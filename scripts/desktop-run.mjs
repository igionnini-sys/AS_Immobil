import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import electron from 'electron';
const env = { ...process.env };
// Gli host basati su Electron possono ereditare questa variabile dagli editor.
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = packaged ? join(root, 'release', process.platform === 'win32' ? 'win-unpacked/Immobiliare.exe' : 'linux-unpacked/immobiliare') : electron;
const args = process.argv.slice(2).filter(arg => arg !== '--packaged');
const child = spawn(executable, [...(packaged ? [] : [fileURLToPath(new URL('../apps/desktop', import.meta.url))]), ...args], {
  // Electron è l'app interattiva: SW_HIDE può impedire la prima apertura su Windows.
  stdio: 'inherit', env, windowsHide: false,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
