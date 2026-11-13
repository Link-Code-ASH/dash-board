// Small check-in animations for HUB: the pressed button pops, and a ring plus
// a few sparkles burst out of it ("뾰로롱"). Pure DOM + Web Animations, drawn
// on a throw-away layer above the page, so React state and saved data are
// never touched. Skipped entirely when the system asks for reduced motion.

const tones = {
  plus: ["#2f9e63", "#5cc28a", "#f2b632", "#6fa8ff"],
  minus: ["#d9534f", "#ee9a98"],
  gold: ["#f2b632", "#ffd66b", "#5cc28a", "#ff8fa3", "#6fa8ff"],
};

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** Pop `el`; with `burst`, sparkles fly out of its centre (`big` for a group finish). */
export function celebrate(el, { tone = "plus", burst = true, big = false } = {}) {
  if (!el?.animate || reducedMotion()) return;
  el.animate(
    [{ transform: "scale(1)" }, { transform: `scale(${big ? 1.3 : 1.2})` }, { transform: "scale(.95)" }, { transform: "scale(1)" }],
    { duration: big ? 520 : 380, easing: "cubic-bezier(.3, 1.5, .5, 1)" },
  );
  if (!burst) return;
  const box = el.getBoundingClientRect();
  if (!box.width) return;
  const colors = tones[tone] || tones.plus;
  const layer = document.createElement("div");
  layer.className = "hub-burst";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { left: `${box.left + box.width / 2}px`, top: `${box.top + box.height / 2}px` });
  document.body.appendChild(layer);

  const ring = document.createElement("i");
  ring.className = "hub-burst-ring";
  ring.style.borderColor = colors[0];
  layer.appendChild(ring);
  const size = Math.max(box.width, box.height);
  ring.animate(
    [{ width: `${size}px`, height: `${size}px`, opacity: 0.55 }, { width: `${size + (big ? 56 : 30)}px`, height: `${size + (big ? 56 : 30)}px`, opacity: 0 }],
    { duration: big ? 700 : 520, easing: "cubic-bezier(.2, .8, .3, 1)", fill: "forwards" },
  );

  const count = big ? 16 : 9;
  const reach = size / 2 + (big ? 34 : 18);
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("i");
    const star = i % 3 === 0;
    piece.className = star ? "hub-burst-star" : "hub-burst-dot";
    piece.style.color = colors[i % colors.length];
    if (!star) piece.style.background = colors[i % colors.length];
    layer.appendChild(piece);
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = reach + Math.random() * (big ? 22 : 12);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const spin = Math.round((Math.random() - 0.5) * 220);
    piece.animate(
      [
        { transform: "translate(-50%, -50%) scale(.3)", opacity: 1 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1) rotate(${spin}deg)`, opacity: 1, offset: 0.65 },
        { transform: `translate(calc(-50% + ${x * 1.12}px), calc(-50% + ${y * 1.12 + 6}px)) scale(.5) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: (big ? 820 : 620) + Math.random() * 160, easing: "cubic-bezier(.15, .8, .3, 1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), big ? 1100 : 900);
}
