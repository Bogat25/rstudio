export interface Picture { name: string; url: string; }
export interface Turn { role: 'user' | 'assistant'; text: string; pictures?: Picture[]; }
export const OLD_PICTURE = '[A picture was attached here; it is no longer shown.]';
export const PICTURE_QUESTION = 'What does this picture show? If it is a plot, R output or an error, explain it.';

export function messages(prompt: string, history: Turn[], question: Turn, keep = 12) {
  const turns = [...(keep > 0 ? history.slice(-keep) : []), question];
  let remaining = 4;
  const contents: unknown[] = new Array(turns.length);
  for (let i = turns.length - 1; i >= 0; --i) {
    const turn = turns[i];
    const pictures = [...(turn.pictures ?? [])].reverse();
    const visible = pictures.slice(0, remaining);
    remaining -= visible.length;
    let text = turn.text;
    if (pictures.length > visible.length) text += `\n${OLD_PICTURE}`;
    contents[i] = visible.length ? [
      ...visible.map(p => ({ type: 'image_url', image_url: { url: p.url } })),
      { type: 'text', text }
    ] : text;
  }
  return [{ role: 'system', content: prompt }, ...turns.map((turn, i) => ({ role: turn.role, content: contents[i] }))];
}

export class ThinkFilter {
  private buffer = '';
  private hidden = false;
  push(text: string, final = false): string {
    this.buffer += text;
    let output = '';
    while (this.buffer) {
      const tag = this.hidden ? '</think>' : '<think>';
      const found = this.buffer.indexOf(tag);
      if (found >= 0) {
        if (!this.hidden) output += this.buffer.slice(0, found);
        this.buffer = this.buffer.slice(found + tag.length);
        this.hidden = !this.hidden;
      } else {
        let suffix = 0;
        if (!final) {
          for (let n = 1; n < tag.length; ++n)
            if (this.buffer.endsWith(tag.slice(0, n))) suffix = n;
        }
        const count = this.buffer.length - suffix;
        if (!this.hidden) output += this.buffer.slice(0, count);
        this.buffer = this.buffer.slice(count);
        break;
      }
    }
    return output;
  }
}

export function codeBlocks(markdown: string): string | null {
  const blocks: string[] = [];
  let fence = '';
  let lines: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const open = /^ {0,3}(`{3,}|~{3,})[^`]*$/.exec(line);
    if (!fence && open) { fence = open[1]; lines = []; }
    else if (fence && new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) {
      blocks.push(lines.join('\n')); fence = '';
    } else if (fence) lines.push(line);
  }
  if (fence) blocks.push(lines.join('\n'));
  return blocks.length ? blocks.join('\n\n') : null;
}

export function lastError(lines: string[]): string | null {
  let error = -1;
  for (let i = lines.length - 1; i >= 0; --i)
    if (/^\s*Error(?: in |:| during )|^Execution halted/.test(lines[i])) { error = i; break; }
  if (error < 0) return null;
  let start = error;
  while (start > 0 && !/^>\s/.test(lines[start])) --start;
  if (!/^>\s/.test(lines[start])) start = error;
  let end = error + 1;
  while (end < lines.length && !/^>\s/.test(lines[end])) ++end;
  return lines.slice(start, end).join('\n').slice(-8000);
}
