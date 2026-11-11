/* Notizen: beim Lernen schnell festhalten, am Rechner mit Claude abarbeiten.
 *
 *  · Karteikarte – Begriff oder Konzept, das auf eine Karte soll. Claude prüft, ob es schon eine gibt,
 *    und schlägt sonst eine vor.
 *  · Frage – Freitext. Claude antwortet kurz und schreibt die Kurzantwort an die Notiz.
 *  · Thema – Wunsch für neue Lerninhalte (auch über die Kachel „Neues Thema“ auf der Startseite).
 *    Claude setzt ihn auf die Themenliste, aus der neue Lernreisen entstehen.
 *
 * LA.notes.button()  Notiz-Knopf für Kopfzeile, Player und Kartenrunde
 * LA.notes.open(kind?) Dialog (optional mit vorgewählter Art); merkt sich die Stelle (Thema, Lektion, Schritt, sichtbare Überschrift)
 *                    und übernimmt markierten Text als Zitat
 * LA.notes.list()    Liste als Ebene über der aktuellen Ansicht – „Zurück“ landet wieder genau dort
 *                    (eine laufende Lektion bleibt erhalten)
 * #/notizen          Liste als eigene Seite: offen / erledigt (?zeige=done)
 *
 * Gespeichert über LA.store.addNote – damit synchronisiert wie der restliche Fortschritt.
 * Abgeholt und erledigt werden die Notizen mit tools/notes.js (Skill /notizen). */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;
  LA.views = LA.views || {};

  const KINDS = {
    card: {
      label: 'Karteikarte',
      icon: 'cards',
      field: 'Begriff oder Konzept',
      placeholder: 'Was soll auf eine Karte?',
      withQuote: 'Was genau soll aus dem Zitat auf die Karte?',
      hint: 'Claude prüft am Rechner, ob es dazu schon eine Karte gibt, und schlägt sonst eine vor.',
    },
    question: {
      label: 'Frage',
      icon: 'bulb',
      field: 'Deine Frage',
      placeholder: 'Was ist dir unklar?',
      withQuote: 'Was ist dir an der Stelle unklar?',
      hint: 'Claude beantwortet die Frage am Rechner kurz – die Antwort steht danach auch hier unter Notizen.',
    },
    topic: {
      label: 'Thema',
      icon: 'route',
      field: 'Was möchtest du lernen?',
      placeholder: 'Thema, Anlass, was dich daran interessiert …',
      withQuote: 'Welches Thema steckt in dem Zitat?',
      hint: 'Claude setzt den Wunsch am Rechner auf deine Themenliste – daraus entstehen neue Lernreisen.',
    },
  };
  let lastKind = 'card';

  /* ---------- Stelle merken ---------- */
  const clip = (s, n = 90) => {
    s = (s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };

  /** Überschrift, die gerade gelesen wird: die letzte, die schon im oberen Drittel angekommen ist */
  function visibleHeading() {
    const els = [...document.querySelectorAll('#main .step-title, #main .step-prompt, #main .read-head h2, #main .lab-item[open] .lab-title, #main .flip-front .flip-text')]
      .filter((el) => el.getClientRects().length);
    if (!els.length) return null;
    const line = window.innerHeight * 0.4;
    const passed = els.filter((el) => el.getBoundingClientRect().top <= line);
    const el = passed.length ? passed[passed.length - 1] : els[0];
    return el;
  }

  function context() {
    const hash = location.hash || '#/';
    const path = hash.replace(/^#/, '').split('?')[0];
    const el = visibleHeading();
    const holder = el && el.closest('[data-topic]');
    const topic = (holder && LA.topics[holder.dataset.topic]) || (LA.current && LA.current.topic) || null;
    const parts = [];
    if (topic) parts.push(topic.title);

    const lm = path.match(/^\/t\/[^/]+\/l\/([^/]+)/);
    const lesson = lm && topic && topic.lessons ? topic.lessons.find((l) => l.id === lm[1]) : null;
    let link = hash;
    if (lesson) {
      parts.push(`Lektion „${lesson.title}“`);
      const count = document.querySelector('#main .pcount');
      // Vorschau ab Schritt X (?schritt=X) zählt im Player wieder ab 1
      const from = parseInt(new URLSearchParams(hash.split('?')[1] || '').get('schritt'), 10) || 1;
      const n = count && parseInt(count.textContent, 10) + from - 1;
      if (n) {
        parts.push('Schritt ' + n);
        link = `#/t/${topic.id}/l/${lesson.id}?schritt=${n}`;
      }
    } else if (el && el.closest('.read-lesson')) {
      parts.push('Nachlesen', `Lektion „${clip(el.closest('.read-lesson').querySelector('.read-head h2').textContent)}“`);
    } else if (el && el.closest('.lab-item')) {
      parts.push('Labs', clip(el.closest('.lab-item').querySelector('.lab-where').textContent));
    } else {
      const view = (path.match(/\/(karten|spiele|test|glossar|labs|nachlesen)/) || [])[1];
      if (view) parts.push({ karten: 'Karteikarten', spiele: 'Spiele', test: 'Test', glossar: 'Glossar', labs: 'Labs', nachlesen: 'Nachlesen' }[view]);
    }
    if (el && !el.matches('.read-head h2')) parts.push(`„${clip(el.textContent)}“`);
    return { topic: topic ? topic.id : null, where: parts.join(' · '), hash: link };
  }

  /* ---------- Markierter Text ---------- */
  // Auf dem iPhone hebt das Antippen des Notiz-Knopfs die Markierung oft schon auf, bevor der Dialog
  // aufgeht. Darum merken wir uns die letzte Markierung und nehmen sie noch kurz nach dem Aufheben.
  const QUOTE_MAX = 600;
  const GRACE_MS = 2500;
  let lastSel = { text: '', gone: 0 };

  function liveSelection() {
    const s = document.getSelection && document.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return '';
    const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    if (!node || !node.closest('#main') || node.closest('input, textarea, .note-sheet')) return '';
    return s.toString();
  }

  document.addEventListener('selectionchange', () => {
    const t = liveSelection();
    if (t.trim()) lastSel = { text: t, gone: 0 };
    else if (lastSel.text && !lastSel.gone) lastSel.gone = Date.now();
  });

  function takeQuote() {
    let t = liveSelection();
    if (!t.trim() && lastSel.gone && Date.now() - lastSel.gone < GRACE_MS) t = lastSel.text;
    lastSel = { text: '', gone: 0 };
    t = t.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    return t.length > QUOTE_MAX ? t.slice(0, QUOTE_MAX - 1) + '…' : t;
  }

  /* ---------- Dialog ---------- */
  function open(preset) {
    if (document.querySelector('.note-dialog')) return;
    const ctx = context();
    let quote = takeQuote();
    let kind = typeof preset === 'string' && KINDS[preset] ? preset : lastKind;
    const label = h('label', { class: 'ce-label', for: 'note-text' });
    const text = h('textarea', { class: 'ce-input', id: 'note-text', rows: 4, autocapitalize: 'sentences' });
    const hint = h('p', { class: 'ce-hint' });
    const error = h('p', { class: 'sync-error', role: 'alert', hidden: true }, 'Schreib kurz auf, worum es geht.');
    const paint = () => {
      label.textContent = KINDS[kind].field + (quote ? ' (optional)' : '');
      text.placeholder = quote ? KINDS[kind].withQuote : KINDS[kind].placeholder;
      hint.textContent = KINDS[kind].hint;
    };
    const quoteBox = quote
      ? h('figure', { class: 'note-quote' },
          h('figcaption', { class: 'note-quote-head' },
            h('span', null, 'Markierter Text'),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zitat entfernen', title: 'Zitat entfernen', onclick: () => {
              quote = '';
              quoteBox.remove();
              paint();
              text.focus();
            } }, icon('x'))),
          h('blockquote', null, quote))
      : null;
    const seg = LA.ui.segmented(Object.keys(KINDS).map((k) => [k, KINDS[k].label]), kind, (v) => {
      kind = v;
      paint();
      text.focus();
    });
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Art der Notiz');
    paint();

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    // Alle Tasten bleiben im Dialog – sonst beantwortet „1“ im Textfeld z. B. die Blitzrunde
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.preventDefault(), form.requestSubmit());
    };

    const form = h('form', { class: 'note-form' },
      h('div', { class: 'note-top' }, h('h3', null, 'Notiz'), h('button', { class: 'link-btn', type: 'button', onclick: () => (close(), list()) }, 'Alle Notizen')),
      seg,
      ctx.where ? h('p', { class: 'note-where muted' }, icon('bookmark'), h('span', null, ctx.where)) : null,
      quoteBox,
      h('div', { class: 'ce-field' }, label, text, hint),
      error,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: close }, 'Abbrechen'),
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Merken')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = text.value.trim();
      if (!value && !quote) {
        error.hidden = false;
        return text.focus();
      }
      lastKind = kind;
      LA.store.addNote({ kind, text: value, quote, ...ctx });
      close();
      LA.fx.sound.tap();
      const n = LA.store.openNotes();
      LA.fx.toast('Notiz gemerkt', `${LA.plural(n, 'offene Notiz', 'offene Notizen')} – am Rechner mit Claude abarbeiten.`);
    });

    const overlay = h('div', { class: 'modal-overlay note-dialog', onclick: (e) => e.target === overlay && close() },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Notiz' }, form));
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    text.focus();
  }

  const button = () =>
    h('button', { class: 'icon-btn note-btn', type: 'button', onclick: open, 'aria-label': 'Notiz anlegen', title: 'Notiz: Kartenwunsch, Frage oder Themenwunsch festhalten' }, icon('note'));

  /* ---------- Liste ---------- */
  const fmt = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  /** Inhalt der Liste – für die Seite #/notizen und die Ebene LA.notes.list() */
  function panel({ filter = 'open', back }) {
    const list = h('div', { class: 'note-list' });
    const empty = h('p', { class: 'muted lab-empty' });
    const tabs = h('div', { class: 'segmented lab-filter', role: 'group', 'aria-label': 'Notizen filtern' });
    const tabBtns = [['open', 'Offen'], ['done', 'Erledigt']].map(([key, text]) => {
      const b = h('button', { type: 'button', onclick: () => ((filter = key), paint()) });
      b.dataset.key = key;
      b.dataset.label = text;
      tabs.appendChild(b);
      return b;
    });
    const clearBtn = h('button', { class: 'btn btn-ghost danger-text', type: 'button', onclick: clearDone }, icon('trash'), 'Erledigte löschen');

    async function clearDone() {
      const done = LA.store.notes().filter((n) => n.done);
      const ok = await LA.fx.dialog({ title: 'Erledigte Notizen löschen?', text: `${LA.plural(done.length, 'Notiz wird', 'Notizen werden')} samt Antwort auf allen Geräten gelöscht.`, ok: 'Löschen', danger: true });
      if (ok) done.forEach((n) => LA.store.deleteNote(n.id));
    }

    function item(n) {
      const k = KINDS[n.kind] || KINDS.question;
      const cat = n.topic && LA.catalogEntry(n.topic);
      return h('article', { class: 'note-item card' + (n.done ? ' is-done' : '') },
        h('div', { class: 'note-head' },
          h('span', { class: 'note-kind' }, icon(k.icon), k.label),
          h('span', { class: 'muted note-date' }, fmt(n.at))),
        n.quote ? h('blockquote', { class: 'note-quote-text' }, n.quote) : null,
        n.text ? h('p', { class: 'note-text' }, n.text) : null,
        n.where || cat
          ? h('a', { class: 'note-where muted', href: n.hash || (cat ? `#/t/${n.topic}` : '#/') }, icon('bookmark'), h('span', null, n.where || cat.title))
          : null,
        n.done
          ? h('div', { class: 'note-res' },
              h('div', { class: 'note-res-head' }, icon('check'), 'Erledigt', n.done.at ? ' · ' + fmt(n.done.at) : ''),
              n.done.res ? h('div', { class: 'md', html: LA.md(n.done.res) }) : null)
          : null,
        h('div', { class: 'btn-row note-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => LA.store.updateNote(n.id, { done: n.done ? null : { at: new Date().toISOString(), res: '' } }) },
            n.done ? icon('refresh') : icon('check'), n.done ? 'Wieder öffnen' : 'Erledigt'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Notiz löschen', title: 'Löschen', onclick: () => LA.store.deleteNote(n.id) }, icon('trash'))));
    }

    function paint() {
      const all = LA.store.notes();
      const c = { open: all.filter((n) => !n.done).length, done: all.filter((n) => n.done).length };
      tabBtns.forEach((b) => {
        const on = b.dataset.key === filter;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
        b.textContent = `${b.dataset.label} · ${c[b.dataset.key]}`;
      });
      const shown = all.filter((n) => (filter === 'done') === !!n.done);
      list.replaceChildren(...shown.map(item));
      empty.hidden = shown.length > 0;
      empty.textContent = filter === 'done'
        ? 'Noch nichts erledigt. Sobald Claude deine Notizen abgearbeitet hat, stehen sie hier – Fragen mit Kurzantwort.'
        : 'Keine offenen Notizen. Tippe beim Lernen oben auf das Notiz-Symbol, um einen Kartenwunsch oder eine Frage festzuhalten.';
      clearBtn.hidden = filter !== 'done' || !c.done;
    }

    paint();
    const off = LA.store.on(paint);

    return {
      el: h('div', { class: 'page note-page' },
        back,
        h('div', { class: 'section-head' }, h('h1', null, 'Notizen'),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: open }, icon('plus'), 'Neue Notiz')),
        h('p', { class: 'muted note-intro' }, 'Kartenwünsche, Fragen und Themenwünsche, die du beim Lernen festgehalten hast. Am Rechner in Claude Code ', h('code', null, '/notizen'), ' aufrufen: Claude beantwortet die Fragen kurz, prüft die Kartenwünsche gegen die vorhandenen Karten, setzt neue Themen auf deine Themenliste und hakt alles hier ab.'),
        tabs,
        empty,
        list,
        clearBtn),
      destroy: off,
    };
  }

  LA.views.notes = async ({ query }) =>
    panel({
      filter: query.zeige === 'done' ? 'done' : 'open',
      back: h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite'),
    });

  /** Liste als Ebene: Die Ansicht darunter (z. B. eine laufende Lektion) bleibt, wie sie ist. */
  function list() {
    if (document.querySelector('.note-sheet')) return;
    const inLesson = /^#\/t\/[^/]+\/l\//.test(location.hash) || !!document.querySelector('#main .player');
    const close = () => {
      sheet.remove();
      p.destroy();
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('hashchange', close);
      if (opener && opener.isConnected) opener.focus();
    };
    // Tasten nicht an den Player darunter durchreichen (Enter würde sonst „Weiter“ drücken)
    const onKey = (e) => {
      if (document.querySelector('.note-dialog, .modal-overlay:not(.note-sheet)')) return;
      e.stopPropagation();
      if (e.key === 'Escape') close();
    };
    const opener = document.activeElement;
    const p = panel({
      back: h('button', { class: 'back-link link-btn', type: 'button', onclick: () => close() }, icon('arrowLeft'), inLesson ? 'Zurück zur Lektion' : 'Zurück'),
    });
    const sheet = h('div', { class: 'note-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Notizen' }, p.el);
    document.body.appendChild(sheet);
    document.addEventListener('keydown', onKey, true);
    // Ein Link in der Liste (Stelle einer Notiz) navigiert – dann Ebene schließen
    window.addEventListener('hashchange', close);
    const first = sheet.querySelector('.back-link');
    if (first) first.focus();
  }

  LA.notes = { open, list, button, context };
})();
