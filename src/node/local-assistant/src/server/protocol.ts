import { EventEmitter } from 'node:events';

export const IDE_METHODS = new Set([
  'protocol/getVersion', 'runtime/getConsoleContent', 'workspace/getCurrentScript', 'workspace/getLocalSettings',
  'ui/getCurrentPlot', 'workspace/insertAtCursor', 'workspace/insertIntoNewFile'
]);

export class Frames {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer): Record<string, any>[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: Record<string, any>[] = [];
    while (true) {
      const end = this.buffer.indexOf('\r\n\r\n');
      if (end < 0) {
        if (this.buffer.length > 8192) throw new Error('Invalid protocol header.');
        break;
      }
      const match = /^Content-Length: (\d+)$/im.exec(this.buffer.subarray(0, end).toString());
      const length = match ? Number(match[1]) : 0;
      if (length < 1 || length > 32 * 1024 * 1024) throw new Error('Invalid protocol length.');
      if (this.buffer.length < end + 4 + length) break;
      messages.push(JSON.parse(this.buffer.subarray(end + 4, end + 4 + length).toString('utf8')));
      this.buffer = this.buffer.subarray(end + 4 + length);
    }
    return messages;
  }
}

export function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

export class Ide extends EventEmitter {
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  constructor() {
    super();
    const frames = new Frames();
    process.stdin.on('data', (chunk: Buffer) => {
      try {
        for (const message of frames.push(chunk)) {
          if (message.method) this.emit(message.method, message.params);
          else {
            const pending = this.pending.get(message.id);
            if (!pending) continue;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
          }
        }
      } catch { this.emit('protocolError'); }
    });
    process.stdin.on('end', () => this.emit('lifecycle/requestShutdown'));
  }
  request(method: string, params: unknown = {}): Promise<any> {
    if (!IDE_METHODS.has(method)) return Promise.reject(new Error('This action is not permitted.'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The IDE did not respond.'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      process.stdout.write(frame({ jsonrpc: '2.0', id, method, params }));
    });
  }
  notify(method: string, params: unknown): void {
    process.stdout.write(frame({ jsonrpc: '2.0', method, params }));
  }
}
