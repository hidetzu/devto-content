#!/usr/bin/env node
// Word count excluding code blocks. DEV articles land best at 1,200-1,800 words.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const POSTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'posts');
for (const f of readdirSync(POSTS).filter((f) => f.endsWith('.md'))) {
  const { content } = matter(readFileSync(join(POSTS, f), 'utf8'));
  const prose = content.replace(/```[\s\S]*?```/g, '');
  const n = prose.split(/\s+/).filter(Boolean).length;
  const flag = n < 900 ? 'short' : n > 1800 ? 'LONG' : 'ok';
  console.log(`${String(n).padStart(5)}  ${flag.padEnd(5)}  ${f}`);
}
