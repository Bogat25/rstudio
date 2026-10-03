import { Turn, Picture, codeBlocks } from '../shared/chat';
import { render } from './markdown';
import { picture } from './pictures';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const transcript = get<HTMLElement>('transcript');
const question = get<HTMLTextAreaElement>('question');
const status = get<HTMLElement>('status');
const sendButton = get<HTMLButtonElement>('send');
const stopButton = get<HTMLButtonElement>('stop');
let history: Turn[] = [];
let attached: Picture[] = [];
let attachmentVersion = 0;
let busy = false; let downloading = false; let awaiting = false; let mouseDown = false; let buffered = false;
let submittedText = ''; let submittedPictures: Picture[] = [];
let ws: WebSocket;
const send = (message: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); else status.textContent = 'The assistant is reconnecting.'; };

function controls(): void {
  sendButton.disabled = busy || awaiting || ws?.readyState !== WebSocket.OPEN;
  stopButton.disabled = !busy && !downloading;
  get<HTMLButtonElement>('new-chat').disabled = busy || awaiting;
  const hasAnswer = history.some(t => t.role === 'assistant');
  get<HTMLButtonElement>('copy').disabled = busy || !hasAnswer;
  get<HTMLButtonElement>('to-editor').disabled = busy || !hasAnswer;
}
function viewer(p: Picture): void {
  const dialog = get<HTMLDialogElement>('viewer'); get<HTMLImageElement>('view-picture').src = p.url;
  get<HTMLImageElement>('view-picture').alt = p.name; get('picture-title').textContent = p.name; dialog.showModal();
}
function thumbnails(container: HTMLElement, pictures: Picture[], removable: boolean): void {
  if (removable) get('attachment-bar').hidden = pictures.length === 0;
  container.replaceChildren();
  pictures.forEach((p, index) => {
    const item = document.createElement('span'); const open = document.createElement('button'); open.type = 'button'; open.title = p.name;
    const img = document.createElement('img'); img.src = p.url; img.alt = p.name;
    const caption = document.createElement('span'); caption.className = 'caption'; caption.textContent = p.name;
    open.append(img, caption); open.onclick = () => viewer(p); item.append(open);
    if (removable) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = `Remove ${p.name}`;
      remove.onclick = () => { attached.splice(index, 1); thumbnails(container, attached, true); }; item.append(remove); }
    container.append(item);
  });
}
function selectionOffsets(): { anchor: number; focus: number } | undefined {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || selection.isCollapsed || !transcript.contains(selection.anchorNode) || !transcript.contains(selection.focusNode)) return;
  const offset = (node: Node, n: number) => { const range = document.createRange(); range.selectNodeContents(transcript); range.setEnd(node, n); return range.toString().length; };
  return { anchor: offset(selection.anchorNode, selection.anchorOffset), focus: offset(selection.focusNode, selection.focusOffset) };
}
function restoreSelection(saved: { anchor: number; focus: number } | undefined): void {
  if (!saved) return;
  const point = (offset: number): [Node, number] => {
    const walker = document.createTreeWalker(transcript, NodeFilter.SHOW_TEXT); let node: Node | null; let last: Node = transcript;
    while ((node = walker.nextNode())) { last = node; const length = node.textContent?.length ?? 0; if (offset <= length) return [node, offset]; offset -= length; }
    return [last, last.textContent?.length ?? 0];
  };
  const [a, an] = point(saved.anchor); const [f, fn] = point(saved.focus);
  window.getSelection()?.setBaseAndExtent(a, an, f, fn);
}
function draw(): void {
  if (mouseDown) { buffered = true; return; }
  const follow = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 32;
  const scroll = transcript.scrollTop; const selected = selectionOffsets();
  history.forEach((turn, index) => {
    let article = transcript.children[index] as HTMLElement | undefined;
    if (!article) {
      article = document.createElement('article'); article.className = turn.role;
      const name = document.createElement('h2'); name.textContent = turn.role === 'user' ? 'You' : 'R assistant';
      const body = document.createElement('div'); body.className = 'answer';
      const pictures = document.createElement('div'); pictures.className = 'pictures';
      article.append(name, pictures, body); transcript.append(article);
      if (turn.pictures?.length) thumbnails(pictures, turn.pictures, false);
    }
    const body = article.querySelector<HTMLElement>('.answer')!;
    if (turn.role === 'assistant') render(body, turn.text);
    else if (body.textContent !== turn.text) body.textContent = turn.text;
  });
  while (transcript.children.length > history.length) transcript.lastElementChild!.remove();
  restoreSelection(selected); transcript.scrollTop = follow && !selected ? transcript.scrollHeight : scroll;
  buffered = false; controls();
}
function released(): void { mouseDown = false; if (buffered) draw(); }
document.addEventListener('mousedown', event => { if (event.button === 0 && transcript.contains(event.target as Node)) mouseDown = true; });
window.addEventListener('mouseup', released);
window.addEventListener('mousemove', event => { if (!event.buttons && mouseDown) released(); });
try { parent.document.addEventListener('mouseup', released); } catch {}
window.addEventListener('blur', released);

