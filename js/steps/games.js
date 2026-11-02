/* Spielerische Schritt-Typen: match, memory, flashcards (melden sich selbst fertig)
 * und hotspots (Grafik erkunden). Werden auch in der Spielhalle wiederverwendet. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h } = LA;

  /* ---------- Wiederverwendbare Flip-Karte ---------- */
  LA.ui.flipCard = (front, back, meta) => {
    const card = h('button', { class: 'flip', type: 'button', 'aria-label': 'Karte umdrehen' },
      h('div', { class: 'flip-inner' },
        h('div', { class: 'flip-face flip-front' }, meta ? h('div', { class: 'flip-meta' }, meta) : null, h('div', { class: 'flip-text', html: LA.md(front) }), h('div', { class: 'flip-hint' }, 'Tippen zum Umdrehen')),
        h('div', { class: 'flip-face flip-back' }, h('div', { class: 'flip-text', html: LA.md(back) }))));
    return card;
  };
  /** Bereits aufgedeckte Karte wieder umdrehen (Vorder- ↔ Rückseite) */
  LA.ui.turnCard = (card) => {
    card.classList.remove('no-anim');
    card.classList.toggle('flipped');
    LA.fx.sound.flip();
  };

  /** Karte mit Stift-Knopf in der Ecke (liegt neben der Karte, nicht darin – sonst würde sie umdrehen) */
  LA.ui.editableCard = (flip, onEdit) =>
    h('div', { class: 'fc-card' }, flip,
      h('button', { class: 'icon-btn sm fc-edit', type: 'button', title: 'Karte bearbeiten (E)', 'aria-label': 'Karte bearbeiten', onclick: onEdit }, LA.icon('pencil')));

  /* ---------- match: Paare finden (Begriff ↔ Erklärung) ---------- */
  LA.defineStep('match', {
    mode: 'game',
    label: 'Paare finden',
    render(step, ctx) {
      const pairs = step.pairs;
      const left = LA.shuffle(pairs.map((p, i) => ({ text: p[0], i })));
      const right = LA.shuffle(pairs.map((p, i) => ({ text: p[1], i })));
      let sel = null;
      let found = 0;
      let mistakes = 0;
      const status = h('div', { class: 'game-status' });
      const updateStatus = () => (status.textContent = `${found} / ${pairs.length} Paare · ${mistakes} Fehler`);
      updateStatus();

      const mk = (side, it) => {
        const b = h('button', { class: `match-item match-${side}`, type: 'button', html: LA.mdi(it.text) });
        b.addEventListener('click', () => click(side, it, b));
        return b;
      };

      function click(side, it, el) {
        if (el.classList.contains('matched')) return;
        if (!sel || sel.side === side) {
          if (sel) sel.el.classList.remove('selected');
          sel = sel && sel.el === el ? null : { side, it, el };
          if (sel) el.classList.add('selected');
          LA.fx.sound.tap();
          return;
        }
        const other = sel;
        sel = null;
        other.el.classList.remove('selected');
        if (other.it.i === it.i) {
          [other.el, el].forEach((x) => x.classList.add('matched'));
          found++;
          LA.fx.sound.good();
          if (found === pairs.length) {
            updateStatus();
            ctx.finish({ correct: mistakes === 0, score: pairs.length / (pairs.length + mistakes), text: mistakes ? `Alle Paare gefunden – mit ${mistakes} Fehlversuch${mistakes === 1 ? '' : 'en'}.` : 'Alle Paare fehlerfrei gefunden!' });
          }
        } else {
          mistakes++;
          [other.el, el].forEach((x) => {
            x.classList.add('wrong');
            setTimeout(() => x.classList.remove('wrong'), 600);
          });
          LA.fx.sound.bad();
        }
        updateStatus();
      }

      return {
        el: h('div', { class: 'step step-match' },
          LA.ui.stepHead(step, ctx, { kicker: 'Finde die Paare', text: step.prompt || 'Tippe links und rechts auf zusammengehörige Karten.' }),
          status,
          h('div', { class: 'match-grid' },
            h('div', { class: 'match-col' }, left.map((it) => mk('l', it))),
            h('div', { class: 'match-col' }, right.map((it) => mk('r', it))))),
      };
    },
  });

  /* ---------- memory: Klassisches Memory mit Begriffspaaren ---------- */
  LA.defineStep('memory', {
    mode: 'game',
    label: 'Memory',
    render(step, ctx) {
      const pairs = step.pairs;
      const n = pairs.length;
      const cards = LA.shuffle(pairs.flatMap((p, i) => [{ text: p[0], pair: i, side: 0 }, { text: p[1], pair: i, side: 1 }]));
      let open = [];
      let moves = 0;
      let found = 0;
      let busy = false;
      const status = h('div', { class: 'game-status' });
      const updateStatus = () => (status.textContent = `${LA.plural(moves, 'Zug', 'Züge')} · ${found} / ${n} Paare`);
      updateStatus();

      cards.forEach((c) => {
        c.el = h('button', { class: 'mem-card', type: 'button', 'aria-label': 'Verdeckte Karte' },
          h('div', { class: 'mem-inner' },
            h('div', { class: 'mem-face mem-front' }, LA.icon('spark')),
            h('div', { class: `mem-face mem-back side-${c.side}`, html: LA.mdi(c.text) })));
        c.el.addEventListener('click', () => flip(c));
      });

      function flip(c) {
        if (busy || c.done || open.includes(c)) return;
        c.el.classList.add('open');
        open.push(c);
        LA.fx.sound.flip();
        if (open.length < 2) return;
        moves++;
        const [a, b] = open;
        if (a.pair === b.pair) {
          a.done = b.done = true;
          setTimeout(() => [a, b].forEach((x) => x.el.classList.add('done')), 250);
          open = [];
          found++;
          LA.fx.sound.good();
          if (found === n) {
            const extra = moves - n;
            ctx.finish({ score: LA.clamp(1 - extra / (n * 2), 0.2, 1), moves, text: `Geschafft in ${moves} Zügen${extra === 0 ? ' – perfekt!' : '.'}` });
          }
        } else {
          busy = true;
          setTimeout(() => {
            a.el.classList.remove('open');
            b.el.classList.remove('open');
            open = [];
            busy = false;
          }, 1000);
        }
        updateStatus();
      }

      return {
        el: h('div', { class: 'step step-memory' },
          LA.ui.stepHead(step, ctx, { kicker: 'Memory', text: step.prompt || 'Decke immer zwei Karten auf und finde die zusammengehörigen Paare.' }),
          status,
          h('div', { class: 'mem-grid', style: { '--cols': n <= 4 ? 4 : n <= 6 ? 4 : 5 } }, cards.map((c) => c.el))),
      };
    },
  });

  /* ---------- flashcards: Karten umdrehen, selbst einschätzen ---------- */
  LA.defineStep('flashcards', {
    mode: 'game',
    label: 'Karteikarten',
    render(step, ctx) {
      const total = step.cards.length;
      // Eigene Fassungen aus dem Kartenstapel gelten auch hier (gleiche ID = Hash der Vorderseite)
      const edits = LA.store.cardEdits(step._topic);
      const queue = step.cards.map((c, i) => {
        const id = LA.hash(c.front);
        return { ...LA.editedCard({ id, front: c.front, back: c.back, _topic: step._topic }, edits[id]), i };
      });
      const missed = new Set();
      let knownFirst = 0;
      let card = null;
      let flipped = false;
      const stage = h('div', { class: 'fc-stage' });
      const counter = h('div', { class: 'game-status' });
      const again = h('button', { class: 'btn btn-soft', type: 'button', onclick: () => answer(false) }, LA.icon('refresh'), 'Nochmal');
      const known = h('button', { class: 'btn btn-good', type: 'button', onclick: () => answer(true) }, LA.icon('check'), 'Gewusst');
      const flipBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => flip() }, 'Umdrehen');
      const actions = h('div', { class: 'fc-actions' }, flipBtn);

      function show(keepFlipped) {
        const c = queue[0];
        counter.textContent = `${total - queue.length + 1} / ${total} · ${missed.size ? missed.size + ' zum Wiederholen' : 'Los geht’s'}`;
        card = LA.ui.flipCard(c.front, c.back);
        card.addEventListener('click', () => flip());
        stage.replaceChildren(LA.ui.editableCard(card, edit));
        if (keepFlipped && flipped) card.classList.add('flipped', 'no-anim');
        else {
          flipped = false;
          actions.replaceChildren(flipBtn);
        }
      }
      // In der Lektion nur umschreiben – Ausblenden betrifft den Kartenstapel
      async function edit() {
        if (!queue.length) return;
        const res = await LA.ui.editCard(queue[0], { remove: false });
        if (res && queue.length) Object.assign(queue[0], res.card), show(true);
      }
      function flip() {
        // Aufgedeckt bleibt aufgedeckt (Bewertungs-Knöpfe bleiben), die Karte selbst lässt sich hin- und herdrehen
        if (flipped) return LA.ui.turnCard(card);
        flipped = true;
        card.classList.add('flipped');
        LA.fx.sound.flip();
        actions.replaceChildren(again, known);
      }
      function answer(ok) {
        if (!flipped) return;
        const c = queue.shift();
        if (ok) {
          if (!missed.has(c.i)) knownFirst++;
          LA.fx.sound.good();
        } else {
          missed.add(c.i);
          queue.push(c);
        }
        if (!queue.length) {
          stage.replaceChildren(h('div', { class: 'fc-done' }, '🎉', h('div', null, 'Alle Karten geschafft!')));
          actions.replaceChildren();
          counter.textContent = `${total} / ${total}`;
          ctx.finish({ score: knownFirst / total, text: `${knownFirst} von ${total} Karten auf Anhieb gewusst.` });
        } else show();
      }
      show();

      return {
        el: h('div', { class: 'step step-flashcards' },
          LA.ui.stepHead(step, ctx, { kicker: 'Karteikarten', text: step.prompt || 'Beantworte die Frage im Kopf, dann dreh die Karte um und sei ehrlich zu dir.' }),
          counter, stage, actions),
        key(e) {
          if (e.key === 'e' && !e.metaKey && !e.ctrlKey && queue.length) return edit(), true;
          if (e.key === ' ') return flip(), true;
          if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) return answer(false), true;
          if (flipped && (e.key === '2' || e.key === 'ArrowRight')) return answer(true), true;
          return false;
        },
      };
    },
  });

  /* ---------- hotspots: Grafik mit anklickbaren Punkten ---------- */
  LA.defineStep('hotspots', {
    mode: 'explore',
    label: 'Entdecken',
    render(step, ctx) {
      const visited = new Set();
      const panel = h('div', { class: 'hs-panel muted' }, 'Tippe auf die nummerierten Punkte in der Grafik.');
      const progress = h('div', { class: 'game-status' }, `0 / ${step.spots.length} entdeckt`);
      const base = step.svg
        ? h('div', { class: 'hs-base', html: step.svg })
        : h('img', { class: 'hs-base', src: /^(https?:|data:)/.test(step.image) ? step.image : `topics/${ctx.topic.id}/${step.image}`, alt: step.alt || '' });
      const markers = step.spots.map((sp, i) => {
        const m = h('button', { class: 'hs-marker', type: 'button', style: { left: sp.x + '%', top: sp.y + '%' }, 'aria-label': sp.title }, String(i + 1));
        m.addEventListener('click', () => open(i));
        return m;
      });

      function open(i) {
        const sp = step.spots[i];
        markers.forEach((m, k) => m.classList.toggle('active', k === i));
        markers[i].classList.add('seen');
        panel.className = 'hs-panel';
        panel.replaceChildren(h('div', { class: 'hs-title' }, h('span', { class: 'hs-num' }, i + 1), sp.title), h('div', { class: 'md', html: LA.md(sp.text) }));
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        LA.fx.sound.tap();
        if (!visited.has(i)) {
          visited.add(i);
          progress.textContent = `${visited.size} / ${step.spots.length} entdeckt`;
          if (visited.size === step.spots.length) ctx.finish({ score: 1, text: 'Alles entdeckt!' });
        }
      }

      return {
        el: h('div', { class: 'step step-hotspots' },
          LA.ui.stepHead({ title: step.title }, ctx, { kicker: 'Erkunde die Grafik', text: step.body }),
          progress,
          // minWidth: dichte Grafiken auf schmalen Bildschirmen nicht stauchen, sondern seitlich verschiebbar machen
          h('div', { class: 'hs-wrap' + (step.minWidth ? ' hs-scroll' : '') },
            h('div', { class: 'hs-inner', style: step.minWidth ? { '--hs-min': step.minWidth + 'px' } : null }, base, markers)),
          step.caption ? h('div', { class: 'fig-caption', html: LA.mdi(step.caption) }) : null,
          panel),
        key(e) {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= markers.length) return open(n - 1), true;
          return false;
        },
      };
    },
  });
})();
