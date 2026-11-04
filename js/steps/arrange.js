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
        li.addEventListener('pointerdown', (e) => onDown(e, li));
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

      // Während des Ziehens per Touch darf die Seite nicht scrollen. Der Listener hängt dauerhaft an der Liste,
      // damit der Browser touchmove schon beim Aufsetzen als blockierbar kennt.
      let dragging = false;
      list.addEventListener('touchmove', (e) => dragging && e.cancelable && e.preventDefault(), { passive: false });
      list.addEventListener('contextmenu', (e) => (dragging || list.querySelector('.pressing')) && e.preventDefault());

      function onDown(e, li) {
        if (locked || dragging || e.target.closest('button')) return;
        if (e.pointerType === 'mouse') return e.button === 0 && startDrag(e, li);
        if (e.target.closest('.grip')) return startDrag(e, li);
        // Touch auf der Karte: kurz halten, dann ziehen – wer gleich wischt, scrollt die Seite
        const sx = e.clientX, sy = e.clientY;
        li.classList.add('pressing');
        const timer = setTimeout(() => { stop(); startDrag(e, li); }, 180);
        const onMove = (ev) => Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8 && stop();
        function stop() {
          clearTimeout(timer);
          li.classList.remove('pressing');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
      }

      function startDrag(e, li) {
        if (e.cancelable) e.preventDefault();
        dragging = true;
        if (e.pointerType !== 'mouse' && navigator.vibrate) navigator.vibrate(12);
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
          dragging = false;
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

  /* ---------- categorize: Begriffe in Gruppen sortieren ----------
   * Breit: alle Begriffe im Pool, Ziehen oder Tippen+Gruppe.
   * Schmal (Handy): Pool zeigt nur den nächsten Begriff als Karte, Tippen auf eine Gruppe sortiert ihn ein –
   * kein Ziehen, kein Scrollen zwischen Pool und Gruppen. Einsortierte Begriffe antippen = verschieben. */
  const compact = () => window.matchMedia('(max-width: 560px)').matches;

  LA.defineStep('categorize', {
    mode: 'check',
    label: 'Zuordnen',
    render(step, ctx) {
      const all = LA.shuffle(step.categories.flatMap((c, ci) => c.items.map((text) => ({ text, cat: ci, at: null, el: null }))));
      const pool = h('div', { class: 'cat-pool' });
      const left = h('div', { class: 'cat-left', 'aria-live': 'polite' });
      let selected = null;
      let locked = false;
      let justDragged = false;

      const buckets = step.categories.map((c, ci) => {
        const label = (c.icon ? c.icon + '\u00a0' : '') + c.name;
        const body = h('div', { class: 'bucket-items', 'data-name': label });
        const el = h('div', { class: 'bucket', style: { '--bucket': `var(--c${(ci % 6) + 1})` }, onclick: (e) => !e.target.closest('.chip') && !justDragged && place(ci, selected || current()) },
          h('div', { class: 'bucket-head' }, label),
          body);
        el._ci = ci;
        return { el, body };
      });
      pool.addEventListener('click', (e) => !e.target.closest('.chip') && !justDragged && place(null));
      pool._ci = null;

      all.forEach((it) => {
        it.el = h('button', { class: 'chip', type: 'button', html: LA.mdi(it.text) });
        it.el.addEventListener('pointerdown', (e) => startDrag(e, it));
        it.el.addEventListener('click', () => {
          if (locked || justDragged) return;
          // Handy: Beim Verschieben zählt die Pool-Karte als „zurücklegen“-Ziel
          if (compact() && selected && selected.at != null && it.at == null) return place(null);
          select(it);
        });
        pool.appendChild(it.el);
      });
      pool.appendChild(left);

      // Auf dem Handy ist der oberste Begriff im Pool automatisch „dran“
      function current() {
        if (!compact()) return null;
        const el = pool.querySelector('.chip');
        return el ? all.find((x) => x.el === el) : null;
      }

      function update() {
        const rest = all.filter((x) => x.at == null).length;
        const moving = selected && selected.at != null;
        left.textContent = moving ? 'Andere Gruppe wählen – oder hier zurücklegen'
          : rest ? `Noch ${rest} · tippe auf die passende Gruppe` : '';
        pool.classList.toggle('empty', rest === 0);
        pool.classList.toggle('moving', !!moving);
      }

      const select = (it) => setSelected(selected === it ? null : it);
      function setSelected(it) {
        selected = it;
        all.forEach((x) => x.el.classList.toggle('selected', x === selected));
        document.querySelectorAll('.bucket, .cat-pool').forEach((b) => b.classList.toggle('targetable', !!selected));
        update();
      }

      function place(ci, it = selected) {
        if (locked || !it) return;
        it.at = ci;
        // Zurückgelegte Begriffe kommen nach vorn, damit sie auf dem Handy gleich wieder dran sind
        ci == null ? pool.insertBefore(it.el, pool.firstChild) : buckets[ci].body.appendChild(it.el);
        setSelected(null);
        LA.fx.sound.tap();
        ctx.ready(all.every((x) => x.at != null));
      }

      function startDrag(e, it) {
        if (locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.pointerType !== 'mouse' && compact()) return; // Handy: tippen statt ziehen, Scrollen bleibt frei
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
          if (!ghost) return; // nur ein Tipp – das erledigt der click-Handler
          ghost.remove();
          it.el.classList.remove('ghosted');
          // Der folgende click (auf Gruppe oder Pool) darf nicht noch einmal einsortieren
          justDragged = true;
          setTimeout(() => (justDragged = false), 0);
          if (ev.type === 'pointercancel') return;
          const over = document.elementFromPoint(ev.clientX, ev.clientY);
          const target = over && over.closest('.bucket, .cat-pool');
          if (target) place(target._ci, it);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }

      update();
      return {
        el: h('div', { class: 'step step-categorize' },
          LA.ui.stepHead(step, ctx, { kicker: 'Sortiere in die passende Gruppe', text: step.prompt }),
          pool,
          h('div', { class: `buckets n${step.categories.length}`, style: { '--n': step.categories.length } }, buckets.map((b) => b.el))),
        check() {
          locked = true;
          setSelected(null);
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