async function addFiles(files: File[]): Promise<void> {
  for (const file of files) {
    try { attached.push(await picture(file)); thumbnails(get('attachments'), attached, true); }
    catch (error: any) { status.textContent = `Could not attach ${file.name}: ${error.message}`; }
  }
  if (attached.length) send({ type: 'pictures-attached' });
}
function submit(): void {
  if (busy || awaiting) { status.textContent = 'An answer is already in progress.'; return; }
  if (!question.value.trim() && !attached.length) return;
  submittedText = question.value; submittedPictures = [...attached]; awaiting = true; controls();
  send({ type: 'send', text: question.value, pictures: attached });
}
sendButton.onclick = submit; stopButton.onclick = () => send({ type: 'stop' });
get('new-chat').onclick = () => { ++attachmentVersion; question.value = ''; attached = []; thumbnails(get('attachments'), [], true); send({ type: 'new-chat' }); };
get('to-editor').onclick = () => send({ type: 'to-editor' });
get('copy').onclick = async () => {
  const code = codeBlocks([...history].reverse().find(t => t.role === 'assistant')?.text ?? '');
  if (code === null) { status.textContent = 'The last answer contains no code.'; return; }
  try { await navigator.clipboard.writeText(code); status.textContent = 'Code copied.'; } catch { status.textContent = 'Could not access the clipboard.'; }
};
get('clear-pictures').onclick = () => { ++attachmentVersion; attached = []; thumbnails(get('attachments'), [], true); };
get<HTMLSelectElement>('edit').onchange = async event => {
  const menu = event.target as HTMLSelectElement;
  const action = menu.value; menu.value = '';
  try {
    if (action === 'copy') await navigator.clipboard.writeText(window.getSelection()?.toString() || question.value.substring(question.selectionStart, question.selectionEnd));
    else if (action === 'paste') { question.setRangeText(await navigator.clipboard.readText(), question.selectionStart, question.selectionEnd, 'end'); question.focus(); }
    else if (action === 'select-all') { question.focus(); question.select(); }
    else if (action === 'new-chat') { if (busy || awaiting) status.textContent = 'Stop the answer before starting a new chat.'; else get('new-chat').click(); }
    else if (action === 'toggle') parent.postMessage('toggle-local-assistant', location.origin);
  } catch { status.textContent = 'Could not access the clipboard.'; }
};
get('close-viewer').onclick = () => get<HTMLDialogElement>('viewer').close();
get('download').onclick = () => send({ type: 'download', visionOnly: false });
get('pause-download').onclick = () => send({ type: 'pause-download' });
get<HTMLSelectElement>('attach').onchange = event => {
  const menu = event.target as HTMLSelectElement;
  if (menu.value === 'files') get<HTMLInputElement>('picture-files').click();
  else if (menu.value === 'remove') get('clear-pictures').click();
  else if (menu.value === 'paste') void navigator.clipboard.read().then(async items => {
    for (const item of items) for (const type of item.types.filter(t => t.startsWith('image/')))
      await addFiles([new File([await item.getType(type)], 'Pasted picture', { type })]);
  }).catch(() => { status.textContent = 'Paste the picture with Ctrl+V, or attach a picture file.'; });
  else if (menu.value) send({ type: 'attach', kind: menu.value });
  menu.value = '';
};
get<HTMLInputElement>('picture-files').onchange = event => {
  const input = event.target as HTMLInputElement; void addFiles([...input.files ?? []]); input.value = '';
};
question.addEventListener('paste', event => {
  const files = [...event.clipboardData?.files ?? []];
  if (files.length) { event.preventDefault(); void addFiles(files); }
});
question.addEventListener('keydown', event => { if (event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); submit(); } });

