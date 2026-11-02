/* Prüfbare Schritt-Typen zum Anordnen: order (Reihenfolge) und categorize (Zuordnen in Gruppen).
 * Bedienung per Ziehen (Maus & Touch über Pointer Events) oder per Tippen/Pfeiltasten. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h } = LA;

  /* ---------- order: Elemente in die richtige Reihenfolge bringen ---------- */
  LA.defineStep('order', {
    mode: 'check',
    label: 'Reihenfolge',
    render(step, ctx) {
      const items = LA.shuffleNotIdentity(step.items.map((text, i) => ({ text, i })));
      const list = h('ol', { class: 'order-list' });
      let locked = false;

      items.forEach((it) => {
        const li = h('li', { class: 'order-item' },
          h('span', { class: 'grip', title: 'Ziehen zum Verschieben' }, LA.icon('grip')),
          h('span', { class: 'order-text', html: LA.mdi(it.text) }),
          h('span', { class: 'order-btns' },
            h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Nach oben', onclick: () => move(li, -1) }, LA.icon('up')),
            h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Nach unten', onclick: () => move(li, 1) }, LA.icon('down'))));
        li._item = it;
        li.addEventListener('pointerdown', (e) => startDrag(e, li));
        list.appendChild(li);
      });

      function move(li, dir) {
        if (locked) return;
        const sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
        if (!sib) return;
        dir < 0 ? list.insertBefore(li, sib) : list.insertBefore(sib, li);
        li.classList.remove('bump');
        void li.offsetWidth;
        li.classList.add('bump');
        LA.fx.sound.tap();
      }

      function startDrag(e, li) {
        if (locked || e.target.closest('button')) return;
        if (e.pointerType === 'mouse' ? e.button !== 0 : !e.target.closest('.grip')) return;
        e.preventDefault();
        const rect = li.getBoundingClientRect();
        const offY = e.clientY - rect.top;
        const ph = h('li', { class: 'order-ph', style: { height: rect.height + 'px' } });
        list.insertBefore(ph, li);
        Object.assign(li.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', zIndex: 60 });
        li.classList.add('dragging');
        const onMove = (ev) => {
          li.style.top = ev.clientY - offY + 'px';
          const after = [...list.children].find((c) => {
            if (c === li || c === ph) return false;
            const r = c.getBoundingClientRect();
            return ev.clientY < r.top + r.height / 2;
          });
          after ? list.insertBefore(ph, after) : list.appendChild(ph);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          li.removeAttribute('style');
          li.classList.remove('dragging');
          list.insertBefore(li, ph);
          ph.remove();
          LA.fx.sound.tap();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }

      ctx.ready(true);
      return {
        el: h('div', { class: 'step step-order' },
          LA.ui.stepHead(step, ctx, { kicker: 'Bring in die richtige Reihenfolge', text: step.prompt }),
          step.top || step.bottom ? h('div', { class: 'order-axis' }, step.top || '') : null,
          list,
          step.bottom ? h('div', { class: 'order-axis' }, step.bottom) : null),
        check() {
          locked = true;
          let right = 0;
          [...list.children].forEach((li, pos) => {
            const ok = li._item.i === pos;
            if (ok) right++;
            li.classList.add(ok ? 'correct' : 'wrong');
            li.querySelector('.order-btns').replaceWith(h('span', { class: 'order-badge' }, ok ? LA.icon('check') : `→ ${li._item.i + 1}`));
          });
          return { correct: right === items.length, score: right / items.length, solution: 'Die Zahl rechts zeigt die richtige Position.' };
        },
      };
    },
  });

  /* ---------- categorize: Begriffe in Gruppen sortieren ---------- */
  LA.defineStep('categorize', {
    mode: 'check',
    label: 'Zuordnen',
    render(step, ctx) {
      const all = LA.shuffle(step.categories.flatMap((c, ci) => c.items.map((text) => ({ text, cat: ci, at: null, el: null }))));
      const pool = h('div', { class: 'cat-pool' });
      let selected = null;
      let locked = false;

      const buckets = step.categories.map((c, ci) => {
        const body = h('div', { class: 'bucket-items' });
        const el = h('div', { class: 'bucket', style: { '--bucket': `var(--c${(ci % 6) + 1})` }, onclick: (e) => !e.target.closest('.chip') && place(ci) },
          h('div', { class: 'bucket-head' }, c.icon ? c.icon + ' ' : '', c.name),
          body);
        el._ci = ci;
        return { el, body };
      });
      pool.addEventListener('click', (e) => !e.target.closest('.chip') && place(null));
      pool._ci = null;

      all.forEach((it) => {
        it.el = h('button', { class: 'chip', type: 'button', html: LA.mdi(it.text) });
        it.el.addEventListener('pointerdown', (e) => startDrag(e, it));
        pool.appendChild(it.el);
      });

      function select(it) {
        selected = selected === it ? null : it;
        all.forEach((x) => x.el.classList.toggle('selected', x === selected));
        document.querySelectorAll('.bucket, .cat-pool').forEach((b) => b.classList.toggle('targetable', !!selected));
      }

      function place(ci, it = selected) {
        if (locked || !it) return;
        it.at = ci;
        (ci == null ? pool : buckets[ci].body).appendChild(it.el);
        select(null);
        LA.fx.sound.tap();
        pool.classList.toggle('empty', all.every((x) => x.at != null));
        ctx.ready(all.every((x) => x.at != null));
      }

      function startDrag(e, it) {
        if (locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const sx = e.clientX, sy = e.clientY;
        let ghost = null;
        const onMove = (ev) => {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          if (!ghost) {
            ghost = it.el.cloneNode(true);
            ghost.classList.add('chip-ghost');
            document.body.appendChild(ghost);
            it.el.classList.add('ghosted');
          }
          ghost.style.left = ev.clientX + 'px';
          ghost.style.top = ev.clientY + 'px';
          const over = document.elementFromPoint(ev.clientX, ev.clientY);
          document.querySelectorAll('.bucket.over, .cat-pool.over').forEach((b) => b.classList.remove('over'));
          const target = over && over.closest('.bucket, .cat-pool');
          if (target) target.classList.add('over');
        };
        const onUp = (ev) => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          document.querySelectorAll('.over').forEach((b) => b.classList.remove('over'));
          if (!ghost) return select(it); // war nur ein Tipp
          ghost.remove();
          it.el.classList.remove('ghosted');
          const over = document.elementFromPoint(ev.clientX, ev.clientY);
          const target = over && over.closest('.bucket, .cat-pool');
          if (target) place(target._ci, it);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }

      return {
        el: h('div', { class: 'step step-categorize' },
          LA.ui.stepHead(step, ctx, { kicker: 'Sortiere in die passende Gruppe', text: step.prompt }),
          pool,
          h('div', { class: 'buckets', style: { '--n': step.categories.length } }, buckets.map((b) => b.el))),
        check() {
          locked = true;
          let right = 0;
          all.forEach((it) => {
            const ok = it.at === it.cat;
            if (ok) right++;
            it.el.disabled = true;
            it.el.classList.add(ok ? 'correct' : 'wrong');
            if (!ok) it.el.appendChild(h('span', { class: 'chip-fix' }, '→ ' + step.categories[it.cat].name));
          });
          return { correct: right === all.length, score: right / all.length };
        },
      };
    },
  });
})();
