// Press feedback for HUB checks: a ripple spreads from the exact spot that was
// pressed and fills the button, and when something gets checked a crisp
// outline in the button's new colour pulses out around it. Nothing is scaled
// or moved, so text stays pixel-sharp. Pure DOM + Web Animations on a
// throw-away layer: React state and saved data are never touched. Skipped
// when the system asks for reduced motion.

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

const ease = "cubic-bezier(.2, .7, .2, 1)";
const filled = (color) => color && !/rgba\(0, 0, 0, 0\)|transparent/.test(color);

/**
 * Ripple + pulse on `el`. `point` is the pointer event (or {clientX, clientY});
 * without one (keyboard) the ripple starts from the centre. `on` is true when
 * the press checked something, false when it unchecked it (ripple only).
 */
export function celebrate(el, { point = null, on = true } = {}) {
  if (!el?.animate || reducedMotion()) return;
  const start = { x: point?.clientX, y: point?.clientY };
  // Wait one frame so the button already shows its new (checked) colour.
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const style = getComputedStyle(el);
    const x = (start.x && start.x >= box.left && start.x <= box.right ? start.x : box.left + box.width / 2) - box.left;
    const y = (start.y && start.y >= box.top && start.y <= box.bottom ? start.y : box.top + box.height / 2) - box.top;
    const layer = document.createElement("div");
    layer.className = "hub-press";
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: style.borderRadius });
    document.body.appendChild(layer);

    const radius = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
    const wave = document.createElement("i");
    wave.className = "hub-press-wave";
    Object.assign(wave.style, { left: `${x}px`, top: `${y}px`, width: `${radius * 2}px`, height: `${radius * 2}px`, background: on && filled(style.backgroundColor) ? "rgba(255, 255, 255, .5)" : "rgba(29, 37, 51, .12)" });
    layer.appendChild(wave);
    const waves = [wave.animate(
      [{ transform: "translate(-50%, -50%) scale(0)", opacity: 1 }, { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.55 }, { transform: "translate(-50%, -50%) scale(1)", opacity: 0 }],
      { duration: 520, easing: ease, fill: "forwards" },
    )];

    if (on) {
      const ring = document.createElement("div");
      ring.className = "hub-press-ring";
      const color = filled(style.backgroundColor) ? style.backgroundColor : style.color;
      Object.assign(ring.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: style.borderRadius, color });
      document.body.appendChild(ring);
      waves.push(ring.animate(
        [{ boxShadow: "0 0 0 0 currentColor", opacity: 0.55 }, { boxShadow: "0 0 0 8px currentColor", opacity: 0 }],
        { duration: 620, easing: ease, fill: "forwards" },
      ));
      waves[1].finished.finally(() => ring.remove());
    }
    waves[0].finished.finally(() => layer.remove());
  });
}
