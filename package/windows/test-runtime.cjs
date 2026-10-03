// Exercise the packaged app over Chromium CDP: the release Electron fuses
// deliberately disable the Node inspector required by Playwright _electron.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const runtime = path.resolve(process.argv[2]);
const buildRoot = path.resolve(process.argv[3]);
const schema = JSON.parse(fs.readFileSync(path.join(runtime, 'RStudio/resources/app/resources/schema/user-prefs-schema.json'), 'utf8'));
const hasLocalAssistant = schema.properties.chat_provider.enum.includes('local');
delete process.env.DEBUG;
const playwrightPath = path.join(repo, 'e2e/rstudio/node_modules/playwright');
if (!fs.existsSync(playwrightPath)) {
  console.error('Install e2e/rstudio dependencies with npm ci before test -Gui.');
  process.exit(1);
}
const { chromium } = require(playwrightPath);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
let child, browser, step = 'startup';
const test = fs.mkdtempSync(path.join(buildRoot, 'packaged-ui-'));
(async () => {
  const data = path.join(test, 'data');
  const config = path.join(test, 'config');
  const work = path.join(test, 'work');
  for (const dir of [config, work, path.join(work, 'library'), path.join(work, 'tmp'), path.join(data, 'local-assistant')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(config, 'rstudio-prefs.json'), JSON.stringify({ chat_provider: hasLocalAssistant ? 'local' : 'none', save_workspace: 'never', load_workspace: false }));
  fs.writeFileSync(path.join(data, 'local-assistant/settings.json'), JSON.stringify({ port: await freePort(), downloadOffered: true }));
  const port = await freePort();
  const env = { ...process.env,
    R_HOME: path.join(runtime, 'R'), RSTUDIO_WHICH_R: path.join(runtime, 'R/bin/x64/R.exe'),
    R_USER: work, R_LIBS_USER: path.join(work, 'library'), R_LIBS: '', R_LIBS_SITE: '',
    R_ENVIRON_USER: path.join(work, '.Renviron'), R_PROFILE_USER: path.join(work, '.Rprofile'),
    RSTUDIO_CONFIG_HOME: config, RSTUDIO_DATA_HOME: data,
    TEMP: path.join(work, 'tmp'), TMP: path.join(work, 'tmp'), TMPDIR: path.join(work, 'tmp'),
    PATH: path.join(runtime, 'R/bin/x64') + path.delimiter + (process.env.PATH || ''),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.RSTUDIO_CPP_BUILD_OUTPUT;
  child = spawn(path.join(runtime, 'RStudio/rstudio.exe'), [
    '--automation-agent', '--no-sandbox', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(data, 'web-cache')}`,
  ], { cwd: work, env, windowsHide: true, stdio: 'ignore' });
  let spawnError = false;
  child.on('error', () => { spawnError = true; });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !browser) {
    if (spawnError || child.exitCode !== null) throw new Error('Packaged process exited');
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); }
    catch { await sleep(250); }
  }
  if (!browser) throw new Error('CDP unavailable');
  step = 'console startup';
  let page;
  while (Date.now() < deadline && !page) {
    for (const candidate of browser.contexts().flatMap(context => context.pages())) {
      // Never log page or iframe URLs: they can contain short-lived authentication.
      if (await candidate.locator('#i18n-errorStartingR').count().catch(() => 0)) {
        const exitCode = await candidate.evaluate(() => new Promise(resolve => {
          window.desktop.getStartupErrorInfo('exit_code', value => resolve(Number(value)));
        })).catch(() => null);
        console.error(`R session startup exit code: ${Number.isInteger(exitCode) ? exitCode : 'unavailable'}`);
        throw new Error('R session failed');
      }
      if (await candidate.locator('#rstudio_console_input').count().catch(() => 0)) { page = candidate; break; }
    }
    if (!page) await sleep(250);
  }
  if (!page) {
    let index = 0;
    for (const candidate of browser.contexts().flatMap(context => context.pages())) {
      console.log(`Window ${++index}: startup-error-page=${await candidate.locator('#i18n-errorStartingR').count().catch(() => 0)}, frames=${candidate.frames().length}`);
      // Error reports contain process output; hide those regions before capture.
      await candidate.addStyleTag({ content: 'code, pre, em, iframe, textarea, input { visibility: hidden !important; }' }).catch(() => {});
      await candidate.screenshot({ path: path.join(buildRoot, `logs/packaged-error-${index}.png`) }).catch(() => {});
    }
    throw new Error('R console unavailable');
  }
  const consoleInput = page.locator('#rstudio_console_input .ace_text-input');
  await consoleInput.waitFor({ timeout: 30000 });
  console.log('PASS packaged RStudio opens its R console');
  step = 'bundled R execution';
  const rPath = path.join(runtime, 'R').replaceAll('\\', '/');
  await page.evaluate(command => {
    const editor = document.getElementById('rstudio_console_input').env.editor;
    editor.setValue(command, 1); editor.focus();
  }, `cat("PACKAGED_R_OK", tolower(normalizePath(R.home())) == tolower(normalizePath(${JSON.stringify(rPath)})), "\\n")`);
  await consoleInput.press('Enter');
  await page.waitForFunction(() => document.getElementById('rstudio_console_output')?.innerText.includes('PACKAGED_R_OK TRUE'), null, { timeout: 30000 });
  console.log('PASS IDE executes code using its bundled R');
  if (hasLocalAssistant) {
    step = 'bundled offline assistant';
    await page.keyboard.press('Control+Shift+t');
    await page.frameLocator("iframe[title='Posit Assistant']").locator('body[data-provider=local]').waitFor({ timeout: 30000 });
    console.log('PASS packaged offline assistant loads');
  } else {
    console.log('SKIP offline Chat: this packaged source does not enable the local provider');
  }
  const screenshot = path.join(buildRoot, 'logs/packaged-runtime.png');
  await page.screenshot({ path: screenshot });
  console.log(`Screenshot: ${screenshot}`);
})().catch(() => {
  // Playwright exception details can include authenticated iframe URLs.
  console.error(`FAILED packaged runtime check: ${step}`);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) {
    const session = await browser.newBrowserCDPSession().catch(() => null);
    if (session) await session.send('Browser.close').catch(() => {});
    await browser.close().catch(() => {});
  }
  if (child && child.exitCode === null) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]);
    if (child.exitCode === null) child.kill();
  }
  // Retain the isolated profile for failure diagnosis; no user profile is read.
});
