// The hero's face is painted, not modelled: a canvas drawing (eyes with iris, lashes and highlights, soft blush,
// fine brows, a small mouth) on the face of the head model. A second drawing with closed eyes is swapped in to blink.
import * as THREE from "three";

// The face is painted onto the front of the head model (hero.glb), whose face UVs are projected straight from
// the front over a SPAN × SPAN window centred on the head: canvas x runs to the hero's left (viewer's right)
// and canvas y runs down. Positions below are in model units from the head's centre.
const SPAN = 0.4;
const W = 512;
const H = 512;
const cache = new Map();
const at = (x, y) => [(0.5 + x / SPAN) * W, (0.5 - y / SPAN) * H];

const IRIS = {
  dot: null,
  big: ["#3c2622", "#7a4a36", "#c98d62"],
  sparkle: ["#28304f", "#4f67a8", "#9cc2ec"],
};

function drawEye(g, cx, cy, side, style, closed, size) {
  g.save();
  g.translate(cx, cy);
  g.scale(size, size);
  g.lineCap = "round";
  g.lineJoin = "round";
  if (closed || style === "sleepy") {
    // A soft upward curve with a tiny lash at the outer end.
    g.strokeStyle = "#3a2626";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-20, -2);
    g.quadraticCurveTo(0, 12, 20, -2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(side * 19, -2);
    g.lineTo(side * 26, -7);
    g.stroke();
    g.restore();
    return;
  }
  if (style === "dot") {
    g.fillStyle = "#2f2224";
    g.beginPath(); g.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(4, -5, 4.2, 0, Math.PI * 2); g.fill();
    g.restore();
    return;
  }
  const [rim, mid, light] = IRIS[style] || IRIS.big;
  const w = 19;
  const h = 25;
  // White of the eye barely shows; the iris fills the shape like most cute characters.
  g.fillStyle = "#2b1e20";
  g.beginPath(); g.ellipse(0, 1, w, h, 0, 0, Math.PI * 2); g.fill();
  const iris = g.createLinearGradient(0, -h, 0, h);
  iris.addColorStop(0, rim);
  iris.addColorStop(0.55, mid);
  iris.addColorStop(1, light);
  g.fillStyle = iris;
  g.beginPath(); g.ellipse(0, 3, w - 4, h - 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1f1517";
  g.beginPath(); g.ellipse(0, 1, 7.5, 11, 0, 0, Math.PI * 2); g.fill();
  // Highlights: a big one up and out, a small one low and in.
  g.fillStyle = "#fff";
  g.beginPath(); g.ellipse(side * -5 + 6, -10, 6.5, 7.5, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(side * 5 - 4, 12, 3, 0, Math.PI * 2); g.fill();
  if (style === "sparkle") {
    g.beginPath(); g.arc(-7, -1, 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(9, 6, 1.8, 0, Math.PI * 2); g.fill();
  }
  // Upper lash line, thicker at the outer corner with a small flick.
  g.strokeStyle = "#2b1e20";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-side * (w + 1), -h * 0.35);
  g.quadraticCurveTo(0, -h - 9, side * (w + 3), -h * 0.45);
  g.stroke();
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(side * (w + 2), -h * 0.45);
  g.lineTo(side * (w + 9), -h * 0.75);
  g.stroke();
  g.restore();
}

function paint(style, closed, skin) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  g.fillStyle = skin;
  g.fillRect(0, 0, W, H);
  // Blush first, under everything: soft and wide.
  for (const [bx, by] of [at(-0.105, -0.09), at(0.105, -0.09)]) {
    const blush = g.createRadialGradient(bx, by, 2, bx, by, 34);
    blush.addColorStop(0, "rgba(255, 128, 128, 0.42)");
    blush.addColorStop(1, "rgba(255, 128, 128, 0)");
    g.fillStyle = blush;
    g.beginPath(); g.ellipse(bx, by, 40, 22, 0, 0, Math.PI * 2); g.fill();
  }
  // Fine brows, mostly hidden by the fringe.
  g.strokeStyle = "rgba(74, 48, 44, 0.75)";
  g.lineCap = "round";
  g.lineWidth = 4;
  for (const side of [-1, 1]) {
    const [x0, y0] = at(side * 0.04, 0.03);
    const [x1, y1] = at(side * 0.102, 0.026);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 - 10, x1, y1); g.stroke();
  }
  const [lx, ly] = at(-0.07, -0.042);
  const [rx, ry] = at(0.07, -0.042);
  drawEye(g, lx, ly, -1, style, closed, 1.95);
  drawEye(g, rx, ry, 1, style, closed, 1.95);
  // A hint of a nose and a small soft smile.
  const [nx, ny] = at(0.004, -0.092);
  g.fillStyle = "rgba(196, 120, 100, 0.45)";
  g.beginPath(); g.ellipse(nx, ny, 3.5, 2.5, 0, 0, Math.PI * 2); g.fill();
  const [mx, my] = at(0, -0.118);
  g.strokeStyle = "#8a4844";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(mx - 13, my - 3);
  g.quadraticCurveTo(mx, my + 7, mx + 13, my - 3);
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // glTF UVs
  texture.anisotropy = 4;
  return texture;
}

// { open, closed } face textures for an eye style on a skin colour (CSS colour), shared by every hero alike.
export function faceTextures(style, skin) {
  const key = `${style}|${skin}`;
  if (!cache.has(key)) cache.set(key, { open: paint(style, false, skin), closed: paint(style, true, skin) });
  return cache.get(key);
}
