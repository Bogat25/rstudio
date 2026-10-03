import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
import { Frames, frame, IDE_METHODS } from '../src/server/protocol';
import { MODEL, VISION } from '../src/server/config';

test('bundled backend streams Unicode, keeps history across clients, cancels and inserts only requested code', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-assistant-test-'));
  const requests: any[] = [];
  const fake = http.createServer(async (req, res) => {
    if (req.url === '/health') { res.end('{}'); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body); requests.push(message);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const emit = (content: string | null) => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    emit(null);
    if (JSON.stringify(message.messages.at(-1)).includes('STOP')) {
      const timer = setInterval(() => emit('more '), 20); res.on('close', () => clearInterval(timer)); return;
    }
    emit('<thi'); emit('nk>private</th'); emit('ink>2 * 3 = 6.\n\n```r\nx <- "ő ű ≤ ∑ √ 中文 😀"\n```'); res.end('data: [DONE]\n\n');
  });
  fake.listen(0, '127.0.0.1'); await once(fake, 'listening');
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as any).port; await new Promise<void>(r => probe.close(() => r()));
  await mkdir(path.join(directory, 'models'));
  await writeFile(path.join(directory, 'models', MODEL), 'fixture');
  await writeFile(path.join(directory, 'models', VISION), 'fixture');
  await writeFile(path.join(directory, 'settings.json'), JSON.stringify({ port: (fake.address() as any).port }));
  const auth = randomBytes(24).toString('hex');
  const root = path.resolve(__dirname, '../..');
  const child = spawn(process.execPath, [path.join(root, 'dist/server/main.js'), '-h', '127.0.0.1', '-p', String(port), '--allowed-origin', 'http://127.0.0.1:56789'], {
    windowsHide: true, env: { ...process.env, RSTUDIO_CHAT_AUTH_TOKEN: auth, RSTUDIO_LOCAL_ASSISTANT_DATA: directory,
      RSTUDIO_LOCAL_ASSISTANT_RESOURCES: root, RSTUDIO_LOCAL_ASSISTANT_PREFS: '{}' }, stdio: ['pipe', 'pipe', 'pipe']
  });
  const methods: string[] = []; const frames = new Frames(); let code = '';
  let handshake!: () => void; const started = new Promise<void>(resolve => { handshake = resolve; });
  child.stdout.on('data', (chunk: Buffer) => {
    for (const message of frames.push(chunk)) {
      if (!message.id || !message.method) continue;
      methods.push(message.method);
      let result: unknown = {};
      if (message.method === 'protocol/getVersion') { result = { protocolVersion: '11.0', capabilities: [...IDE_METHODS] }; handshake(); }
      if (message.method === 'workspace/getCurrentScript') result = { content: 'unsaved <- 1' };
      if (message.method === 'workspace/insertAtCursor') result = { success: false };
      if (message.method === 'workspace/insertIntoNewFile') { result = { success: true }; code = message.params.content; }
      child.stdin.write(frame({ jsonrpc: '2.0', id: message.id, result }));
    }
  });
  const clients: WebSocket[] = [];
  const events: any[] = [];
  const waitFor = async (predicate: (message: any) => boolean, after = 0, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const message = events.slice(after).find(predicate); if (message) return message;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected assistant event was not received.');
  };
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ai-chat`, { origin: 'http://127.0.0.1:56789', headers: { Cookie: `posit-assistant-auth=${auth}` } });
    clients.push(ws); ws.on('message', data => events.push(JSON.parse(data.toString()))); await once(ws, 'open'); return ws;
  };
  try {
    await Promise.race([started, new Promise<never>((_r, reject) => setTimeout(() => reject(new Error('Backend handshake timed out.')), 5000).unref())]);
    for (const options of [{ origin: 'http://127.0.0.1:56789', headers: {} },
      { origin: 'http://untrusted.invalid', headers: { Cookie: `posit-assistant-auth=${auth}` } }]) {
      const denied = new WebSocket(`ws://127.0.0.1:${port}/ai-chat`, options);
      const status = await new Promise<number>((resolve, reject) => {
        denied.on('unexpected-response', (_request, response) => { resolve(response.statusCode!); response.resume(); denied.terminate(); });
        denied.on('error', () => {}); denied.on('open', () => reject(new Error('Unauthenticated or foreign-origin connection was accepted.')));
      });
      assert.equal(status, 403);
    }
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'send', text: 'Explain arithmetic' }));
    const finished = await waitFor(m => m.type === 'state' && !m.busy && m.history.length === 2);
    assert.match(finished.history[1].text, /ő ű ≤ ∑ √ 中文 😀/); assert.doesNotMatch(finished.history[1].text, /private|think/);
    assert.equal(requests[0].messages[0].role, 'system'); assert.equal(requests[0].chat_template_kwargs.enable_thinking, false);
    const after = events.length; await connect();
    const resumed = await waitFor(m => m.type === 'state' && m.history.length === 2, after); assert.equal(resumed.history[1].text, finished.history[1].text);
    ws.send(JSON.stringify({ type: 'to-editor' })); await waitFor(m => m.type === 'notice', after);
    assert.equal(code, 'x <- "ő ű ≤ ∑ √ 中文 😀"');
    ws.send(JSON.stringify({ type: 'attach', kind: 'script' })); const attachment = await waitFor(m => m.type === 'attachment', after); assert.equal(attachment.text, 'unsaved <- 1');
    const stopAfter = events.length; ws.send(JSON.stringify({ type: 'send', text: 'STOP' })); await waitFor(m => m.type === 'delta', stopAfter);
    const stopTime = Date.now(); ws.send(JSON.stringify({ type: 'stop' }));
    await waitFor(m => m.type === 'state' && !m.busy && m.status === 'Stopped.', stopAfter); assert.ok(Date.now() - stopTime < 1000);
    assert.ok(methods.every(method => IDE_METHODS.has(method)));
  } finally {
    clients.forEach(ws => ws.terminate());
    const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve();
    child.stdin.end(); await exited; fake.closeAllConnections(); fake.close(); await rm(directory, { recursive: true, force: true });
  }
});
