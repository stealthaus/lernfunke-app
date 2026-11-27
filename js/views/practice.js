/* Übungsmodi: Karteikarten (Leitner, pro Thema oder Lernreise, bearbeitbar), Tagesfrage, Reise- und Favoriten-Test. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;

  function topBar(onExit, barFill, right) {
    return h('div', { class: 'player-top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Beenden', onclick: onExit }, icon('x')),
      h('div', { class: 'pbar' }, barFill),
      LA.notes.button(),
      right || h('span'));
  }

  /* ---------- Karteikarten mit Leitner-Fächern ----------
   * Ein Trainer für zwei Stapel: ein Thema (#/t/<id>/karten) oder eine ganze Lernreise
   * (#/r/<reise>/karten). Jede Karte trägt ihr Thema (_topic), dort liegt ihr Fach –
   * was im Reise-Stapel gelernt wird, zählt also auch im Thema und umgekehrt.
   * Rundengröße kommt aus den Einstellungen: fällige Karten zuerst, der Rest wird mit neuen aufgefüllt.
   * In der Runde selbst liegen fällige und neue Karten gemischt durcheinander. */

  function classify(cards) {
    const today = LA.today();
    const boxes = [0, 0, 0, 0, 0];
    const due = [], fresh = [], locked = [];
    cards.forEach((c) => {
      const cs = LA.store.cardState(c._topic, c.id);
      // Neue Karten erst, wenn ihre Lektion geschafft ist
      if (!cs) (LA.cardUnlocked(c._topic, c.id) ? fresh : locked).push(c);
      else {
        boxes[cs.box - 1]++;
        if (cs.due <= today) due.push({ ...c, box: cs.box });
      }
    });
    // Wacklige Fächer zuerst, innerhalb eines Fachs gemischt (im Reise-Stapel: Themen durcheinander)
    return { boxes, due: LA.shuffle(due).sort((a, b) => a.box - b.box), fresh, locked };
  }

  function leitnerViz(boxes, freshCount) {
    const max = Math.max(1, freshCount, ...boxes);
    return h('div', { class: 'leitner' },
      h('div', { class: 'lt-box lt-new' }, h('div', { class: 'lt-stack', style: { '--h': (freshCount / max) * 100 + '%' } }), h('div', { class: 'lt-count' }, freshCount), h('div', { class: 'lt-label' }, 'Neu')),
      boxes.map((n, i) => h('div', { class: 'lt-box', style: { '--box': `var(--box-${i + 1})` } },
        h('div', { class: 'lt-stack', style: { '--h': (n / max) * 100 + '%' } }),
        h('div', { class: 'lt-count' }, n),
        h('div', { class: 'lt-label' }, `Fach ${i + 1}`),
        h('div', { class: 'lt-int' }, i === 0 ? 'täglich' : `alle ${LA.store.INTERVALS[i + 1]} Tage`))));
  }

  /* ---------- Karte bearbeiten ----------
   * card = null → neue eigene Karte. opts: { topics: Themen für neue Karten, topicId: vorausgewählt,
   * remove: false → kein Ausblenden/Löschen (Lektion) }
   * → Promise { action: 'save' | 'add' | 'reset' | 'hide' | 'show' | 'delete', card } oder null */
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Strg';

  LA.ui.editCard = (card, opts = {}) => new Promise((resolve) => {
    const isNew = !card;
    const topics = opts.topics || [];
    const field = (label, value, rows, placeholder) => {
      const ta = h('textarea', { class: 'ce-input', rows, placeholder });
      ta.value = value || '';
      ta.addEventListener('input', sync);
      return { ta, el: h('label', { class: 'ce-field' }, h('span', { class: 'ce-label' }, label), ta) };
    };
    const front = field('Vorderseite', card && card.front, 2, 'Frage oder Begriff');
    const back = field('Rückseite', card && card.back, 5, 'Antwort – gern in deinen eigenen Worten');
    const where = isNew && topics.length > 1
      ? h('select', { class: 'ce-input' }, topics.map((t) => h('option', { value: t.id, selected: t.id === opts.topicId }, t.title)))
      : null;
    const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => done(isNew ? 'add' : 'save') }, isNew ? 'Anlegen' : 'Speichern');
    const small = (ic, label, action) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => done(action) }, icon(ic), label);

    const left = [];
    if (card && card.edited) left.push(small('refresh', 'Original wiederherstellen', 'reset'));
    if (card && opts.remove !== false) {
      if (card.hidden) left.push(small('eye', 'Wieder aufnehmen', 'show'));
      else if (!card.own) left.push(small('eyeOff', 'Ausblenden', 'hide'));
      else {
        // Löschen ist endgültig – erst nach zweitem Klick
        const del = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('trash'), 'Löschen');
        del.addEventListener('click', () => {
          if (del.classList.contains('btn-danger')) return done('delete');
          del.className = 'btn btn-danger btn-sm';
          del.replaceChildren(icon('trash'), 'Wirklich löschen?');
        });
        left.push(del);
      }
    }
    const cs = card && LA.store.cardState(card._topic, card.id);
    const kicker = card && [card.src, cs ? `Fach ${cs.box}` : 'Noch nicht gelernt'].filter(Boolean).join(' · ');

    function sync() {
      saveBtn.disabled = !front.ta.value.trim() || !back.ta.value.trim();
    }
    function done(action) {
      const f = front.ta.value.trim(), b = back.ta.value.trim();
      if ((action === 'save' || action === 'add') && (!f || !b)) return;
      const tid = card ? card._topic : where ? where.value : topics[0].id;
      if (action === 'add') {
        const id = LA.store.saveOwnCard(tid, { front: f, back: b });
        return close({ action, card: LA.refreshCard({ id, src: 'Eigene Karte', own: true, _topic: tid }) });
      }
      if (action === 'delete') {
        LA.store.deleteOwnCard(tid, card.id);
        return close({ action, card });
      }
      if (action === 'save' && card.own) LA.store.saveOwnCard(tid, { id: card.id, front: f, back: b });
      else if (action === 'save') {
        // Wieder wie im Inhalt → keine eigene Fassung speichern
        const same = f === card.orig.front.trim() && b === card.orig.back.trim();
        LA.store.editCard(tid, card.id, same ? { front: null, back: null } : { front: f, back: b });
      } else if (action === 'reset') LA.store.editCard(tid, card.id, { front: null, back: null });
      else LA.store.editCard(tid, card.id, { hidden: action === 'hide' });
      close({ action, card: LA.refreshCard(card) });
    }
    function close(res) {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(res);
    }
    // Alle Tasten bleiben im Dialog – sonst dreht die Leertaste im Textfeld die Karte um
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        done(isNew ? 'add' : 'save');
      }
    };
    // Nur schließen, wenn der Klick auch auf dem Hintergrund begann (Text markieren und daneben loslassen)
    let downOnOverlay = false;
    const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => (downOnOverlay = e.target === overlay), onclick: (e) => downOnOverlay && e.target === overlay && close(null) },
      h('div', { class: 'modal modal-wide card-editor', role: 'dialog', 'aria-modal': 'true', 'aria-label': isNew ? 'Neue Karte' : 'Karte bearbeiten' },
        h('div', { class: 'ce-head' },
          h('h3', null, isNew ? 'Neue Karte' : 'Karte bearbeiten'),
          kicker ? h('div', { class: 'ce-kicker' }, kicker) : null),
        where ? h('label', { class: 'ce-field' }, h('span', { class: 'ce-label' }, 'Station'), where) : null,
        front.el,
        back.el,
        h('div', { class: 'ce-hint' }, 'Formatierung: **fett**, `Code`, Listen mit „- “', h('span', { class: 'ce-keys' }, ' · ', h('kbd', null, MOD), ' ', h('kbd', null, 'Enter'), ' speichert')),
        card && card.edited
          ? h('details', { class: 'ce-orig' },
              h('summary', null, 'Original ansehen'),
              h('div', { class: 'ce-orig-front', html: LA.mdi(card.orig.front) }),
              h('div', { class: 'md', html: LA.md(card.orig.back) }))
          : null,
        h('div', { class: 'modal-actions ce-actions' },
          h('div', { class: 'ce-left' }, left),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(null) }, 'Abbrechen'),
          saveBtn)));
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    sync();
    front.ta.focus();
    front.ta.setSelectionRange(front.ta.value.length, front.ta.value.length);
  });

  /** Kurze Rückmeldung, wenn eine Karte den Stapel verlässt oder dazukommt */
  function notify(res) {
    if (res.action === 'hide') LA.fx.toast('Karte ausgeblendet', 'Unter „Karten bearbeiten“ holst du sie zurück.');
    else if (res.action === 'delete') LA.fx.toast('Karte gelöscht');
    else if (res.action === 'add') LA.fx.toast('Karte angelegt', 'Sie kommt als neue Karte in deinen Stapel.');
  }

  /** Markdown für die Listenvorschau einebnen */
  const plain = (src) => String(src)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, term, label) => label || term)
    .replace(/\*\*|==|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  /** o: { deck({ hidden }) → Karten, topics() → Themen für neue Karten,
   *       back: { href, label, done }, kicker?, intro?, multi?, tile?(), extra?(rerender) } */
  function cardTrainer(o) {
    const root = h('div', { class: 'player-wrap' });
    let onKey = null;

    function overview() {
      setKeys(null);
      LA.app.setFocus(false);
      const all = o.deck();
      const { boxes, due, fresh, locked } = classify(all);
      const max = LA.store.roundSize();
      const dueNow = due.slice(0, max);
      // Neue Karten zufällig aus dem ganzen Stapel – im Reise-Stapel also aus allen Stationen
      const newNow = LA.sample(fresh, max - dueNow.length);
      const later = due.length - dueNow.length;
      const size = dueNow.length + newNow.length;
      let cta;
      if (!all.length) {
        cta = o.multi
          ? h('div', null, h('strong', null, 'Keine Karten ausgewählt'), h('div', { class: 'muted' }, 'Wähle unten mindestens eine Station aus.'))
          : h('div', null, h('strong', null, 'Keine Karten im Stapel'), h('div', { class: 'muted' }, 'Leg unter „Karten bearbeiten“ eigene an oder hol ausgeblendete zurück.'));
      } else if (size) {
        cta = [h('div', null, h('strong', null, `${size} Karten für heute`),
                 h('div', { class: 'muted' }, `${dueNow.length} fällig · ${newNow.length} neu` + (later ? ` · ${later} weitere fällig in der nächsten Runde` : ''))),
               h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => session(LA.shuffle([...dueNow, ...newNow]), true) }, icon('play'), 'Lernen starten')];
      } else {
        cta = [h('div', null, h('strong', null, 'Alles erledigt für heute'), h('div', { class: 'muted' }, 'Deine Karten sind frisch im Gedächtnis. Morgen geht’s weiter.')),
               h('button', { class: 'btn btn-soft', type: 'button', onclick: () => session(LA.sample(all, max), false) }, 'Frei üben')];
      }
      root.replaceChildren(h('div', { class: 'page cards-page' },
        h('a', { class: 'back-link', href: o.back.href }, icon('arrowLeft'), o.back.label),
        o.kicker ? h('div', { class: 'cards-kicker' }, icon('route'), o.kicker) : null,
        h('h1', null, 'Karteikarten'),
        h('p', { class: 'muted' }, o.intro || 'Gewusste Karten wandern ein Fach weiter und kommen seltener dran. Nicht gewusste starten wieder in Fach 1. So wiederholst du genau das, was du gerade zu vergessen drohst.'),
        leitnerViz(boxes, fresh.length + locked.length),
        locked.length ? h('p', { class: 'muted' }, `${LA.plural(locked.length, 'neue Karte wartet', 'neue Karten warten')} auf Lektionen, die du noch nicht geschafft hast.`) : null,
        h('div', { class: 'cards-cta card' }, cta,
          all.length ? h('div', { class: 'cards-round' },
            h('span', { class: 'muted', id: 'round-label' }, 'Karten pro Runde'),
            h('div', { role: 'group', 'aria-labelledby': 'round-label' },
              LA.ui.roundSizePicker((v) => (LA.store.setting('roundSize', v), overview())))) : null),
        h('div', { class: 'deck-tiles' },
          h('button', { class: 'action-tile', type: 'button', onclick: () => manage() },
            h('div', { class: 'at-icon' }, icon('pencil')),
            h('div', null,
              h('div', { class: 'at-title' }, 'Karten bearbeiten'),
              h('div', { class: 'at-sub' }, editSummary(o.deck({ hidden: true })))),
            h('span', { class: 'deck-switch-go' }, icon('arrowRight'))),
          o.tile ? o.tile() : null),
        o.extra ? o.extra(overview) : null));
    }

    function editSummary(cards) {
      const n = (test) => cards.filter(test).length;
      const parts = [[n((c) => c.own), 'eigene'], [n((c) => c.edited), 'umgeschrieben'], [n((c) => c.hidden), 'ausgeblendet']].filter(([k]) => k);
      return parts.length ? parts.map(([k, label]) => `${k} ${label}`).join(' · ') : 'Umschreiben, eigene Karten anlegen, ausblenden';
    }

    /* Kartenliste: suchen, filtern, bearbeiten, neue Karte anlegen */
    const FILTERS = [
      ['all', 'Alle', () => true],
      ['own', 'Eigene', (c) => c.own],
      ['edited', 'Umgeschrieben', (c) => c.edited],
      ['hidden', 'Ausgeblendet', (c) => c.hidden],
    ];
    let newTopic = null; // zuletzt gewählte Station für neue Karten

    function manage() {
      setKeys(null);
      LA.app.setFocus(false);
      let filter = 'all', q = '';
      const chips = h('div', { class: 'tag-filter cl-filter' });
      const list = h('div', { class: 'cl-list' });

      function render(highlight) {
        const cards = o.deck({ hidden: true });
        chips.replaceChildren(...FILTERS.map(([key, label, test]) => {
          const k = cards.filter(test).length;
          if (!k && key !== 'all' && key !== filter) return null;
          return h('button', { class: 'chip-filter' + (key === filter ? ' on' : ''), type: 'button', onclick: () => ((filter = key), render()) }, `${label} ${k}`);
        }).filter(Boolean));
        const test = FILTERS.find(([key]) => key === filter)[2];
        const ql = q.toLowerCase();
        const shown = cards.filter((c) => test(c) && (!ql || (c.front + ' ' + c.back).toLowerCase().includes(ql)));
        list.replaceChildren(...shown.map(row));
        if (!shown.length) list.appendChild(h('p', { class: 'muted cl-empty' }, q ? 'Keine Karte gefunden.' : 'Hier ist gerade nichts.'));
        const hit = highlight && list.querySelector(`[data-id="${highlight}"]`);
        if (hit) {
          hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
          hit.classList.add('flash');
        }
      }

      function row(c) {
        const cs = LA.store.cardState(c._topic, c.id);
        const t = o.multi && LA.topics[c._topic];
        return h('button', { class: 'cl-row' + (c.hidden ? ' off' : ''), type: 'button', dataset: { id: c.id }, onclick: () => edit(c) },
          h('span', { class: 'cl-box' + (cs ? '' : ' new'), style: cs ? { '--box': `var(--box-${cs.box})` } : null, title: cs ? `Fach ${cs.box}` : 'Neue Karte' }, cs ? cs.box : ''),
          h('span', { class: 'cl-text' },
            h('span', { class: 'cl-front' }, plain(c.front)),
            h('span', { class: 'cl-back' }, plain(c.back)),
            h('span', { class: 'cl-meta' },
              t ? h('span', null, LA.glyph(t.icon || 'book'), ' ', t.title) : null,
              c.own ? h('span', { class: 'cl-flag own' }, 'Eigene Karte') : h('span', null, c.src),
              c.edited ? h('span', { class: 'cl-flag edited' }, 'umgeschrieben') : null,
              c.hidden ? h('span', { class: 'cl-flag' }, 'ausgeblendet') : null)),
          h('span', { class: 'cl-go' }, icon('pencil')));
      }

      async function edit(c) {
        const res = await LA.ui.editCard(c, { topics: o.topics() });
        if (!res) return;
        notify(res);
        render();
      }

      async function add() {
        const res = await LA.ui.editCard(null, { topics: o.topics(), topicId: newTopic });
        if (!res) return;
        newTopic = res.card._topic;
        notify(res);
        if (filter !== 'all' && filter !== 'own') filter = 'all';
        render(res.card.id);
      }

      const topics = o.topics();
      root.replaceChildren(h('div', { class: 'page cards-page' },
        h('button', { class: 'back-link', type: 'button', onclick: overview }, icon('arrowLeft'), 'Karteikarten'),
        o.kicker ? h('div', { class: 'cards-kicker' }, icon('route'), o.kicker) : null,
        h('div', { class: 'section-head' },
          h('h1', null, 'Karten bearbeiten'),
          h('button', { class: 'btn btn-primary', type: 'button', disabled: !topics.length, onclick: add }, icon('plus'), 'Neue Karte')),
        h('p', { class: 'muted' }, 'Schreib Karten in deinen eigenen Worten um, leg eigene an oder blende aus, was du nicht üben willst. Beim Umschreiben bleibt das Fach erhalten.'),
        h('div', { class: 'cl-tools' },
          h('label', { class: 'search' }, icon('search'), h('input', { type: 'search', placeholder: 'Karte suchen …', oninput: (e) => ((q = e.target.value), render()) })),
          chips),
        list));
      window.scrollTo(0, 0);
      render();
    }

    // Im Reise-Stapel steht das Thema mit auf der Karte
    function meta(c, cs) {
      const box = cs ? `Fach ${cs.box}` : 'Neue Karte';
      const t = o.multi && LA.topics[c._topic];
      return t ? `${t.title} · ${box}` : box;
    }

    function session(cards, scored) {
      const queue = cards.map((c) => ({ ...c }));
      let total = queue.length;
      let done = 0, knownFirst = 0, xp = 0;
      const missed = new Set();
      const barFill = h('div', { class: 'pbar-fill' });
      const xpVal = h('span', null, '0');
      const stage = h('div', { class: 'player-stage' });
      const actions = h('div', { class: 'fc-actions' });
      const view = h('div', { class: 'player' },
        topBar(() => overview(), barFill, h('div', { class: 'xp-chip' }, icon('bolt'), xpVal, ' XP')),
        stage,
        h('div', { class: 'player-foot' }, h('div', { class: 'foot-inner center' }, actions)));
      root.replaceChildren(view);
      LA.app.setFocus(true);
      let flipped = false;
      let card = null;

      function show(keepFlipped) {
        const c = queue[0];
        barFill.style.width = (done / total) * 100 + '%';
        card = LA.ui.flipCard(c.front, c.back, meta(c, LA.store.cardState(c._topic, c.id)));
        card.addEventListener('click', flip);
        // data-topic: Glossar-Popover schlagen [[Begriffe]] im Thema der Karte nach
        stage.replaceChildren(h('div', { class: 'fc-session', dataset: { topic: c._topic } }, h('div', { class: 'game-status' }, `${Math.min(done + 1, total)} / ${total}`), LA.ui.swipeCard(LA.ui.editableCard(card, edit), { active: () => flipped, onSwipe: answer })));
        // Nach dem Bearbeiten bleibt eine umgedrehte Karte umgedreht
        if (keepFlipped && flipped) return card.classList.add('flipped', 'no-anim');
        flipped = false;
        actions.replaceChildren(h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: flip }, 'Umdrehen'));
      }
      async function edit() {
        const c = queue[0];
        const res = await LA.ui.editCard(c, { topics: o.topics() });
        if (!res || queue[0] !== c) return;
        notify(res);
        if (res.action === 'hide' || res.action === 'delete') {
          queue.shift();
          total--;
          queue.length ? show() : finish();
        } else {
          Object.assign(c, res.card);
          show(true);
        }
      }
      function flip() {
        if (flipped) return LA.ui.turnCard(card);
        flipped = true;
        card.classList.add('flipped');
        LA.fx.sound.flip();
        actions.replaceChildren(
          h('button', { class: 'btn btn-soft btn-lg', type: 'button', onclick: () => answer(false) }, icon('refresh'), 'Nochmal'),
          h('button', { class: 'btn btn-good btn-lg', type: 'button', onclick: () => answer(true) }, icon('check'), 'Gewusst'));
      }
      function answer(ok) {
        if (!flipped) return;
        const c = queue.shift();
        const firstTime = !missed.has(c.id);
        if (scored && firstTime) LA.store.reviewCard(c._topic, c.id, ok);
        xp += LA.store.addXP(ok ? 2 : 1);
        xpVal.textContent = xp;
        if (ok) {
          done++;
          if (firstTime) knownFirst++;
          LA.fx.sound.good();
        } else {
          missed.add(c.id);
          queue.push(c);
        }
        if (queue.length) show();
        else finish();
      }
      function finish() {
        setKeys(null);
        barFill.style.width = '100%';
        actions.replaceChildren();
        LA.fx.sound.done();
        if (total && knownFirst / total >= 0.7) LA.fx.confetti(90);
        stage.replaceChildren(h('div', { class: 'result' },
          h('div', { class: 'result-emoji' }, LA.glyph('cards', 'tile gl-done')),
          h('h2', null, 'Runde geschafft!'),
          h('p', { class: 'muted' }, scored ? 'Die Karten sind in ihre neuen Fächer gewandert.' : 'Freies Üben – die Fächer bleiben unverändert.'),
          h('div', { class: 'result-stats' },
            h('div', { class: 'rstat' }, h('div', { class: 'rstat-val' }, `${knownFirst} / ${total}`), h('div', { class: 'rstat-label' }, 'auf Anhieb')),
            h('div', { class: 'rstat' }, h('div', { class: 'rstat-val' }, '+' + xp), h('div', { class: 'rstat-label' }, 'XP'))),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: overview }, 'Zur Kartenübersicht'),
            h('a', { class: 'btn btn-ghost', href: o.back.href }, o.back.done))));
      }
      setKeys((e) => {
        if (document.querySelector('.modal-overlay')) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
        else if (e.key === 'e' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); edit(); } // sonst landet das „e“ im Textfeld
        else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) { e.preventDefault(); answer(false); }
        else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) { e.preventDefault(); answer(true); }
        else if (e.key === 'Escape') overview();
      });
      show();
    }

    function setKeys(fn) {
      if (onKey) document.removeEventListener('keydown', onKey);
      onKey = fn;
      if (fn) document.addEventListener('keydown', fn);
    }

    overview();
    return { el: root, focus: false, destroy: () => setKeys(null) };
  }

  /* ---------- Stapel eines Themas ---------- */
  LA.views.cards = async ({ id }) => {
    const topic = await LA.loadTopic(id);
    const sr = LA.seriesOf(id);
    return cardTrainer({
      back: { href: `#/t/${id}`, label: topic.title, done: 'Zum Thema' },
      deck: (opts) => LA.topicCards(topic, opts),
      topics: () => [topic],
      tile: () => sr
        ? h('a', { class: 'action-tile deck-switch', href: `#/r/${sr.series.id}/karten` },
            h('div', { class: 'at-icon' }, icon('route')),
            h('div', null,
              h('div', { class: 'at-title' }, 'Ganze Lernreise üben'),
              h('div', { class: 'at-sub' }, `Alle Karten aus „${sr.series.title}“ in einem Stapel – gleicher Fortschritt wie hier.`)),
            h('span', { class: 'deck-switch-go' }, icon('arrowRight')))
        : null,
    });
  };

  /* ---------- Stapel einer Lernreise: alle Stationen, einzeln abwählbar ---------- */
  LA.views.seriesCards = async ({ seriesId }) => {
    const sr = LA.series.find((s) => s.id === seriesId);
    if (!sr) throw new Error(`Die Lernreise „${seriesId}“ gibt es nicht`);
    const topics = await Promise.all(sr.topics.filter((t) => LA.catalogEntry(t)).map((t) => LA.loadTopic(t)));
    const selected = () => {
      const on = LA.seriesCardTopics(sr);
      return topics.filter((t) => on.includes(t.id));
    };
    return cardTrainer({
      kicker: `Lernreise · ${sr.title}`,
      intro: 'Alle Karten der Reise in einem Stapel, bunt gemischt. Die Fächer sind dieselben wie in den einzelnen Themen – was du hier wiederholst, zählt auch dort.',
      back: { href: '#/karten', label: 'Alle Karteikarten', done: 'Zu allen Karteikarten' },
      multi: true,
      deck: (opts) => LA.seriesCards(selected(), opts),
      topics: selected,
      extra: (rerender) => stationPanel(sr, topics, rerender),
    });
  };

  /* ---------- Alle Karteikarten: je Lernreise ein eigener Stapel (nicht gemischt), dazu Themen ohne Reise ----------
   * Nur ein schneller Einstieg – gelernt wird im jeweiligen Reise- oder Themenstapel. */
  LA.views.allCards = () => {
    const withStats = (r) => ({ ...r, ...LA.cardsOverview(r.ids) });
    const series = LA.series
      .filter((sr) => sr.topics.some((id) => LA.catalogEntry(id)))
      .map((sr) => withStats({ title: sr.title, href: `#/r/${sr.id}/karten`, ids: LA.seriesCardTopics(sr), archived: LA.isArchived(sr), route: true }));
    const loose = LA.catalog
      .filter((t) => !LA.seriesOf(t.id))
      .map((t) => withStats({ title: t.title, href: `#/t/${t.id}/karten`, ids: [t.id], glyph: t.icon || 'book' }))
      .filter((r) => r.total);
    const active = series.filter((r) => !r.archived);
    const best = [...active, ...loose].filter((r) => r.open).sort((a, b) => b.due - a.due || b.open - a.open)[0];
    // Gesamtzahl wie auf der Startseite und in der Statistik (gleiche Karte in zwei Reisen zählt einmal)
    const all = LA.cardsToday(LA.cardTopics());

    const seg = (n, color, label) => (n ? h('span', { class: 'ds-seg', title: `${label}: ${n}`, style: { flex: String(n), '--box': color } }) : null);
    // Archivierte Reisen sind pausiert: keine Zahlen, die drängen – der Stapel lässt sich trotzdem öffnen
    const meta = (r) => r.archived ? 'pausiert'
      : r.due ? [h('strong', null, `${r.due} fällig`), r.fresh ? ` · ${r.fresh} neu` : null] : r.fresh ? `${r.fresh} neu` : LA.plural(r.total, 'Karte', 'Karten');
    const row = (r) => h('a', { class: 'ds-row ac-row', href: r.href, 'aria-label': r.archived ? `${r.title}: pausiert, ${LA.plural(r.total, 'Karte', 'Karten')}` : `${r.title}: ${r.due} fällig, ${r.fresh} neu, ${LA.plural(r.total, 'Karte', 'Karten')}` },
      h('span', { class: 'ds-icon' }, r.route ? icon('route') : LA.glyph(r.glyph)),
      h('span', { class: 'ds-title' }, r.title),
      h('span', { class: 'ds-bar' }, seg(r.fresh + r.locked, 'var(--muted)', 'Neu'), r.boxes.map((n, b) => seg(n, `var(--box-${b + 1})`, `Fach ${b + 1}`))),
      h('span', { class: 'ds-meta' }, meta(r)),
      h('span', { class: 'deck-switch-go' }, icon('arrowRight')));
    const section = (title, rows) => (rows.length ? h('section', { class: 'deck-stations' }, h('div', { class: 'section-head' }, h('h2', null, title)), h('div', { class: 'ds-list card' }, rows.map(row))) : null);

    return {
      el: h('div', { class: 'page cards-page' },
        h('h1', null, 'Alle Karteikarten'),
        h('p', { class: 'muted' }, 'Jede Lernreise hat ihren eigenen Stapel. Tipp eine Reise an, um ihre Karten zu lernen – die Fächer sind dieselben wie in den Themen.'),
        h('div', { class: 'cards-cta card' },
          best
            ? [h('div', null, h('strong', null, `Heute: ${LA.cardsText(all)}`),
                 h('div', { class: 'muted' }, `Am meisten wartet in „${best.title}“: ${LA.cardsText(best)}`)),
               h('a', { class: 'btn btn-primary btn-lg', href: best.href }, icon('play'), 'Weiterlernen')]
            : h('div', null, h('strong', null, 'Alles erledigt für heute'), h('div', { class: 'muted' }, 'In keinem Stapel ist gerade etwas fällig.'))),
        section('Lernreisen', active),
        section('Themen ohne Lernreise', loose),
        section('Archivierte Lernreisen', series.filter((r) => r.archived)),
        series.some((r) => r.archived) ? h('p', { class: 'muted' }, 'Archivierte Lernreisen sind pausiert: Ihre Karten zählen nirgends mit. Willst du sie wiederholen, hol die Reise auf der Startseite aus dem Archiv.') : null),
    };
  };

  /** Stationen mit Häkchen und Fächer-Balken (gleiche Farben wie die Leitner-Grafik) */
  function stationPanel(sr, topics, rerender) {
    const on = new Set(LA.seriesCardTopics(sr));
    const deck = LA.seriesCards(topics.filter((t) => on.has(t.id)));
    const pick = (ids, mode) => {
      const y = window.scrollY;
      LA.setSeriesCardTopics(sr, ids, mode);
      rerender();
      window.scrollTo(0, y);
    };
    const started = topics.filter((t) => LA.stationStarted(t.id)).map((t) => t.id);
    const mode = LA.seriesCardPick(sr);
    const plain = !(mode.on || []).length && !(mode.off || []).length;
    // Einzeln geänderte Häkchen: keiner der beiden Knöpfe ist dann „an“, ein Tipp setzt die Regel wieder rein
    const modeSwitch = LA.ui.segmented([['started', 'Nur begonnene'], ['all', 'Alle']], plain ? (mode.all ? 'all' : 'started') : null,
      (v) => pick(v === 'all' ? topics.map((t) => t.id) : started, v));
    modeSwitch.setAttribute('role', 'group');
    modeSwitch.setAttribute('aria-label', 'Stationen im Stapel');
    const seg = (n, color, label) => (n ? h('span', { class: 'ds-seg', title: `${label}: ${n}`, style: { flex: String(n), '--box': color } }) : null);

    const rows = topics.map((t, i) => {
      const active = on.has(t.id);
      // Abgewählte Stationen zeigen ihren eigenen Stapel, aktive den Anteil am Reise-Stapel
      const cards = active ? deck.filter((c) => c._topic === t.id) : LA.topicCards(t);
      const { boxes, due, fresh, locked } = classify(cards);
      const box = h('input', { type: 'checkbox', checked: active, 'aria-label': `${t.title} einbeziehen` });
      box.addEventListener('change', () => pick(box.checked ? [...on, t.id] : [...on].filter((x) => x !== t.id)));
      return h('label', { class: 'ds-row' + (active ? '' : ' off') },
        box,
        h('span', { class: 'ds-icon' }, LA.glyph(t.icon || 'book')),
        h('span', { class: 'ds-title' }, h('span', { class: 'ds-num' }, `${i + 1}.`), ' ', t.title),
        h('span', { class: 'ds-bar' }, seg(fresh.length + locked.length, 'var(--muted)', 'Neu'), boxes.map((n, b) => seg(n, `var(--box-${b + 1})`, `Fach ${b + 1}`))),
        h('span', { class: 'ds-meta' }, due.length ? h('strong', null, `${due.length} fällig`) : LA.plural(cards.length, 'Karte', 'Karten')));
    });

    return h('section', { class: 'deck-stations' },
      h('div', { class: 'section-head' },
        h('h2', null, 'Stationen'),
        modeSwitch),
      h('p', { class: 'muted' }, !plain
        ? 'Eigene Auswahl – einzelne Häkchen bleiben gespeichert.'
        : mode.all
          ? 'Alle Stationen sind im Stapel.'
          : 'Im Stapel sind die begonnenen Stationen – beginnst du eine neue, kommt sie von selbst dazu.'),
      h('div', { class: 'ds-list card' }, rows));
  }

  /* ---------- Tagesfrage ----------
   * Eine Frage pro Tag aus einer früher geschafften Lektion (js/core/challenges.js). Richtig: doppelte XP.
   * Falsch beantwortete Fragen kommen am nächsten Tag zuerst noch einmal, danach die neue Frage.
   * Ist alles beantwortet, zeigt die Seite nur noch, dass sie erledigt ist. */
  LA.views.daily = async () => {
    const dq = LA.challenges.daily();
    const qs = dq.answered ? [] : await LA.challenges.dailyQuestions();
    if (!qs.length) {
      return {
        el: h('div', { class: 'page' },
          h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite'),
          h('h1', null, 'Tagesfrage'),
          h('p', { class: 'muted' }, dq.newAnswered
            ? 'Heute schon beantwortet – morgen gibt es die nächste.'
            : 'Sobald du eine Lektion geschafft hast, gibt es hier ab dem nächsten Tag jeden Tag eine Frage daraus.'),
          h('a', { class: 'btn btn-soft', href: '#/' }, 'Zur Startseite')),
      };
    }
    const first = qs[0].topic;
    LA.current = { topic: first };
    const player = LA.createPlayer({
      topic: first,
      // eindeutige Schlüssel: die Fragen können aus verschiedenen Themen kommen
      steps: qs.map((q, i) => ({ ...q.step, _key: 'dq-' + i, _topic: q.topic.id })),
      showTopic: true,
      onExit: () => LA.router.go('#/'),
      result(sum) {
        let right = 0, wrong = 0;
        qs.forEach((q, i) => {
          const res = sum.results.find((r) => r.key === 'dq-' + i);
          const correct = !!(res && res.correct);
          if (q.retry) LA.store.dailyRetry(q.retry, correct);
          if (q.isNew) LA.store.dailyAnswer(correct, { topic: q.topic.id, qid: q.step._qid });
          correct ? right++ : wrong++;
        });
        if (right) sum.gain(dq.bonus * right);
        const many = qs.length > 1;
        return {
          glyph: wrong ? 'book' : 'bulb',
          title: !wrong ? 'Sitzt!' : right ? 'Teils geschafft' : 'Fast – jetzt weißt du es',
          subtitle: !wrong
            ? (many ? 'Doppelte XP für jede richtige Antwort. Morgen gibt es die nächste Frage.' : 'Doppelte XP für die Tagesfrage. Morgen gibt es die nächste.')
            : `Lies dir die Erklärung oben noch einmal durch. Morgen kommt ${wrong > 1 ? 'jede falsche Frage' : 'die Frage'} noch einmal – und dazu eine neue.`,
          stats: [{ label: 'XP', value: '+' + sum.xp }, ...(many ? [{ label: 'Richtig', value: `${right}/${qs.length}` }] : [])],
          noConfetti: !!wrong,
          actions: [
            { label: 'Zur Startseite', primary: true, href: '#/' },
            { label: 'Zum Thema', href: `#/t/${first.id}` },
          ],
        };
      },
    });
    return { el: h('div', { class: 'player-wrap' }, player.el), focus: true, destroy: () => player.destroy() };
  };
})();
