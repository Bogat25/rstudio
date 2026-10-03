export interface Block { kind: 'paragraph' | 'code' | 'heading' | 'list' | 'quote'; text: string; ordered?: boolean; }
export function blocks(markdown: string): Block[] {
  const output: Block[] = [];
  let paragraph: string[] = [];
  let code: string[] = [];
  let fence = '';
  const flush = () => { if (paragraph.length) output.push({ kind: 'paragraph', text: paragraph.join('\n') }); paragraph = []; };
  for (const line of markdown.split(/\r?\n/)) {
    const opening = /^ {0,3}(`{3,}|~{3,})[^`]*$/.exec(line);
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) {
        output.push({ kind: 'code', text: code.join('\n') }); fence = ''; code = [];
      } else code.push(line);
      continue;
    }
    if (opening) { flush(); fence = opening[1]; continue; }
    if (/^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) { flush(); continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) { flush(); output.push({ kind: 'heading', text: heading[1] }); continue; }
    const list = /^\s*(?:([-+*])|\d+[.)])\s+(.+)$/.exec(line);
    if (list) {
      flush(); const ordered = !list[1]; const previous = output.at(-1);
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.text += '\n' + list[2];
      else output.push({ kind: 'list', text: list[2], ordered });
      continue;
    }
    if (/^\s*> ?/.test(line)) { flush(); output.push({ kind: 'quote', text: line.replace(/^\s*> ?/, '') }); continue; }
    paragraph.push(line);
  }
  flush(); if (fence && code.length) output.push({ kind: 'code', text: code.join('\n') });
  return output;
}
export function inline(element: HTMLElement, text: string): void {
  const pattern = /`([^`\n]+)`|\*\*(\S(?:.*?\S)?)\*\*|(?<![\w*])\*(\S(?:[^*]*?\S)?)\*(?![\w*])|(?<!\w)_(\S(?:[^_]*?\S)?)_(?!\w)|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(start, match.index)));
    const child = document.createElement(match[1] !== undefined ? 'code' : match[2] !== undefined ? 'strong' : match[5] !== undefined ? 'a' : 'em');
    child.textContent = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (child instanceof HTMLAnchorElement) {
      try { const url = new URL(match[6]); if (['https:', 'http:'].includes(url.protocol)) { child.href = url.href; child.target = '_blank'; child.rel = 'noopener noreferrer'; } } catch {}
    }
    element.append(child); start = match.index! + match[0].length;
  }
  element.append(document.createTextNode(text.slice(start)));
}
function node(block: Block): HTMLElement {
  const el = document.createElement(({ paragraph: 'p', code: 'pre', heading: 'h3', list: block.ordered ? 'ol' : 'ul', quote: 'blockquote' })[block.kind]);
  if (block.kind === 'code') { const code = document.createElement('code'); code.textContent = block.text; el.append(code); }
  else if (block.kind === 'list') for (const line of block.text.split('\n')) { const li = document.createElement('li'); inline(li, line); el.append(li); }
  else inline(el, block.text);
  return el;
}
const previous = new WeakMap<HTMLElement, Block[]>();
export function render(element: HTMLElement, markdown: string): void {
  const parsed = blocks(markdown); const old = previous.get(element) ?? [];
  for (let i = 0; i < parsed.length; ++i) {
    if (JSON.stringify(parsed[i]) === JSON.stringify(old[i])) continue;
    const child = node(parsed[i]);
    if (element.children[i]) element.children[i].replaceWith(child); else element.append(child);
  }
  while (element.children.length > parsed.length) element.lastElementChild!.remove();
  previous.set(element, parsed);
}
