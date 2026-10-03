import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, ThinkFilter, codeBlocks, lastError, OLD_PICTURE } from '../src/shared/chat';
import { answerStream } from '../src/server/stream';

test('split thought tags are removed without losing arithmetic or Unicode', () => {
  const filter = new ThinkFilter();
  let result = '';
  for (const char of 'ő<think>private 😀</think>≤ ∑ √ 中文 😀<thing>') result += filter.push(char);
  result += filter.push('', true);
  assert.equal(result, 'ő≤ ∑ √ 中文 😀<thing>');
});
test('code extraction never substitutes prose and keeps several or incomplete blocks', () => {
  assert.equal(codeBlocks('No code here.'), null);
  assert.equal(codeBlocks('```r\nx <- 1\n```\nText\n~~~r\ny <- 2\n~~~'), 'x <- 1\n\ny <- 2');
  assert.equal(codeBlocks('```r\nx <- 1'), 'x <- 1');
});
test('last error includes the causing command and ignores later successful commands', () => {
  assert.equal(lastError(['> bad(x)', 'Error in bad(x) : no such function', '  detail', '> 2+2', '[1] 4']), '> bad(x)\nError in bad(x) : no such function\n  detail');
  assert.equal(lastError(['> 2+2', '[1] 4']), null);
});
test('requests keep the newest four pictures, pictures before text and system first', () => {
  const picture = (n: number) => ({ name: String(n), url: `data:image/png;base64,${n}` });
  const result = messages('Prompt', [{ role: 'user', text: 'Older', pictures: [picture(1), picture(2), picture(3)] }, { role: 'assistant', text: 'Answer' }], { role: 'user', text: 'New', pictures: [picture(4), picture(5), picture(6)] });
  assert.deepEqual(result[0], { role: 'system', content: 'Prompt' });
  assert.match(JSON.stringify(result[1]), new RegExp(OLD_PICTURE.replace(/[\[\].]/g, '\\$&')));
  const content = result[3].content as any[];
  assert.equal(content[0].image_url.url, picture(6).url);
  assert.equal(content.at(-1).text, 'New');
  assert.equal(JSON.stringify(result).match(/"type":"image_url"/g)?.length, 4);
});

test('zero history sends only the system prompt and current question', () => {
  assert.equal(messages('Prompt', [{ role: 'assistant', text: 'old' }], { role: 'user', text: 'new' }, 0).length, 2);
});
test('SSE survives byte splits, null delta, escaped surrogate pairs and split thoughts', async () => {
  const wire = [null, '<thi', 'nk>hidden</th', 'ink>```r\ncat("ő 中文 😀")\n```'].map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`).join('') + 'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(wire.replace('😀', '\\ud83d\\ude00'));
  const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  let answer = '';
  for await (const text of answerStream(new Response(body))) answer += text;
  assert.equal(answer, '```r\ncat("ő 中文 😀")\n```');
});
test('a truncated model stream is reported as an error', async () => {
  await assert.rejects(async () => { for await (const _text of answerStream(new Response('data: {}\n\n'))) {} }, /before the answer finished/);
});
