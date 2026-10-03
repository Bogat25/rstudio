import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Ide } from './protocol';

const args = process.argv.slice(2);
const value = (key: string, fallback = '') => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const host = value('-h', '127.0.0.1');
if (host !== '127.0.0.1') throw new Error('The local assistant requires loopback.');
const auth = process.env.RSTUDIO_CHAT_AUTH_TOKEN;
if (!auth) throw new Error('The IDE did not provide authentication.');
const origin = value('--allowed-origin');
const serverMode = args.includes('--server-mode');
const ide = new Ide();
const server = http.createServer((_request, response) => { response.writeHead(404).end(); });
const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const cookies = (request.headers.cookie ?? '').split(';').map(x => x.trim());
  const provided = url.searchParams.get('authToken') ?? cookies.find(x => x.startsWith('posit-assistant-auth='))?.slice('posit-assistant-auth='.length) ?? '';
  const token = Buffer.from(provided);
  const expected = Buffer.from(auth);
  const allowed = request.headers.origin === origin;
  if (url.pathname !== '/ai-chat' || token.length !== expected.length || !timingSafeEqual(token, expected) || (!serverMode && !allowed)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request));
});
sockets.on('connection', ws => ws.send(JSON.stringify({ type: 'status', text: 'Local assistant connected.' })));
const stop = () => { for (const ws of sockets.clients) ws.terminate(); server.close(); process.exit(0); };
ide.on('lifecycle/requestShutdown', stop);
ide.on('protocolError', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.listen(Number(value('-p', '0')), host, () => {
  ide.request('protocol/getVersion', { clientProtocolVersion: '11.0', clientVersion: '0.1.0',
    capabilities: ['lifecycle/requestShutdown'] }).catch(stop);
});
