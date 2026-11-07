/* Schritt-Typen: explain (Erklärkarte) und think (Nachdenken & Aufdecken).
 * Außerdem gemeinsame UI-Helfer für alle Schritt-Typen (LA.ui). */
(function () {
  'use strict';
  const LA = window.LA;
  const { h } = LA;

  const CALLOUTS = {
    remember: { icon: 'star', label: 'Merke' },
    tip: { icon: 'bulb', label: 'Tipp' },
    example: { icon: 'pencil', label: 'Beispiel' },
    info: { icon: 'info', label: 'Gut zu wissen' },
    warning: { icon: 'alert', label: 'Achtung' },
  };

  LA.ui = LA.ui || {};

  /** Callout-Boxen aus step.remember / tip / example / info / warning */
  LA.ui.callouts = (step) =>
    Object.keys(CALLOUTS)
      .filter((k) => step[k])
      .map((k) =>
        h('div', { class: `callout callout-${k}` },
          h('div', { class: 'callout-head' }, LA.icon(CALLOUTS[k].icon), CALLOUTS[k].label),
          h('div', { class: 'callout-body', html: LA.md(step[k]) })));

  /** Überschrift + Fragetext + optionale Grafik – gemeinsam für alle Schritt-Typen */
  LA.ui.stepHead = (step, ctx, { kicker, text } = {}) => {
    const els = [];
    if (kicker) els.push(h('div', { class: 'step-kicker' }, kicker));
    if (step.title) els.push(h('h2', { class: 'step-title', html: LA.mdi(step.title) }));
    if (text) els.push(h('div', { class: 'step-prompt md', html: LA.md(text) }));
    if (step.figure) els.push(LA.renderFigure(step.figure, ctx.topic));
    return els;
  };

  /* ---------- Labs: Übungen am Rechner ----------
   * Erklärkarten mit `lab: true` bekommen ein Kennzeichen und zwei Umschalter. „Später machen“ setzt das Lab
   * auf die Lab-Liste (für unterwegs am Handy), „Erledigt“ hakt es ab. Beide schließen sich gegenseitig aus. */
  const LAB_NOTE = {
    none: 'Gerade nicht am Rechner? Merk dir das Lab für später.',
    later: 'Steht auf deiner Lab-Liste – du findest sie auf der Seite der Station und bei der Lernreise.',
    done: 'Erledigt – schön, dass du es ausprobiert hast.',
  };
  LA.ui.labKicker = () => h('div', { class: 'lab-kicker' }, LA.icon('laptop'), 'Lab am Rechner');

  LA.ui.labBar = (step, topicId) => {
    const id = step._lab;
    const note = h('p', { class: 'lab-note' });
    const later = h('button', { class: 'btn btn-soft lab-btn lab-later', type: 'button' });
    const done = h('button', { class: 'btn btn-soft lab-btn lab-done', type: 'button' });
    const cur = () => (LA.store.labState(topicId, id) || {}).s || 'none';
    function paint() {
      const s = cur();
      later.replaceChildren(LA.icon(s === 'later' ? 'check' : 'bookmark'), s === 'later' ? 'Gemerkt' : 'Später machen');
      done.replaceChildren(LA.icon('check'), s === 'done' ? 'Erledigt' : 'Als erledigt abhaken');
      later.setAttribute('aria-pressed', String(s === 'later'));
      done.setAttribute('aria-pressed', String(s === 'done'));
      later.classList.toggle('on', s === 'later');
      done.classList.toggle('on', s === 'done');
      note.textContent = LAB_NOTE[s];
    }
    function pick(s) {
      const first = s === 'later' && !LA.store.labCount();
      LA.store.setLab(topicId, id, cur() === s ? null : s);
      paint();
      LA.fx.sound.tap();
      if (first) LA.fx.toast('Auf der Lab-Liste', 'Am Rechner findest du sie auf der Seite der Station oder bei der Lernreise unter „Labs“.');
    }
    later.addEventListener('click', () => pick('later'));
    done.addEventListener('click', () => pick('done'));
    paint();
    return h('div', { class: 'lab-bar', role: 'group', 'aria-label': 'Lab merken oder abhaken' }, note, h('div', { class: 'btn-row' }, later, done));
  };

  /* ---------- explain ---------- */
  LA.defineStep('explain', {
    mode: 'passive',
    label: 'Erklärung',
    render(step, ctx) {
      const fig = step.figure ? LA.renderFigure(step.figure, ctx.topic) : null;
      return {
        el: h('div', { class: 'step step-explain' + (step._lab ? ' is-lab' : '') },
          step._lab ? LA.ui.labKicker() : null,
          step.title ? h('h2', { class: 'step-title', html: LA.mdi(step.title) }) : null,
          step.figureFirst ? fig : null,
          step.body ? h('div', { class: 'md', html: LA.md(step.body) }) : null,
          step.figureFirst ? null : fig,
          LA.ui.callouts(step),
          step._lab ? LA.ui.labBar(step, step._topic || ctx.topic.id) : null),
      };
    },
  });

  /* ---------- think: erst selbst überlegen, dann aufdecken ---------- */
  LA.defineStep('think', {
    mode: 'game',
    label: 'Nachdenken',
    render(step, ctx) {
      const answer = h('div', { class: 'think-answer', hidden: true },
        h('div', { class: 'think-answer-label' }, LA.icon('eye'), 'Auflösung'),
        h('div', { class: 'md', html: LA.md(step.answer) }));
      const rate = h('div', { class: 'think-rate', hidden: true },
        h('span', { class: 'muted' }, 'Wie gut lagst du?'),
        h('button', { class: 'btn btn-soft', onclick: () => done(0.5) }, 'Noch nicht ganz'),
        h('button', { class: 'btn btn-good', onclick: () => done(1) }, LA.icon('check'), 'Wusste ich'));
      const revealBtn = h('button', { class: 'btn btn-primary btn-lg', onclick: reveal }, LA.icon('eye'), 'Antwort aufdecken');
      const hint = step.hint
        ? h('details', { class: 'hint' }, h('summary', null, 'Tipp anzeigen'), h('div', { class: 'md', html: LA.md(step.hint) }))
        : null;

      function reveal() {
        answer.hidden = false;
        rate.hidden = false;
        revealBtn.remove();
        LA.fx.sound.flip();
      }
      let finished = false;
      function done(score) {
        if (finished) return;
        finished = true;
        rate.querySelectorAll('button').forEach((b) => (b.disabled = true));
        // „Noch nicht ganz“ gilt als nicht gewusst → kommt in Lektionen am Ende noch einmal
        ctx.finish({ score, correct: score === 1, graded: false, text: score === 1 ? 'Super – Wissen aktiv abgerufen!' : 'Kein Problem – beim nächsten Mal sitzt es besser.' });
      }

      return {
        el: h('div', { class: 'step step-think' },
          LA.ui.stepHead(step, ctx, { kicker: 'Denk kurz nach', text: step.prompt }),
          hint, revealBtn, answer, rate),
        // Rückblick: Auflösung zeigen, Bedienelemente ausblenden
        review() {
          answer.hidden = false;
          revealBtn.remove();
          if (hint) hint.remove();
          if (!finished) rate.hidden = true;
        },
        key(e) {
          if (e.key === ' ' && revealBtn.isConnected) {
            e.preventDefault();
            reveal();
            return true;
          }
          return false;
        },
      };
    },
  });
})();
