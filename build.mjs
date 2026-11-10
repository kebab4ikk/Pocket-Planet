// Builds dist/PocketPlanet.js: one file to paste into the Scriptable app.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const header = `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: globe;

// Pocket Planet: a new pixel-art planet every time the widget refreshes.
// Built from planet.js + scriptable-main.js. Edit those, then run
// "node build.mjs".

`;
const core = readFileSync(join(here, 'planet.js'), 'utf8');
const main = readFileSync(join(here, 'scriptable-main.js'), 'utf8');
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'PocketPlanet.js'), header + core + '\n' + main);
console.log('wrote dist/PocketPlanet.js');

// Windows: a folder with the wallpaper script and its installer.
const win = join(here, 'dist', 'windows');
mkdirSync(win, { recursive: true });
writeFileSync(join(win, 'pocket-planet.cjs'),
  '// Pocket Planet for Windows. Built from planet.js + windows/wallpaper-main.js.\n' +
  core + '\n' + readFileSync(join(here, 'windows', 'wallpaper-main.js'), 'utf8'));
for (const f of ['install.ps1', 'install.cmd', 'new-planet.cmd']) {
  let text = readFileSync(join(here, 'windows', f), 'utf8').replace(/\r?\n/g, '\r\n');
  writeFileSync(join(win, f), text);
}
console.log('wrote dist/windows/');
