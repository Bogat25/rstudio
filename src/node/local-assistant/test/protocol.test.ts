import test from 'node:test';
import assert from 'node:assert/strict';
import { Frames, frame, IDE_METHODS } from '../src/server/protocol';

test('stdio framing counts UTF-8 bytes and accepts one byte at a time', () => {
  const message = { jsonrpc: '2.0', id: 1, result: 'ő ű Ελληνικά ≤ ∑ √ 中文 😀' };
  const parser = new Frames();
  const results = [];
  for (const byte of frame(message)) results.push(...parser.push(Buffer.from([byte])));
  assert.deepEqual(results, [message]);
});
test('execution and file mutations are unavailable to the local backend', () => {
  for (const method of ['runtime/executeCode', 'workspace/writeFileContent', 'workspace/editFileContent'])
    assert.equal(IDE_METHODS.has(method), false);
});
