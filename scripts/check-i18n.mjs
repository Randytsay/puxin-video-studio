#!/usr/bin/env node
// Verifies that every locale in messages/ has the same set of translation keys.
// Run locally or in CI: `npm run i18n:check`. Exits non-zero on any mismatch
// (missing keys, extra keys, or empty-string values), so a PR that only
// touches one locale cannot merge without the others being updated.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.resolve(__dirname, '..', 'messages');

/** Flatten a nested JSON object into dotted keys. */
function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v, key));
    } else {
      out.push([key, v]);
    }
  }
  return out;
}

const localeFiles = readdirSync(messagesDir).filter((f) => f.endsWith('.json')).sort();
if (localeFiles.length < 2) {
  console.error(`Need at least 2 locale files in ${messagesDir}; found ${localeFiles.length}.`);
  process.exit(1);
}

const trees = {};
for (const file of localeFiles) {
  const locale = path.basename(file, '.json');
  const raw = readFileSync(path.join(messagesDir, file), 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`✗ ${file}: invalid JSON — ${err.message}`);
    process.exit(1);
  }
  trees[locale] = flatten(parsed);
}

const [baseLocale, ...otherLocales] = Object.keys(trees);
const baseKeys = new Set(trees[baseLocale].map(([k]) => k));

let ok = true;

// Cross-locale key parity
for (const locale of otherLocales) {
  const localeKeys = new Set(trees[locale].map(([k]) => k));
  const missing = [...baseKeys].filter((k) => !localeKeys.has(k)).sort();
  const extra = [...localeKeys].filter((k) => !baseKeys.has(k)).sort();
  if (missing.length) {
    ok = false;
    console.error(`✗ [${locale}] missing ${missing.length} key(s) present in ${baseLocale}:`);
    for (const k of missing) console.error(`    - ${k}`);
  }
  if (extra.length) {
    ok = false;
    console.error(`✗ [${locale}] has ${extra.length} key(s) not in ${baseLocale}:`);
    for (const k of extra) console.error(`    + ${k}`);
  }
}

// Empty-string detection (all locales): empty values render the raw key name
// in the UI via next-intl's fallback, which is effectively a missing translation.
for (const [locale, entries] of Object.entries(trees)) {
  const empties = entries.filter(([, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
  if (empties.length) {
    ok = false;
    console.error(`✗ [${locale}] has ${empties.length} empty-string value(s):`);
    for (const k of empties) console.error(`    · ${k}`);
  }
}

// --- Source usage: keys referenced in code but absent from every locale ------
// Cross-locale parity alone cannot catch this: a `t('foo.bar')` that exists in
// no locale at all is consistent across locales and used to pass silently,
// surfacing only as the raw key rendered in the UI.
//
// Only literal `t('...')` calls are checked. Dynamic keys (`t(step.titleKey)`)
// are unresolvable statically and are skipped rather than guessed at.

const SOURCE_DIRS = ['app', 'components', 'lib', 'src', 'i18n'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const projectRoot = path.resolve(__dirname, '..');

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // directory absent in this checkout
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

// `const t = useTranslations('editor')` / `getTranslations('render')`, including
// files that bind more than one namespace under different variable names.
const BINDING_RE = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*['"`]([\w.]+)['"`]\s*\)/g;

const usageProblems = [];

for (const file of SOURCE_DIRS.flatMap((d) => [...walk(path.join(projectRoot, d))])) {
  const source = readFileSync(file, 'utf8');

  const namespaces = new Map();
  for (const m of source.matchAll(BINDING_RE)) {
    namespaces.set(m[1], m[2]);
  }
  if (namespaces.size === 0) continue;

  for (const [binding, namespace] of namespaces) {
    const callRe = new RegExp(`\\b${binding}\\s*\\(\\s*['"\`]([\\w.]+)['"\`]`, 'g');
    for (const call of source.matchAll(callRe)) {
      const fullKey = `${namespace}.${call[1]}`;
      if (baseKeys.has(fullKey)) continue;
      // Report only if it is missing from *every* locale — a key present in
      // some locale but not the base is already covered by the parity check.
      const inAnyLocale = Object.values(trees).some((entries) =>
        entries.some(([k]) => k === fullKey),
      );
      if (!inAnyLocale) {
        usageProblems.push({ file: path.relative(projectRoot, file), key: fullKey });
      }
    }
  }
}

if (usageProblems.length) {
  ok = false;
  console.error(`✗ ${usageProblems.length} key(s) used in source but missing from all locales:`);
  for (const { file, key } of usageProblems) console.error(`    ! ${key}  (${file})`);
}

if (ok) {
  console.log(
    `✓ i18n OK — ${baseKeys.size} keys across ${Object.keys(trees).length} locales ` +
      `(${Object.keys(trees).join(', ')}); source usage checked`,
  );
  process.exit(0);
}
process.exit(1);
