// Regenerates the INLINE module inside index.html from src/*.js.
//
//   node tools/sync-inline.mjs        # rewrite index.html
//   node tools/sync-inline.mjs --check  # verify it is up to date (exit 1 if stale)
//
// Why this exists: Chrome and Firefox refuse to load external
// <script type="module" src="..."> from file:// URLs (verified: the page never
// boots). Users get a zero-build experience because index.html ships with the
// inline module already synced — nobody has to run anything to open the app.
// src/ remains the canonical ESM source for tests and for anyone serving the
// directory over HTTP (then the external modules could be used instead).

import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);

// Dependency order: pure helpers first, DOM glue last (it calls init()).
const MODULE_ORDER = ['luhn', 'iban', 'aliases', 'policies', 'detectors', 'redact', 'jsonredact', 'app'];

const IMPORT_RE = /^\s*import\s+.*?from\s+'\.\/[A-Za-z0-9_-]+\.js';?\s*$/;
const EXPORT_DECL_RE = /^\s*export\s+(?=(?:async\s+)?(?:function|const|let|class|var)\b)/;

let body = '';
for (const name of MODULE_ORDER) {
  const url = new URL(`src/${name}.js`, root);
  let src = await readFile(url, 'utf8');

  // Every import must point at a module that is part of this bundle.
  for (const m of src.matchAll(/from\s+'\.\/([A-Za-z0-9_-]+)\.js'/g)) {
    const dep = m[1];
    if (!MODULE_ORDER.includes(dep)) {
      console.error(`sync-inline: src/${name}.js imports ./${dep}.js which is not in MODULE_ORDER`);
      process.exit(1);
    }
  }

  const lines = src
    .split('\n')
    .filter((line) => !IMPORT_RE.test(line))
    .map((line) => line.replace(EXPORT_DECL_RE, ''));
  if (/^\s*export\s*\{/.test(lines.join('\n'))) {
    console.error(`sync-inline: src/${name}.js uses "export { ... }" which this tool does not strip`);
    process.exit(1);
  }
  body += `// ==== src/${name}.js ====\n${lines.join('\n').trimEnd()}\n\n`;
}

// Parse-check the generated module (syntax only, never executed).
const tmp = join(tmpdir(), `maskary-inline-check-${process.pid}.mjs`);
await writeFile(tmp, body, 'utf8');
const check = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
if (check.status !== 0) {
  console.error('sync-inline: generated module failed node --check:');
  console.error(check.stderr || check.stdout);
  process.exit(1);
}

const indexPath = fileURLToPath(new URL('index.html', root));
const html = await readFile(indexPath, 'utf8');
const re = /(<!--INLINE-MODULE:START-->\s*<script type="module">)[\s\S]*?(<\/script>\s*<!--INLINE-MODULE:END-->)/;
if (!re.test(html)) {
  console.error('sync-inline: markers <!--INLINE-MODULE:START/END--> not found in index.html');
  process.exit(1);
}

const banner =
  '/* Synced from src/*.js by tools/sync-inline.mjs — edit src/, then run:\n' +
  '   node tools/sync-inline.mjs\n' +
  '   (inline module because Chrome/Firefox block external module scripts on file://) */\n';
// NOTE: use a function replacer — a string replacer would interpret $' $` $&
// sequences that legitimately occur inside the bundled source code.
const next = html.replace(re, (_m, g1, g2) => `${g1}\n${banner}\n${body.trimEnd()}\n${g2}`);

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  if (next !== html) {
    console.error('sync-inline: index.html is STALE — run: node tools/sync-inline.mjs');
    process.exit(1);
  }
  console.log('sync-inline: index.html is up to date');
} else {
  if (next === html) {
    console.log('sync-inline: index.html already up to date');
  } else {
    await writeFile(indexPath, next, 'utf8');
    console.log(`sync-inline: wrote inline module (${body.length} bytes) into index.html`);
  }
}
