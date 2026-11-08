// Builds the downloadable versions of the resume from the Jekyll output in _site/.
// Run `bundle exec jekyll build` first, or `npm run build` to do both.
//
// - Designed PDF: the site printed with its print stylesheet, like Print / Save as PDF in Chrome.
// - ATS PDF, Word, and plain text: one column, standard section headings, no icons or images,
//   built from the masthead, the summary, and the detailed experience.
//
// File names come from the `data-download` links in _layouts/resume.html.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const ORIGIN = 'http://resume.local';
const FORMATS = ['pdf', 'ats-pdf', 'ats-docx', 'txt'];

// Parts of the page left out of the ATS versions. The experience cards repeat the detailed experience.
const ATS_SKIP = '.masthead, .experience-summary';
// Section headings ATS parsers look for, keyed by the heading used on the site.
const ATS_HEADINGS = { 'Human Summary': 'Summary', 'Detailed Work Experience': 'Experience' };

// No letter-spacing or justified text: PDF text extraction guesses word breaks from glyph gaps.
const ATS_CSS = `
  @page { size: letter; margin: 0.6in 0.7in; }
  body { margin: 0; color: #000; font: 10.5pt/1.4 Arial, Helvetica, "Liberation Sans", sans-serif; font-variant-ligatures: none; }
  a { color: inherit; text-decoration: none; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  h2 { font-size: 11.5pt; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2pt; margin: 14pt 0 6pt; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 10pt 0 0; break-after: avoid; }
  p { margin: 0 0 5pt; }
  .meta { break-after: avoid; }
  .about { font-style: italic; }
  ul { margin: 0 0 5pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; break-inside: avoid; }
`;

const baseurl = (fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8')
  .match(/^baseurl:\s*["']?([^"'\s#]*)/m)?.[1] ?? '').replace(/\/$/, '');

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('_site/index.html not found. Run `bundle exec jekyll build` first, or `npm run build`.');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext();
  // Serve _site/ at the baseurl so the page's absolute asset paths resolve. Other requests (fonts) go to the network.
  await context.route(`${ORIGIN}/**`, (route) => {
    const urlPath = decodeURIComponent(new URL(route.request().url()).pathname);
    let file = path.join(SITE, urlPath.slice(baseurl.length));
    if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
    return urlPath.startsWith(baseurl) && fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });

  const page = await context.newPage();
  await page.goto(`${ORIGIN}${baseurl}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const links = await page.$$eval('a[data-download]', (as) => Object.fromEntries(as.map((a) => [a.dataset.download, new URL(a.href).pathname])));
  const missing = FORMATS.filter((format) => !links[format]);
  if (missing.length) throw new Error(`_layouts/resume.html has no data-download link for: ${missing.join(', ')}`);
  const output = (format) => {
    const file = path.join(SITE, decodeURIComponent(links[format]).slice(baseurl.length));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return file;
  };

  const resume = await page.evaluate(extractResume, { skip: ATS_SKIP, headings: ATS_HEADINGS });
  if (!resume.name || !resume.sections.some((section) => section.entries.length)) {
    throw new Error('Could not find the name and experience entries in _site/index.html. See README.md for the structure the ATS versions expect.');
  }

  await page.pdf({ path: output('pdf'), preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });

  const atsPage = await context.newPage();
  await atsPage.setContent(atsHtml(resume));
  await atsPage.pdf({ path: output('ats-pdf'), preferCSSPageSize: true, tagged: true, outline: true });

  fs.writeFileSync(output('ats-docx'), await Packer.toBuffer(atsDocx(resume)));
  fs.writeFileSync(output('txt'), atsText(resume));

  for (const format of FORMATS) console.log(`${format.padEnd(8)} ${path.relative(ROOT, output(format))}`);
} finally {
  await browser.close();
}

// Runs in the page. Reads the rendered resume into { name, contact, sections }, where each section has
// blocks (paragraphs and lists) and entries (### headings with their dates and blocks).
function extractResume({ skip, headings }) {
  const ICONS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]/gu;
  const clean = (text) => text.replace(ICONS, ' ').replace(/\s+/g, ' ').trim();

  const masthead = document.querySelector('.masthead');
  const contact = [];
  for (const node of masthead?.querySelector('p')?.childNodes ?? []) {
    if (node.nodeName === 'A') {
      const text = node.protocol === 'mailto:'
        ? decodeURIComponent(node.pathname)
        : node.href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      contact.push({ text, href: node.href });
    } else {
      // Icons and &nbsp; separate the plain-text items, such as the location.
      for (const part of node.textContent.replace(ICONS, ' ').split(' ')) {
        if (part.trim()) contact.push({ text: clean(part) });
      }
    }
  }

  const sections = [];
  let section;
  let entry;
  const walk = (el) => {
    for (const child of el.children) {
      if (child.matches(skip)) continue;
      const tag = child.tagName;
      if (['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'BLOCKQUOTE'].includes(tag)) {
        walk(child);
      } else if (tag === 'H2') {
        const heading = clean(child.textContent);
        section = { heading: headings[heading] ?? heading, blocks: [], entries: [] };
        sections.push(section);
        entry = null;
      } else if (!section && /^(H3|P|UL|OL)$/.test(tag) && clean(child.textContent)) {
        throw new Error(`Content before the first ## heading: "${clean(child.textContent).slice(0, 60)}"`);
      } else if (tag === 'H3') {
        const [title, org = ''] = clean(child.textContent).split(' @ ');
        entry = { title, org, dates: '', blocks: [] };
        section.entries.push(entry);
      } else if (tag === 'P' && entry && child.matches('.dates')) {
        entry.dates = clean(child.textContent).replace(/^since (.+)/i, '$1 – Present');
      } else if (tag === 'P' && clean(child.textContent)) {
        (entry ?? section).blocks.push({ text: clean(child.textContent), about: child.matches('.company') });
      } else if (tag === 'UL' || tag === 'OL') {
        (entry ?? section).blocks.push({ items: [...child.children].map((li) => clean(li.textContent)) });
      }
    }
  };
  walk(document.querySelector('.resume'));

  return { name: clean(masthead?.querySelector('h1')?.textContent ?? ''), contact, sections };
}

