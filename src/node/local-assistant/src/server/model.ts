import { spawn, ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Settings, MODEL, VISION } from './config';

export class Model {
  private child?: ChildProcess;
  private starting?: Promise<void>;
  private closed = false;
  private signature = '';
  private lastError = '';
  private recentLog = '';
  private log?: ReturnType<typeof createWriteStream>;
  private external = false;
  private stopping: Promise<void> = Promise.resolve();
  constructor(private status: (text: string) => void,
    private launch = (exe: string, args: string[]) => spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })) {}
  url(settings: Settings): string { return `http://127.0.0.1:${settings.port}`; }
  private async healthy(settings: Settings): Promise<boolean> {
    return fetch(this.url(settings) + '/health', { signal: AbortSignal.timeout(500) }).then(r => r.ok).catch(() => false);
  }
  async ready(settings: Settings, vision = false): Promise<void> {
    const signature = JSON.stringify([settings.serverExe, settings.modelDirectory, settings.port,
      settings.threads, settings.ctxSize, settings.imageMaxTokens]);
    if (this.signature && this.signature !== signature) {
      const previous = this.starting;
      await this.stop(); await previous?.catch(() => {});
    } else await this.stopping;
    this.closed = false;
    this.signature = signature;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      if (await this.healthy(settings)) { this.external = !this.child; return; }
      this.external = false;
      await this.start(settings, vision);
    })().finally(() => { this.starting = undefined; });
    return this.starting;
  }
  private async start(settings: Settings, vision: boolean): Promise<void> {
    const model = path.join(settings.modelDirectory, MODEL);
    const reader = path.join(settings.modelDirectory, VISION);
    if (!await stat(model).then(s => s.isFile()).catch(() => false)) throw new Error('The local model is missing. Use Download model to install it.');
    const hasReader = await stat(reader).then(s => s.isFile()).catch(() => false);
    if (vision && !hasReader) throw new Error('The vision reader is missing. Download it to ask about pictures.');
    if (!await stat(settings.serverExe).then(s => s.isFile()).catch(() => false)) throw new Error('llama-server is missing. See the local assistant developer instructions.');
    this.closed = false; this.lastError = ''; this.recentLog = '';
    const folder = path.join(os.tmpdir(), 'rstudio-local-assistant');
    await mkdir(folder, { recursive: true });
    const filename = path.join(folder, `llama-${process.pid}.log`);
    const log = this.log = createWriteStream(filename, { flags: 'a' });
    const args = ['-m', model, '--host', '127.0.0.1', '--port', String(settings.port),
      '-ngl', '0', '-c', String(settings.ctxSize)];
    if (settings.threads) args.push('-t', String(settings.threads));
    if (hasReader) args.push('--mmproj', reader, '--image-max-tokens', String(settings.imageMaxTokens));
    const child = this.child = this.launch(settings.serverExe, args);
    child.on('error', () => { this.lastError = 'Unable to start llama-server.'; });
    const capture = (chunk: Buffer) => {
      if (!log.writableEnded) log.write(chunk);
      this.recentLog = (this.recentLog + chunk.toString('utf8')).slice(-16000);
      const errors = this.recentLog.split(/\r?\n/).filter(line => /error|failed/i.test(line));
      if (errors.length) this.lastError = errors.at(-1)!.slice(0, 500);
    };
    child.stdout?.on('data', capture); child.stderr?.on('data', capture);
    child.once('exit', () => { if (this.child === child) this.child = undefined; log.end(); });
    this.status('Loading the local model…');
    const deadline = Date.now() + settings.startupTimeout * 1000;
    while (Date.now() < deadline && !this.closed) {
      if (await this.healthy(settings)) { this.status('Local model ready.'); return; }
      if (child.exitCode !== null || child.signalCode !== null || this.lastError === 'Unable to start llama-server.')
        throw new Error((this.lastError || 'llama-server exited during startup.') + ` Log: ${filename}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.stop();
    throw new Error(`The model did not become ready within ${settings.startupTimeout} seconds. Log: ${filename}`);
  }
  get ownedPid(): number | undefined { return this.child?.pid; }
  get usesExternalServer(): boolean { return this.external; }
  stop(): Promise<void> {
    this.closed = true;
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      this.stopping = new Promise(resolve => {
        const timer = setTimeout(resolve, 2000); timer.unref();
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
      child.kill();
    }
    this.child = undefined;
    this.log?.end();
    return this.stopping;
  }
}
