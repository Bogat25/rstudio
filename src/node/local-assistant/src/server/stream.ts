import { ThinkFilter } from '../shared/chat';

export async function* answerStream(response: Response, stripThink = true): AsyncGenerator<string> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as any;
    throw new Error(String(body.error?.message ?? body.message ?? `Model server returned HTTP ${response.status}.`).slice(0, 1000));
  }
  if (!response.body) throw new Error('The model server returned an empty response.');
  const filter = new ThinkFilter();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let done = false;
  const record = () => {
    const raw = data.join('\n');
    data = [];
    if (!raw) return '';
    if (raw === '[DONE]') { done = true; return ''; }
    const message = JSON.parse(raw);
    if (message.error) throw new Error(message.error.message ?? 'The model server failed.');
    const content = message.choices?.[0]?.delta?.content;
    return typeof content === 'string' ? (stripThink ? filter.push(content) : content) : '';
  };
  for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      else if (!line) {
        const text = record();
        if (text) yield text;
        if (done) break;
      }
    }
    if (done) break;
    if (buffer.length > 4 * 1024 * 1024) throw new Error('The model stream contains an oversized record.');
  }
  if (!done) throw new Error('The model connection ended before the answer finished.');
  if (stripThink) {
    const tail = filter.push('', true);
    if (tail) yield tail;
  }
}
