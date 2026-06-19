#!/usr/bin/env node
// Splits configured `##` sections out of the tutorial into their own files in the
// skill directory, so SKILL.md can link to them on demand instead of inlining the
// full text. This keeps a single source of truth: the website still serves the
// whole docs/Tutorial.md; only the skill bundle links the heavier/situational
// sections rather than inlining them.
//
// Usage: node scripts/split-tutorial.mjs <tutorial.md> <outDir> <outFile> <Section Title>...
//   Writes the reduced tutorial to <outDir>/<outFile> and each extracted section
//   to <outDir>/<slug>.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , srcPath, outDir, outFile, ...extractTitles] = process.argv;
if (!srcPath || !outDir || !outFile) {
    console.error('Usage: split-tutorial.mjs <tutorial.md> <outDir> <outFile> <Section Title>...');
    process.exit(1);
}
const extract = new Set(extractTitles);

// Strip leading YAML frontmatter, then split into segments at `## ` headings
// (the text before the first heading - the `# Tutorial` h1 and intro - is kept as-is).
const text = readFileSync(srcPath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const segments = [];
let current = { title: null, lines: [] };
for (const line of text.split('\n')) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) {
        segments.push(current);
        current = { title: m[1], lines: [line] };
    } else {
        current.lines.push(line);
    }
}
segments.push(current);

const slugify = (title) => title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

const out = [];
for (const seg of segments) {
    if (seg.title && extract.has(seg.title)) {
        const slug = slugify(seg.title);
        writeFileSync(join(outDir, `${slug}.md`), seg.lines.join('\n').trim() + '\n');

        // Replace the section with its heading plus a one-line teaser (the first
        // sentence of its first paragraph) and a link, so the agent knows when to
        // open the full file.
        const para = [];
        for (const l of seg.lines.slice(1)) {
            if (l.trim() === '') { if (para.length) break; else continue; }
            para.push(l.trim());
        }
        let teaser = para.join(' ');
        const sentenceEnd = teaser.search(/\.\s/);
        teaser = sentenceEnd === -1 ? teaser.replace(/:$/, '.') : teaser.slice(0, sentenceEnd + 1);
        out.push(`## ${seg.title}`, '', `${teaser} See [${slug}.md](${slug}.md).`, '');
    } else {
        out.push(...seg.lines);
    }
}

writeFileSync(join(outDir, outFile), out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
