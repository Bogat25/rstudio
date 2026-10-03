import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { defaults } from '../src/server/config';
import { Model } from '../src/server/model';
import { answerStream } from '../src/server/stream';

test('pinned CPU Qwen model produces a streamed R answer', {
  skip: !process.env.RSTUDIO_TEST_REAL_MODEL_DIR, timeout: 300000
}, async () => {
  const settings = { ...defaults(), modelDirectory: process.env.RSTUDIO_TEST_REAL_MODEL_DIR!,
    serverExe: path.resolve(__dirname, '../../llama/llama-server.exe'), threads: 4, port: 18714 };
  const model = new Model(text => process.stdout.write(text + '\n'));
  try {
    await model.ready(settings);
    const response = await fetch(model.url(settings) + '/v1/chat/completions', { method: 'POST',
      headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ messages: [{ role: 'system', content: 'Help a student learn R. Put code in fenced R blocks.' },
        { role: 'user', content: 'Give R code for the mean of c(1, 2, 3). Keep the answer short.' }],
        stream: true, max_tokens: 128, chat_template_kwargs: { enable_thinking: false } }) });
    let answer = ''; for await (const text of answerStream(response)) answer += text;
    assert.match(answer, /mean\s*\(/); assert.doesNotMatch(answer, /<think>/);
    process.stdout.write('Real CPU model returned a streamed R answer.\n');
    if (process.env.RSTUDIO_TEST_REAL_PICTURE) {
      const image = await readFile(process.env.RSTUDIO_TEST_REAL_PICTURE);
      const pictureResponse = await fetch(model.url(settings) + '/v1/chat/completions', { method: 'POST',
        headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + image.toString('base64') } },
          { type: 'text', text: 'Describe this plot in one short sentence.' }
        ] }], stream: true, max_tokens: 64, chat_template_kwargs: { enable_thinking: false } }) });
      let description = ''; for await (const text of answerStream(pictureResponse)) description += text;
      assert.ok(description.trim().length > 10); assert.doesNotMatch(description, /<think>/);
      process.stdout.write('Real CPU vision reader returned a streamed description of an R plot.\n');
    }
  } finally { await model.stop(); }
});
