import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { download } from '../src/server/download';

test('download resumes a byte range and renames only a verified complete file', async () => {
  const body = Buffer.from('verified model fixture'); let requested = '';
  const server = http.createServer((req, res) => {
    requested = req.headers.range ?? '';
    res.writeHead(206, { 'content-range': `bytes 5-${body.length - 1}/${body.length}` }); res.end(body.subarray(5));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-download-'));
  const asset = { name: 'fixture.gguf', bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'),
    url: `http://127.0.0.1:${(server.address() as any).port}/file` };
  try {
    await writeFile(path.join(directory, asset.name + '.part'), body.subarray(0, 5));
    await download(asset, directory, new AbortController().signal, () => {});
    assert.equal(requested, 'bytes=5-'); assert.deepEqual(await readFile(path.join(directory, asset.name)), body);
    assert.equal(await stat(path.join(directory, asset.name + '.part')).catch(() => null), null);
  } finally { server.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a server ignoring Range restarts the file and a bad checksum cannot publish it', async () => {
  const body = Buffer.from('all bytes');
  const server = http.createServer((_req, res) => res.end(body));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-download-'));
  const asset = { name: 'fixture.gguf', bytes: body.length, sha256: '0'.repeat(64), url: `http://127.0.0.1:${(server.address() as any).port}/file` };
  try {
    await writeFile(path.join(directory, asset.name + '.part'), body.subarray(0, 3));
    await assert.rejects(download(asset, directory, new AbortController().signal, () => {}), /SHA-256/);
    assert.equal(await stat(path.join(directory, asset.name)).catch(() => null), null);
    assert.equal((await stat(path.join(directory, asset.name + '.part'))).size, 0);
  } finally { server.close(); await rm(directory, { recursive: true, force: true }); }
});

test('pause leaves a partial file that can resume without publishing it', async () => {
  const body = Buffer.alloc(65536, 65);
  const server = http.createServer((_req, res) => { res.write(body); setTimeout(() => res.end(body), 1000).unref(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rstudio-download-'));
  const asset = { name: 'fixture.gguf', bytes: body.length * 2, sha256: '0'.repeat(64), url: `http://127.0.0.1:${(server.address() as any).port}/file` };
  const controller = new AbortController();
  try {
    await assert.rejects(download(asset, directory, controller.signal, bytes => { if (bytes) controller.abort(); }));
    assert.ok((await stat(path.join(directory, asset.name + '.part'))).size > 0);
    assert.equal(await stat(path.join(directory, asset.name)).catch(() => null), null);
  } finally { server.closeAllConnections(); server.close(); await rm(directory, { recursive: true, force: true }); }
});
