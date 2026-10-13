import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index.html pins three 0.170.0 and maps addons', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /"three": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/build\/three\.module\.js"/);
  assert.match(html, /"three\/addons\/": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/examples\/jsm\/"/);
});
