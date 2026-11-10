// fx.js - confetti and click ripples (respects prefers-reduced-motion)
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#ff5d8f', '#ffb454', '#2dd4bf', '#8b7bff', '#ffe066'];

export function confetti(count = 140) {
  if (reduce()) return;
  const c = document.createElement('canvas');
  c.className = 'fx-confetti';
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const ps = Array.from({ length: count }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 120, y: c.height * 0.6,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 5,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    col: COLORS[(Math.random() * COLORS.length) | 0]
  }));
  let f = 0;
  (function tick() {
    g.clearRect(0, 0, c.width, c.height);
    ps.forEach(p => {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.globalAlpha = Math.max(0, 1 - f / 110);
      g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    });
    if (++f < 110) requestAnimationFrame(tick); else c.remove();
  })();
}

export function initRipples() {
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('button');
    if (!b || reduce()) return;
    const r = b.getBoundingClientRect(), s = document.createElement('span');
    const d = Math.max(r.width, r.height) * 2;
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 600);
  });
}
