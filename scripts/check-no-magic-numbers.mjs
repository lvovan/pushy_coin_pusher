#!/usr/bin/env node
/**
 * Single-Source-Of-Truth gate (Constitution Principle V).
 *
 * Scans src/game/** and src/render/** for numeric literals. Numeric literals
 * are forbidden EXCEPT:
 *   - The trivial allowlist: 0, 1, -1, 2, 0.5
 *   - Literals used to initialize a named `const` (i.e. local named constants,
 *     which themselves act as a single source of truth at file scope).
 *   - Literals appearing inside the file `src/config/gameBalance.ts`.
 *   - Literals on lines marked with the trailing comment `// @no-magic-ok`.
 *
 * The intent: gameplay tuning values must live in gameBalance.ts. Implementation
 * constants (camera FOV, near plane, etc.) must be named.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SCAN_DIRS = ['src/game', 'src/render'];
const ALLOWLIST = new Set(['0', '1', '-1', '2', '0.5']);

/** @param {string} dir */
async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (ent.isFile() && /\.(ts|tsx|mts|cts)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Strip block comments, line comments, and string/template literal contents
 * (but preserve `\n` so line numbers stay accurate).
 * @param {string} src
 */
function stripNonCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      // line comment — keep newline only
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          if (src[i + 1] === '\n') out += '\n';
          i += 2;
          continue;
        }
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      out += src[i] ?? '';
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Find lines explicitly marked OK with a trailing `// @no-magic-ok`.
 * Uses the original source (with comments) before they get stripped.
 * @param {string} src
 */
function findOkLines(src) {
  const ok = new Set();
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('@no-magic-ok')) ok.add(i + 1);
  }
  return ok;
}

const NUMBER_RE = /(-?)\b(\d+\.\d+|\.\d+|\d+)(e[+-]?\d+)?\b/gi;

/**
 * Test if the numeric literal at `idx` in `code` is the initializer of a
 * `const NAME = <number>` declaration on the same line.
 * @param {string} line
 * @param {number} matchStart
 */
function isNamedConstInit(line, matchStart) {
  const before = line.slice(0, matchStart);
  // Accept patterns like:  const FOO = 1.23  /  const FOO: number = 1.23
  return /\bconst\s+[A-Za-z_$][\w$]*(\s*:\s*[A-Za-z_$][\w$<>[\],\s]*)?\s*=\s*$/.test(before);
}

/**
 * @param {string} code stripped of comments/strings
 * @param {string} original
 * @param {string} filePath
 * @returns {{line: number, col: number, text: string, lineText: string}[]}
 */
function findViolations(code, original, filePath) {
  const okLines = findOkLines(original);
  const stripped = stripNonCode(code);
  const violations = [];
  const lines = stripped.split('\n');
  const origLines = original.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    NUMBER_RE.lastIndex = 0;
    let m;
    while ((m = NUMBER_RE.exec(line)) !== null) {
      const full = (m[1] ?? '') + (m[2] ?? '') + (m[3] ?? '');
      // Skip pure index/property accessors like `.123` (not normally numbers)
      // and skip when ALLOWLIST contains the value or unsigned value.
      const normalized = String(Number(full));
      if (ALLOWLIST.has(full) || ALLOWLIST.has(normalized)) continue;
      if (okLines.has(i + 1)) continue;
      if (isNamedConstInit(line, m.index)) continue;
      violations.push({
        line: i + 1,
        col: m.index + 1,
        text: full,
        lineText: (origLines[i] ?? '').trim(),
      });
    }
  }
  return violations;
}

async function main() {
  /** @type {string[]} */
  const files = [];
  for (const d of SCAN_DIRS) {
    files.push(...(await walk(join(REPO_ROOT, d))));
  }
  /** @type {{file:string,line:number,col:number,text:string,lineText:string}[]} */
  const allViolations = [];
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const code = stripNonCode(src);
    const v = findViolations(code, src, file);
    for (const vv of v) {
      allViolations.push({ file: relative(REPO_ROOT, file).split(sep).join('/'), ...vv });
    }
  }
  if (allViolations.length === 0) {
    console.log(`check-no-magic-numbers: OK (${files.length} files scanned)`);
    return;
  }
  console.error(`check-no-magic-numbers: ${allViolations.length} violation(s)`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  literal "${v.text}"  >>  ${v.lineText}`);
  }
  console.error('');
  console.error('Move tuning values into src/config/gameBalance.ts, name implementation');
  console.error('constants with `const`, or annotate the line with // @no-magic-ok.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
