# Resume

Andrei Niculescu's resume, written in Markdown and published with GitHub Pages at
**https://aniculescu.github.io/resume/**.

## Editing

All of the content lives in [`index.md`](index.md). Push to `main` and GitHub Pages
rebuilds the site in about a minute.

| File | Purpose |
| --- | --- |
| `index.md` | Resume content |
| `_layouts/resume.html` | Page shell (head, fonts, print button) |
| `assets/css/resume.css` | Screen and print styles |
| `assets/img/` | Company logos |

Kramdown notes for `index.md`:

- `markdown="1"` on an HTML tag lets Markdown be used inside it (used for the two-column overview).
- `{#some-id}` after a heading sets its anchor; the "Read on" links point at these.
- `{: .dates}` / `{: .company}` on the line after a paragraph apply a CSS class to it.

## Preview locally

```sh
bundle config set --local path vendor/bundle
bundle install
bundle exec jekyll serve --livereload
```

Then open http://localhost:4000/resume/.

## PDF

Open the site and use the **Print / Save as PDF** button. The print stylesheet
hides the page chrome and starts the detailed experience on a new page.
