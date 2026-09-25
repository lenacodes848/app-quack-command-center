import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = readFileSync(join(root, 'STUDENT_DECISIONS.md'), 'utf8');

function sections() {
  const parts = text.split(/^## /m).slice(1);
  return parts.map((p) => {
    const [title, ...rest] = p.split('\n');
    return { title: title.trim(), body: rest.join('\n') };
  });
}

test('every single-line field in STUDENT_DECISIONS.md has a value', () => {
  const empty = [];
  for (const s of sections()) {
    const lines = s.body.split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^([A-Z][^:\n]{2,80}):\s*(.*)$/);
      if (!m) return;
      if (/^(Note|Marks?|Choose|Mark)\b/.test(m[1])) return;
      const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
      const introducesChoices = /^\d+\.\s+\[[ x]\]/.test(next);
      if (m[2].trim() === '' && !introducesChoices) empty.push(`${s.title} -> ${m[1]}`);
    });
  }
  assert.deepEqual(empty, [], `empty fields:\n${empty.join('\n')}`);
});

test('every choice group has a selection or is recorded as not applicable', () => {
  const missing = [];
  for (const s of sections()) {
    const boxes = s.body.match(/^\d+\.\s+\[[ x]\]/gm) ?? [];
    if (boxes.length === 0) continue;
    const checked = boxes.filter((b) => b.includes('[x]')).length;
    const na = /not_applicable/i.test(s.body);
    if (checked === 0 && !na) missing.push(s.title);
  }
  assert.deepEqual(missing, [], `sections with no selection: ${missing.join(', ')}`);
});

test('at least one of Claude Code or Codex is selected', () => {
  const s = sections().find((x) => x.title.startsWith('3.'));
  assert.ok(s, 'section 3 missing');
  assert.match(s.body, /^1\.\s+\[x\]\s+Claude Code|^2\.\s+\[x\]\s+Codex/m);
});

test('first release definition paragraph is written', () => {
  const s = sections().find((x) => x.title.startsWith('14.'));
  assert.ok(s, 'section 14 missing');
  const paragraph = s.body.split('\n').filter((l) => l.trim() && !l.startsWith('Write one paragraph')).join(' ');
  assert.ok(paragraph.length > 300, 'first release paragraph is missing or too short');
});

test('no credentials or private paths are recorded in the worksheet', () => {
  assert.doesNotMatch(text, /sk-[A-Za-z0-9]{10,}/);
  assert.doesNotMatch(text, /\/Users\//);
});
