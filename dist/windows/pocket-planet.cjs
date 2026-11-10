// Pocket Planet for Windows. Built from planet.js + windows/wallpaper-main.js.
/*
 * Pocket Planet core: procedural pixel-art planets.
 * Plain JavaScript with no DOM and no dependencies, so the same file runs in
 * Scriptable (iOS), in a browser and in Node.
 *
 *   const P = PocketPlanet.makePlanet(seed);           // what the planet is
 *   const lay = PocketPlanet.layout(P, box);           // where it goes
 *   const img = PocketPlanet.render(P, W, H, lay);     // pixels, 1 per grid cell
 *   const png = PocketPlanet.encodePNG(img, scale);    // Uint8Array, upscaled
 */
var PocketPlanet = (function () {
  'use strict';

  // ---------------------------------------------------------------- random
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, s) {
    var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function makeNoise(rand) {
    var p = new Uint8Array(512), perm = [], i, j, t;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) { j = Math.floor(rand() * (i + 1)); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 512; i++) p[i] = perm[i & 255];

    function grad(h, x, y, z) {
      h &= 15;
      var u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
      return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }
    function noise(x, y, z) {
      var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
      var u = x * x * x * (x * (x * 6 - 15) + 10);
      var v = y * y * y * (y * (y * 6 - 15) + 10);
      var w = z * z * z * (z * (z * 6 - 15) + 10);
      var A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      var B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      var a1 = grad(p[AA], x, y, z), b1 = grad(p[BA], x - 1, y, z);
      var a2 = grad(p[AB], x, y - 1, z), b2 = grad(p[BB], x - 1, y - 1, z);
      var a3 = grad(p[AA + 1], x, y, z - 1), b3 = grad(p[BA + 1], x - 1, y, z - 1);
      var a4 = grad(p[AB + 1], x, y - 1, z - 1), b4 = grad(p[BB + 1], x - 1, y - 1, z - 1);
      var l1 = a1 + u * (b1 - a1), l2 = a2 + u * (b2 - a2);
      var l3 = a3 + u * (b3 - a3), l4 = a4 + u * (b4 - a4);
      var m1 = l1 + v * (l2 - l1), m2 = l3 + v * (l4 - l3);
      return m1 + w * (m2 - m1);
    }
    function fbm(x, y, z, oct) {
      var s = 0, a = 0.5, f = 1, n = 0;
      for (var i = 0; i < oct; i++) { s += a * noise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
      return s / n;
    }
    return { noise: noise, fbm: fbm };
  }

  // ---------------------------------------------------------------- color
  function c255(v) { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; }
  function rgb(r, g, b) { return (c255(r) << 16) | (c255(g) << 8) | c255(b); }
  function mix(a, b, t) {
    return rgb(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t,
               ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t,
               (a & 255) * (1 - t) + (b & 255) * t);
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = s < 0 ? 0 : s > 1 ? 1 : s; l = l < 0 ? 0 : l > 1 ? 1 : l;
    if (s === 0) return rgb(l * 255, l * 255, l * 255);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return rgb(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
  }
  function toHsl(c) {
    var r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  // Like hsl(), but dark yellows turn olive/brown, so lift them toward gold.
  function vivid(h, s, l) {
    var hh = ((h % 360) + 360) % 360, y = hh > 35 && hh < 70 ? 1 - Math.abs(hh - 52) / 18 : 0;
    return hsl(h, Math.min(1, s + 0.25 * y), l + (0.85 - l) * 0.45 * y);
  }
  function hue(c, deg) { var x = toHsl(c); return hsl(x[0] + deg, x[1], x[2]); }

  // Banded "pixel art" shading: 5 light levels, the darkest tinted toward night.
  var LEVELS = [0.2, 0.43, 0.68, 0.9, 1];
  function makeShader(night) {
    var cache = new Map();
    return function (c, lv) {
      var key = c * 8 + lv, v = cache.get(key);
      if (v !== undefined) return v;
      var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = LEVELS[lv];
      if (lv === 4) { r += (255 - r) * 0.14; g += (255 - g) * 0.14; b += (255 - b) * 0.14; }
      else { r *= f; g *= f; b *= f; }
      v = rgb(r, g, b);
      if (lv === 0) v = mix(v, night, 0.4); else if (lv === 1) v = mix(v, night, 0.18);
      cache.set(key, v);
      return v;
    };
  }

  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  function levelFor(l, b) {
    var lv = Math.floor((l + 0.22) / 1.22 * 4.6 + (b - 0.5) * 0.9);
    return lv < 0 ? 0 : lv > 4 ? 4 : lv;
  }

  function quantile(arr, n, f) {
    if (n === 0) return 0;
    var s = arr.slice(0, n).sort();
    var i = Math.floor(f * (n - 1));
    return s[i < 0 ? 0 : i >= n ? n - 1 : i];
  }

  // ---------------------------------------------------------------- planets
  // Realistic worlds (terran, ocean, desert, moon) are kept rare on purpose.
  var TYPES = [['terran', 5], ['ocean', 3], ['desert', 5], ['moon', 3], ['ice', 6], ['lava', 9],
               ['gas', 18], ['candy', 12], ['toxic', 6], ['alien', 20], ['crystal', 13]];
  var LABELS = { terran: 'Terran world', ocean: 'Ocean world', desert: 'Desert world', ice: 'Ice world',
                 lava: 'Lava world', gas: 'Gas giant', moon: 'Barren rock', candy: 'Candy world', toxic: 'Toxic world',
                 alien: 'Alien world', crystal: 'Crystal world' };
  var TEMPS = { terran: [-10, 35], ocean: [5, 30], desert: [40, 90], ice: [-190, -40], lava: [400, 1100],
                gas: [-170, -90], moon: [-120, 110], candy: [15, 28], toxic: [30, 75],
                alien: [-20, 60], crystal: [-120, 10] };
  var SYL = ['ka', 'zu', 'mi', 'lo', 'ra', 've', 'no', 'xi', 'ta', 'qu', 'el', 'or', 'an', 'is', 'um', 'py',
             'sa', 'do', 'ri', 'ne', 'ko', 'lu', 'fa', 'be', 'yo', 'ze', 'th', 'ar', 'ix', 'ul', 'mo', 'vi'];
  var SUFFIX = ['', '', '', ' Prime', ' II', ' III', ' IV', ' VII', ' b', ' c', ' Minor', ' Major', '-9', '-42'];

  function makePlanet(seed) {
    seed = seed >>> 0;
    var rand = mulberry32(seed ^ 0x5bd1e995);
    for (var w = 0; w < 4; w++) rand();
    function rr(a, b) { return a + (b - a) * rand(); }
    function pick(a) { return a[Math.floor(rand() * a.length)]; }
    // any hue, but yellow/gold comes up about a third of the time
    function anyHue() { return rand() < 0.33 ? rr(42, 58) : rr(0, 360); }

    var total = 0, i;
    for (i = 0; i < TYPES.length; i++) total += TYPES[i][1];
    var roll = rand() * total, type = TYPES[0][0];
    for (i = 0; i < TYPES.length; i++) { roll -= TYPES[i][1]; if (roll < 0) { type = TYPES[i][0]; break; } }

    var P = { seed: seed, type: type, label: LABELS[type] };
    P.noiseSeed = Math.floor(rand() * 4294967296);
    P.tilt = rr(-0.55, 0.55);
    P.elev = (rand() < 0.5 ? -1 : 1) * rr(0.2, 0.45);
    P.spin = rr(0, Math.PI * 2);
    P.scale = rr(1.5, 2.4);
    var L = [rr(0.55, 0.9) * (rand() < 0.75 ? -1 : 1), rr(0.15, 0.55), rr(0.12, 0.45)];
    var ll = Math.hypot(L[0], L[1], L[2]);
    P.light = [L[0] / ll, L[1] / ll, L[2] / ll];
    P.bgHue = rand() < 0.6 ? rr(205, 250) : pick([rr(170, 205), rr(250, 300), rr(300, 360), rr(0, 30)]);
    P.night = hsl(P.bgHue, 0.5, 0.12);
    P.atm = 0;

    var pal = {};
    if (type === 'terran' || type === 'ocean') {
      var ws = rr(-15, 18), hs = rr(-22, 18);
      pal = { deep: hue(0x1d4b8f, ws), shallow: hue(0x2f86c8, ws), sand: 0xe6d394, grass: hue(0x5cab4b, hs),
              forest: hue(0x387a3a, hs), rock: 0x86765f, snow: 0xf1f5fa, cloud: 0xffffff, city: 0xffd27a };
      P.kind = 'wet';
      P.land = type === 'ocean' ? rr(0.05, 0.12) : rr(0.3, 0.5);
      P.clouds = type === 'ocean' ? rr(0.22, 0.35) : rr(0.15, 0.32);
      P.ice = type === 'ocean' ? rr(0.85, 0.95) : rr(0.74, 0.9);
      P.cities = type === 'terran' && rand() < 0.6;
      P.atm = hue(0x7fc4ff, ws);
    } else if (type === 'candy') {
      var cs = pick([0, 90, 90, 120, 180, 240, 300]) + rr(-15, 15);
      pal = { deep: hue(0xe46fa5, cs), shallow: hue(0xff9fca, cs), sand: 0xfff0b8, grass: hue(0x9eeac0, -cs),
              forest: hue(0x6fcfa2, -cs), rock: hue(0xc6a3e8, cs), snow: 0xffffff, cloud: 0xfff4fa };
      P.kind = 'wet'; P.land = rr(0.3, 0.5); P.clouds = rr(0.12, 0.3); P.ice = rr(0.8, 0.92);
      P.atm = hue(0xffb8de, cs);
    } else if (type === 'toxic') {
      var ts = pick([0, 0, 120, 200, 260]) + rr(-20, 20);
      pal = { deep: hue(0x3b1a63, ts), shallow: hue(0x6a2fa0, ts), sand: hue(0xc6e85a, ts), grass: hue(0x8fd436, ts),
              forest: hue(0x4f9a2a, ts), rock: 0x4a3b5c, snow: 0xe6ffb0, cloud: hue(0xc9ff8a, ts) };
      P.kind = 'wet'; P.land = rr(0.35, 0.55); P.clouds = rr(0.15, 0.35); P.ice = rr(0.88, 0.97);
      P.atm = hue(0xb8ff6a, ts);
    } else if (type === 'alien') {
      // vivid made-up palette: purple-leaning seas, land in a contrasting hue
      var hw = anyHue(), hl = rand() < 0.3 ? rr(45, 58) : hw + rr(90, 180) * (rand() < 0.5 ? -1 : 1);
      pal = { deep: vivid(hw, 0.6, 0.28), shallow: vivid(hw, 0.65, 0.46), sand: vivid(hl + 25, 0.65, 0.76),
              grass: vivid(hl, 0.62, 0.56), forest: vivid(hl - 12, 0.55, 0.38), rock: vivid(hw + 40, 0.3, 0.42),
              snow: vivid(hw, 0.45, 0.93), cloud: vivid(hw + 20, 0.55, 0.9) };
      P.kind = 'wet'; P.land = rr(0.3, 0.55); P.clouds = rr(0.1, 0.28); P.ice = rr(0.82, 0.95);
      P.atm = vivid(hw, 0.85, 0.74);
    } else if (type === 'crystal') {
      var ch = anyHue();
      pal = { c1: vivid(ch, 0.75, 0.88), c2: vivid(ch, 0.65, 0.72), c3: vivid(ch + 15, 0.6, 0.57), c4: vivid(ch + 28, 0.55, 0.4),
              crack: vivid(ch - 45 + (rand() < 0.5 ? 0 : 90), 0.95, 0.72) };
      P.kind = 'ice'; P.atm = vivid(ch, 0.9, 0.78);
    } else if (type === 'desert') {
      var dh = rand() < 0.35 ? pick([0, 90, 160, 200, 320]) + rr(-10, 10) : rr(15, 42);
      pal = { s1: hsl(dh + 4, 0.6, 0.8), s2: hsl(dh, 0.55, 0.66), s3: hsl(dh - 5, 0.5, 0.52), s4: hsl(dh - 10, 0.45, 0.38),
              snow: 0xf6efe6, cloud: hsl(dh, 0.5, 0.88) };
      P.kind = 'desert'; P.caps = rand() < 0.5; P.clouds = rand() < 0.5 ? rr(0.04, 0.12) : 0;
      P.atm = hsl(dh, 0.75, 0.72);
    } else if (type === 'ice') {
      var is = rand() < 0.5 ? rr(-180, 180) : rr(-20, 25);
      pal = { c1: 0xf4fbff, c2: hue(0xd2ecfa, is), c3: hue(0xa6d2ee, is), c4: hue(0x6aa7d6, is), crack: hue(0x3c6fa8, is) };
      P.kind = 'ice'; P.atm = hue(0xcff0ff, is);
    } else if (type === 'lava') {
      var lshift = rand() < 0.55 ? pick([60, 110, 150, 180, 210, 250, 290]) : rr(-10, 10);
      pal = { r1: 0x4a3633, r2: 0x362726, r3: 0x241a1b, lava: hue(0xff5a1f, lshift), hot: hue(0xffc93c, lshift) };
      P.kind = 'lava'; P.lavaFrac = rr(0.12, 0.22);
    } else if (type === 'gas') {
      var h1 = anyHue(), h2 = h1 + rr(20, 70) * (rand() < 0.5 ? -1 : 1), sat = rr(0.45, 0.75);
      var gp = [hsl(h1, sat, 0.84), hsl(h1, sat, 0.7), hsl(h2, sat, 0.6), hsl(h2, sat * 0.9, 0.47), hsl(h1, sat, 0.56)];
      var bands = [], n = 7 + Math.floor(rand() * 6), prev = -1;
      for (i = 0; i < n; i++) { var b; do { b = Math.floor(rand() * gp.length); } while (b === prev); bands.push(b); prev = b; }
      pal = { bands: gp, storm: hsl(h2 + 180 * (rand() < 0.3 ? 1 : 0) + 10, 0.6, 0.6), stormIn: hsl(h2 + 15, 0.55, 0.78) };
      P.kind = 'gas'; P.bands = bands; P.freq = rr(2.5, 6); P.turb = rr(0.15, 0.4);
      if (rand() < 0.65) P.storm = { lon: rr(-1, 1), lat: rr(-0.5, 0.5), w: rr(0.25, 0.45), h: rr(0.1, 0.18) };
      P.atm = hsl(h1, 0.6, 0.8);
    } else {
      var mh = rr(0, 360), ms = rr(0.03, 0.16);
      pal = { c1: hsl(mh, ms, 0.72), c2: hsl(mh, ms, 0.6), c3: hsl(mh, ms, 0.48), floor: hsl(mh, ms, 0.38), rim: hsl(mh, ms, 0.82) };
      P.kind = 'moon';
      P.craters = [];
      var nc = 14 + Math.floor(rand() * 14);
      for (i = 0; i < nc; i++) {
        var cu = rr(-1, 1), ca = rr(0, Math.PI * 2), cr = Math.sqrt(1 - cu * cu), rad = rr(0.07, 0.24);
        P.craters.push([cr * Math.cos(ca), cu, cr * Math.sin(ca), Math.cos(rad), Math.cos(rad * 0.75)]);
      }
    }
    P.pal = pal;

    // rings lie in the equator plane; the ring normal is the planet's axis
    var ringChance = type === 'gas' ? 0.5 : type === 'moon' ? 0.05 : 0.15;
    var ax = [-Math.sin(P.tilt) * Math.cos(P.elev), Math.cos(P.tilt) * Math.cos(P.elev), Math.sin(P.elev)];
    P.axis = ax;
    if (rand() < ringChance) {
      var base = type === 'gas' ? pal.bands[0] : type === 'moon' ? pal.c1 : hsl(rr(0, 360), 0.35, 0.75);
      var cols = [base, hue(mix(base, 0xffffff, 0.25), 20), mix(base, 0x000000, 0.25)];
      var bins = [], nb = 48, cur = 0;
      for (i = 0; i < nb; i++) {
        if (rand() < 0.35) cur = Math.floor(rand() * 3);
        bins.push(rand() < 0.1 ? -1 : cur);
      }
      P.ring = { ri: rr(1.25, 1.5), ro: rr(1.8, 2.25), cols: cols, bins: bins };
    }

    var mr = rand(), nm = mr < 0.45 ? 0 : mr < 0.8 ? 1 : 2;
    P.moons = [];
    for (i = 0; i < nm; i++) {
      P.moons.push({ ang: rr(0, Math.PI * 2), dist: rr(1.45, 1.9), size: rr(0.09, 0.16),
                     color: hsl(rr(0, 360), rr(0, 0.25), rr(0.55, 0.75)), seed: Math.floor(rand() * 1e9) });
    }

    var name = '', ns = 2 + (rand() < 0.35 ? 1 : 0);
    for (i = 0; i < ns; i++) name += pick(SYL);
    if (/^(th|x)/.test(name) || name.length < 4) name = pick(['a', 'o', 'e']) + name;
    P.name = name.charAt(0).toUpperCase() + name.slice(1) + pick(SUFFIX);
    var tr = TEMPS[type];
    P.temp = Math.round(rr(tr[0], tr[1]));
    P.day = Math.round(rr(5, 80));
    P.facts = [P.day + ' h day', (P.temp > 0 ? '+' : '') + P.temp + '°C',
               nm === 0 ? 'no moons' : nm === 1 ? '1 moon' : nm + ' moons'];
    if (P.ring) P.facts.push('rings');
    return P;
  }

  // Fit the planet (and its rings and halo) into box {x, y, w, h} of grid pixels.
  function layout(P, box, fill) {
    fill = fill || 0.94;
    var a = P.axis, ex = 1.12, ey = 1.12;
    if (P.ring) {
      ex = Math.max(ex, P.ring.ro * Math.sqrt(1 - a[0] * a[0]));
      ey = Math.max(ey, P.ring.ro * Math.sqrt(1 - a[1] * a[1]));
    }
    var r = Math.min(box.w / 2 / ex, box.h / 2 / ey) * fill;
    return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, r: r, ey: ey }; // ey*r: how far it reaches below cy
  }

  // ---------------------------------------------------------------- render
  function render(P, W, H, lay, opt) {
    opt = opt || {};
    var pix = new Int32Array(W * H);
    var N = makeNoise(mulberry32(P.noiseSeed));
    var shade = makeShader(P.night);
    var rand = mulberry32(P.seed ^ 0x2545f491);
    var lx = P.light[0], ly = P.light[1], lz = P.light[2];
    var pal = P.pal, x, y, i, px, py;

    // --- sky
    if (opt.transparent) pix.fill(-1);
    else {
      var bg0 = hsl(P.bgHue, 0.45, 0.065), bg1 = hsl(P.bgHue, 0.4, 0.09), bg2 = hsl(P.bgHue + 30, 0.35, 0.115);
      var nf = 6 / Math.max(W, H);
      for (py = 0; py < H; py++) for (px = 0; px < W; px++) {
        var nv = N.fbm(px * nf, py * nf, 11.3, 2) * 3 + (bayer(px, py) - 0.5) * 0.45;
        pix[py * W + px] = nv > 0.95 ? bg2 : nv > 0.5 ? bg1 : bg0;
      }
      var stars = [0xffffff, 0xfff1c9, 0xcfe0ff], ns = Math.round(W * H * 0.012);
      for (i = 0; i < ns; i++) {
        px = Math.floor(rand() * W); py = Math.floor(rand() * H);
        pix[py * W + px] = mix(bg0, stars[i % 3], [0.35, 0.6, 1][Math.floor(rand() * 3)]);
      }
      var nbig = Math.max(2, Math.round(W * H * 0.0007));
      for (i = 0; i < nbig; i++) {
        px = 2 + Math.floor(rand() * (W - 4)); py = 2 + Math.floor(rand() * (H - 4));
        var sc = stars[i % 3], arm = mix(bg0, sc, 0.45);
        pix[py * W + px] = sc;
        pix[py * W + px - 1] = arm; pix[py * W + px + 1] = arm;
        pix[(py - 1) * W + px] = arm; pix[(py + 1) * W + px] = arm;
      }
    }

    var cx = lay.cx, cy = lay.cy, R = lay.r;
    var ring = P.ring, an = P.axis;
    var ri = ring ? ring.ri : 0, ro = ring ? ring.ro : 0, nb = ring ? ring.bins.length : 0;
    var aw = P.atm ? Math.max(1.5, R * 0.07) / R : 0;
    var ext = Math.max(1 + aw, ro) + 2 / R;
    // opt.glow: backlit look, a bright halo around the lit edge plus a sun flare
    // just behind it, in dithered steps so it stays pixel art.
    var glow = !!opt.glow, GL = 0.3, FR = 0.6, GLV = [0, 0.16, 0.34, 0.58, 0.85];
    var lxy = Math.hypot(lx, ly) || 1, ux = lx / lxy, uy = ly / lxy;
    var glowCol = mix(P.atm || 0xffd9a8, 0xffffff, 0.45);
    if (glow) ext = Math.max(ext, 1 + GL, 1 + FR) + 2 / R;
    var x0 = Math.max(0, Math.floor(cx - ext * R)), x1 = Math.min(W - 1, Math.ceil(cx + ext * R));
    var y0 = Math.max(0, Math.floor(cy - ext * R)), y1 = Math.min(H - 1, Math.ceil(cy + ext * R));

    // planet orientation: view -> planet frame = Ry(-spin) Rx(-elev) Rz(-tilt)
    var ct = Math.cos(P.tilt), st = Math.sin(P.tilt), ce = Math.cos(P.elev), se = Math.sin(P.elev);
    var cs = Math.cos(P.spin), ss = Math.sin(P.spin);

    var cap = (x1 - x0 + 1) * (y1 - y0 + 1);
    var sIdx = new Int32Array(cap), sX = new Float32Array(cap), sY = new Float32Array(cap), sZ = new Float32Array(cap);
    var U = new Float32Array(cap), V = new Float32Array(cap), Wv = new Float32Array(cap);
    var n = 0;

    for (py = y0; py <= y1; py++) for (px = x0; px <= x1; px++) {
      x = (px + 0.5 - cx) / R; y = -(py + 0.5 - cy) / R;
      var d2 = x * x + y * y, z = d2 < 1 ? Math.sqrt(1 - d2) : -9;
      var rb = -1, rt = 0, rr2 = 0;
      if (ring) {
        rt = -(x * an[0] + y * an[1]) / an[2];
        rr2 = d2 + rt * rt;
        if (rr2 >= ri * ri && rr2 <= ro * ro) rb = ring.bins[Math.min(nb - 1, Math.floor((Math.sqrt(rr2) - ri) / (ro - ri) * nb))];
      }
      var k = py * W + px;
      if (d2 < 1 && !(rb >= 0 && rt > z)) {
        sIdx[n] = k; sX[n] = x; sY[n] = y; sZ[n] = z;
        var x1r = x * ct + y * st, y1r = -x * st + y * ct;
        var y2 = y1r * ce + z * se, z2 = -y1r * se + z * ce;
        U[n] = x1r * cs - z2 * ss; V[n] = y2; Wv[n] = x1r * ss + z2 * cs;
        n++;
        continue;
      }
      if (rb >= 0) {
        var bd = x * lx + y * ly + rt * lz;
        var shadow = bd < 0 && bd * bd > rr2 - 1;
        var rlv = shadow ? 1 : (bayer(px, py) > 0.85 ? 4 : 3);
        pix[k] = shade(ring.cols[rb], rlv);
        continue;
      }
      if (aw && d2 < (1 + aw) * (1 + aw)) {
        var d = Math.sqrt(d2), lit = (x * lx + y * ly) / d + (bayer(px, py) - 0.5) * 0.3;
        if (lit > -0.15) {
          var inner = d < 1 + aw * 0.5;
          var alpha = (inner ? 0.55 : 0.28) * (lit > 0.35 ? 1 : 0.6);
          if (opt.transparent && pix[k] === -1) pix[k] = shade(P.atm, inner ? 3 : 2);
          else pix[k] = mix(pix[k], P.atm, alpha);
        }
      }
      if (glow) {
        var gd = Math.sqrt(d2), face = Math.max(0, (x * ux + y * uy) / gd);
        var halo = gd < 1 + GL ? face * face * face * Math.pow(1 - (gd - 1) / GL, 2) : 0;
        var fq = Math.hypot(x - ux, y - uy) / FR, flare = fq < 1 ? Math.pow(1 - fq, 2.2) * 1.2 : 0;
        var glv = Math.floor(Math.min(1, halo + flare) * 5 + (bayer(px, py) - 0.5) * 0.9);
        if (glv > 0) pix[k] = mix(pix[k], glowCol, GLV[glv > 4 ? 4 : glv]);
      }
    }

    colorSurface(P, N, shade, pix, n, sIdx, sX, sY, sZ, U, V, Wv, W);
    if (glow) {
      // light spilling over the lit edge of the disk
      for (i = 0; i < n; i++) {
        var f = sX[i] * ux + sY[i] * uy;
        if (f <= 0) continue;
        var e = 1 - sZ[i], rim = f * f * e * e * e * e * 1.4;
        var k2 = sIdx[i], qx = k2 % W, rlv2 = Math.floor(Math.min(1, rim) * 5 + (bayer(qx, (k2 - qx) / W) - 0.5) * 0.9);
        if (rlv2 > 0) pix[k2] = mix(pix[k2], glowCol, GLV[rlv2 > 4 ? 4 : rlv2] * 0.85);
      }
    }
    drawMoons(P, pix, W, H, cx, cy, R, shade, opt);
    return { w: W, h: H, pix: pix };
  }

  function colorSurface(P, N, shade, pix, n, sIdx, sX, sY, sZ, U, V, Wv, W) {
    var s = P.scale, pal = P.pal, kind = P.kind, i, u, v, w;
    var lx = P.light[0], ly = P.light[1], lz = P.light[2];
    var F1 = new Float32Array(n), F2 = new Float32Array(n), F3 = new Float32Array(n);

    for (i = 0; i < n; i++) {
      u = U[i] * s; v = V[i] * s; w = Wv[i] * s;
      if (kind === 'wet') {
        F1[i] = N.fbm(u, v, w, 5);
        F2[i] = N.fbm(u * 0.9 + 17.1, v * 2.4 + 3.3, w * 0.9 - 5.2, 4);
        F3[i] = N.noise(u * 2.5 + 40, v * 2.5, w * 2.5) * 0.12;
      } else if (kind === 'desert') {
        F1[i] = N.fbm(u, v, w, 4) * 0.75 + N.noise(u * 1.5, v * 9, w * 1.5) * 0.25;
        F2[i] = P.clouds ? N.fbm(u * 0.8 + 9, v * 3, w * 0.8, 3) : 0;
        F3[i] = N.noise(u * 2.5 + 40, v * 2.5, w * 2.5) * 0.08;
      } else if (kind === 'ice') {
        F1[i] = N.fbm(u, v, w, 4);
        F2[i] = 1 - Math.abs(N.fbm(u * 1.4 + 31, v * 1.4, w * 1.4, 3));
      } else if (kind === 'lava') {
        F1[i] = N.fbm(u, v, w, 4);
        F2[i] = 1 - Math.abs(N.fbm(u * 1.2 + 5, v * 1.2, w * 1.2, 4));
      } else if (kind === 'gas') {
        F1[i] = N.fbm(u * 1.2, v * 4, w * 1.2, 3);
      } else {
        F1[i] = N.fbm(u * 1.3, v * 1.3, w * 1.3, 4);
      }
    }

    var t = {};
    if (kind === 'wet') {
      t.sea = quantile(F1, n, 1 - P.land);
      t.shallow = quantile(F1, n, Math.max(0, 1 - P.land - 0.07));
      t.top = quantile(F1, n, 0.995);
      t.cloud = quantile(F2, n, 1 - P.clouds);
    } else if (kind === 'desert') {
      t.a = quantile(F1, n, 0.25); t.b = quantile(F1, n, 0.55); t.c = quantile(F1, n, 0.85);
      t.cloud = P.clouds ? quantile(F2, n, 1 - P.clouds) : 9;
    } else if (kind === 'ice') {
      t.a = quantile(F1, n, 0.12); t.b = quantile(F1, n, 0.4); t.c = quantile(F1, n, 0.72);
      t.crack = quantile(F2, n, 0.9);
    } else if (kind === 'lava') {
      t.a = quantile(F1, n, 0.33); t.b = quantile(F1, n, 0.66);
      t.lava = quantile(F2, n, 1 - P.lavaFrac); t.hot = quantile(F2, n, 1 - P.lavaFrac * 0.35);
    } else if (kind === 'moon') {
      t.a = quantile(F1, n, 0.33); t.b = quantile(F1, n, 0.7);
    }

    var ring = P.ring, an = P.axis, la = ring ? lx * an[0] + ly * an[1] + lz * an[2] : 0;

    for (i = 0; i < n; i++) {
      var k = sIdx[i], px = k % W, py = (k - px) / W, b = bayer(px, py);
      var x = sX[i], y = sY[i], z = sZ[i];
      var l = x * lx + y * ly + z * lz, lv = levelFor(l, b);
      if (ring && Math.abs(la) > 1e-3) {
        var sd = -(x * an[0] + y * an[1] + z * an[2]) / la;
        if (sd > 0) {
          var qx = x + sd * lx, qy = y + sd * ly, qz = z + sd * lz, qd = Math.sqrt(qx * qx + qy * qy + qz * qz);
          if (qd > ring.ri && qd < ring.ro &&
              ring.bins[Math.min(ring.bins.length - 1, Math.floor((qd - ring.ri) / (ring.ro - ring.ri) * ring.bins.length))] >= 0)
            lv = Math.max(0, lv - 2);
        }
      }
      var f1 = F1[i], f2 = F2[i], lat = Math.abs(V[i]), c, emit = -1;

      if (kind === 'wet') {
        var land = f1 > t.sea;
        if (lat + F3[i] > P.ice) c = pal.snow;
        else if (!land) c = f1 > t.shallow ? pal.shallow : pal.deep;
        else {
          var hh = (f1 - t.sea) / Math.max(1e-6, t.top - t.sea);
          c = hh < 0.07 ? pal.sand : hh < 0.45 ? pal.grass : hh < 0.75 ? pal.forest : hh < 0.93 ? pal.rock : pal.snow;
        }
        if (f2 > t.cloud) c = pal.cloud;
        else if (P.cities && land && lv === 0 && c !== pal.snow && hash2(px, py, P.seed) < 0.07) emit = pal.city;
      } else if (kind === 'desert') {
        c = f1 > t.c ? pal.s1 : f1 > t.b ? pal.s2 : f1 > t.a ? pal.s3 : pal.s4;
        if (P.caps && lat + F3[i] > 0.88) c = pal.snow;
        if (f2 > t.cloud) c = pal.cloud;
      } else if (kind === 'ice') {
        c = f1 > t.c ? pal.c1 : f1 > t.b ? pal.c2 : f1 > t.a ? pal.c3 : pal.c4;
        if (f2 > t.crack) c = pal.crack;
      } else if (kind === 'lava') {
        c = f1 > t.b ? pal.r1 : f1 > t.a ? pal.r2 : pal.r3;
        if (f2 > t.hot) { c = pal.hot; lv = 4; }
        else if (f2 > t.lava) { c = pal.lava; lv = Math.max(lv, 3); }
      } else if (kind === 'gas') {
        var bnd = V[i] * P.freq + f1 * P.turb * P.freq + (b - 0.5) * 0.25;
        var bi = Math.floor(bnd) % P.bands.length;
        if (bi < 0) bi += P.bands.length;
        c = pal.bands[P.bands[bi]];
        if (P.storm) {
          var lon = Math.atan2(Wv[i], U[i]), latA = Math.asin(Math.max(-1, Math.min(1, V[i])));
          var dl = lon - P.storm.lon; dl -= Math.round(dl / (2 * Math.PI)) * 2 * Math.PI;
          var e = (dl / P.storm.w) * (dl / P.storm.w) + ((latA - P.storm.lat) / P.storm.h) * ((latA - P.storm.lat) / P.storm.h);
          if (e < 0.4) c = pal.stormIn; else if (e < 1) c = pal.storm;
        }
      } else {
        c = f1 > t.b ? pal.c1 : f1 > t.a ? pal.c2 : pal.c3;
        var cr = P.craters;
        for (var j = 0; j < cr.length; j++) {
          var dd = U[i] * cr[j][0] + V[i] * cr[j][1] + Wv[i] * cr[j][2];
          if (dd > cr[j][3]) { c = dd > cr[j][4] ? pal.floor : pal.rim; break; }
        }
      }
      pix[k] = emit >= 0 ? emit : shade(c, lv);
    }
  }

  function drawMoons(P, pix, W, H, cx, cy, R, shade, opt) {
    var lx = P.light[0], ly = P.light[1], lz = P.light[2];
    for (var m = 0; m < P.moons.length; m++) {
      var mo = P.moons[m], mr = Math.max(2, mo.size * R), placed = false, mx = 0, my = 0;
      for (var tries = 0; tries < 8 && !placed; tries++) {
        var ang = mo.ang + tries * 0.8;
        var dist = (P.ring ? Math.max(mo.dist, P.ring.ro * 0.95) : mo.dist) * R + mr;
        mx = cx + Math.cos(ang) * dist; my = cy - Math.sin(ang) * dist * 0.9;
        placed = mx - mr > 1 && mx + mr < W - 1 && my - mr > 1 && my + mr < H - 1;
      }
      if (!placed) continue;
      var mN = makeNoise(mulberry32(mo.seed)), dark = mix(mo.color, 0x000000, 0.22);
      for (var py = Math.floor(my - mr); py <= Math.ceil(my + mr); py++) {
        for (var px = Math.floor(mx - mr); px <= Math.ceil(mx + mr); px++) {
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          var x = (px + 0.5 - mx) / mr, y = -(py + 0.5 - my) / mr, d2 = x * x + y * y;
          if (d2 >= 1) continue;
          var z = Math.sqrt(1 - d2);
          var c = mN.noise(x * 2.2, y * 2.2, z * 2.2) > 0.12 ? dark : mo.color;
          pix[py * W + px] = shade(c, levelFor(x * lx + y * ly + z * lz, bayer(px, py)));
        }
      }
    }
  }

  // ---------------------------------------------------------------- PNG
  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(buf, start, end) {
    var c = -1;
    for (var i = start; i < end; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

  // Deflate with fixed Huffman codes and run-length matches only (distance 1).
  // Upscaled pixel art is mostly runs, so this compresses it very well.
  function deflateRLE(data) {
    function rev(c, l) { var r = 0; for (var i = 0; i < l; i++) { r = (r << 1) | (c & 1); c >>= 1; } return r; }
    var litCode = new Uint16Array(288), litLen = new Uint8Array(288), s, k;
    for (s = 0; s < 288; s++) {
      var c, l;
      if (s < 144) { c = 0x30 + s; l = 8; } else if (s < 256) { c = 0x190 + s - 144; l = 9; }
      else if (s < 280) { c = s - 256; l = 7; } else { c = 0xc0 + s - 280; l = 8; }
      litCode[s] = rev(c, l); litLen[s] = l;
    }
    var lenSym = new Uint16Array(259);
    for (k = 0; k < 29; k++) {
      var hi = k < 28 ? LEN_BASE[k + 1] - 1 : 258;
      for (var len = LEN_BASE[k]; len <= hi; len++) lenSym[len] = 257 + k;
    }
    var out = new Uint8Array(Math.ceil(data.length * 9 / 8) + 64), op = 0, bb = 0, bc = 0;
    function put(bits, nb) {
      bb |= bits << bc; bc += nb;
      while (bc >= 8) { out[op++] = bb & 255; bb >>>= 8; bc -= 8; }
    }
    put(1, 1); put(1, 2);
    var i = 0, n = data.length;
    while (i < n) {
      var run = 0;
      if (i > 0) { var pb = data[i - 1]; while (run < 258 && i + run < n && data[i + run] === pb) run++; }
      if (run >= 3) {
        s = lenSym[run]; k = s - 257;
        put(litCode[s], litLen[s]);
        if (LEN_EXTRA[k]) put(run - LEN_BASE[k], LEN_EXTRA[k]);
        put(0, 5);
        i += run;
      } else { put(litCode[data[i]], litLen[data[i]]); i++; }
    }
    put(litCode[256], litLen[256]);
    if (bc > 0) out[op++] = bb & 255;
    return out.subarray(0, op);
  }

  function zlib(data) {
    var d = deflateRLE(data), a = 1, b = 0;
    for (var i = 0; i < data.length; i++) { a = (a + data[i]) % 65521; b = (b + a) % 65521; }
    var out = new Uint8Array(d.length + 6);
    out[0] = 0x78; out[1] = 0x01; out.set(d, 2);
    var ad = ((b << 16) | a) >>> 0, e = d.length + 2;
    out[e] = ad >>> 24; out[e + 1] = (ad >>> 16) & 255; out[e + 2] = (ad >>> 8) & 255; out[e + 3] = ad & 255;
    return out;
  }

  // img: {w, h, pix} with 0xRRGGBB per pixel, or -1 for transparent.
  // Each pixel becomes a scale x scale block. Optional outW/outH crop the
  // result to an exact size (so a wallpaper matches the screen pixel for pixel).
  function encodePNG(img, scale, outW, outH) {
    scale = Math.max(1, Math.round(scale || 1));
    var w = img.w, h = img.h, pix = img.pix, i, x, y, r;
    var W = Math.min(w * scale, outW || Infinity), H = Math.min(h * scale, outH || Infinity);
    var map = new Map(), colors = [];
    for (i = 0; i < pix.length && colors.length <= 256; i++) {
      if (!map.has(pix[i])) { map.set(pix[i], colors.length); colors.push(pix[i]); }
    }
    var indexed = colors.length <= 256, bpp = indexed ? 1 : 4, stride = 1 + W * bpp;
    var raw = new Uint8Array(stride * H);
    for (var oy = 0; oy < H; oy++) {
      var o = oy * stride;
      if (oy % scale) { raw[o] = 2; continue; } // "Up" filter: an all-zero copy of the row above
      raw[o++] = 0;
      y = oy / scale;
      for (var ox = 0; ox < W; ox++) {
        var p = pix[y * w + Math.floor(ox / scale)];
        if (indexed) raw[o++] = map.get(p);
        else if (p === -1) { raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; }
        else { raw[o++] = (p >> 16) & 255; raw[o++] = (p >> 8) & 255; raw[o++] = p & 255; raw[o++] = 255; }
      }
    }

    var chunks = [];
    function chunk(type, data) { chunks.push([type, data]); }
    var ihdr = new Uint8Array(13);
    ihdr[0] = W >>> 24; ihdr[1] = (W >>> 16) & 255; ihdr[2] = (W >>> 8) & 255; ihdr[3] = W & 255;
    ihdr[4] = H >>> 24; ihdr[5] = (H >>> 16) & 255; ihdr[6] = (H >>> 8) & 255; ihdr[7] = H & 255;
    ihdr[8] = 8; ihdr[9] = indexed ? 3 : 6;
    chunk('IHDR', ihdr);
    if (indexed) {
      var plte = new Uint8Array(colors.length * 3), trns = -1;
      for (i = 0; i < colors.length; i++) {
        var cc = colors[i];
        if (cc === -1) { trns = i; cc = 0; }
        plte[i * 3] = (cc >> 16) & 255; plte[i * 3 + 1] = (cc >> 8) & 255; plte[i * 3 + 2] = cc & 255;
      }
      chunk('PLTE', plte);
      if (trns >= 0) {
        var ta = new Uint8Array(trns + 1);
        for (i = 0; i < trns; i++) ta[i] = 255;
        chunk('tRNS', ta);
      }
    }
    chunk('IDAT', zlib(raw));
    chunk('IEND', new Uint8Array(0));

    var size = 8;
    for (i = 0; i < chunks.length; i++) size += 12 + chunks[i][1].length;
    var out = new Uint8Array(size), op = 0;
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (i = 0; i < 8; i++) out[op++] = sig[i];
    for (i = 0; i < chunks.length; i++) {
      var t = chunks[i][0], dat = chunks[i][1], L = dat.length;
      out[op++] = L >>> 24; out[op++] = (L >>> 16) & 255; out[op++] = (L >>> 8) & 255; out[op++] = L & 255;
      var cs = op;
      for (var j = 0; j < 4; j++) out[op++] = t.charCodeAt(j);
      out.set(dat, op); op += L;
      var crc = crc32(out, cs, op);
      out[op++] = crc >>> 24; out[op++] = (crc >>> 16) & 255; out[op++] = (crc >>> 8) & 255; out[op++] = crc & 255;
    }
    return out;
  }

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function toBase64(bytes) {
    var parts = [], chunk = [], n = bytes.length, i;
    for (i = 0; i + 2 < n; i += 3) {
      var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      chunk.push(B64[v >> 18], B64[(v >> 12) & 63], B64[(v >> 6) & 63], B64[v & 63]);
      if (chunk.length >= 8192) { parts.push(chunk.join('')); chunk = []; }
    }
    if (i < n) {
      var a = bytes[i], b = i + 1 < n ? bytes[i + 1] : 0, vv = (a << 16) | (b << 8);
      chunk.push(B64[vv >> 18], B64[(vv >> 12) & 63], i + 1 < n ? B64[(vv >> 6) & 63] : '=', '=');
    }
    parts.push(chunk.join(''));
    return parts.join('');
  }

  return { makePlanet: makePlanet, layout: layout, render: render, encodePNG: encodePNG, toBase64: toBase64 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PocketPlanet;

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

// How many pixels of the rectangle the planet's rings cover.
function ringPixels(P, lay, x0, y0, w, h) {
  if (!P.ring) return 0;
  const a = P.axis, { ri, ro } = P.ring;
  let hits = 0;
  for (let py = y0; py < y0 + h; py++) for (let px = x0; px < x0 + w; px++) {
    const x = (px + 0.5 - lay.cx) / lay.r, y = -(py + 0.5 - lay.cy) / lay.r;
    const t = -(x * a[0] + y * a[1]) / a[2], d = Math.sqrt(x * x + y * y + t * t);
    if (d >= ri && d <= ro) hits++;
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

  // Name, type and facts in the empty space at the bottom right, above the taskbar.
  const lines = [[P.name, 2, 0xffffff], [P.label, 1, 0xd8d4f0], [P.facts.join(' · '), 1, 0xa9a6c6]];
  if (textWidth(P.name, 2) > W * 0.4) lines[0][1] = 1;
  const right = W - Math.round(W * 0.04);
  const blockW = Math.max(...lines.map(([t, sc]) => textWidth(t, sc))), blockH = 7 * lines[0][1] + 7 * 2 + 12;
  // Bottom right normally; top right if the rings would run through the text there.
  const bottom = Math.round(H * (wide ? 0.76 : 0.82)), top = Math.round(H * 0.07);
  const ringIn = y0 => ringPixels(P, lay, right - blockW, y0, blockW, blockH);
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
