// The hero's face is painted, not modelled: a canvas drawing (eyes with iris, lashes and highlights, soft blush,
// a small mouth) wrapped onto a patch of the head. A second drawing with closed eyes is swapped in to blink.
import * as THREE from "three";

// The patch covers this much of the head, in degrees: across from the left to the right of the face, and down
// from the brow to the chin.
export const FACE = { across: 140, from: 70, to: 135 };
const W = 512;
const H = Math.round((W * (FACE.to - FACE.from)) / FACE.across);

const cache = new Map();
// Canvas position of a point given as degrees off the face's centre line and degrees down from the top of the head.
const at = (side, down) => [((side + FACE.across / 2) / FACE.across) * W, ((down - FACE.from) / (FACE.to - FACE.from)) * H];

const IRIS = {
  dot: null,
  big: ["#3c2622", "#7a4a36", "#c98d62"],
  sparkle: ["#28304f", "#4f67a8", "#9cc2ec"],
};

function drawEye(g, cx, cy, side, style, closed) {
  g.save();
  g.translate(cx, cy);
  g.scale(2.05, 2.05);
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

function paint(style, closed) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  const [lx, ly] = at(-25, 102);
  const [rx, ry] = at(25, 102);
  // Blush first, under everything: soft and wide.
  for (const [bx, by] of [at(-36, 116), at(36, 116)]) {
    const blush = g.createRadialGradient(bx, by, 2, bx, by, 40);
    blush.addColorStop(0, "rgba(255, 134, 134, 0.55)");
    blush.addColorStop(1, "rgba(255, 134, 134, 0)");
    g.fillStyle = blush;
    g.beginPath(); g.ellipse(bx, by, 44, 26, 0, 0, Math.PI * 2); g.fill();
  }
  drawEye(g, lx, ly, -1, style, closed);
  drawEye(g, rx, ry, 1, style, closed);
  // A small soft smile.
  const [mx, my] = at(0, 115);
  g.strokeStyle = "#7a3f3c";
  g.lineWidth = 6;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(mx - 11, my - 3);
  g.quadraticCurveTo(mx, my + 8, mx + 11, my - 3);
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// { open, closed } textures for an eye style, shared by every hero with that style.
export function faceTextures(style) {
  if (!cache.has(style)) cache.set(style, { open: paint(style, false), closed: paint(style, true) });
  return cache.get(style);
}

// The patch: part of a unit sphere matching the head (scale it like the head).
export function faceGeometry() {
  const deg = THREE.MathUtils.degToRad;
  return new THREE.SphereGeometry(1, 40, 20, Math.PI / 2 - deg(FACE.across / 2), deg(FACE.across), deg(FACE.from), deg(FACE.to - FACE.from));
}
