import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { defaults, MODEL, selectContext, loadSettings, applicationHome, contextFolder, systemPrompt } from '../src/server/config';
import { Model } from '../src/server/model';

test('course selection ranks shared words and respects the exact character budget', () => {
  const files = [{ name: 'random.R', text: 'random normal samples' }, { name: 'regression.md', text: 'regression coefficients residuals' }];
  const selected = selectContext(files, 'Explain regression residuals', 53);
  assert.match(selected, /^\n--- regression.md ---/);
  assert.equal(selected.length, 53);
  assert.equal(selectContext(files, 'anything', 0), '');
});

test('supervisor reuses an existing healthy loopback server without owning it', async () => {
  const server = http.createServer((_req, response) => response.writeHead(200).end('{}'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const settings = { ...defaults(), port: (server.address() as any).port };
  const model = new Model(() => {}, () => { throw new Error('must not launch'); });
  try { await model.ready(settings); assert.equal(model.usesExternalServer, true); model.stop(); assert.ok(server.listening); }
  finally { server.close(); }
});

test('supervisor starts once, waits through loading, restarts after exit and closes its child', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-model-test-'));
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as any).port; await new Promise<void>(r => probe.close(() => r()));
  const script = path.join(directory, 'fake.cjs');
  await writeFile(path.join(directory, MODEL), 'fake');
  await writeFile(script, `const http=require('node:http'); const started=Date.now(); http.createServer((q,r)=>r.writeHead(Date.now()-started>200?200:503).end('{}')).listen(${port},'127.0.0.1');`);
  const children: ReturnType<typeof spawn>[] = [];
  const model = new Model(() => {}, (_exe, args) => {
    assert.ok(args.includes('--host')); assert.equal(args[args.indexOf('--host') + 1], '127.0.0.1');
    const child = spawn(process.execPath, [script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); return child;
  });
  const settings = { ...defaults(directory), modelDirectory: directory, serverExe: process.execPath, port, startupTimeout: 5 };
  try {
    await Promise.all([model.ready(settings), model.ready(settings)]); assert.equal(children.length, 1);
    const ended = once(children[0], 'exit'); children[0].kill(); await ended;
    await model.ready(settings); assert.equal(children.length, 2);
    const stopped = once(children[1], 'exit'); model.stop(); await stopped;
    assert.equal(model.ownedPid, undefined);
  } finally { model.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('missing model is an actionable error', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-missing-model-'));
  // Own the endpoint: a running IDE may already serve the default model port.
  const server = http.createServer((_req, response) => response.writeHead(503).end());
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const model = new Model(() => {});
  try {
    await assert.rejects(model.ready({ ...defaults(directory), modelDirectory: directory,
      port: (server.address() as any).port }), /model is missing/);
  } finally {
    model.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('startup failure reports the server error and a hung startup is bounded', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-model-failure-'));
  await writeFile(path.join(directory, MODEL), 'fixture');
  const server = http.createServer((_req, response) => response.writeHead(503).end());
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const settings = { ...defaults(directory), modelDirectory: directory, serverExe: process.execPath,
    startupTimeout: 1, port: (server.address() as any).port };
  const children: ReturnType<typeof spawn>[] = [];
  const failed = new Model(() => {}, () => {
    const child = spawn(process.execPath, ['-e', 'console.error("error: fixture model failed to load"); process.exit(2)'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); return child;
  });
  const hung = new Model(() => {}, () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); return child;
  });
  try {
    await assert.rejects(failed.ready(settings), /error: fixture model failed to load.*Log:/);
    const start = Date.now();
    await assert.rejects(hung.ready(settings), /did not become ready within 1 seconds/);
    assert.ok(Date.now() - start < 2500);
  } finally {
    await failed.stop(); await hung.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
    await rm(directory, { recursive: true, force: true });
  }
});

test('relative configuration follows application home and course material is read again for each question', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-settings-'));
  try {
    await writeFile(path.join(directory, 'settings.json'), JSON.stringify({ serverExe: 'llama/llama-server.exe', modelDirectory: 'models' }));
    const settings = await loadSettings(directory);
    assert.equal(settings.serverExe, path.resolve(applicationHome, 'llama/llama-server.exe'));
    assert.equal(settings.modelDirectory, path.resolve(applicationHome, 'models'));
    settings.contextDirectory = directory;
    assert.equal(await contextFolder(settings), directory);
    await writeFile(path.join(directory, 'course.md'), 'regression course version one');
    assert.match(await systemPrompt(settings, 'regression'), /course version one/);
    await writeFile(path.join(directory, 'course.md'), 'regression course version two');
    const prompt = await systemPrompt(settings, 'regression');
    assert.match(prompt, /course version two/); assert.doesNotMatch(prompt, /course version one/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
