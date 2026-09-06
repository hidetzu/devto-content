#!/usr/bin/env node
// Sends dist/*.md to the DEV API v1.
//   First publish: POST /api/articles. Every one after: PUT /api/articles/:id.
//   The id DEV assigns is written back into posts/<slug>.md as devto_id.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { LOCAL_KEYS } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Local runs read .env; in CI the key arrives from repository secrets.
try { process.loadEnvFile(join(ROOT, '.env')); } catch { /* absent is fine */ }

const DIST = join(ROOT, 'dist');
const POSTS = join(ROOT, 'posts');
const API = 'https://dev.to/api/articles';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const apiKey = process.env.DEVTO_API_KEY;

if (!dryRun && !apiKey) {
  console.error('DEVTO_API_KEY is not set. Use --dry-run to check the content only.');
  process.exit(1);
}

// Catches the mistakes DEV either accepts silently or rejects unhelpfully.
function validate(slug, data, body) {
  const errs = [];
  if (!data.title) errs.push('no title');
  if (!data.canonical_url) errs.push('no canonical_url (it must point at the Zenn article)');
  if (data.published !== false) errs.push('published is not false');
  const tags = String(data.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length > 4) errs.push(`${tags.length} tags (4 is the maximum)`);
  for (const t of tags) {
    if (!/^[a-z0-9]+$/.test(t)) errs.push(`tag "${t}": lowercase alphanumeric only`);
  }
  if (/```mermaid/.test(body)) errs.push('mermaid block left in the body (run npm run build first)');
  if (/^#\s/m.test(body)) errs.push('h1 in the body (it duplicates the title; drop it)');
  const words = body.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length;
  if (words > 2200) console.warn(`  warn: ${words} words, long for DEV. Consider splitting it.`);
  if (errs.length) {
    console.error(`${slug}:\n  - ${errs.join('\n  - ')}`);
    return null;
  }
  return tags;
}

function writeBackId(slug, id) {
  const path = join(POSTS, `${slug}.md`);
  const raw = readFileSync(path, 'utf8');
  const updated = /^devto_id:.*$/m.test(raw)
    ? raw.replace(/^devto_id:.*$/m, `devto_id: ${id}`)
    : raw.replace(/^---\n([\s\S]*?)\n---/, `---\n$1\ndevto_id: ${id}\n---`);
  writeFileSync(path, updated);
}

const built = readdirSync(DIST).filter((f) => f.endsWith('.md'));
const files = only ? built.filter((f) => f === `${only}.md`) : built;

if (files.length === 0) {
  // Having no articles yet is a normal state. Only a bad --only, or a
  // forgotten build, should fail.
  if (only) {
    console.error(`--only ${only} matched no article`);
    process.exit(1);
  }
  const sources = readdirSync(POSTS).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  if (sources.length > 0) {
    console.error('dist/ is empty. Run npm run build first.');
    process.exit(1);
  }
  console.log('no articles in posts/, nothing to do');
  process.exit(0);
}

let failed = false;
for (const [i, file] of files.entries()) {
  const slug = file.replace(/\.md$/, '');
  const { data, content } = matter(readFileSync(join(DIST, file), 'utf8'));
  const body = content.trim();

  const tags = validate(slug, data, body);
  if (!tags) { failed = true; continue; }

  const article = {
    title: data.title,
    body_markdown: body,
    published: false,
    tags,
    description: data.description ?? '',
    canonical_url: data.canonical_url,
    ...(data.cover_image ? { main_image: data.cover_image } : {}),
    ...(data.series ? { series: data.series } : {}),
  };
  for (const k of LOCAL_KEYS) delete article[k];

  const id = data.devto_id;
  if (dryRun) {
    console.log(`[dry-run] ${id ? `PUT ${API}/${id}` : `POST ${API}`} :: ${slug}`);
    console.log(`  title: ${article.title}`);
    console.log(`  tags:  ${tags.join(', ')}`);
    console.log(`  canon: ${article.canonical_url}`);
    continue;
  }

  const res = await fetch(id ? `${API}/${id}` : API, {
    method: id ? 'PUT' : 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ article }),
  });
  if (!res.ok) {
    console.error(`${slug}: ${res.status} ${await res.text()}`);
    failed = true;
    continue;
  }
  const json = await res.json();
  if (!id) writeBackId(slug, json.id);
  console.log(`${id ? 'updated' : 'created'} ${slug} -> ${json.url ?? json.id}`);

  // DEV rate-limits consecutive article creation.
  if (i < files.length - 1) await new Promise((r) => setTimeout(r, 3000));
}

process.exit(failed ? 1 : 0);
