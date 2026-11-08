/* Der Player führt eine Folge von Schritten aus – für Lektionen, Abschlusstest und Mini-Spiele.
 *
 * LA.createPlayer({
 *   topic, steps,
 *   retryWrong: true,          // falsch beantwortete Fragen am Ende wiederholen
 *   gradeAll: false,           // auch Selbsteinschätzungen (think) zählen zur Genauigkeit – für Tests
 *   showTopic: false,          // Thema über jeder Frage anzeigen (Reise-Tests mischen Themen)
 *   onExit(),                  // X-Button
 *   result(summary) → { stars?, title, subtitle, stats:[{label,value}], actions:[{label, primary?, href? | onClick?}] }
 *
 * Schritt-Instanzen: { el, check?(), key?(e), review?() – Ansicht für den Rückblick vorbereiten, destroy?() }
 * }) → { el, destroy }
 *
 * Rückblick: Der Pfeil oben links springt zu schon erledigten Aufgaben zurück (z. B. um sie nachträglich
 * zu merken). Erklärkarten werden übersprungen, die Aufgabe bleibt so, wie sie beantwortet wurde (gesperrt). */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;

  const PRAISE = ['Richtig!', 'Super!', 'Genau!', 'Stark!', 'Klasse!', 'Volltreffer!', 'Sitzt!'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  LA.createPlayer = (opts) => {
    const topic = opts.topic;
    const queue = opts.steps.slice();
    const results = new Map();
    const t0 = Date.now();
    let idx = 0;
    let inst = null;
    let mode = null;
    let state = 'answer'; // 'answer' → 'checked' → nächster Schritt; 'done' am Ende
    let xp = 0;
    let isReady = false;
    // Rückblick: erledigte Aufgaben mit ihrer beantworteten Karte; review = Index darin, -1 = aktuelle Ansicht
    const history = [];
    let review = -1;
    let curCard = null;
    let curScroll = 0;
    let resultEl = null;
    // Fußleiste der aktuellen Aufgabe – wird gemerkt, damit sie nach dem Rückblick wiederhergestellt werden kann
    const footState = { fb: [null], prim: ['Weiter', {}] };
    const isTask = (m) => m === 'check' || m === 'game';

    const barFill = h('div', { class: 'pbar-fill' });
    const bar = h('div', { class: 'pbar', role: 'progressbar', 'aria-label': 'Fortschritt', 'aria-valuemin': '0' }, barFill);
    const counter = h('span', { class: 'pcount', 'aria-hidden': 'true' });
    // Urteil für Screenreader – die Fußleiste ändert sich sonst lautlos
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    const xpVal = h('span', null, '0');
    const xpChip = h('div', { class: 'xp-chip', title: 'In dieser Runde gesammelte XP' }, icon('bolt'), xpVal, h('span', { class: 'xp-unit' }, ' XP'));
    const hasTasks = queue.some((st) => LA.steps[st.type] && isTask(LA.steps[st.type].mode));
    const backBtn = hasTasks ? h('button', { class: 'icon-btn back-btn', type: 'button', onclick: goBack }, icon('arrowLeft')) : null;
    const favBtn = queue.some((st) => st._qid) ? h('button', { class: 'icon-btn fav-btn', type: 'button', onclick: toggleFav }, icon('heart')) : null;
    const stage = h('div', { class: 'player-stage' });
    const fbBox = h('div', { class: 'feedback' });
    const primary = h('button', { class: 'btn btn-primary btn-lg', type: 'button' });
    const keyHint = h('span', { class: 'key-hint', 'aria-hidden': 'true' }, h('kbd', null, 'Enter'));
    const foot = h('div', { class: 'player-foot' }, h('div', { class: 'foot-inner' }, fbBox, keyHint, primary));
    const el = h('div', { class: 'player' },
      h('div', { class: 'player-top' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Beenden', onclick: exit }, icon('x')),
        backBtn,
        bar,
        counter,
        favBtn,
        LA.notes.button(),
        xpChip),
      stage, foot, live);

    primary.addEventListener('click', onPrimary);

    function setPrimary(label, o = {}) {
      footState.prim = [label, o];
      if (review < 0) paintPrimary(label, o);
    }

    function paintPrimary(label, { disabled = false, ghost = false } = {}) {
      primary.textContent = label;
      primary.disabled = disabled;
      primary.classList.toggle('btn-primary', !ghost);
      primary.classList.toggle('btn-ghost', ghost);
      keyHint.hidden = disabled || ghost;
    }

    /** Fortschritt: Balken, „3 / 9“ und ARIA-Werte. Wiederholungen verlängern die Runde sichtbar. */
    function progress(done) {
      const total = queue.length;
      barFill.style.width = (done / total) * 100 + '%';
      bar.setAttribute('aria-valuemax', String(total));
      bar.setAttribute('aria-valuenow', String(done));
      bar.setAttribute('aria-valuetext', done >= total ? 'Fertig' : `Schritt ${done + 1} von ${total}`);
      counter.textContent = done >= total ? '' : `${done + 1} / ${total}`;
    }

    function feedback(kind, title, text) {
      footState.fb = [kind, title, text];
      if (review < 0) paintFeedback(kind, title, text, true);
    }

    function paintFeedback(kind, title, text, announce) {
      fbBox.className = 'feedback' + (kind ? ' fb-' + kind : '');
      fbBox.replaceChildren();
      foot.className = 'player-foot' + (kind ? ' foot-' + kind : '');
      if (!kind) return;
      fbBox.append(
        h('div', { class: 'fb-icon' }, icon(kind === 'bad' ? 'x' : 'check')),
        h('div', { class: 'fb-text' }, h('strong', null, title), text ? h('span', null, text) : null));
      if (announce) live.textContent = [title, text].filter(Boolean).join(' ');
    }

    function gain(n) {
      if (!n) return;
      xp += n;
      xpVal.textContent = xp;
      xpChip.classList.remove('pop');
      void xpChip.offsetWidth;
      xpChip.classList.add('pop');
      LA.store.addXP(n);
      LA.fx.floatXP(primary, n);
    }

    const ctx = {
      topic,
      ready(ok) {
        isReady = !!ok;
        if (state === 'answer' && mode === 'check') setPrimary(footState.prim[0], { ...footState.prim[1], disabled: !ok });
      },
      submit() {
        if (state === 'answer' && mode === 'check' && !primary.disabled) doCheck();
      },
      finish(res) {
        if (state !== 'answer') return;
        state = 'checked';
        const step = queue[idx];
        record(step, { correct: true, ...res, graded: res.graded !== false || !!opts.gradeAll });
        const reward = mode === 'explore' ? 5 : res.graded === false ? Math.round(3 + 2 * res.score) : Math.round(5 + 10 * res.score);
        gain(reward);
        // Spiele mit Fehlversuchen melden correct: false (z. B. match) → am Ende noch einmal
        const again = opts.retryWrong && !step._retry && res.correct === false;
        if (again) queue.push({ ...step, _retry: true });
        feedback('good', mode === 'explore' ? 'Alles entdeckt!' : 'Geschafft!', [res.text, again ? 'Die Aufgabe kommt am Ende noch einmal.' : ''].filter(Boolean).join(' '));
        if (mode === 'game') LA.fx.sound.done();
        setPrimary('Weiter');
      },
    };

    /* ---------- Favoriten: Herz oben rechts bei prüfbaren Fragen ---------- */
    /** Schritt, der gerade zu sehen ist – im Rückblick die frühere Aufgabe */
    const viewStep = () => (review >= 0 ? history[review].step : state === 'done' ? null : queue[idx]);

    function syncFav() {
      syncBack();
      if (!favBtn) return;
      const step = viewStep();
      const on = !!(step && step._qid) && LA.store.isFav(step._topic, step._qid);
      favBtn.style.visibility = step && step._qid ? '' : 'hidden';
      favBtn.classList.toggle('on', on);
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.setAttribute('aria-label', on ? 'Favorit entfernen' : 'Als Favorit merken');
      const why = step && LA.testOnlyAsFav(step.type) ? 'kommt dann auch in Tests dran' : 'kommt in Tests öfter dran';
      favBtn.title = on ? `Favorit – ${why}. Nochmal tippen entfernt ihn.` : `Als Favorit merken – ${why}`;
    }

    function toggleFav() {
      const step = viewStep();
      if (!step || !step._qid) return;
      const first = !LA.store.favCount();
      const on = LA.store.toggleFav(step._topic, step._qid);
      syncFav();
      LA.fx.sound.tap();
      if (!on) return;
      favBtn.classList.remove('pop');
      void favBtn.offsetWidth;
      favBtn.classList.add('pop');
      if (first) LA.fx.toast('Als Favorit gemerkt', 'Favoriten kommen in Tests öfter dran. Auf der Startseite kannst du sie je Lernreise gesammelt testen.');
    }

    /* ---------- Rückblick: zu erledigten Aufgaben zurück, Erklärkarten bleiben hinter dir ---------- */
    function syncBack() {
      if (!backBtn) return;
      const can = review < 0 ? history.length > 0 : review > 0;
      backBtn.style.visibility = can ? '' : 'hidden';
      backBtn.disabled = !can;
      backBtn.setAttribute('aria-label', 'Vorherige Aufgabe ansehen');
      backBtn.title = 'Vorherige Aufgabe ansehen – z. B. um sie als Favorit zu merken';
    }

    /** Beantwortete Karte der aktuellen Aufgabe aufheben, gesperrt bis auf die Erklärung */
    function archive() {
      if (!curCard || !isTask(mode)) return;
      if (inst && inst.review) inst.review();
      [...curCard.children].forEach((c) => {
        if (!c.classList.contains('explain-box')) c.inert = true;
      });
      curCard.prepend(h('div', { class: 'review-tag' }, icon('arrowLeft'), 'Rückblick – schon erledigt'));
      history.push({ step: queue[idx], card: curCard, pos: idx });
    }

    function goBack() {
      const to = (review < 0 ? history.length : review) - 1;
      if (to < 0) return;
      if (review < 0) curScroll = stage.scrollTop;
      review = to;
      const { card, pos } = history[to];
      stage.replaceChildren(card);
      stage.scrollTop = 0;
      foot.hidden = false;
      paintFeedback(null);
      paintPrimary(state === 'done' ? 'Zurück zum Ergebnis' : 'Zurück zur Aufgabe');
      counter.textContent = `${pos + 1} / ${queue.length}`;
      live.textContent = `Rückblick: Schritt ${pos + 1}`;
      syncFav();
      LA.fx.sound.tap();
      const head = card.querySelector('.step-title') || card.querySelector('.step-prompt') || card.querySelector('.review-tag');
      if (head) {
        head.tabIndex = -1;
        head.focus({ preventScroll: true });
      }
    }

    function leaveReview() {
      review = -1;
      if (state === 'done') {
        stage.replaceChildren(resultEl);
        foot.hidden = true;
        progress(queue.length);
      } else {
        stage.replaceChildren(curCard);
        stage.scrollTop = curScroll;
        paintFeedback(...footState.fb);
        paintPrimary(...footState.prim);
        progress(idx);
      }
      live.textContent = 'Zurück bei der aktuellen Aufgabe';
      syncFav();
      primary.focus({ preventScroll: true });
    }

    function record(step, res) {
      if (!step._retry) results.set(step._key || step.type + idx, { score: res.score, correct: res.correct, graded: res.graded !== false, raw: res });
    }

    function show() {
      const step = queue[idx];
      const def = LA.steps[step.type];
      const stepTopic = LA.topics[step._topic] || topic;
      ctx.topic = stepTopic;
      state = 'answer';
      isReady = false;
      feedback(null);
      syncFav();
      progress(idx);
      if (inst && inst.destroy) inst.destroy();
      try {
        if (!def) throw new Error(`Unbekannter Schritt-Typ „${step.type}“`);
        mode = def.mode;
        inst = def.render(step, ctx);
      } catch (e) {
        console.error(e);
        mode = 'passive';
        inst = { el: h('div', { class: 'step fig-error' }, 'Dieser Schritt konnte nicht angezeigt werden: ' + e.message) };
      }
      // data-topic: Glossar-Popover schlagen [[Begriffe]] im Thema der Frage nach
      const card = h('div', { class: 'step-card' + (step._retry ? ' is-retry' : ''), dataset: { topic: stepTopic.id } },
        opts.showTopic ? h('div', { class: 'step-topic' }, stepTopic.icon, ' ', stepTopic.title) : null,
        step._retry ? h('div', { class: 'retry-tag' }, icon('refresh'), 'Wiederholung') : null,
        inst.el);
      curCard = card;
      stage.replaceChildren(card);
      stage.scrollTop = 0;
      // Fokus auf die neue Aufgabe: Screenreader lesen sie vor, Tab startet bei den Antworten
      const head = card.querySelector('.step-title') || card.querySelector('.step-prompt') || card.querySelector('.step-kicker');
      if (head && idx > 0) {
        head.tabIndex = -1;
        head.focus({ preventScroll: true });
      }
      // Schritt-Typen dürfen ctx.ready() schon während render() aufrufen (z. B. order)
      if (mode === 'check') setPrimary('Prüfen', { disabled: !isReady });
      else if (mode === 'game') setPrimary('Überspringen', { ghost: true });
      else setPrimary('Weiter');
    }

    function doCheck() {
      const step = queue[idx];
      const res = inst.check();
      state = 'checked';
      record(step, res);
      const first = !step._retry;
      if (res.correct) {
        LA.fx.sound.good();
        gain(first ? 10 : 5);
        feedback('good', pick(PRAISE), '');
      } else {
        LA.fx.sound.bad();
        if (res.score > 0) gain(Math.round(res.score * 5));
        feedback('bad', res.score > 0 ? 'Teilweise richtig' : 'Nicht ganz', opts.retryWrong && first ? 'Die Frage kommt am Ende noch einmal.' : '');
        if (opts.retryWrong && first) queue.push({ ...step, _retry: true });
      }
      // Ausführliches Feedback direkt an der Aufgabe – mit eigenem Urteil, damit es ohne Blick nach unten verständlich ist
      const expl = [res.correct ? null : res.solution, step.explanation].filter(Boolean);
      if (expl.length) {
        const box = h('div', { class: 'explain-box ' + (res.correct ? 'good' : 'bad') },
          h('div', { class: 'explain-head' }, icon(res.correct ? 'check' : 'bulb'), res.correct ? 'Richtig – warum?' : 'So ist es richtig'),
          ...expl.map((t) => h('div', { class: 'md', html: LA.md(t) })));
        curCard.appendChild(box);
        requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      }
      setPrimary('Weiter');
    }

    function onPrimary() {
      if (review >= 0) return leaveReview();
      if (state === 'done') return;
      if (state === 'answer' && mode === 'check') return doCheck();
      if (state === 'answer' && mode === 'game') {
        // übersprungen
        record(queue[idx], { correct: false, score: 0, graded: true });
      }
      next();
    }

    function next() {
      archive();
      idx++;
      if (idx >= queue.length) complete();
      else show();
    }

    function complete() {
      state = 'done';
      if (inst && inst.destroy) inst.destroy();
      syncFav();
      progress(queue.length);
      feedback(null);
      foot.hidden = true;
      const all = [...results.values()];
      const graded = all.filter((r) => r.graded);
      const accuracy = graded.length ? graded.reduce((a, r) => a + r.score, 0) / graded.length : 1;
      const summary = { accuracy, stars: accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1, xp, time: Date.now() - t0, results: all };
      // Bonus-XP am Ende (z. B. Lektionsabschluss) fließen in die angezeigte Summe ein
      summary.gain = (n) => {
        gain(n);
        summary.xp = xp;
      };
      const r = opts.result(summary);
      resultEl = resultScreen(r, summary);
      stage.replaceChildren(resultEl);
      // Hauptaktion ist der Default: fokussiert, Enter löst sie aus
      const main = resultEl.querySelector('.result-actions .btn-primary');
      if (main) main.focus({ preventScroll: true });
      LA.fx.sound.done();
      if (!r.noConfetti && (r.stars == null || r.stars >= 2)) setTimeout(() => LA.fx.confetti(), 250);
    }

    function resultScreen(r, sum) {
      const stars = r.stars != null
        ? h('div', { class: 'result-stars' }, [1, 2, 3].map((i) => h('span', { class: 'rstar' + (i <= r.stars ? ' on' : ''), style: { animationDelay: i * 0.18 + 's' } }, icon('star'))))
        : r.emoji ? h('div', { class: 'result-emoji' }, r.emoji) : null;
      return h('div', { class: 'result' },
        stars,
        h('h2', null, r.title),
        r.subtitle ? h('p', { class: 'muted', html: LA.mdi(r.subtitle) }) : null,
        h('div', { class: 'result-stats' }, (r.stats || []).map((st) =>
          h('div', { class: 'rstat' }, h('div', { class: 'rstat-val' }, st.value), h('div', { class: 'rstat-label' }, st.label)))),
        r.extra || null,
        h('div', { class: 'result-actions' }, (r.actions || []).map((a) =>
          a.href
            ? h('a', { class: 'btn ' + (a.primary ? 'btn-primary btn-lg' : 'btn-ghost'), href: a.href }, a.label)
            : h('button', { class: 'btn ' + (a.primary ? 'btn-primary btn-lg' : 'btn-ghost'), type: 'button', onclick: a.onClick }, a.label))));
    }

    async function exit() {
      if (state !== 'done' && idx > 0) {
        const ok = await LA.fx.dialog({ title: 'Wirklich beenden?', text: 'Deine gesammelten XP bleiben erhalten, aber die Runde wird nicht abgeschlossen.', ok: 'Beenden', cancel: 'Weitermachen' });
        if (!ok) return;
      }
      opts.onExit();
    }

    function onKey(e) {
      if (document.querySelector('.modal-overlay')) return;
      const inField = e.target.matches && e.target.matches('input, textarea');
      if (e.key === 'Escape') return exit();
      if (e.key === 'Enter') {
        if (!primary.disabled && (state !== 'done' || review >= 0) && !e.repeat) {
          e.preventDefault();
          primary.click();
        } else if (state === 'done' && review < 0 && !e.repeat && !e.target.closest('.result-actions')) {
          const main = resultEl && resultEl.querySelector('.result-actions .btn-primary');
          if (main) { e.preventDefault(); main.click(); }
        }
        return;
      }
      if (inField) return;
      if (review < 0 && state === 'answer' && inst && inst.key && inst.key(e)) e.preventDefault();
    }
    document.addEventListener('keydown', onKey);

    show();
    return {
      el,
      destroy() {
        document.removeEventListener('keydown', onKey);
        if (inst && inst.destroy) inst.destroy();
      },
    };
  };
})();
