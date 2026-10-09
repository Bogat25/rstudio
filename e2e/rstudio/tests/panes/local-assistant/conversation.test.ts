import { test, expect } from '@fixtures/rstudio.fixture';
import { executeCommand, setPref } from '@utils/commands';
import { ConsolePaneActions } from '@actions/console_pane.actions';
import { AceEditor } from '@pages/ace_editor.page';
import http from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

test.use({ trace: 'off' });
test.describe('Local assistant conversation', { tag: ['@chat', '@desktop_only'] }, () => {
  let server: http.Server;
  let requests: any[];
  const code = 'local_ai_test_value <- "ő ű α β ≤ ∑ √ 中文 😀"';
  test.beforeEach(async ({ rstudioSession, rstudioPage: page }, testInfo) => {
    await setPref(page, 'chat_provider', 'none');
    requests = [];
    server = http.createServer(async (req, res) => {
      if (req.url === '/health') { res.end('{}'); return; }
      let body = ''; for await (const chunk of req) body += chunk;
      const request = JSON.parse(body); requests.push(request);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const emit = (content: string | null) => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      emit(null);
      if (JSON.stringify(request.messages.at(-1)).includes('PROSE')) { emit('An answer without fenced code.'); res.end('data: [DONE]\n\n'); return; }
      if (JSON.stringify(request.messages.at(-1)).includes('LONG')) {
        let count = 0;
        const timer = setInterval(() => emit(`Paragraph ${++count}: selectable text.\n\n`), 40);
        res.on('close', () => clearInterval(timer)); return;
      }
      emit('<thi'); emit('nk>hidden thinking</think>2 * 3 = 6.\n\n---\n\n```r\n' + code + '\n```\n\n<script>neverRun()</script>');
      res.end('data: [DONE]\n\n');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const data = path.join(path.dirname(rstudioSession.logDir!), 'local-assistant');
    await mkdir(path.join(data, 'models'), { recursive: true });
    await writeFile(path.join(data, 'models', 'Qwen3.5-4B-Q4_K_M.gguf'), 'fixture');
    await writeFile(path.join(data, 'models', 'Qwen3.5-4B-mmproj-F16.gguf'), 'fixture');
    const real = testInfo.title.includes('pinned CPU') && !!process.env.RSTUDIO_TEST_REAL_MODEL_DIR;
    await writeFile(path.join(data, 'settings.json'), JSON.stringify({ port: real ? 18716 : (server.address() as any).port }));
    await setPref(page, 'local_assistant_model_dir', '');
    if (testInfo.title.includes('first-run')) await setPref(page, 'local_assistant_model_dir', path.join(data, 'missing-model'));
    if (testInfo.title.includes('reader-only')) {
      const readerOnly = path.join(data, 'reader-only'); await mkdir(readerOnly, { recursive: true });
      await writeFile(path.join(readerOnly, 'Qwen3.5-4B-Q4_K_M.gguf'), 'fixture');
      await setPref(page, 'local_assistant_model_dir', readerOnly);
    }
    if (real) {
      await setPref(page, 'local_assistant_model_dir', process.env.RSTUDIO_TEST_REAL_MODEL_DIR!);
      await setPref(page, 'local_assistant_threads', 4);
    }
    await setPref(page, 'chat_provider', 'local');
    await expect(page.locator("iframe[title='Posit Assistant']")).not.toBeVisible();
    await page.keyboard.press('Control+Shift+T');
    await expect(page.frameLocator("iframe[title='Posit Assistant']").locator('#send')).toBeEnabled();
  });
  test.afterEach(async ({ rstudioPage: page }) => {
    const stopped = page.waitForResponse(response => /\/rpc\/chat_stop_backend(?:\?|$)/.test(response.url()));
    await setPref(page, 'chat_provider', 'none'); await stopped;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('renders safe Unicode Markdown, copies code, inserts it with one undo and attaches editable R context', async ({ rstudioPage: page }) => {
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    const consoleActions = new ConsolePaneActions(page);
    const previousId = await page.evaluate(() => window.rstudio?.documents.active()?.id);
    await executeCommand(page, 'newSourceDoc');
    await expect.poll(() => page.evaluate(() => window.rstudio?.documents.active()?.id)).not.toBe(previousId);
    const editor = new AceEditor(page, '');
    await editor.setValue('# existing script\n');
    const question = 'Explain arithmetic: ő ű α β ≤ ∑ √ 中文 😀';
    await page.evaluate(text => navigator.clipboard.writeText(text), question);
    await frame.locator('#question').focus(); await frame.locator('#question').press('Control+v');
    await expect(frame.locator('#question')).toHaveValue(question);
    await frame.locator('#question').press('Control+Enter');
    await expect(frame.locator('#copy')).toBeEnabled();
    expect(requests[0].messages.at(-1).content).toBe(question);
    await expect(frame.locator('.assistant pre code')).toHaveText(code);
    await expect(frame.locator('.assistant')).toContainText('2 * 3 = 6.');
    await expect(frame.locator('.assistant em')).toHaveCount(0);
    await expect(frame.locator('.assistant hr, .assistant script')).toHaveCount(0);
    await expect(frame.locator('.assistant')).not.toContainText('hidden thinking');
    await frame.locator('#copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await frame.locator('#to-editor').click();
    await expect.poll(() => editor.getValue()).toBe('# existing script\n' + code);
    await editor.focus(); await page.keyboard.press('Control+z');
    await expect.poll(() => editor.getValue()).toBe('# existing script\n');
    await consoleActions.executeInConsole('cat("not-executed:", exists("local_ai_test_value", inherits=FALSE))');
    await expect(page.locator('#rstudio_workbench_panel_console')).toContainText('not-executed: FALSE');
    await frame.locator('#attach').selectOption('script');
    await expect(frame.locator('#question')).toHaveValue(/# existing script/);
    await consoleActions.executeInConsole('stop("local assistant attachment test")');
    await frame.locator('#attach').selectOption('error');
    await expect(frame.locator('#question')).toHaveValue(/stop\("local assistant attachment test"\)/);
    await frame.locator('#attach').selectOption('console');
    await expect(frame.locator('#question')).toHaveValue(/Recent console output/);
    await consoleActions.executeInConsole('plot(1:5, main="Local assistant plot")');
    await frame.locator('#attach').selectOption('plot'); await expect(frame.locator('#attachments img')).toHaveCount(1);
    await frame.locator('#attachments img').click(); await expect(frame.locator('#viewer')).toBeVisible();
    await frame.locator('#viewer').press('Escape'); await expect(frame.locator('#viewer')).not.toBeVisible();
    await frame.locator('#question').fill(''); await frame.locator('#send').click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(frame.locator('#copy')).toBeEnabled();
    expect(requests.at(-1).messages.at(-1).content[0].type).toBe('image_url');
    expect(requests.at(-1).messages.at(-1).content.at(-1).text).toMatch(/What does this picture show/);
    await frame.locator('#new-chat').click(); await expect(frame.locator('article')).toHaveCount(0);
  });

  test('reports missing code without replacing the clipboard and creates a script when no editor is open', async ({ rstudioPage: page }) => {
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    await page.evaluate(() => navigator.clipboard.writeText('keep this clipboard'));
    await frame.locator('#question').fill('PROSE'); await frame.locator('#send').click();
    await expect(frame.locator('.assistant')).toHaveText(/An answer without fenced code/);
    await frame.locator('#copy').click(); await expect(frame.locator('#status')).toHaveText('The last answer contains no code.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('keep this clipboard');
    await frame.locator('#to-editor').click(); await expect(frame.locator('#status')).toHaveText('The last answer contains no code.');
    await executeCommand(page, 'closeAllSourceDocs');
    await expect.poll(() => page.evaluate(() => window.rstudio?.documents.active())).toBeFalsy();
    await frame.locator('#question').fill('Give code'); await frame.locator('#send').click();
    await expect(frame.locator('.assistant pre code')).toHaveText(code);
    await frame.locator('#to-editor').click();
    await expect.poll(() => page.evaluate(() => window.rstudio?.documents.active()?.id)).toBeTruthy();
    await expect.poll(() => new AceEditor(page, '').getValue()).toBe(code);
  });

  test('normalizes picture files, EXIF rotation and clipboard images and clears pending attachments', async ({ rstudioPage: page }) => {
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    const images = await frame.locator('#question').evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 1000;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e33'; ctx.fillRect(0, 0, 2000, 1000);
      return { png: canvas.toDataURL('image/png').split(',')[1], jpeg: canvas.toDataURL('image/jpeg').split(',')[1] };
    });
    const jpeg = Buffer.from(images.jpeg, 'base64');
    const exif = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000', 'hex');
    const rotated = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
    const bmp = Buffer.alloc(62); bmp.write('BM'); bmp.writeUInt32LE(62, 2); bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(2, 18); bmp.writeInt32LE(1, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
    bmp[56] = 255; bmp[58] = 255;
    const requireLocal = createRequire(path.resolve('../../src/node/local-assistant/package.json'));
    const tiff = Buffer.from(requireLocal('utif').encodeImage(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]).buffer, 2, 1));
    await frame.locator('#picture-files').setInputFiles([
      { name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(images.png, 'base64') },
      { name: 'upright.jpg', mimeType: 'image/jpeg', buffer: rotated },
      { name: 'tiny.gif', mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') },
      { name: 'tiny.bmp', mimeType: 'image/bmp', buffer: bmp },
      { name: 'tiny.tiff', mimeType: 'image/tiff', buffer: tiff }
    ]);
    await expect(frame.locator('#attachments img')).toHaveCount(5);
    const dimensions = await frame.locator('#attachments img').evaluateAll(elements => elements.map(el => [(el as HTMLImageElement).naturalWidth, (el as HTMLImageElement).naturalHeight]));
    expect(dimensions).toEqual([[1600, 800], [800, 1600], [1, 1], [2, 1], [2, 1]]);
    await frame.locator('#question').focus();
    await frame.locator('#question').evaluate(async (_el, png) => {
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
    }, images.png);
    await frame.locator('#question').focus(); await frame.locator('#question').press('Control+v');
    await expect(frame.locator('#attachments img')).toHaveCount(6);
    await frame.getByTitle('Remove tiny.gif', { exact: true }).click(); await expect(frame.locator('#attachments img')).toHaveCount(5);
    await frame.locator('#question').fill(''); await frame.locator('#send').click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].messages.at(-1).content.filter((item: any) => item.type === 'image_url')).toHaveLength(4);
    await expect(frame.locator('article .pictures img')).toHaveCount(5);
    await expect(frame.locator('#copy')).toBeEnabled();
    await frame.locator('#new-chat').click(); await expect(frame.locator('article')).toHaveCount(0);
    await expect(frame.locator('#attachment-bar')).not.toBeVisible();
  });

  test('keeps R usable, preserves scroll and selection during streaming and toggles from iframe focus', async ({ rstudioPage: page }) => {
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    await frame.locator('#question').fill('LONG'); await frame.locator('#send').click();
    await expect(frame.locator('.assistant')).toContainText('Paragraph 12:');
    const firstParagraph = frame.locator('.assistant p').first();
    await firstParagraph.scrollIntoViewIfNeeded();
    const bounds = await firstParagraph.boundingBox();
    await page.mouse.move(bounds!.x + 5, bounds!.y + 5); await page.mouse.down();
    const held = await frame.locator('.assistant').innerText();
    await page.waitForTimeout(250); // Incoming deltas must remain buffered during a physical drag.
    expect(await frame.locator('.assistant').innerText()).toBe(held);
    await page.mouse.up();
    await expect.poll(() => frame.locator('.assistant').innerText()).not.toBe(held);
    await frame.locator('#transcript').evaluate(el => { el.scrollTop = 0; const range = document.createRange(); range.selectNodeContents(el.querySelector('.assistant p')!); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); });
    await expect(frame.locator('.assistant')).toContainText('Paragraph 20:');
    expect(await frame.locator('#transcript').evaluate(el => el.scrollTop)).toBe(0);
    expect(await frame.locator('#transcript').evaluate(() => window.getSelection()!.toString())).toContain('Paragraph 1:');
    await new ConsolePaneActions(page).executeInConsole('cat("R-remains-usable")');
    await expect(page.locator('#rstudio_workbench_panel_console')).toContainText('R-remains-usable');
    await frame.locator('#stop').click(); await expect(frame.locator('#send')).toBeEnabled({ timeout: 1000 });
    await frame.locator('#question').focus(); await frame.locator('#question').press('Control+Shift+T');
    await expect(frame.locator('#question')).not.toBeVisible();
    await page.keyboard.press('Control+Shift+T'); await expect(frame.locator('#question')).toBeVisible();
    await expect(frame.locator('.assistant')).toContainText('Paragraph 1:');
  });

  test('answers through the pinned CPU model in the native Chat pane', async ({ rstudioPage: page }) => {
    test.skip(!process.env.RSTUDIO_TEST_REAL_MODEL_DIR, 'Requires the verified downloaded model.');
    test.setTimeout(180000);
    await setPref(page, 'local_assistant_model_dir', process.env.RSTUDIO_TEST_REAL_MODEL_DIR!);
    // Use a separate loopback port from RGui and the standalone real-model test.
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    await frame.locator('#question').fill('Give only a fenced R code block calculating the mean of c(1, 2, 3).');
    await frame.locator('#send').click();
    await expect(frame.locator('.assistant pre code')).toContainText(/mean\s*\(/, { timeout: 120000 });
    await expect(frame.locator('#copy')).toBeEnabled({ timeout: 120000 });
  });

  test('offers the first-run download once and remembers a decline across backend restarts', async ({ rstudioPage: page }) => {
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    await expect(frame.locator('#download-offer')).toBeVisible();
    await expect(frame.locator('#offer-text')).toContainText('3.4 GB'); await frame.locator('#offer-no').click();
    const stopped = page.waitForResponse(response => /\/rpc\/chat_stop_backend(?:\?|$)/.test(response.url()));
    await setPref(page, 'chat_provider', 'none'); await stopped; await setPref(page, 'chat_provider', 'local');
    await page.keyboard.press('Control+Shift+T');
    await expect(frame.locator('#status')).toContainText('The local model is missing. Use Download model');
    await expect(frame.locator('#download-offer')).not.toBeVisible();
  });

  test('offers a reader-only download and remains usable for text when it is declined', async ({ rstudioPage: page }) => {
    const frame = page.frameLocator("iframe[title='Posit Assistant']");
    await expect(frame.locator('#download-offer')).toBeVisible();
    await expect(frame.locator('#offer-text')).toContainText('vision reader (672 MB)');
    await frame.locator('#offer-no').click(); await frame.locator('#question').fill('PROSE'); await frame.locator('#send').click();
    await expect(frame.locator('.assistant')).toContainText('An answer without fenced code');
    await new ConsolePaneActions(page).executeInConsole('plot(1:5)');
    await frame.locator('#attach').selectOption('plot');
    await expect(frame.locator('#download-offer')).toBeVisible();
    await frame.locator('#offer-no').click(); await expect(frame.locator('#attachment-bar')).not.toBeVisible();
  });
});
