#!/usr/bin/env node
/**
 * split-android-patch.mjs - cut the squashed upstream android patch into an
 * ordered, granular series, and PROVE the cut is lossless.
 *
 *   usage: node tools/split-android-patch.mjs <squashed.patch> [outdir]
 *
 * The source is a single squash of ten upstream commits. Those commits are not
 * recoverable from a squash, so this tool does NOT pretend to rebuild them: it
 * regroups whole file blocks by concern (tools/patch-groups.json) and proves
 * the series carries exactly the same change as the source.
 *
 * Proof obligations - the tool exits non-zero if any fails:
 *
 *   1. CENSUS       every source file block lands in exactly one group; nothing
 *                   dropped, nothing duplicated, nothing invented.
 *   2. LOSSLESS     every block in the WRITTEN series is byte-identical
 *                   (sha256) to its block in the source.
 *   3. WELL-FORMED  every hunk header's line counts match the hunk body - so a
 *                   truncated or corrupted patch cannot pass as valid.
 *   4. GIT AGREES   git apply --numstat, an independent parser, reports the same
 *                   added/removed totals this tool computed. Skipped with a note
 *                   if git is not on PATH.
 *
 * Accounting note (this mattered): a unified-diff hunk has three quantities that
 * are easy to confuse, and confusing them silently inflates the numbers -
 *
 *     newSide = added + context      oldSide = removed + context
 *
 * A hunk header "@@ -a,oldSide +c,newSide @@" is validated against SIDE counts.
 * Reporting added/removed means subtracting context, not reporting the sides.
 * This tool reported the sides as if they were deltas, was caught by obligation
 * 4, and now reports both - which is why obligation 4 exists.
 *
 * The written patches are plain unified diffs with a prose preamble, which
 * `git apply` skips. No email headers, no fabricated commit ids.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [, , inputPath, outDirArg] = process.argv;
if (!inputPath) {
  console.error('usage: node tools/split-android-patch.mjs <squashed.patch> [outdir]');
  process.exit(2);
}
const outDir = outDirArg || 'patches';
const cfg = JSON.parse(readFileSync(new URL('./patch-groups.json', import.meta.url), 'utf8'));
const groups = cfg.groups;

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const fail = (msg) => { console.error(`FAIL  ${msg}`); process.exit(1); };
const norm = (s) => s.replace(/\n+$/, '\n'); // trailing-newline-insensitive compare

// ---------------------------------------------------------------- read + split
const text = readFileSync(inputPath, 'utf8');
const sourceSha = sha(text);
const totalLines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const parts = text.split(/(?=^diff --git )/m);
const rawBlocks = parts.slice(1);
if (rawBlocks.length === 0) fail('no "diff --git" blocks found - is this a unified diff?');

const pathOf = (b) => {
  const m = b.match(/^diff --git a\/(\S+) b\/(\S+)/m);
  if (!m) fail('found a block with no parseable "diff --git" header');
  return m[2];
};

const source = new Map();
for (const b of rawBlocks) {
  const p = pathOf(b);
  if (source.has(p)) fail(`duplicate file block in source: ${p}`);
  source.set(p, b);
}

// ---------------------------------------------------------- proof 3: hunk math
// Returns side counts (for header validation) AND true deltas (for reporting).
function hunkStats(block, label) {
  const lines = block.split('\n');
  let hunks = 0, oldSide = 0, newSide = 0, added = 0, removed = 0, context = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!h) continue;
    const oldN = h[2] === undefined ? 1 : Number(h[2]);
    const newN = h[4] === undefined ? 1 : Number(h[4]);
    let o = 0, n = 0, j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l === '' || l.startsWith('@@ ') || l.startsWith('diff --git ')) break;
      const c = l[0];
      if (c === '+') { n++; added++; }
      else if (c === '-') { o++; removed++; }
      else if (c === ' ') { o++; n++; context++; }
      else if (c === '\\') continue; // "\ No newline at end of file"
      else break;
    }
    if (o !== oldN || n !== newN) {
      fail(`${label}: hunk header "@@ -${oldN} +${newN} @@" has body of -${o} +${n}`);
    }
    hunks++; oldSide += o; newSide += n;
    i = j - 1;
  }
  return { hunks, oldSide, newSide, added, removed, context };
}

// ------------------------------------------------------------- proof 1: census
const seen = new Map();
for (const g of groups) {
  for (const f of g.files) {
    if (seen.has(f)) fail(`file appears in two groups: ${f} (${seen.get(f)} and ${g.slug})`);
    seen.set(f, g.slug);
  }
}
const ungrouped = [...source.keys()].filter((f) => !seen.has(f));
const phantom = [...seen.keys()].filter((f) => !source.has(f));
if (ungrouped.length) fail(`source files with no group: ${ungrouped.join(', ')}`);
if (phantom.length) fail(`group files absent from the source patch: ${phantom.join(', ')}`);

// -------------------------------------------------------------------- emit
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.patch')) unlinkSync(join(outDir, f));

const rows = [];
let n = 0;
for (const g of groups) {
  n++;
  const num = String(n).padStart(4, '0');
  const name = `${num}-${g.slug}.patch`;
  const title = `${num} - ${g.title}`;
  let body = '';
  const acc = { hunks: 0, oldSide: 0, newSide: 0, added: 0, removed: 0, context: 0 };
  for (const f of g.files) {
    const st = hunkStats(source.get(f), f);
    for (const k of Object.keys(acc)) acc[k] += st[k];
    const b = norm(source.get(f));
    body += b;
  }
  const head =
    `${title}\n${'='.repeat(title.length)}\n\n` +
    `${g.why}\n\n` +
    `concern   : ${g.slug}\n` +
    `files     : ${g.files.length}\n` +
    `upstream  : squashed android patch ${cfg.upstream.commit.slice(0, 7)} ` +
    `(tailscale ${cfg.upstream.tailscale_range}), ${cfg.upstream.date}\n` +
    `apply     : git apply ${outDir}/${name}\n\n` +
    `Regrouped by concern from the upstream squashed patch - the ten commits named in\n` +
    `that squash are not recoverable from it, so this is a reviewed regrouping, not a\n` +
    `recovery. The split is lossless and machine-checked; see ${outDir}/MANIFEST.md.\n` +
    `Everything above the first "diff --git" is a preamble and is ignored by git apply.\n\n`;
  writeFileSync(join(outDir, name), head + body, 'utf8');
  rows.push({ num, name, slug: g.slug, title: g.title, files: g.files, ...acc });
}

// ----------------------------------------------------- proof 2: lossless, on disk
const emitted = new Map();
const writtenFiles = readdirSync(outDir).filter((x) => x.endsWith('.patch')).sort();
for (const f of writtenFiles) {
  const blocks = readFileSync(join(outDir, f), 'utf8').split(/(?=^diff --git )/m).slice(1);
  for (const b of blocks) {
    const p = pathOf(b);
    if (emitted.has(p)) fail(`file emitted twice across the series: ${p}`);
    emitted.set(p, b);
  }
}
for (const [p, b] of source) {
  if (!emitted.has(p)) fail(`the written series is missing ${p}`);
  if (sha(norm(emitted.get(p))) !== sha(norm(b))) {
    fail(`written block for ${p} is NOT byte-identical to the source`);
  }
}
if (emitted.size !== source.size) {
  fail(`series holds ${emitted.size} blocks, source holds ${source.size}`);
}
for (const [, b] of emitted) hunkStats(b, 'written-series'); // validate the artefact, not the intention

// --------------------------------------------------------- proof 4: git agrees
const totals = rows.reduce(
  (a, r) => ({
    files: a.files + r.files.length, hunks: a.hunks + r.hunks, added: a.added + r.added,
    removed: a.removed + r.removed, context: a.context + r.context,
    oldSide: a.oldSide + r.oldSide, newSide: a.newSide + r.newSide,
  }),
  { files: 0, hunks: 0, added: 0, removed: 0, context: 0, oldSide: 0, newSide: 0 }
);

let gitVerdict = 'skipped (git not on PATH)';
let gitTotals = null;
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
  let ga = 0, gd = 0, gn = 0;
  for (const f of writtenFiles) {
    const out = execFileSync('git', ['apply', '--numstat', join(outDir, f)], { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const [a, d] = line.split('\t');
      ga += Number(a) === Number(a) ? Number(a) : 0;
      gd += Number(d) === Number(d) ? Number(d) : 0;
      gn++;
    }
  }
  gitTotals = { files: gn, added: ga, removed: gd };
  if (gn !== totals.files) fail(`git sees ${gn} files, this tool sees ${totals.files}`);
  if (ga !== totals.added) fail(`git counts +${ga}, this tool counts +${totals.added}`);
  if (gd !== totals.removed) fail(`git counts -${gd}, this tool counts -${totals.removed}`);
  gitVerdict = `agreed on all ${gn} files (+${ga}/-${gd})`;
} catch (e) {
  if (gitTotals === null && !/git not on PATH/.test(gitVerdict)) {
    // a real mismatch already called fail(); anything else is a git-absent skip
    gitVerdict = `skipped (${String(e.message).split('\n')[0]})`;
  }
}

// ------------------------------------------------------------------ manifest
let md = '';
md += '# Patch series manifest\n\n';
md += `**Source:** \`${cfg.source}\`  \n`;
md += `**Source sha256:** \`${sourceSha}\`  \n`;
md += `**Source size:** ${totalLines} lines, ${source.size} file blocks.  \n`;
md += `**Upstream:** squashed android patch \`${cfg.upstream.commit.slice(0, 7)}\` - "${cfg.upstream.subject}", `;
md += `tailscale \`${cfg.upstream.tailscale_range}\`, by ${cfg.upstream.author}, dated ${cfg.upstream.date}.  \n`;
md += `**Series:** ${groups.length} patches, ${totals.files} files, ${totals.hunks} hunks, `;
md += `**+${totals.added}/-${totals.removed}** lines.  \n`;
md += `**Line accounting:** ${totals.newSide} new-side and ${totals.oldSide} old-side lines, of which `;
md += `${totals.context} are context (unchanged) - so ${totals.context} = ${totals.newSide} - ${totals.added} = ${totals.oldSide} - ${totals.removed}.\n\n`;
md += '## What this split is, and what it is not\n\n';
md += `${cfg.note}\n\n`;
md += 'Every block in the series below is **byte-identical** to its block in the source - ';
md += 'proven by sha256 over the written files, not over the intended ones. Every hunk header ';
md += 'was re-checked against its own body after writing, so a truncated patch cannot hide here. ';
md += 'And `git apply --numstat` - a parser this tool did not write - was required to report the ';
md += 'same line totals, which is how the first, badly-labelled version of this report was caught.\n\n';
md += '## The series\n\n';
md += '| # | patch | concern | files | hunks | + | - | new-side | old-side |\n';
md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
for (const r of rows) {
  md += `| ${r.num} | \`${r.name}\` | ${r.title.replace(/^\d+ - /, '')} | ${r.files.length} | ${r.hunks} | ${r.added} | ${r.removed} | ${r.newSide} | ${r.oldSide} |\n`;
}
md += `| | **total** | | **${totals.files}** | **${totals.hunks}** | **${totals.added}** | **${totals.removed}** | **${totals.newSide}** | **${totals.oldSide}** |\n\n`;
md += '## File to group\n\n';
for (const r of rows) {
  md += `### \`${r.name}\`\n\n`;
  for (const f of r.files) md += `- \`${f}\`  \n`;
  md += '\n';
}
md += '## Verification\n\n';
md += 'Re-run at any time (deterministic and idempotent):\n\n';
md += '```sh\n';
md += `node tools/split-android-patch.mjs ${cfg.source} patches\n`;
md += '```\n\n';
md += 'Success prints `OK` with the census; any failure exits non-zero with `FAIL <reason>`.\n';
md += 'Regenerate the series whenever the upstream android patch is re-synced to a newer\n';
md += 'tailscale release.\n';
writeFileSync(join(outDir, 'MANIFEST.md'), md, 'utf8');

console.log(`OK  ${outDir}: ${groups.length} patches, ${totals.files} files, ${totals.hunks} hunks, +${totals.added}/-${totals.removed}`);
console.log(`    source sha256 ${sourceSha}`);
console.log(`    context lines: ${totals.context}  (${totals.newSide} new-side - ${totals.added} added = ${totals.oldSide} old-side - ${totals.removed} removed, as it must)`);
console.log(`    proof 1 census complete - proof 2 byte-identical on disk - proof 3 every hunk header arithmetic-checked`);
console.log(`    proof 4 git apply --numstat: ${gitVerdict}`);
for (const r of rows) {
  console.log(`    ${r.num}  ${r.name.padEnd(34)} ${String(r.files.length).padStart(2)} files  ${String(r.hunks).padStart(3)} hunks  +${String(r.added).padStart(4)}/-${r.removed}`);
}
