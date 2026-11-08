# Resume

Andrei Niculescu's resume, written in Markdown and published with GitHub Pages at
**https://aniculescu.github.io/resume/**.

`index.md` is the source of truth. Every push to `main` rebuilds the site and these
downloads, linked from the site footer:

| Download | URL |
| --- | --- |
| Designed PDF (the site, printed) | [/resume/downloads/Andrei-Niculescu-Resume.pdf](https://aniculescu.github.io/resume/downloads/Andrei-Niculescu-Resume.pdf) |
| ATS-friendly PDF | [/resume/downloads/Andrei-Niculescu-Resume-ATS.pdf](https://aniculescu.github.io/resume/downloads/Andrei-Niculescu-Resume-ATS.pdf) |
| ATS-friendly Word | [/resume/downloads/Andrei-Niculescu-Resume-ATS.docx](https://aniculescu.github.io/resume/downloads/Andrei-Niculescu-Resume-ATS.docx) |
| Plain text, for pasting into application forms | [/resume/downloads/Andrei-Niculescu-Resume.txt](https://aniculescu.github.io/resume/downloads/Andrei-Niculescu-Resume.txt) |

Pull requests build the same files without deploying. Download them from the
**resume** artifact on the workflow run to review a change before merging.

## Editing

| File | Purpose |
| --- | --- |
| `index.md` | Resume content |
| `_layouts/resume.html` | Page shell (head, fonts, download links) |
| `assets/css/resume.css` | Screen and print styles; print styles also shape the designed PDF |
| `assets/img/` | Company logos |
| `scripts/generate.mjs` | Builds the downloads from the built site |
| `.github/workflows/publish.yml` | Builds and deploys on push to `main` |

Kramdown notes for `index.md`:

- `markdown="1"` on an HTML tag lets Markdown be used inside it (used for the two-column overview).
- `{#some-id}` after a heading sets its anchor; the "Read on" links point at these.
- `{: .dates}` / `{: .company}` on the line after a paragraph apply a CSS class to it.

## How the ATS versions are built

The ATS PDF, Word file, and plain text are one column with standard section headings,
no icons, images, or tables, and the contact links written out as URLs. They are built
from the rendered page, so they follow `index.md` as long as it keeps this structure:

- The name is the `#` heading in `<header class="masthead">`; the line under it is the contact line.
- Each `##` heading starts a section. "Human Summary" becomes **Summary** and
  "Detailed Work Experience" becomes **Experience** (see `ATS_HEADINGS` in `scripts/generate.mjs`).
- Each `###` heading in a section is an entry, written `Title @ Company`.
- `{: .dates}` under an entry gives its dates. "since 2021" becomes "2021 – Present".
- `{: .company}` under an entry is the company description, set in italics.
- The Experience Summary cards (`.experience-summary`) are left out because they repeat the detailed experience.

New sections (Skills, Education) work the same way: add a `##` heading inside
`<section class="details">` with paragraphs, lists, or `###` entries under it.

## Preview locally

Requires Ruby, Node.js, and Google Chrome.

```sh
bundle config set --local path vendor/bundle
bundle install
npm install

npm run build                      # site + downloads in _site/downloads/
bundle exec jekyll serve --livereload
```

Then open http://localhost:4000/resume/. `jekyll serve` keeps `_site/downloads/` but doesn't
regenerate it; run `npm run generate` after editing to refresh the downloads.

## One-time GitHub setup

Pages must deploy from GitHub Actions: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. With the default "Deploy from a branch", the site still updates but the
downloads are never published.
