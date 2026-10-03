import test from 'node:test';
import assert from 'node:assert/strict';
import { blocks } from '../src/client/markdown';

test('streaming Markdown omits fence markers and horizontal rules and preserves literal code', () => {
  assert.deepEqual(blocks('# Result\n\n2 * 3 is 6.\n\n---\n```r\nx <- "ő ű ≤ ∑ √ 中文 😀"'), [
    { kind: 'heading', text: 'Result' }, { kind: 'paragraph', text: '2 * 3 is 6.' },
    { kind: 'code', text: 'x <- "ő ű ≤ ∑ √ 中文 😀"' }
  ]);
});
test('lists, quotes and raw HTML remain data for safe DOM rendering', () => {
  assert.deepEqual(blocks('- one\n- two\n\n> note\n<script>run()</script>'), [
    { kind: 'list', text: 'one\ntwo', ordered: false }, { kind: 'quote', text: 'note' },
    { kind: 'paragraph', text: '<script>run()</script>' }
  ]);
});
