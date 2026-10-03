import { stat } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Ide } from './protocol';
import { Model } from './model';
import { answerStream } from './stream';
import { loadSettings, initialize, systemPrompt, saveSettings, Settings, MODEL, VISION } from './config';
import { ASSETS, download, configureProxy } from './download';
import { messages, codeBlocks, lastError, Turn, Picture, PICTURE_QUESTION } from '../shared/chat';

export class Assistant {
  private clients = new Set<WebSocket>();
  private history: Turn[] = [];
  private generation?: AbortController;
  private downloading?: AbortController;
  private status = 'Local assistant connected.';
  private offered = false;
  private readerOffered = false;
  private initialized = initialize().then(configureProxy);
  private model = new Model(text => this.setStatus(text));
  constructor(private ide: Ide) {}
  private async settings(): Promise<Settings> {
    return loadSettings(undefined, await this.ide.request('workspace/getLocalSettings'));
  }
  private send(ws: WebSocket, message: unknown): void { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
  private broadcast(message: unknown): void { for (const ws of this.clients) this.send(ws, message); }
  private state(): void { this.broadcast({ type: 'state', history: this.history, busy: !!this.generation, status: this.status, downloading: !!this.downloading }); }
  private setStatus(text: string): void { this.status = text; this.broadcast({ type: 'status', text }); }
  async connect(ws: WebSocket): Promise<void> {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', data => {
      try { const message = JSON.parse(data.toString()); void this.action(ws, message).catch(error => this.send(ws, { type: 'error', text: error.message })); }
      catch { this.send(ws, { type: 'error', text: 'Invalid assistant message.' }); }
    });
    this.send(ws, { type: 'state', history: this.history, busy: !!this.generation, status: this.status, downloading: !!this.downloading });
    try {
      await this.initialized;
      const settings = await this.settings();
      const present = await stat(path.join(settings.modelDirectory, MODEL)).then(s => s.isFile()).catch(() => false);
      if (present) {
        await this.model.ready(settings);
        if (!this.readerOffered && !await stat(path.join(settings.modelDirectory, VISION)).then(s => s.isFile()).catch(() => false)) {
          this.readerOffered = true; this.send(ws, { type: 'offer', visionOnly: true });
        }
      }
      else if (!settings.downloadOffered && !this.offered) {
        this.offered = true; settings.downloadOffered = true; await saveSettings(settings);
        this.send(ws, { type: 'offer', visionOnly: false });
        this.setStatus('The local model is missing. You can download it now or later.');
      } else this.setStatus('The local model is missing. Use Download model to install it.');
    } catch (error: any) { this.setStatus(error.message); }
  }
  private async action(ws: WebSocket, message: any): Promise<void> {
    if (message.type === 'stop') { this.generation?.abort(); this.downloading?.abort(); return; }
    if (message.type === 'pause-download') { this.downloading?.abort(); return; }
    if (message.type === 'new-chat') {
      if (this.generation) { this.generation.abort(); throw new Error('Stop the answer before starting a new chat.'); }
      this.history = []; this.state(); return;
    }
    await this.initialized;
    const settings = await this.settings();
    if (message.type === 'pictures-attached') {
      if (!await stat(path.join(settings.modelDirectory, VISION)).then(s => s.isFile()).catch(() => false))
        this.send(ws, { type: 'offer', visionOnly: true });
      return;
    }
    if (message.type === 'send') {
      if (this.generation) throw new Error('An answer is already in progress.');
      let text = typeof message.text === 'string' ? message.text.slice(0, 64000).trim() : '';
      const pictures: Picture[] = Array.isArray(message.pictures) ? message.pictures.slice(0, 20) : [];
      if (pictures.some(p => typeof p.name !== 'string' || typeof p.url !== 'string' || p.url.length > 2 * 1024 * 1024 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(p.url)))
        throw new Error('A picture has an unsupported format or size.');
      if (!text && pictures.length) text = PICTURE_QUESTION;
      if (!text) return;
      if (pictures.length && !await stat(path.join(settings.modelDirectory, VISION)).then(s => s.isFile()).catch(() => false)) {
        this.send(ws, { type: 'offer', visionOnly: true }); throw new Error('The vision reader is missing. Download it to ask about pictures.');
      }
      const question: Turn = { role: 'user', text, pictures };
      // Prepare a complete immutable request before generation starts.
      const prompt = await systemPrompt(settings, text);
      if (this.generation) throw new Error('An answer is already in progress.');
      const body = JSON.stringify({ messages: messages(prompt, this.history, question, settings.keepHistory),
        temperature: settings.temperature, top_p: settings.topP, max_tokens: settings.maxTokens,
        stream: true, chat_template_kwargs: { enable_thinking: settings.thinking } });
      const controller = this.generation = new AbortController();
      this.history.push(question, { role: 'assistant', text: '' }); this.state();
      this.send(ws, { type: 'sent' });
      void this.generate(settings, body, pictures.length > 0, controller); return;
    }
    if (message.type === 'attach') {
      if (message.kind === 'script') {
        const result = await this.ide.request('workspace/getCurrentScript');
        this.send(ws, { type: 'attachment', name: 'Current script', text: String(result.content).slice(0, 12000) });
      } else if (message.kind === 'console' || message.kind === 'error') {
        const result = await this.ide.request('runtime/getConsoleContent', { limit: 200, maxChars: 16000, fromBottom: true });
        const text = message.kind === 'error' ? lastError(result.lines) : result.lines.join('\n').slice(-12000);
        if (!text) throw new Error(message.kind === 'error' ? 'No recent R error was found.' : 'The console is empty.');
        this.send(ws, { type: 'attachment', name: message.kind === 'error' ? 'Last error' : 'Recent console output', text });
      } else if (message.kind === 'plot') {
        const result = await this.ide.request('ui/getCurrentPlot');
        this.send(ws, { type: 'picture', picture: { name: result.name, url: result.url } });
        if (!await stat(path.join(settings.modelDirectory, VISION)).then(s => s.isFile()).catch(() => false))
          this.send(ws, { type: 'offer', visionOnly: true });
      } else throw new Error('Unknown attachment.');
      return;
    }
    if (message.type === 'to-editor') {
      const latest = [...this.history].reverse().find(t => t.role === 'assistant');
      const code = latest ? codeBlocks(latest.text) : null;
      if (code === null) throw new Error('The last answer contains no code.');
      const result = await this.ide.request('workspace/insertAtCursor', { content: code });
      if (!result.success) await this.ide.request('workspace/insertIntoNewFile', { content: code, languageId: 'r' });
      this.send(ws, { type: 'notice', text: 'Code inserted in the editor.' }); return;
    }
    if (message.type === 'download') { void this.downloadModels(settings, !!message.visionOnly); return; }
    throw new Error('Unknown assistant action.');
  }
  private async generate(settings: Settings, body: string, vision: boolean, controller: AbortController): Promise<void> {
    const answer = this.history.at(-1)!;
    let timeout: NodeJS.Timeout | undefined;
    try {
      // Keep warm-up independent of cancellation, but release the UI immediately
      // when Stop is pressed while the model is still loading.
      await Promise.race([this.model.ready(settings, vision), new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('Stopped.')), { once: true });
      })]);
      controller.signal.throwIfAborted();
      timeout = setTimeout(() => controller.abort(new Error('The model request timed out.')), settings.requestTimeout * 1000);
      this.setStatus(vision ? 'Reading the picture…' : 'Answering…'); this.ide.notify('chat/setBusyStatus', { busy: true });
      const response = await fetch(this.model.url(settings) + '/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal });
      for await (const text of answerStream(response)) {
        if (!answer.text && vision) this.setStatus('Answering…');
        answer.text += text;
        this.broadcast({ type: 'delta', text });
      }
      this.setStatus('Local model ready.');
    } catch (error: any) {
      this.setStatus(controller.signal.aborted ? (controller.signal.reason?.message === 'The model request timed out.' ? controller.signal.reason.message : 'Stopped.') : error.message);
    } finally {
      clearTimeout(timeout); this.generation = undefined;
      this.ide.notify('chat/setBusyStatus', { busy: false }); this.state();
    }
  }
  private async downloadModels(settings: Settings, visionOnly: boolean): Promise<void> {
    if (this.downloading) return;
    if (this.generation) { this.setStatus('Stop the answer before downloading the model.'); return; }
    const controller = this.downloading = new AbortController(); this.state();
    try {
      for (const asset of visionOnly ? ASSETS.slice(1) : ASSETS) {
        await download(asset, settings.modelDirectory, controller.signal, (bytes, total) =>
          this.broadcast({ type: 'download-progress', name: asset.name, bytes, total }));
      }
      await this.model.stop();
      this.setStatus('Download verified. Loading the local model…');
      await this.model.ready(settings);
    } catch (error: any) { this.setStatus(controller.signal.aborted ? 'Download paused. Use Download model to resume.' : error.message); }
    finally { this.downloading = undefined; this.state(); }
  }
  stop(): void { this.generation?.abort(); this.downloading?.abort(); this.model.stop(); }
}
