// ---------------------------------------------------------------- Windows
// Renders a new planet at the exact size of the main screen and sets it as the
// desktop wallpaper. Needs Node.js. install.ps1 runs this every time you sign
// in or unlock the PC.
//
//   node pocket-planet.cjs              new wallpaper
//   node pocket-planet.cjs 2560x1440    force a size (default: main screen)
//   node pocket-planet.cjs --seed=42    a particular planet
//   node pocket-planet.cjs --no-set     only write the PNG, print its path

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'PocketPlanet');
const LOG = path.join(OUT_DIR, 'log.txt');

// 5x7 pixel font: 7 rows per glyph, 5 bits per row (16 = leftmost pixel).
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
  '°': [12, 18, 18, 12, 0, 0, 0], '·': [0, 0, 0, 4, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
};

function textWidth(text, s) { return text.length * 6 * s - s; }

function drawText(img, text, x0, y0, s, color, shadow) {
  for (const pass of [shadow, color]) {
    const d = pass === shadow ? s : 0;
    let x = x0;
    for (const ch of text.toUpperCase()) {
      const g = FONT[ch] || FONT[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (!(g[row] & (16 >> col))) continue;
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
            const px = x + col * s + dx + d, py = y0 + row * s + dy + d;
            if (px >= 0 && py >= 0 && px < img.w && py < img.h) img.pix[py * img.w + px] = pass;
          }
        }
      }
      x += 6 * s;
    }
  }
}

// Full path, so it works even when PATH doesn't include PowerShell.
function powershellExe() {
  const p = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(p) ? p : 'pwsh.exe';
}

function powershell(script, env) {
  // -EncodedCommand avoids every quoting problem with paths and quotes.
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  return execFileSync(powershellExe(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
    { windowsHide: true, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
}

function screenSize() {
  if (process.platform !== 'win32') return [1920, 1080];
  const out = powershell(`
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class PPScreen { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i); }'
[PPScreen]::SetProcessDPIAware() | Out-Null
"$([PPScreen]::GetSystemMetrics(0))x$([PPScreen]::GetSystemMetrics(1))"`);
  const m = out.match(/(\d+)x(\d+)/);
  return m && +m[1] > 0 ? [+m[1], +m[2]] : [1920, 1080];
}

function setWallpaper(file) {
  powershell(`
$f = $env:POCKET_PLANET_FILE
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '10'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '0'
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class PPWall { [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }'
if ([PPWall]::SystemParametersInfo(20, 0, $f, 3) -eq 0) { throw "SystemParametersInfo failed" }`,
  { POCKET_PLANET_FILE: file });
}

// How many pixels of the rectangle the planet's disk or rings cover.
function covered(P, lay, x0, y0, w, h) {
  const a = P.axis, ring = P.ring;
  let hits = 0;
  for (let py = y0; py < y0 + h; py++) for (let px = x0; px < x0 + w; px++) {
    const x = (px + 0.5 - lay.cx) / lay.r, y = -(py + 0.5 - lay.cy) / lay.r;
    if (x * x + y * y < 1.21) { hits++; continue; }
    if (ring) {
      const t = -(x * a[0] + y * a[1]) / a[2], d = Math.sqrt(x * x + y * y + t * t);
      if (d >= ring.ri && d <= ring.ro) hits++;
    }
  }
  return hits;
}

function main() {
  const argv = process.argv.slice(2);
  const sizeArg = argv.find(a => /^\d+x\d+$/i.test(a));
  const seedArg = argv.find(a => a.startsWith('--seed='));
  const [Wp, Hp] = sizeArg ? sizeArg.toLowerCase().split('x').map(Number) : screenSize();
  const P = PocketPlanet.makePlanet(seedArg ? Number(seedArg.slice(7)) : Math.floor(Math.random() * 4294967296));

  // One pixel-art pixel is PX screen pixels: 4 on a 1080p screen, 5 on 1440p, 8 on 4K.
  const PX = Math.max(2, Math.round(Math.min(Wp, Hp) / 270));
  const W = Math.ceil(Wp / PX), H = Math.ceil(Hp / PX);
  const wide = Wp >= Hp;

  // Close-up: a huge planet running off the left and bottom edges, lit from
  // behind at the top right so a bright halo wraps its edge.
  const r = (wide ? 0.68 : 0.6) * Math.min(H, W * 1.6);
  const lay = wide ? { cx: W * 0.12, cy: H * 0.7, r: r } : { cx: W * 0.05, cy: H * 0.68, r: r };
  const L = [0.6, 0.72, -0.12], ll = Math.hypot(L[0], L[1], L[2]);
  P.light = [L[0] / ll, L[1] / ll, L[2] / ll];
  const img = PocketPlanet.render(P, W, H, lay, { glow: true });

  // Name, type and facts in the free corner: bottom right (above the taskbar),
  // or top right when the planet or its rings would cover the text there.
  const lines = [[P.name, 2, 0xffffff], [P.label, 1, 0xd8d4f0], [P.facts.join(' · '), 1, 0xa9a6c6]];
  if (textWidth(P.name, 2) > W * 0.4) lines[0][1] = 1;
  const right = W - Math.round(W * 0.04);
  const blockW = Math.max(...lines.map(([t, sc]) => textWidth(t, sc))), blockH = 7 * lines[0][1] + 7 * 2 + 12;
  const bottom = Math.round(H * (wide ? 0.76 : 0.82)), top = Math.round(H * 0.07);
  const ringIn = y0 => covered(P, lay, right - blockW, y0, blockW, blockH);
  let ty = ringIn(bottom) <= ringIn(top) ? bottom : top;
  for (const [text, sc, col] of lines) {
    drawText(img, text, right - textWidth(text, sc), ty, sc, col, 0x05050c);
    ty += 7 * sc + 4;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // A new file name each time: Windows sometimes keeps showing a cached image
  // when the wallpaper path stays the same.
  const file = path.join(OUT_DIR, 'planet-' + Date.now() + '.png');
  fs.writeFileSync(file, PocketPlanet.encodePNG(img, PX, Wp, Hp));

  if (argv.includes('--no-set') || process.platform !== 'win32') {
    console.log(file);
    return;
  }
  setWallpaper(file);
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^planet-\d+\.png$/.test(f) && path.join(OUT_DIR, f) !== file) {
      try { fs.unlinkSync(path.join(OUT_DIR, f)); } catch (e) { /* still in use; next run cleans it */ }
    }
  }
  fs.appendFileSync(LOG, new Date().toISOString() + '  ' + P.name + ' (' + P.label + ')\n');
}

try {
  main();
} catch (e) {
  try { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.appendFileSync(LOG, new Date().toISOString() + '  ERROR ' + (e.stack || e) + '\n'); } catch (_) {}
  console.error(e);
  process.exitCode = 1;
}
