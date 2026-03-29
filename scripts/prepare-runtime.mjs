import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = process.cwd();
const resourcesDir = path.join(repoRoot, 'resources_build');
const isWin = process.platform === 'win32';
const binaryExt = isWin ? '.exe' : '';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function readFileBufferOrThrow(sourcePath, label) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`${label} nao encontrado`);
  }
  return fs.readFileSync(sourcePath);
}

function copyDirectoryIfExists(sourcePath, targetPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return false;
  removeIfExists(targetPath);
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  return true;
}

function findInPath(names) {
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function findFirstExisting(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function getEngineSource() {
  return findFirstExisting([
    path.join(repoRoot, 'dist', `leg3ndy-engine${binaryExt}`),
    path.join(repoRoot, 'dist', 'leg3ndy-engine', `leg3ndy-engine${binaryExt}`),
    path.join(repoRoot, 'dist', 'leg3ndy-engine'),
    path.join(repoRoot, 'dist', 'leg3ndy-engine', 'leg3ndy-engine')
  ]);
}

function getFfmpegSource() {
  return findFirstExisting([
    process.env.LEG3NDY_FFMPEG_PATH,
    path.join(resourcesDir, `ffmpeg${binaryExt}`),
    path.join(resourcesDir, 'ffmpeg.exe'),
    path.join(resourcesDir, 'ffmpeg'),
    findInPath(isWin ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg']),
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg'
  ]);
}

function getBgutilServerSource() {
  return findFirstExisting([
    process.env.LEG3NDY_BGUTIL_SERVER_HOME,
    path.join(os.homedir(), 'bgutil-ytdlp-pot-provider', 'server')
  ]);
}

ensureDir(resourcesDir);

const engineSource = getEngineSource();
const ffmpegSource = getFfmpegSource();
const nodeSource = process.execPath;
const bgutilSource = getBgutilServerSource();

const engineBuffer = readFileBufferOrThrow(engineSource, 'Engine Python');
const ffmpegBuffer = readFileBufferOrThrow(ffmpegSource, 'FFmpeg');
const nodeBuffer = readFileBufferOrThrow(nodeSource, 'Node');

for (const entry of [`leg3ndy-engine${binaryExt}`, 'leg3ndy-engine.exe', 'leg3ndy-engine', `ffmpeg${binaryExt}`, 'ffmpeg.exe', 'ffmpeg', `node${binaryExt}`, 'node.exe', 'node']) {
  removeIfExists(path.join(resourcesDir, entry));
}
removeIfExists(path.join(resourcesDir, 'bgutil-server'));

fs.writeFileSync(path.join(resourcesDir, `leg3ndy-engine${binaryExt}`), engineBuffer);
fs.writeFileSync(path.join(resourcesDir, `ffmpeg${binaryExt}`), ffmpegBuffer);
fs.writeFileSync(path.join(resourcesDir, `node${binaryExt}`), nodeBuffer);

const copiedBgutil = copyDirectoryIfExists(bgutilSource, path.join(resourcesDir, 'bgutil-server'));

console.log(`[prepare-runtime] Engine: ${engineSource}`);
console.log(`[prepare-runtime] FFmpeg: ${ffmpegSource}`);
console.log(`[prepare-runtime] Node: ${nodeSource}`);
console.log(copiedBgutil
  ? `[prepare-runtime] BGUTIL: ${bgutilSource}`
  : '[prepare-runtime] BGUTIL: nao encontrado, seguindo sem bundle do provider');
