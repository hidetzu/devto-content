# devto-content

English articles for [dev.to](https://dev.to/hidetzu), written in Markdown and published through the DEV API.

Most posts here start as a Japanese article on [Zenn](https://zenn.dev/hidetzu). They are **rewritten, not translated** — the structure that works for a Japanese technical post does not survive a literal translation into English. See [CLAUDE.md](./CLAUDE.md) for the writing rules.

## Layout

```
posts/     Article sources. May contain ```mermaid blocks.
assets/    Diagrams rendered to PNG by the build. Committed.
dist/      Build output. This is what gets published. Gitignored.
scripts/   build / publish / wordcount
```

## Writing

```bash
npm install
cp posts/_template.md posts/my-post.md
```

Front matter:

```yaml
---
title: "OFFSET Doesn't Skip Rows"
published: false
description: "One sentence. Shown on the feed card."
tags: postgres, sql, performance, database
canonical_url: https://zenn.dev/hidetzu/articles/<zenn-slug>
cover_image: ""
zenn_source: <zenn-slug>
devto_id:
---
```

- `tags`: at most 4, lowercase alphanumeric only (no hyphens)
- `canonical_url`: points at the original Zenn article. Required whenever `zenn_source` is set; empty only for a post written for DEV first
- `published`: always `false` — posts land on DEV as drafts and are published by hand
- `zenn_source` and `devto_id` are local bookkeeping and are stripped before the API call

## Building

```bash
npm run build   # renders mermaid to assets/*.png, writes dist/
npm run wc      # word count, excluding code blocks (1,200-1,800 is the target)
```

DEV does not render mermaid, so `build` rasterises every ` ```mermaid ` block with mermaid-cli and rewrites it as an image reference. Diagrams are rendered on a white background: a transparent one disappears against DEV's dark theme. Output is PNG rather than SVG because SVG served from raw.githubusercontent is not reliably treated as an image.

Each PNG is named after a hash of the diagram source, so unchanged diagrams are not re-rendered.

## Publishing

You need a DEV API key from `https://dev.to/settings/extensions`. Put it in `.env` at the repository root (gitignored) and `publish` picks it up:

```
DEVTO_API_KEY=xxxx
```

```bash
npm run publish -- --dry-run       # validate front matter and body, send nothing
npm run publish -- --only my-post
```

The first publish `POST`s the article and writes the returned id back into `posts/<slug>.md` as `devto_id`. Every publish after that is a `PUT` against the same article.

`--dry-run` checks for the mistakes that the API accepts silently or rejects unhelpfully: a `zenn_source` with no `canonical_url`, a `canonical_url` that is not an https URL, `published: true`, more than four tags, tags with illegal characters, an `<h1>` duplicating the title, and mermaid blocks that were never built.

> **Note:** never put the API key in a public dotfiles repository. Use `.env` locally and GitHub Secrets in CI.

### Images require this repository to stay public

Diagrams are referenced by absolute URL through `raw.githubusercontent.com`. DEV proxies images at render time rather than copying them, so the origin has to be reachable without authentication — a private repository returns 404 and the diagrams silently fail to load. This is the same assumption every git-based DEV publishing tool makes.

It also means **`assets/` must be pushed before publishing**, or DEV will fetch a URL that does not exist yet.

## CI

- **push / pull request** — `validate` runs the build and the dry-run checks. It never publishes.
- **manual dispatch** — `publish` creates the drafts and commits the resulting `devto_id` values back. Requires `DEVTO_API_KEY` in repository secrets.
