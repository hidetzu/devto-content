#!/usr/bin/env node
// posts/*.md -> dist/*.md
//   Rasterises every ```mermaid block into assets/ and rewrites it as an
//   absolute image reference. Everything else in the body is left alone.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { RAW_BASE } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = join(ROOT, 'posts');
const ASSETS = join(ROOT, 'assets');
const DIST = join(ROOT, 'dist');
const TMP = join(ROOT, '.mmd-tmp');

mkdirSync(ASSETS, { recursive: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(TMP, { recursive: true });

const MERMAID = /^```mermaid[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

function renderMermaid(slug, code) {
  // The filename carries a hash of the source, so an unchanged diagram is
  // never re-rendered.
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 8);
  const name = `${slug}-${hash}.png`;
  const out = join(ASSETS, name);
  if (!existsSync(out)) {
    const src = join(TMP, `${slug}-${hash}.mmd`);
    writeFileSync(src, code);
    // -b white: a transparent background makes the lines and labels vanish
    //           against DEV's dark theme
    // -s 2:     retina
    execFileSync('npx', [
      '-y', '-p', '@mermaid-js/mermaid-cli', 'mmdc',
      '-i', src, '-o', out, '-b', 'white', '-s', '2',
      '-p', join(ROOT, 'puppeteer-config.json'),
    ], { stdio: 'inherit' });
    console.log(`  rendered ${name}`);
  }
  return `${RAW_BASE}/assets/${name}`;
}

const files = readdirSync(POSTS).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
if (files.length === 0) console.log('no articles in posts/');

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const { data, content } = matter(readFileSync(join(POSTS, file), 'utf8'));
  console.log(`build ${slug}`);

  let n = 0;
  const body = content.replace(MERMAID, (_m, code) => {
    n += 1;
    const url = renderMermaid(slug, code.trim());
    return `![Diagram ${n}](${url})`;
  });

  writeFileSync(join(DIST, file), matter.stringify(body, data));
  if (n > 0) console.log(`  ${n} diagram(s)`);
}

rmSync(TMP, { recursive: true, force: true });
console.log('done. commit and push assets/ before publishing');