// Same-origin forwarding lets RStudio apply the user's configured shortcuts
// while focus is in the iframe. Ctrl+Enter is handled above by the composer.
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || (!event.ctrlKey && !event.altKey && !event.metaKey)) return;
  try {
    const forwarded = new (parent as Window & typeof globalThis).KeyboardEvent('keydown', { key: event.key, code: event.code,
      keyCode: event.keyCode, which: event.which, ctrlKey: event.ctrlKey, altKey: event.altKey,
      shiftKey: event.shiftKey, metaKey: event.metaKey, bubbles: true, cancelable: true });
    if (!parent.document.dispatchEvent(forwarded)) event.preventDefault();
  } catch {}
});

function connect(): void {
  const params = new URLSearchParams(location.search);
  const url = new URL(params.get('wsUrl') ?? '', location.href);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  const token = params.get('authToken'); if (token) url.searchParams.set('authToken', token);
  ws = new WebSocket(url);
  ws.onopen = () => { parent.postMessage({ type: 'assistant-connected' }, location.origin); controls(); };
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') { history = message.history; busy = message.busy; downloading = message.downloading; status.textContent = message.status; get<HTMLButtonElement>('pause-download').hidden = !downloading; draw(); }
    else if (message.type === 'delta') { if (history.at(-1)?.role === 'assistant') history.at(-1)!.text += message.text; draw(); }
    else if (message.type === 'status' || message.type === 'error' || message.type === 'notice') { status.textContent = message.text; if (message.type === 'error') { awaiting = false; controls(); } }
    else if (message.type === 'sent') {
      awaiting = false; if (question.value === submittedText) question.value = '';
      attached = attached.filter(p => !submittedPictures.some(sent => sent.url === p.url)); thumbnails(get('attachments'), attached, true); controls();
    } else if (message.type === 'attachment') { question.value += `\n\n[${message.name}]\n${message.text}`; question.focus(); }
    else if (message.type === 'picture') {
      const version = attachmentVersion;
      const bytes = Uint8Array.from(atob(message.picture.url.split(',')[1]), c => c.charCodeAt(0));
      void picture(new File([bytes], message.picture.name, { type: 'image/png' }))
        .then(p => { if (version === attachmentVersion) { attached.push(p); thumbnails(get('attachments'), attached, true); } })
        .catch(() => { status.textContent = 'Could not prepare the current plot picture.'; });
    }
    else if (message.type === 'offer') {
      const dialog = get<HTMLDialogElement>('download-offer');
      get('offer-text').textContent = message.visionOnly ? 'Download the vision reader (672 MB) to ask about pictures?' : 'Download the local model and vision reader (about 3.4 GB)? They work offline after downloading.';
      get('offer-yes').onclick = () => { dialog.close(); send({ type: 'download', visionOnly: message.visionOnly }); };
      get('offer-no').onclick = () => {
        dialog.close();
        if (message.visionOnly) { ++attachmentVersion; attached = []; thumbnails(get('attachments'), [], true); status.textContent = 'Text chat remains available. The vision reader can be downloaded later.'; }
      }; if (!dialog.open) dialog.showModal();
    } else if (message.type === 'download-progress') {
      status.textContent = `Downloading ${message.name}: ${(message.bytes / 1000000).toFixed(1)} / ${(message.total / 1000000).toFixed(1)} MB (${Math.floor(100 * message.bytes / message.total)}%)`;
    }
  };
  ws.onclose = () => { awaiting = false; status.textContent = 'The assistant disconnected. Reconnecting…'; controls(); setTimeout(connect, 1000); };
  controls();
}
connect();
