/* Prüfbare Schritt-Typen: quiz, truefalse, estimate, cloze.
 * render() liefert { el, check() → { correct, score, solution? }, key?(e) } */
(function () {
  'use strict';
  const LA = window.LA;
  const { h } = LA;

  const num = (v) => Number(v).toLocaleString('de-DE');
  const norm = (str) => String(str).trim().toLowerCase().replace(/\s+/g, ' ');

  /* ---------- quiz: Single- oder Multiple-Choice ---------- */
  LA.defineStep('quiz', {
    mode: 'check',
    label: 'Quiz',
    render(step, ctx) {
      const multi = Array.isArray(step.answer);
      const answers = new Set(multi ? step.answer : [step.answer]);
      let opts = step.options.map((o, i) => ({ ...(typeof o === 'string' ? { text: o } : o), i }));
      if (step.shuffle !== false) opts = LA.shuffle(opts);
      const selected = new Set();
      let locked = false;

      const buttons = opts.map((o, k) =>
        h('button', { class: 'option', type: 'button', 'aria-pressed': 'false', onclick: () => toggle(o.i) },
          h('span', { class: 'opt-key' }, String.fromCharCode(65 + k)),
          h('span', { class: 'opt-text', html: LA.mdi(o.text) })));

      function toggle(i) {
        if (locked) return;
        if (multi) selected.has(i) ? selected.delete(i) : selected.add(i);
        else {
          selected.clear();
          selected.add(i);
        }
        opts.forEach((o, k) => {
          buttons[k].classList.toggle('selected', selected.has(o.i));
          buttons[k].setAttribute('aria-pressed', String(selected.has(o.i)));
        });
        LA.fx.sound.tap();
        ctx.ready(selected.size > 0);
      }

      return {
        el: h('div', { class: 'step step-quiz' },
          LA.ui.stepHead(step, ctx, { kicker: multi ? 'Mehrere Antworten möglich' : 'Wähle eine Antwort', text: step.question }),
          h('div', { class: 'options' }, buttons)),
        check() {
          locked = true;
          let hits = 0, misses = 0;
          opts.forEach((o, k) => {
            const b = buttons[k];
            b.disabled = true;
            const isAns = answers.has(o.i), isSel = selected.has(o.i);
            // Richtig/falsch nicht nur über Farbe zeigen: Buchstabe wird zu ✓ bzw. ✗
            if (isAns) b.classList.add('correct');
            if (isSel && !isAns) b.classList.add('wrong');
            if (isAns || isSel) b.querySelector('.opt-key').replaceChildren(LA.icon(isAns ? 'check' : 'x'));
            if (isAns && isSel) hits++;
            if (isSel && !isAns) misses++;
            if (o.why && (isSel || isAns)) b.appendChild(h('span', { class: 'opt-why', html: LA.mdi(o.why) }));
          });
          const correct = hits === answers.size && misses === 0;
          const score = multi ? LA.clamp((hits - misses) / answers.size, 0, 1) : correct ? 1 : 0;
          return { correct, score };
        },
        key(e) {
          // Optionen heißen A, B, C … – Buchstaben und Ziffern wählen beide
          const letter = e.key.length === 1 && !e.metaKey && !e.ctrlKey ? e.key.toUpperCase().charCodeAt(0) - 64 : 0;
          const n = letter >= 1 && letter <= 26 ? letter : parseInt(e.key, 10);
          if (n >= 1 && n <= opts.length) {
            toggle(opts[n - 1].i);
            return true;
          }
          return false;
        },
      };
    },
  });

  /* ---------- truefalse: Stimmt / Stimmt nicht ---------- */
  LA.defineStep('truefalse', {
    mode: 'check',
    label: 'Wahr oder falsch',
    render(step, ctx) {
      let choice = null;
      const mk = (val, label, icon) =>
        h('button', { class: `tf-btn tf-${val}`, type: 'button', onclick: () => pick(val) }, LA.icon(icon), label);
      const yes = mk(true, 'Stimmt', 'check');
      const no = mk(false, 'Stimmt nicht', 'x');

      function pick(val) {
        if (choice !== null) return;
        choice = val;
        (val ? yes : no).classList.add('selected');
        ctx.ready(true);
        ctx.submit();
      }

      return {
        el: h('div', { class: 'step step-tf' },
          LA.ui.stepHead(step, ctx, { kicker: 'Stimmt das?' }),
          h('blockquote', { class: 'tf-statement', html: LA.mdi(step.statement) }),
          h('div', { class: 'tf-buttons' }, yes, no)),
        check() {
          const correct = choice === step.answer;
          yes.disabled = no.disabled = true;
          (step.answer ? yes : no).classList.add('correct');
          if (!correct) (choice ? yes : no).classList.add('wrong');
          return { correct, score: correct ? 1 : 0, solution: `Die Aussage ${step.answer ? 'stimmt' : 'stimmt nicht'}.` };
        },
        key(e) {
          if (['1', 'ArrowLeft', 'j'].includes(e.key)) return pick(true), true;
          if (['2', 'ArrowRight', 'n'].includes(e.key)) return pick(false), true;
          return false;
        },
      };
    },
  });

  /* ---------- estimate: Schätzfrage mit Schieberegler ---------- */
  LA.defineStep('estimate', {
    mode: 'check',
    label: 'Schätzfrage',
    render(step, ctx) {
      const { min, max } = step;
      const stepSize = step.step || 1;
      const tol = step.tolerance || 0;
      const unit = step.unit ? (step.unit === '%' ? ' %' : ' ' + step.unit) : '';
      let start = min + Math.round((max - min) / 2 / stepSize) * stepSize;
      if (Math.abs(start - step.answer) <= tol + stepSize) start = min + Math.round((max - min) * 0.2 / stepSize) * stepSize;

      const value = h('div', { class: 'est-value' }, num(start) + unit);
      const input = h('input', { type: 'range', min, max, step: stepSize, value: start, class: 'est-range', 'aria-label': 'Schätzwert' });
      const marker = h('div', { class: 'est-marker', hidden: true });
      const band = h('div', { class: 'est-band', hidden: true });
      input.addEventListener('input', () => {
        value.textContent = num(input.value) + unit;
        ctx.ready(true);
      });

      const pos = (v) => ((v - min) / (max - min)) * 100 + '%';
      return {
        el: h('div', { class: 'step step-estimate' },
          LA.ui.stepHead(step, ctx, { kicker: 'Schätze!', text: step.question }),
          value,
          h('div', { class: 'est-track' }, band, input, marker),
          h('div', { class: 'est-scale' }, h('span', null, num(min) + unit), h('span', null, num(max) + unit))),
        check() {
          const v = Number(input.value);
          input.disabled = true;
          const dev = Math.abs(v - step.answer);
          const correct = dev <= tol;
          marker.hidden = false;
          marker.style.left = pos(step.answer);
          marker.setAttribute('data-label', num(step.answer) + unit);
          if (tol) {
            band.hidden = false;
            band.style.left = pos(Math.max(min, step.answer - tol));
            band.style.width = `calc(${pos(Math.min(max, step.answer + tol))} - ${pos(Math.max(min, step.answer - tol))})`;
          }
          value.classList.add(correct ? 'good' : 'bad');
          const score = correct ? 1 : LA.clamp(1 - (dev - tol) / ((max - min) / 2), 0, 1);
          return {
            correct,
            score,
            solution: `Richtig: ${num(step.answer)}${unit}${tol ? ` (±${num(tol)} zählt als Treffer)` : ''} – du lagst ${dev ? num(dev) + unit + ' daneben' : 'genau richtig'}.`,
          };
        },
      };
    },
  });

  /* ---------- cloze: Lückentext ----------
   * text: 'Die {{Sonne}} ist ein {{Stern|Fixstern}}.'  (| = weitere erlaubte Antworten)
   * Standard: Wortbank zum Antippen. typed: true → Eingabefelder. */
  LA.defineStep('cloze', {
    mode: 'check',
    label: 'Lückentext',
    render(step, ctx) {
      const parts = step.text.split(/\{\{(.+?)\}\}/);
      const blanks = [];
      const textEl = h('div', { class: 'cloze-text' });
      parts.forEach((p, i) => {
        if (i % 2 === 0) {
          if (p) textEl.appendChild(h('span', { html: LA.mdi(p) }));
          return;
        }
        const alts = p.split('|').map((x) => x.trim());
        const b = { alts, chip: null, el: null, input: null };
        if (step.typed) {
          b.input = h('input', { class: 'cloze-input', type: 'text', autocomplete: 'off', spellcheck: 'false', size: Math.max(4, alts[0].length + 1) });
          b.input.addEventListener('input', () => ctx.ready(blanks.every((x) => x.input.value.trim())));
          b.el = b.input;
        } else {
          b.el = h('button', { class: 'blank', type: 'button', onclick: () => clickBlank(b) }, ' ');
        }
        blanks.push(b);
        textEl.appendChild(b.el);
      });

      let active = null;
      let locked = false;
      const bank = h('div', { class: 'cloze-bank' });
      const chips = step.typed
        ? []
        : LA.shuffle([...blanks.map((b) => b.alts[0]), ...(step.distractors || [])]).map((text) => {
            const c = { text, el: null, blank: null };
            c.el = h('button', { class: 'chip', type: 'button', onclick: () => clickChip(c) }, text);
            bank.appendChild(c.el);
            return c;
          });

      function setActive(b) {
        active = b;
        blanks.forEach((x) => x.el.classList.toggle('active', x === b));
      }
      function clickBlank(b) {
        if (locked) return;
        if (b.chip) {
          b.chip.el.classList.remove('used');
          b.chip.blank = null;
          b.chip = null;
          b.el.textContent = ' ';
          b.el.classList.remove('filled');
          setActive(b);
        } else setActive(active === b ? null : b);
        LA.fx.sound.tap();
        update();
      }
      function clickChip(c) {
        if (locked || c.blank) return;
        const target = active && !active.chip ? active : blanks.find((b) => !b.chip);
        if (!target) return;
        target.chip = c;
        c.blank = target;
        c.el.classList.add('used');
        target.el.textContent = c.text;
        target.el.classList.add('filled');
        setActive(blanks.find((b) => !b.chip) || null);
        LA.fx.sound.tap();
        update();
      }
      function update() {
        ctx.ready(blanks.every((b) => b.chip));
      }
      if (!step.typed) setActive(blanks[0]);

      return {
        el: h('div', { class: 'step step-cloze' },
          LA.ui.stepHead(step, ctx, { kicker: step.typed ? 'Fülle die Lücken aus' : 'Tippe die Wörter in die Lücken', text: step.prompt }),
          textEl,
          step.typed ? null : bank),
        check() {
          locked = true;
          let right = 0;
          blanks.forEach((b) => {
            const given = step.typed ? b.input.value : b.chip.text;
            const ok = b.alts.some((a) => norm(a) === norm(given));
            if (ok) right++;
            b.el.classList.remove('active');
            b.el.classList.add(ok ? 'correct' : 'wrong');
            if (b.input) b.input.disabled = true;
            if (!ok) b.el.after(h('span', { class: 'cloze-fix' }, b.alts[0]));
          });
          chips.forEach((c) => (c.el.disabled = true));
          return { correct: right === blanks.length, score: right / blanks.length };
        },
      };
    },
  });
})();
