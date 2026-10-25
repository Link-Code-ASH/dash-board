import { createLucideIcon } from "lucide-react";

// Everyday-care icons lucide doesn't have, drawn on lucide's 24px grid with
// the same round 2px strokes so they sit beside the stock icons.
const icon = (name, nodes) => createLucideIcon(name, nodes.map(([tag, attrs], i) => [tag, { ...attrs, key: `${name}-${i}` }]));

export const SleepMask = icon("SleepMask", [
  ["path", { d: "M1.5 11h2M20.5 11h2" }],
  ["path", { d: "M3.5 10c0-2 1.6-3.5 3.6-3.5h9.8c2 0 3.6 1.5 3.6 3.5v1.8c0 3-2.1 5.2-4.8 5.2-1.7 0-2.9-.9-3.7-2.1-.8 1.2-2 2.1-3.7 2.1-2.7 0-4.8-2.2-4.8-5.2z" }],
  ["path", { d: "M6.5 11.3c.9.8 2.1.8 3 0M14.5 11.3c.9.8 2.1.8 3 0" }],
]);
export const SheetMask = icon("SheetMask", [
  ["path", { d: "M12 3c-3.9 0-7 3.1-7 7.4C5 15.6 8 21 12 21s7-5.4 7-10.6C19 6.1 15.9 3 12 3z" }],
  ["path", { d: "M8 10.5c.6-.7 1.9-.7 2.5 0M13.5 10.5c.6-.7 1.9-.7 2.5 0" }],
  ["path", { d: "M12 12.5v1.5M10.2 17h3.6" }],
]);
export const Comb = icon("Comb", [
  ["rect", { x: "3", y: "7", width: "18", height: "4", rx: "1.5" }],
  ["path", { d: "M5.5 11v6M9 11v6M12.5 11v6M16 11v6M19.5 11v4" }],
]);
export const HairDryer = icon("HairDryer", [
  ["circle", { cx: "8", cy: "9", r: "4.5" }],
  ["circle", { cx: "8", cy: "9", r: "1.5" }],
  ["path", { d: "M12.2 7.2H19a1 1 0 0 1 1 1v1.6a1 1 0 0 1-1 1h-6.8" }],
  ["path", { d: "M7 13.4 6 20a1 1 0 0 0 1 1h1.6a1 1 0 0 0 1-.8l1-6" }],
]);
export const Razor = icon("Razor", [
  ["rect", { x: "5", y: "3", width: "14", height: "4", rx: "1.5" }],
  ["path", { d: "M12 7v14M10 11h4" }],
]);
export const Iron = icon("Iron", [
  ["path", { d: "M2.5 18h17.5a1 1 0 0 0 1-1v-.5A7.5 7.5 0 0 0 13.5 9H8a4 4 0 0 0-3.9 3.2z" }],
  ["path", { d: "M8.5 9V6a1.5 1.5 0 0 1 1.5-1.5h7.5" }],
]);
export const Vacuum = icon("Vacuum", [
  ["path", { d: "M16 3h3M17.5 3 10 18" }],
  ["path", { d: "m12.3 9.2 3 1.4-2 4-3-1.4z" }],
  ["path", { d: "M4 18h7.5a1.5 1.5 0 0 1 1.5 1.5V21H2.5v-1.5A1.5 1.5 0 0 1 4 18z" }],
]);
export const Pillow = icon("Pillow", [
  ["path", { d: "M5 6c3 1.2 11 1.2 14 0 1.6 2.6 1.6 9.4 0 12-3-1.2-11-1.2-14 0-1.6-2.6-1.6-9.4 0-12z" }],
  ["path", { d: "M8.5 12c2.3.5 4.7.5 7 0" }],
]);
export const LotionPump = icon("LotionPump", [
  ["rect", { x: "7", y: "10", width: "10", height: "11", rx: "2" }],
  ["path", { d: "M10.5 10V7h3v3M9.5 7h5M12 7V4h4" }],
  ["path", { d: "M10 15h4" }],
]);
export const CreamJar = icon("CreamJar", [
  ["path", { d: "M5 12h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" }],
  ["rect", { x: "4", y: "7", width: "16", height: "5", rx: "1.5" }],
]);
export const Lipstick = icon("Lipstick", [
  ["rect", { x: "8", y: "13", width: "8", height: "8", rx: "1" }],
  ["path", { d: "M9.5 13V8.6L14.5 5v8" }],
]);
export const SunscreenTube = icon("SunscreenTube", [
  ["path", { d: "M8 3h8v3H8zM8.8 6h6.4l1.8 14a1 1 0 0 1-1 1.1H8a1 1 0 0 1-1-1.1z" }],
  ["circle", { cx: "12", cy: "13", r: "2" }],
]);
export const YogaMat = icon("YogaMat", [
  ["circle", { cx: "15", cy: "12.5", r: "6.5" }],
  ["circle", { cx: "15", cy: "12.5", r: "2" }],
  ["path", { d: "M2 16h6.9M2 16v3h13" }],
]);
export const JumpRope = icon("JumpRope", [
  ["rect", { x: "3.5", y: "2", width: "3", height: "7", rx: "1.5" }],
  ["rect", { x: "17.5", y: "2", width: "3", height: "7", rx: "1.5" }],
  ["path", { d: "M5 9c0 7.5 3 12 7 12s7-4.5 7-12" }],
]);
export const Sock = icon("Sock", [
  ["path", { d: "M8 3h6v8.2l3.6 3.6a3.1 3.1 0 0 1-4.4 4.4L8.9 14.9A3 3 0 0 1 8 12.8z" }],
  ["path", { d: "M8 6.5h6" }],
]);
export const BedMade = icon("BedMade", [
  ["path", { d: "M3 19V9M21 19v-4M3 15h18" }],
  ["path", { d: "M10 15v-3a1 1 0 0 1 1-1h8a2 2 0 0 1 2 2v2" }],
  ["rect", { x: "4.5", y: "11.5", width: "4", height: "3.5", rx: "1" }],
]);
