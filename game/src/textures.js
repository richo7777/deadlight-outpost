// Procedural canvas textures for Deadlight Outpost.
// No external image files: every texture is painted on an offscreen canvas
// and returned as a THREE.CanvasTexture (sRGB colour space).

import * as THREE from 'three';

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Deterministic speckle helper so a texture looks the same every load.
function speckle(ctx, size, count, colors, minR, maxR, seed) {
  let s = seed >>> 0;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(next() * colors.length)];
    ctx.globalAlpha = 0.25 + next() * 0.55;
    const r = minR + next() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(next() * size, next() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Dark asphalt / packed dirt ground with speckles, cracks and faint patches.
// 512x512, RepeatWrapping so it can tile 8x8 over the 70x70 ground plane.
export function makeGroundTexture() {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size);

  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, size, size);

  // Large soft patches of slightly lighter / darker dirt.
  speckle(ctx, size, 90, ['#2a2e33', '#1d2024', '#2e2a24', '#262a2e'], 18, 55, 101);
  // Fine grit.
  speckle(ctx, size, 5200, ['#31353b', '#17191d', '#3a3f45', '#26221c'], 0.6, 2.2, 202);
  // Small stones.
  speckle(ctx, size, 260, ['#454b52', '#101216', '#5a5f66'], 1.5, 3.5, 303);

  // A few thin cracks.
  ctx.strokeStyle = 'rgba(8, 9, 11, 0.7)';
  ctx.lineWidth = 1.5;
  let s = 404;
  const next = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 7; i++) {
    let x = next() * size;
    let y = next() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (next() - 0.5) * 70;
      y += (next() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = 4;
  return tex;
}

// Wooden supply crate: planks, grain, frame and corner bolts.
export function makeCrateTexture() {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);

  ctx.fillStyle = '#7a5a33';
  ctx.fillRect(0, 0, size, size);

  // Horizontal planks.
  const plankH = size / 4;
  for (let p = 0; p < 4; p++) {
    ctx.fillStyle = p % 2 === 0 ? '#82603a' : '#745631';
    ctx.fillRect(0, p * plankH, size, plankH);
    // Grain lines.
    ctx.strokeStyle = 'rgba(52, 34, 14, 0.55)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 5; g++) {
      const y = p * plankH + 6 + g * 11 + ((p * 7 + g * 3) % 5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + 3, size * 0.6, y - 3, size, y + 2);
      ctx.stroke();
    }
    // Plank seam.
    ctx.fillStyle = 'rgba(20, 12, 4, 0.8)';
    ctx.fillRect(0, p * plankH, size, 2);
  }

  // Frame.
  ctx.strokeStyle = '#5d4222';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, size - 18, size - 18);
  // Diagonal brace.
  ctx.strokeStyle = '#5d4222';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(size - 14, size - 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size - 14, 14);
  ctx.lineTo(14, size - 14);
  ctx.stroke();

  // Corner bolts.
  ctx.fillStyle = '#2e2a24';
  for (const [x, y] of [[24, 24], [size - 24, 24], [24, size - 24], [size - 24, size - 24]]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b6f73';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e2a24';
  }

  speckle(ctx, size, 500, ['#8a6a42', '#5d4222', '#3d2c15'], 0.8, 2.5, 505);

  const tex = toTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Stacked sandbags: rounded rows in khaki / olive tones with stitched seams.
export function makeSandbagTexture() {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);

  ctx.fillStyle = '#8a7a52';
  ctx.fillRect(0, 0, size, size);

  const rows = 4;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : size / 4;
    for (let c = -1; c < 3; c++) {
      const x = c * (size / 2) + offset;
      const y = r * rowH;
      const w = size / 2 - 6;
      const h = rowH - 6;
      // Bag body: rounded rect via ellipse-ish fill.
      ctx.fillStyle = r % 2 === 0 ? '#93835c' : '#87794f';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Shading: darker bottom, lighter top.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2 + h * 0.18, w / 2, h * 0.32, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 240, 200, 0.14)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2 - h * 0.2, w / 2, h * 0.3, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Stitched seam across the middle.
      ctx.strokeStyle = 'rgba(60, 50, 28, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 8, y + h / 2);
      ctx.lineTo(x + w - 8, y + h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  speckle(ctx, size, 900, ['#a08f66', '#6f6242', '#b5a67e'], 0.7, 2.2, 606);

  const tex = toTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Dark chain-link / welded-mesh fence on a transparent background,
// so it can be layered over a dark frame. Drawn as a diamond grid.
export function makeFenceTexture() {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);

  ctx.clearRect(0, 0, size, size);

  // Diamond mesh.
  ctx.strokeStyle = 'rgba(148, 158, 168, 0.9)';
  ctx.lineWidth = 2;
  const step = 32;
  for (let i = -size; i <= size * 2; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + size, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }
  // Horizontal rails top and bottom.
  ctx.strokeStyle = '#3a4048';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(size, 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, size - 5);
  ctx.lineTo(size, size - 5);
  ctx.stroke();

  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Soft radial glow (white-yellow core fading to transparent) for lamp sprites.
export function makeGlowTexture() {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);

  const g = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  g.addColorStop(0, 'rgba(255, 244, 200, 1)');
  g.addColorStop(0.25, 'rgba(255, 220, 140, 0.75)');
  g.addColorStop(0.6, 'rgba(255, 190, 90, 0.28)');
  g.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = toTexture(canvas);
  return tex;
}
