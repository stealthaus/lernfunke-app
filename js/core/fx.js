/* Effekte: Sounds (WebAudio, ohne Dateien), Konfetti, Toasts, XP-Popups, Dialoge. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h } = LA;

  /* ---------- Sound ---------- */
  let ctx = null;
  function audio() {
    if (!LA.store.setting('sound')) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, start, dur, type = 'sine', vol = 0.12) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + start;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const sound = {
    good: () => { tone(660, 0, 0.12); tone(990, 0.08, 0.22); },
    bad: () => { tone(220, 0, 0.18, 'triangle', 0.14); tone(165, 0.1, 0.25, 'triangle', 0.12); },
    tap: () => tone(520, 0, 0.05, 'sine', 0.05),
    flip: () => tone(380, 0, 0.06, 'triangle', 0.05),
    done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'sine', 0.1)),
    level: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.35, 'square', 0.04)),
  };

  /* ---------- Konfetti ---------- */
  function confetti(amount = 120) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = h('canvas', { class: 'confetti' });
    document.body.appendChild(canvas);
    const c = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    c.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = ['--c1', '--c2', '--c3', '--c4', '--c5', '--accent'].map((v) => css.getPropertyValue(v).trim() || '#f59f00');
    const parts = Array.from({ length: amount }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      hgt: 8 + Math.random() * 8,
      col: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    (function frame(now) {
      const t = now - start;
      c.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.r);
        c.globalAlpha = Math.max(0, 1 - t / 2200);
        c.fillStyle = p.col;
        c.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt * Math.abs(Math.cos(p.r * 2)));
        c.restore();
      }
      if (t < 2200) requestAnimationFrame(frame);
      else canvas.remove();
    })(start);
  }

  /* ---------- Toasts ---------- */
  function toast(title, text, kind = 'info') {
    let box = document.getElementById('toasts');
    if (!box) document.body.appendChild((box = h('div', { id: 'toasts' })));
    const el = h('div', { class: `toast toast-${kind}`, role: 'status', title: 'Antippen oder wegwischen zum Schließen' }, h('strong', null, title), text ? h('span', null, text) : null);
    box.appendChild(el);
    // Oben am Rand, kurz sichtbar; Antippen oder Wischen (hoch/seitlich) schließt sofort.
    let gone = false;
    const close = (dx = 0, dy = 0) => {
      if (gone) return;
      gone = true;
      el.style.transform = dx || dy ? `translate(${dx * 3}px, ${Math.min(dy, 0) * 3}px)` : '';
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
    };
    setTimeout(close, text ? 2600 : 1800);

    let sx = 0, sy = 0, dragging = false;
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging || gone) return;
      const dx = e.clientX - sx, dy = Math.min(e.clientY - sy, 0);
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = '';
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 40 || dy < -20 || (Math.abs(dx) < 8 && Math.abs(dy) < 8)) close(dx, dy);
      else el.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      dragging = false;
      el.style.transition = '';
      el.style.transform = '';
    });
  }

  function levelUp(level) {
    sound.level();
    confetti(160);
    toast(`Level ${level} erreicht! 🚀`, 'Weiter so – dein Wissen wächst.', 'level');
  }

  /** Kleines "+10 XP", das an einem Element aufsteigt. */
  function floatXP(anchor, n) {
    if (!anchor || !n) return;
    const r = anchor.getBoundingClientRect();
    const el = h('div', { class: 'xp-float' }, `+${n} XP`);
    el.style.left = r.left + r.width / 2 + 'px';
    el.style.top = r.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /* ---------- Dialog ---------- */
  function dialog({ title, text, ok = 'OK', cancel = 'Abbrechen', danger }) {
    return new Promise((resolve) => {
      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(false); }
        if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); close(true); }
      };
      const okBtn = h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => close(true) }, ok);
      const overlay = h('div', { class: 'modal-overlay', onclick: (e) => e.target === overlay && close(false) },
        h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
          h('h3', null, title),
          text ? h('p', { class: 'muted' }, text) : null,
          h('div', { class: 'modal-actions' },
            cancel ? h('button', { class: 'btn btn-ghost', onclick: () => close(false) }, cancel) : null,
            okBtn)));
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey, true);
      okBtn.focus();
    });
  }

  LA.fx = { sound, confetti, toast, levelUp, floatXP, dialog };
})();
