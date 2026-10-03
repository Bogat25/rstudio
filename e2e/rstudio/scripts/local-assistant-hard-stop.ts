// Optional Windows smoke check. Uses an isolated launch and kills only its
// validated Electron process, without taskkill /T, to test child cleanup.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { launchRStudio, shutdownRStudio, CDP_PORT } from '../fixtures/desktop.fixture';
import { setPref, executeCommand } from '../utils/commands';

async function main(): Promise<void> {
  assert.equal(process.platform, 'win32', 'This job-object check is Windows-only.');
  assert.ok(process.env.RSTUDIO_TEST_REAL_MODEL_DIR, 'Set the verified model directory.');
  process.env.PW_SANDBOX = await mkdtemp(path.join(os.tmpdir(), 'rstudio-hard-stop-'));
  process.env.PW_SANDBOX_NO_SEED_CREDENTIALS = '1';
  for (const directory of ['Documents', 'AppData/Local', 'AppData/Roaming'])
    await mkdir(path.join(process.env.PW_SANDBOX, 'user-home', directory), { recursive: true });
  const session = await launchRStudio();
  try {
    await setPref(session.page, 'chat_provider', 'none');
    const data = path.join(session.dataHome, 'local-assistant'); await mkdir(data, { recursive: true });
    await writeFile(path.join(data, 'settings.json'), JSON.stringify({ port: 18718 }));
    await setPref(session.page, 'local_assistant_model_dir', process.env.RSTUDIO_TEST_REAL_MODEL_DIR!);
    await setPref(session.page, 'local_assistant_threads', 4);
    await setPref(session.page, 'chat_provider', 'local'); await executeCommand(session.page, 'activateChat');
    const frame = session.page.frameLocator("iframe[title='Posit Assistant']");
    await frame.locator('#question').fill('Give only a fenced R block with mean(c(1,2,3)).'); await frame.locator('#send').click();
    await frame.locator('.assistant pre code').waitFor({ timeout: 120000 });
    const check = `
$ErrorActionPreference='Stop'
$modelId=(Get-NetTCPConnection -LocalPort 18718 -State Listen | Select-Object -First 1).OwningProcess
$hostId=(Get-NetTCPConnection -LocalPort ${CDP_PORT} -State Listen | Select-Object -First 1).OwningProcess
$owned=@(); $nextId=$modelId
for($i=0; $i -lt 12 -and $nextId; $i++) {
  $item=Get-CimInstance Win32_Process -Filter "ProcessId=$nextId"
  $owned+=@{Id=$item.ProcessId; Name=$item.Name}; $nextId=$item.ParentProcessId
  if($item.ProcessId -eq $hostId){break}
}
if(-not($owned.Id -contains $hostId)){throw 'Model is not a descendant of this isolated IDE.'}
if(-not($owned.Name -match '(?:^|[.])rsession(?:-.*)?[.]exe$')){throw 'Expected session job owner was not found.'}
if((Get-Process -Id $hostId).ProcessName -ne 'electron'){throw 'Unexpected desktop process.'}
Stop-Process -Id $hostId -Force
$deadline=[DateTime]::UtcNow.AddSeconds(8)
do {
  $remaining=@($owned | Where-Object { $_.Id -ne $hostId -and (Get-Process -Id $_.Id -ErrorAction SilentlyContinue) })
  if(-not $remaining.Count){break}; Start-Sleep -Milliseconds 100
} while([DateTime]::UtcNow -lt $deadline)
if($remaining.Count){throw 'An owned model/backend/session process survived the IDE hard stop.'}
'PASS: hard-stopping only Electron removed its owned model, backend and session.'
`;
    process.stdout.write(execFileSync('powershell.exe', ['-NoProfile', '-Command', check], { encoding: 'utf8', windowsHide: true }));
  } finally { await shutdownRStudio(session); }
}
main().catch(() => { process.stderr.write('Local assistant hard-stop smoke check failed.\n'); process.exitCode = 1; });
