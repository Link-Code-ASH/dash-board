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
  big: ["#2a1512", "#8c4a2a", "#f0b071"],
  sparkle: ["#1d2147", "#4f5fc4", "#9fd6f2"],
};

// An anime eye: white shape under a heavy upper lash line with a flick at the outer corner, a tall iris cut off
// by the lid, dark at the top and glowing at the bottom, a pupil and two highlights (lit from the upper left).
function drawEye(g, cx, cy, side, style, closed, size) {
  g.save();
  g.translate(cx, cy);
  g.scale(size, size);
  g.lineCap = "round";
  g.lineJoin = "round";
  const ink = "#2a1a1c";
  if (closed || style === "sleepy") {
    // Closed: a soft downward arc with the lash flick.
    g.strokeStyle = ink;
    g.lineWidth = 5.5;
    g.beginPath(); g.moveTo(-side * 20, -2); g.quadraticCurveTo(0, 10, side * 21, -4); g.stroke();
    g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(side * 20, -4); g.lineTo(side * 27, -9); g.stroke();
    g.restore();
    return;
  }
  if (style === "dot") {
    g.fillStyle = ink;
    g.beginPath(); g.ellipse(0, 2, 8, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff";
    g.beginPath(); g.arc(-2.5, -3, 3.2, 0, Math.PI * 2); g.fill();
    g.restore();
    return;
  }
  const [rim, mid, light] = IRIS[style] || IRIS.big;
  const w = 19;
  const h = 28;
  const inner = -side * w;
  const outer = side * w;
  // The white, shaped by the lids.
  const eyeShape = () => {
    g.beginPath();
    g.moveTo(inner, 0);
    g.bezierCurveTo(inner + side * 4, -h * 0.95, outer - side * 6, -h * 1.05, outer, -h * 0.42);
    g.bezierCurveTo(outer + side * 1, h * 0.35, side * 8, h * 1.0, 0, h * 0.98);
    g.bezierCurveTo(-side * 10, h * 0.95, inner, h * 0.5, inner, 0);
    g.closePath();
  };
  eyeShape();
  g.fillStyle = "#fffaf7";
  g.fill();
  g.save();
  eyeShape();
  g.clip();
  // Iris: tall, filling most of the eye, cut by the upper lid.
  const iris = g.createLinearGradient(0, -h, 0, h);
  iris.addColorStop(0, rim);
  iris.addColorStop(0.45, mid);
  iris.addColorStop(1, light);
  g.fillStyle = iris;
  g.beginPath(); g.ellipse(side * 1, 3, w * 0.74, h * 0.96, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = rim;
  g.lineWidth = 2;
  g.stroke();
  // Shade under the lid, pupil, and a glow at the bottom of the iris.
  g.fillStyle = "rgba(20, 10, 20, 0.35)";
  g.beginPath(); g.ellipse(0, -h * 0.85, w * 1.2, h * 0.45, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = rim;
  g.beginPath(); g.ellipse(side * 1, 3, w * 0.34, h * 0.44, 0, 0, Math.PI * 2); g.fill();
  const glow = g.createRadialGradient(side * 1, h * 0.55, 1, side * 1, h * 0.55, w * 0.6);
  glow.addColorStop(0, "rgba(255, 255, 240, 0.55)");
  glow.addColorStop(1, "rgba(255, 255, 240, 0)");
  g.fillStyle = glow;
  g.beginPath(); g.ellipse(side * 1, h * 0.55, w * 0.6, h * 0.35, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  // Highlights.
  g.fillStyle = "#fff";
  g.beginPath(); g.ellipse(-6, -8, 5.8, 7.4, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(6.5, 10, 2.6, 0, Math.PI * 2); g.fill();
  if (style === "sparkle") {
    g.beginPath(); g.arc(-8, 6, 1.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(5, -12, 1.6, 0, Math.PI * 2); g.fill();
  }
  // Upper lash line: heavy, thickest towards the outer corner, ending in a flick.
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(inner - side * 1, 1);
  g.bezierCurveTo(inner + side * 3, -h * 1.02, outer - side * 6, -h * 1.12, outer + side * 3, -h * 0.5);
  g.lineTo(outer + side * 10, -h * 0.82);
  g.lineTo(outer + side * 4, -h * 0.28);
  g.bezierCurveTo(outer - side * 6, -h * 0.86, inner + side * 6, -h * 0.82, inner + side * 1, 2);
  g.closePath();
  g.fill();
  // The lid crease above and a few lower lashes at the outer corner.
  g.strokeStyle = "rgba(42, 26, 28, 0.6)";
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(inner + side * 6, -h * 1.12); g.quadraticCurveTo(0, -h * 1.38, outer - side * 3, -h * 1.0); g.stroke();
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(outer - side * 1, h * 0.2); g.quadraticCurveTo(side * 12, h * 0.95, side * 3, h * 1.0); g.stroke();
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
    const [x0, y0] = at(side * 0.04, 0.04);
    const [x1, y1] = at(side * 0.108, 0.036);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 - 10, x1, y1); g.stroke();
  }
  const [lx, ly] = at(-0.074, -0.044);
  const [rx, ry] = at(0.074, -0.044);
  drawEye(g, lx, ly, -1, style, closed, 2.25);
  drawEye(g, rx, ry, 1, style, closed, 2.25);
  // A hint of a nose and a small soft smile.
  const [nx, ny] = at(0.004, -0.092);
  g.fillStyle = "rgba(196, 120, 100, 0.45)";
  g.beginPath(); g.ellipse(nx, ny, 3.5, 2.5, 0, 0, Math.PI * 2); g.fill();
  // A small open smile.
  const [mx, my] = at(0, -0.118);
  g.save();
  g.translate(mx, my);
  g.scale(1.35, 1.35);
  g.fillStyle = "#7a2c32";
  g.beginPath();
  g.moveTo(-12, -4);
  g.quadraticCurveTo(0, -1, 12, -4);
  g.quadraticCurveTo(9, 11, 0, 12);
  g.quadraticCurveTo(-9, 11, -12, -4);
  g.fill();
  g.fillStyle = "#f08a92";
  g.beginPath(); g.ellipse(0, 8, 6.5, 3.5, 0, 0, Math.PI * 2); g.fill();
  g.restore();
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