function entryMeta(entry) {
  return [entry.org, entry.dates].filter(Boolean).join(' | ');
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function atsHtml({ name, contact, sections }) {
  const blocks = (list) => list.map((block) => block.items
    ? `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : `<p${block.about ? ' class="about"' : ''}>${escapeHtml(block.text)}</p>`).join('\n');
  const entry = (e) => `<h3>${escapeHtml(e.title)}</h3>
${entryMeta(e) ? `<p class="meta">${escapeHtml(entryMeta(e))}</p>` : ''}
${blocks(e.blocks)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(name)} – Resume</title><style>${ATS_CSS}</style></head>
<body>
<h1>${escapeHtml(name)}</h1>
<p>${contact.map((c) => (c.href ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.text)}</a>` : escapeHtml(c.text))).join(' | ')}</p>
${sections.map((s) => `<h2>${escapeHtml(s.heading)}</h2>\n${blocks(s.blocks)}\n${s.entries.map(entry).join('\n')}`).join('\n')}
</body>
</html>`;
}

function atsDocx({ name, contact, sections }) {
  const font = 'Arial';
  const blocks = (list) => list.flatMap((block) => block.items
    ? block.items.map((text) => new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } }))
    : [new Paragraph({ children: [new TextRun({ text: block.text, italics: block.about })] })]);

  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, text: name }),
    new Paragraph({
      children: contact.flatMap((c, i) => [
        ...(i ? [new TextRun(' | ')] : []),
        c.href ? new ExternalHyperlink({ link: c.href, children: [new TextRun({ text: c.text, style: 'Hyperlink' })] }) : new TextRun(c.text),
      ]),
    }),
  ];
  for (const s of sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: s.heading }), ...blocks(s.blocks));
    for (const e of s.entries) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: e.title }));
      if (entryMeta(e)) children.push(new Paragraph({ text: entryMeta(e), keepNext: true }));
      children.push(...blocks(e.blocks));
    }
  }

  // Sizes are in half-points, spacing and margins in twentieths of a point.
  return new Document({
    creator: name,
    title: `${name} – Resume`,
    styles: {
      default: {
        document: { run: { font, size: 21 }, paragraph: { spacing: { after: 100, line: 276 } } },
        title: { run: { font, size: 40, bold: true, color: '000000' }, paragraph: { spacing: { after: 40 } } },
        heading1: {
          run: { font, size: 23, bold: true, allCaps: true, color: '000000' },
          paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 2 } } },
        },
        heading2: { run: { font, size: 21, bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 20 }, keepNext: true } },
      },
      // Also on Normal: some readers, such as macOS Quick Look, ignore the document defaults.
      paragraphStyles: [{ id: 'Normal', name: 'Normal', run: { font, size: 21 } }],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 864, bottom: 864, left: 1008, right: 1008 } } },
      children,
    }],
  });
}

function atsText({ name, contact, sections }) {
  const blocks = (list) => list.map((block) => (block.items ? block.items.map((item) => `- ${item}`).join('\n') : block.text));
  const chunks = [`${name}\n${contact.map((c) => c.text).join(' | ')}`];
  for (const s of sections) {
    chunks.push(s.heading.toUpperCase(), ...blocks(s.blocks));
    for (const e of s.entries) chunks.push([e.title, entryMeta(e)].filter(Boolean).join('\n'), ...blocks(e.blocks));
  }
  return `${chunks.join('\n\n')}\n`;
}
