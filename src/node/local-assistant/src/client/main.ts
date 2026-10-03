const params = new URLSearchParams(location.search);
const url = new URL(params.get('wsUrl') ?? '', location.href);
const token = params.get('authToken');
if (token) url.searchParams.set('authToken', token);
const ws = new WebSocket(url);
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.type === 'status') document.getElementById('status')!.textContent = message.text;
};
ws.onopen = () => parent.postMessage({ type: 'assistant-connected' }, location.origin);
ws.onclose = () => { document.getElementById('status')!.textContent = 'The local assistant disconnected. Reopen the Chat pane to reconnect.'; };
