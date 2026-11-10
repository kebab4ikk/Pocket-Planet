// ---------------------------------------------------------------- Scriptable
// Everything below runs only inside the Scriptable app on iOS.
//
// Widget parameter (long-press the widget > Edit Widget > Parameter):
//   (empty)  a new random planet every time iOS refreshes the widget
//   daily    one planet per day, the same all day
//
// Run from a Shortcut, it outputs a lock-screen wallpaper image instead.

const PARAM = String(args.widgetParameter || '').trim().toLowerCase();

function newSeed() {
  if (PARAM === 'daily') {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  return Math.floor(Math.random() * 4294967296);
}

function toImage(scene, px) {
  const b64 = PocketPlanet.toBase64(PocketPlanet.encodePNG(scene, px));
  return Image.fromData(Data.fromBase64String(b64));
}

// Approximate widget sizes in points (they vary a little by iPhone model;
// the background image is scaled to fill, so close is good enough).
const SIZES = {
  small: [170, 170], medium: [364, 170], large: [364, 382], extraLarge: [780, 382],
  accessoryCircular: [76, 76], accessoryRectangular: [172, 76],
};

function addText(stack, text, size, opacity, bold) {
  const t = stack.addText(text);
  t.font = bold ? Font.boldRoundedSystemFont(size) : Font.mediumRoundedSystemFont(size);
  t.textColor = new Color('#ffffff', opacity);
  t.shadowColor = new Color('#000000', 0.6);
  t.shadowRadius = 2;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function buildWidget(P, family) {
  const w = new ListWidget();
  // Ask iOS to refresh as soon as it allows (in practice every 5-15 minutes).
  w.refreshAfterDate = new Date(Date.now() + 60 * 1000);

  if (family === 'accessoryInline') {
    w.addText('🪐 ' + P.name);
    return w;
  }

  const scale = Device.screenScale();
  const [wp, hp] = SIZES[family] || SIZES.large;

  if (family === 'accessoryCircular' || family === 'accessoryRectangular') {
    // Lock-screen widgets: just the planet on a transparent background.
    const G = 44, px = Math.max(1, Math.round(hp * scale / G));
    const lay = PocketPlanet.layout(P, { x: 1, y: 1, w: G - 2, h: G - 2 }, 1);
    const img = toImage(PocketPlanet.render(P, G, G, lay, { transparent: true }), px);
    w.setPadding(0, 0, 0, 0);
    if (family === 'accessoryCircular') {
      w.addImage(img).centerAlignImage();
      return w;
    }
    const row = w.addStack();
    row.centerAlignContent();
    row.addImage(img).imageSize = new Size(hp - 8, hp - 8);
    row.addSpacer(6);
    const col = row.addStack();
    col.layoutVertically();
    col.addText(P.name).font = Font.boldRoundedSystemFont(14);
    col.addText(P.label).font = Font.mediumRoundedSystemFont(11);
    return w;
  }

  const PX = Math.max(2, Math.round(scale * 1.4));      // one "pixel" of pixel art, in device pixels
  const W = Math.ceil(wp * scale / PX), H = Math.ceil(hp * scale / PX);
  let box;
  if (family === 'small') box = { x: W * 0.1, y: H * 0.04, w: W * 0.8, h: H * 0.7 };
  else if (family === 'medium') box = { x: W * 0.02, y: H * 0.05, w: W * 0.48, h: H * 0.9 };
  else box = { x: W * 0.06, y: H * 0.04, w: W * 0.88, h: H * 0.72 };
  const lay = PocketPlanet.layout(P, box);
  w.backgroundImage = toImage(PocketPlanet.render(P, W, H, lay), PX);
  w.setPadding(10, 14, 12, 14);

  if (family === 'medium') {
    const row = w.addStack();
    row.addSpacer(wp * 0.48);
    const col = row.addStack();
    col.layoutVertically();
    col.addSpacer();
    addText(col, P.name, 18, 1, true);
    addText(col, P.label, 12, 0.85, false);
    col.addSpacer(6);
    for (const f of P.facts) addText(col, f, 11, 0.65, false);
    col.addSpacer();
  } else if (family === 'small') {
    w.addSpacer();
    addText(w, P.name, 14, 1, true);
    addText(w, P.label, 10, 0.75, false);
  } else {
    w.addSpacer();
    addText(w, P.name, 22, 1, true);
    addText(w, P.label + '  ·  ' + P.facts.join('  ·  '), 12, 0.75, false);
  }
  return w;
}

function makeWallpaper(P) {
  const res = Device.screenResolution();
  let Wp = Math.round(Math.min(res.width, res.height)), Hp = Math.round(Math.max(res.width, res.height));
  const PX = Math.max(3, Math.round(Wp / 220));
  const W = Math.ceil(Wp / PX), H = Math.ceil(Hp / PX);
  // Keep the top third free for the lock-screen clock.
  const lay = PocketPlanet.layout(P, { x: W * 0.06, y: H * 0.34, w: W * 0.88, h: H * 0.4 });
  const img = toImage(PocketPlanet.render(P, W, H, lay), PX);

  const ctx = new DrawContext();
  ctx.size = new Size(Wp, Hp);
  ctx.opaque = true;
  ctx.respectScreenScale = false;
  ctx.drawImageAtPoint(img, new Point(0, 0));
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldRoundedSystemFont(Wp * 0.055));
  ctx.setTextColor(new Color('#ffffff', 0.92));
  const ty = Hp * 0.765;
  ctx.drawTextInRect(P.name, new Rect(0, ty, Wp, Wp * 0.08));
  ctx.setFont(Font.mediumRoundedSystemFont(Wp * 0.032));
  ctx.setTextColor(new Color('#ffffff', 0.6));
  ctx.drawTextInRect(P.label + '  ·  ' + P.facts.join('  ·  '), new Rect(0, ty + Wp * 0.075, Wp, Wp * 0.06));
  return ctx.getImage();
}

const P = PocketPlanet.makePlanet(newSeed());

if (config.runsInWidget) {
  Script.setWidget(buildWidget(P, config.widgetFamily));
} else if (config.runsWithSiri || args.shortcutParameter != null) {
  // Shortcuts can't take an Image from Scriptable, so hand over the PNG as
  // base64 text. In the shortcut, "Decode Base64" turns it back into a picture.
  Script.setShortcutOutput(Data.fromPNG(makeWallpaper(P)).toBase64String());
} else {
  const a = new Alert();
  a.title = '🪐 ' + P.name;
  a.message = P.label + ' · ' + P.facts.join(' · ');
  a.addAction('Preview large widget');
  a.addAction('Preview medium widget');
  a.addAction('Save wallpaper to Photos');
  a.addCancelAction('Close');
  const choice = await a.presentSheet();
  if (choice === 0) await buildWidget(P, 'large').presentLarge();
  else if (choice === 1) await buildWidget(P, 'medium').presentMedium();
  else if (choice === 2) {
    const img = makeWallpaper(P);
    await Photos.save(img);
    await QuickLook.present(img, true);
  }
}
Script.complete();
