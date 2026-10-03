import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readdir } from 'node:fs/promises';

await mkdir('dist/client', { recursive: true });
await build({ entryPoints: ['src/server/main.ts'], bundle: true, platform: 'node',
  target: 'node22', format: 'cjs', outfile: 'dist/server/main.js' });
await build({ entryPoints: ['src/client/main.ts'], bundle: true, platform: 'browser',
  target: 'es2022', format: 'esm', outfile: 'dist/client/main.js' });
await copyFile('src/client/index.html', 'dist/client/index.html');
await copyFile('src/client/style.css', 'dist/client/style.css');
await writeFile('dist/csp.json', JSON.stringify({
  'default-src': "'self'", 'script-src': "'self'", 'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:", 'connect-src': "'self'", 'object-src': "'none'",
  'base-uri': "'none'", 'form-action': "'none'"
}));
const licenses = [];
for (const name of ['ws', 'undici', 'utif', 'pako']) {
  const files = await readdir(`node_modules/${name}`);
  const license = files.find(file => /^licen[cs]e(?:\.|$)/i.test(file));
  if (!license) throw new Error(`Missing third-party license for ${name}.`);
  const { readFile } = await import('node:fs/promises');
  licenses.push(`=== ${name} ===\n${await readFile(`node_modules/${name}/${license}`, 'utf8')}`);
}
await writeFile('dist/THIRD-PARTY-NOTICES.txt', licenses.join('\n\n'));
for (const file of await readdir('test')) {
  if (file.endsWith('.test.ts'))
    await build({ entryPoints: [`test/${file}`], bundle: true, platform: 'node',
      target: 'node22', format: 'cjs', outfile: `dist/test/${file.replace('.ts', '.js')}` });
}
