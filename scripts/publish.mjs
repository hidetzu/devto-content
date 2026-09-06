#!/usr/bin/env node
// dist/*.md を DEV API v1 に投げる。
//   初回は POST /api/articles、2回目以降は PUT /api/articles/:id
//   採番された id は posts/<slug>.md の devto_id に書き戻す
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { LOCAL_KEYS } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const POSTS = join(ROOT, 'posts');
const API = 'https://dev.to/api/articles';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const apiKey = process.env.DEVTO_API_KEY;

if (!dryRun && !apiKey) {
  console.error('DEVTO_API_KEY が未設定。--dry-run で内容だけ確認できる');
  process.exit(1);
}

function validate(slug, data, body) {
  const errs = [];
  if (!data.title) errs.push('title がない');
  if (!data.canonical_url) errs.push('canonical_url がない（Zenn記事を指すこと）');
  if (data.published !== false) errs.push('published が false でない');
  const tags = String(data.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length > 4) errs.push(`tags が ${tags.length} 個（最大4）`);
  for (const t of tags) {
    if (!/^[a-z0-9]+$/.test(t)) errs.push(`tag "${t}" は小文字英数のみ`);
  }
  if (/```mermaid/.test(body)) errs.push('mermaid が残っている（npm run build を先に）');
  if (/^#\s/m.test(body)) errs.push('本文に h1 がある（title と重複するので削る）');
  const words = body.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length;
  if (words > 2200) console.warn(`  warn: ${words} words（DEV では長い。分割を検討）`);
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

const files = readdirSync(DIST)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !only || f === `${only}.md`);

if (files.length === 0) {
  console.error('対象がない。npm run build を先に実行すること');
  process.exit(1);
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

  // DEV API のレート制限（連続作成が弾かれる）を避ける
  if (i < files.length - 1) await new Promise((r) => setTimeout(r, 3000));
}

process.exit(failed ? 1 : 0);
