# Writing rules for dev.to

This repository holds **English** articles for dev.to (DEV Community).
Most of them start as a Japanese article in `~/work/private/zenn-content`,
but they are **rewritten, not translated**.

## The one rule that matters: rewrite, don't translate

The Zenn conventions — `はじめに` / `おわりに` sections, emoji in h2 headings,
background-first structure — belong to Japanese technical writing. Translated
literally they read stiff and bury the point. **Do not carry them into this repo.**

| Zenn (Japanese) | dev.to (English) |
|---|---|
| Opens with `## 🎯 はじめに` and context | Claim and conclusion in the first 2-3 sentences. No intro heading |
| Closes with `## 👋 おわりに` | Close with a heading that names its content, e.g. `## What I'd do differently` |
| Emoji in h2 | No emoji. Sentence case |
| Posts run to 16,000 characters | **1,200-1,800 words.** Split it or cut it |
| `:::message` | `> **Note:** ...` blockquote |
| ```mermaid | Fine in the source. `npm run build` rasterises it |

## Structure

1. **Hook (2-3 sentences)** — what happened, or what was measured. Land the conclusion here
2. **The setup** — preconditions, versions, data sizes. Be specific
3. **What actually happened** — the body: measurements, code, output
4. **Why** — the mechanism
5. **Trade-offs** — when not to do this, and how it breaks
6. **Takeaway** — one line the reader can use tomorrow

Never open with "In this article, we will explore...". Start cold.

## Style

- First person, `I`. Active voice
- Short sentences. Three or four per paragraph at most
- Numbers instead of adjectives (`9m28s → 18s`, not `much faster`)
- Japan-specific context (domestic SaaS, Japanese-language specifics) needs
  explaining or cutting — the reader has none of it
- Define a term the first time it appears, in one line

## Titles

Concrete noun + number + something unexpected. The Japanese habit of joining two
clauses with an em dash does not work in English.

```
Bad:  OFFSET Doesn't Skip Rows - The Slowness of Pagination Measured on 10 Million PostgreSQL Rows
Good: OFFSET Doesn't Skip Rows: What 10M Rows in PostgreSQL Actually Cost
```

## Front matter

```yaml
---
title: "OFFSET Doesn't Skip Rows"
published: false
description: "One sentence. Shown on the feed card."
tags: postgres, sql, performance, database
canonical_url: https://zenn.dev/hidetzu/articles/<zenn-slug>
cover_image: ""
series: ""                 # only for a multi-part post; delete the key otherwise
zenn_source: <zenn-slug>   # bookkeeping; stripped before the API call
devto_id:                  # filled in by publish after the first POST
---
```

- `published: false` always. Publishing happens by hand from the DEV dashboard
- `tags`: **at most 4, lowercase alphanumeric only** (no hyphens)
- `canonical_url` is **required whenever `zenn_source` is set** — it keeps the
  SEO weight on Zenn and avoids a duplicate-content penalty. Leave it empty only
  for a post with no original elsewhere; DEV then canonicalises to itself

## Diagrams

- Write ` ```mermaid ` in the source. DEV does not render mermaid, so
  `npm run build` turns each block into a PNG
- Rendered on a white background: a transparent one vanishes against DEV's dark theme
- Diagram first, then the prose explaining it

## Workflow

```bash
npm run build              # mermaid -> PNG, writes dist/
npm run wc                 # word count
npm run publish -- --dry-run
npm run publish            # needs DEVTO_API_KEY
```

## Checklist

- [ ] Is the conclusion in the first 2-3 sentences?
- [ ] Is it between 1,200 and 1,800 words?
- [ ] Any headings left over from translating `はじめに` / `おわりに`?
- [ ] Any emoji left in h2?
- [ ] `tags`: 4 or fewer, lowercase alphanumeric?
- [ ] Does `canonical_url` point at the right Zenn article (or is it empty because there is no original)?
- [ ] Is `published` still `false`?
- [ ] Is every Japan-specific assumption either explained or gone?
