import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface Settings {
  modelDirectory: string; contextDirectory: string; threads: number; imageMaxTokens: number;
  thinking: boolean; keepHistory: number; port: number; serverExe: string;
  startupTimeout: number; requestTimeout: number; contextMaxChars: number;
  ctxSize: number; maxTokens: number; temperature: number; topP: number; downloadOffered: boolean;
}
export const MODEL = 'Qwen3.5-4B-Q4_K_M.gguf';
export const VISION = 'Qwen3.5-4B-mmproj-F16.gguf';
export const dataDirectory = process.env.RSTUDIO_LOCAL_ASSISTANT_DATA ?? path.join(os.homedir(), '.rstudio', 'local-assistant');
export const resources = process.env.RSTUDIO_LOCAL_ASSISTANT_RESOURCES ?? path.resolve(__dirname, '../..');
export const applicationHome = process.env.RSTUDIO_LOCAL_ASSISTANT_HOME ?? resources;

export function defaults(directory = dataDirectory): Settings {
  return { modelDirectory: path.join(directory, 'models'), contextDirectory: '', threads: 0,
    imageMaxTokens: 256, thinking: false, keepHistory: 12, port: 18713,
    serverExe: path.join(resources, 'llama', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
    startupTimeout: 240, requestTimeout: 120, contextMaxChars: 12000, ctxSize: 8192,
    maxTokens: 1024, temperature: 0.3, topP: 0.9, downloadOffered: false };
}
export async function loadSettings(directory = dataDirectory, preferences: Partial<Settings> = {}): Promise<Settings> {
  const stored = await readFile(path.join(directory, 'settings.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  const overrides = JSON.parse(process.env.RSTUDIO_LOCAL_ASSISTANT_PREFS ?? '{}');
  const result = { ...defaults(directory), ...stored, ...overrides, ...preferences } as Settings;
  for (const key of ['modelDirectory', 'contextDirectory', 'serverExe'] as const)
    if (typeof result[key] !== 'string') throw new Error(`Invalid setting: ${key}.`);
  if (!result.modelDirectory) result.modelDirectory = defaults(directory).modelDirectory;
  for (const key of ['modelDirectory', 'contextDirectory', 'serverExe'] as const)
    if (result[key] && !path.isAbsolute(result[key])) result[key] = path.resolve(applicationHome, result[key]);
  for (const [key, min, max] of [
    ['threads', 0, 256], ['imageMaxTokens', 64, 4096], ['keepHistory', 0, 100], ['port', 1024, 65535],
    ['startupTimeout', 1, 3600], ['requestTimeout', 1, 3600], ['contextMaxChars', 0, 1000000],
    ['ctxSize', 512, 131072], ['maxTokens', 1, 32768]
  ] as const) {
    if (!Number.isInteger(result[key]) || result[key] < min || result[key] > max)
      throw new Error(`Invalid setting: ${key}.`);
  }
  if (typeof result.thinking !== 'boolean' || !Number.isFinite(result.temperature) || !Number.isFinite(result.topP))
    throw new Error('Invalid generation settings.');
  return result;
}
export async function saveSettings(settings: Settings): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const file = path.join(dataDirectory, 'settings.json');
  const stored = await readFile(file, 'utf8').then(JSON.parse).catch(() => ({}));
  // Persist the offer decision without converting portable relative paths to
  // absolute paths or freezing defaults from the current installation.
  await writeFile(file, JSON.stringify({ ...stored, downloadOffered: settings.downloadOffered }, null, 2));
}
export async function initialize(): Promise<void> {
  await mkdir(path.join(dataDirectory, 'context'), { recursive: true });
  for (const name of ['system_prompt.txt', 'context/README.txt']) {
    const destination = path.join(dataDirectory, name);
    try { await writeFile(destination, await readFile(path.join(resources, name)), { flag: 'wx' }); }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
  }
}
export function selectContext(files: { name: string; text: string }[], question: string, budget: number): string {
  const words = new Set(question.toLocaleLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) ?? []);
  const score = (text: string) => [...new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) ?? [])]
    .filter(word => words.has(word)).length;
  const sorted = [...files].sort((a, b) => score(b.name + '\n' + b.text) - score(a.name + '\n' + a.text) || a.name.localeCompare(b.name));
  let result = '';
  for (const file of sorted) {
    if (result.length >= budget) break;
    result += (`\n--- ${file.name} ---\n` + file.text).slice(0, budget - result.length);
  }
  return result;
}
export async function contextFolder(settings: Settings): Promise<string> {
  if (settings.contextDirectory) return settings.contextDirectory;
  const project = process.env.RSTUDIO_LOCAL_ASSISTANT_PROJECT;
  if (project) {
    const folder = path.join(project, '.ai-context');
    if (await stat(folder).then(s => s.isDirectory()).catch(() => false)) return folder;
  }
  return path.join(dataDirectory, 'context');
}
export async function systemPrompt(settings: Settings, question: string): Promise<string> {
  const prompt = await readFile(path.join(dataDirectory, 'system_prompt.txt'), 'utf8')
    .catch(() => readFile(path.join(resources, 'system_prompt.txt'), 'utf8'));
  const folder = await contextFolder(settings);
  const files: { name: string; text: string }[] = [];
  for (const name of (await readdir(folder).catch(() => [])).sort()) {
    if (!/\.(txt|md|r|rmd|csv)$/i.test(name) || /^README\./i.test(name)) continue;
    const file = path.join(folder, name);
    const info = await stat(file).catch(() => null);
    if (info?.isFile() && info.size <= 4 * 1024 * 1024) files.push({ name, text: await readFile(file, 'utf8') });
  }
  const reference = selectContext(files, question, settings.contextMaxChars);
  return prompt + (reference ? '\n\nCOURSE REFERENCE MATERIAL\n' + reference : '');
}
