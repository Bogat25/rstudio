import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, mkdir, stat, statfs, rename, truncate } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { MODEL, VISION } from './config';

export interface Asset { name: string; url: string; bytes: number; sha256: string; }
export const ASSETS: Asset[] = [
  { name: MODEL, url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    bytes: 2740937888, sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4' },
  { name: VISION, url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/mmproj-F16.gguf',
    bytes: 672423616, sha256: 'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864' }
];
export async function configureProxy(): Promise<void> {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
    setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: '127.0.0.1,localhost,' + (process.env.NO_PROXY ?? process.env.no_proxy ?? '') })); return;
  }
  if (process.platform !== 'win32') return;
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  const read = async (name: string) => {
    const { stdout } = await promisify(execFile)('reg.exe', ['query', key, '/v', name], { windowsHide: true });
    return new RegExp(`\\s${name}\\s+REG_\\w+\\s+([^\\r\\n]+)`).exec(stdout)?.[1]?.trim() ?? '';
  };
  try {
    if (await read('ProxyEnable') !== '0x1') return;
    const value = await read('ProxyServer');
    const match = /(?:^|;)https=([^;]+)/i.exec(value);
    const proxy = match?.[1] ?? (value.includes('=') ? /(?:^|;)http=([^;]+)/i.exec(value)?.[1] : value);
    if (!proxy) return;
    const bypass = await read('ProxyOverride').catch(() => '');
    // Honor common system bypass patterns through the environment proxy agent.
    // The local model HTTP requests always bypass proxying.
    const noProxy = ['127.0.0.1', 'localhost', ...bypass.split(';').filter(x => x && x !== '<local>')].join(',');
    setGlobalDispatcher(new EnvHttpProxyAgent({ httpProxy: proxy.includes('://') ? proxy : `http://${proxy}`,
      httpsProxy: proxy.includes('://') ? proxy : `http://${proxy}`, noProxy }));
  } catch { /* An absent system proxy is normal. */ }
}
export async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function download(asset: Asset, directory: string, signal: AbortSignal,
  progress: (bytes: number, total: number) => void): Promise<void> {
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, asset.name);
  if (await stat(destination).then(s => s.size === asset.bytes).catch(() => false) && await digest(destination) === asset.sha256) return;
  const partial = destination + '.part';
  let offset = await stat(partial).then(s => s.size).catch(() => 0);
  if (offset > asset.bytes) { await truncate(partial, 0); offset = 0; }
  const disk = await statfs(directory, { bigint: true });
  if (disk.bavail * disk.bsize < BigInt(asset.bytes - offset + 64 * 1024 * 1024))
    throw new Error('There is not enough free space for the model download.');
  if (offset < asset.bytes) {
    const response = await fetch(asset.url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal });
    if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status}).`);
    if (offset && response.status === 206) {
      if (!response.headers.get('content-range')?.startsWith(`bytes ${offset}-`)) throw new Error('The download server returned an incorrect byte range.');
    } else offset = 0;
    const file = await open(partial, offset ? 'a' : 'w');
    try {
      progress(offset, asset.bytes);
      for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
        signal.throwIfAborted();
        if (offset + chunk.length > asset.bytes) throw new Error('The downloaded file exceeds its expected size.');
        let written = 0;
        while (written < chunk.length) {
          const result = await file.write(chunk, written, chunk.length - written);
          if (!result.bytesWritten) throw new Error('The model file could not be written.');
          written += result.bytesWritten;
        }
        offset += chunk.length; progress(offset, asset.bytes);
      }
    } finally { await file.close(); }
  }
  signal.throwIfAborted();
  if (offset !== asset.bytes) throw new Error('The download ended early. Resume it to continue.');
  if (await digest(partial) !== asset.sha256) {
    await truncate(partial, 0);
    throw new Error('SHA-256 verification failed. The partial file was reset; retry the download.');
  }
  signal.throwIfAborted();
  await rename(partial, destination);
}
