// Quiet check-in feedback for HUB: the pressed button gives a soft press and
// settle, and one thin ring in the button's own colour fades out around it.
// Finishing a whole group lets its count settle the same way, a touch longer.
// Pure DOM + Web Animations on a throw-away layer, so React state and saved
// data are never touched. Skipped when the system asks for reduced motion.

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

const ease = "cubic-bezier(.2, .7, .2, 1)";

/** Soft press on `el`; `ring` adds one fading outline (`color`: a CSS variable name), `big` is for a group finish. */
export function celebrate(el, { ring = true, big = false, color: tint = "" } = {}) {
  if (!el?.animate || reducedMotion()) return;
  el.animate(
    big
      ? [{ transform: "scale(1)" }, { transform: "scale(1.08)", offset: 0.4 }, { transform: "scale(1)" }]
      : [{ transform: "scale(1)" }, { transform: "scale(.94)", offset: 0.35 }, { transform: "scale(1)" }],
    { duration: big ? 560 : 300, easing: ease },
  );
  if (!ring) return;
  const box = el.getBoundingClientRect();
  if (!box.width) return;
  const style = getComputedStyle(el);
  const bg = style.backgroundColor;
  const color = (tint && style.getPropertyValue(tint).trim()) || (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) ? bg : style.color);
  const layer = document.createElement("i");
  layer.className = "hub-press-ring";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    borderRadius: style.borderRadius, borderColor: color,
  });
  document.body.appendChild(layer);
  const grow = big ? 10 : 6;
  layer.animate(
    [{ opacity: 0.55, transform: "scale(1)" }, { opacity: 0.35, offset: 0.4 }, { opacity: 0, transform: `scale(${1 + grow / Math.max(box.width, 24)}, ${1 + grow / Math.max(box.height, 24)})` }],
    { duration: big ? 700 : 520, easing: ease, fill: "forwards", delay: 60 },
  ).finished.finally(() => layer.remove());
}
