/* Themenseite (Lernpfad), Lektion, Abschlusstest, Glossar und Nachlesen. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;

  const lessonMinutes = (l) => l.minutes || Math.max(2, Math.round(l.steps.length * 0.7));

  /** Welche Übungsformate kommen in einer Lektion vor? */
  function formats(lesson) {
    const labels = new Set();
    lesson.steps.forEach((st) => st.type !== 'explain' && LA.steps[st.type] && labels.add(LA.steps[st.type].label));
    return [...labels];
  }

  function stars(n, cls = '') {
    return h('span', { class: 'stars ' + cls }, [1, 2, 3].map((i) => h('span', { class: 'star' + (i <= n ? ' on' : '') }, icon('star'))));
  }

  /* ---------- Themenseite ---------- */
  LA.views.topic = async ({ id }) => {
    const topic = await LA.loadTopic(id);
    LA.store.visit(id);
    const tState = LA.store.topic(id);
    const prog = LA.topicProgress(id);
    const next = LA.nextLesson(topic);
    const cards = LA.topicCards(topic);
    const due = cards.filter((c) => {
      const cs = tState.cards[c.id];
      return cs && cs.due <= LA.today();
    }).length;
    const fresh = cards.filter((c) => !tState.cards[c.id]).length;
    const favN = LA.store.favCount(id);

    const cta = next
      ? h('a', { class: 'btn btn-primary btn-lg', href: `#/t/${id}/l/${next.id}` }, icon('play'), prog.done ? 'Weiterlernen' : 'Los geht’s')
      : h('a', { class: 'btn btn-primary btn-lg', href: `#/t/${id}/test` }, icon('target'), 'Abschlusstest starten');

    const action = (href, ic, title, sub, badge) =>
      h('a', { class: 'action-tile', href }, h('div', { class: 'at-icon' }, icon(ic)), h('div', null, h('div', { class: 'at-title' }, title), h('div', { class: 'at-sub' }, sub)), badge ? h('span', { class: 'at-badge' }, badge) : null);

    // Lernpfad, gruppiert nach Kapitel
    const path = h('div', { class: 'path' });
    let chapter;
    topic.lessons.forEach((l, i) => {
      if (l.chapter && l.chapter !== chapter) {
        chapter = l.chapter;
        path.appendChild(h('div', { class: 'path-chapter' }, l.chapter));
      }
      const res = tState.lessons[l.id];
      const isNext = next && next.id === l.id;
      path.appendChild(h('a', { class: 'lesson-node' + (res ? ' done' : '') + (isNext ? ' next' : ''), href: `#/t/${id}/l/${l.id}` },
        h('div', { class: 'node-circle' }, res ? icon('check') : String(i + 1)),
        h('div', { class: 'node-body' },
          h('div', { class: 'node-title' }, l.title),
          l.summary ? h('div', { class: 'node-sum muted' }, l.summary) : null,
          h('div', { class: 'node-meta' },
            h('span', null, icon('clock'), `~${lessonMinutes(l)} min`),
            formats(l).slice(0, 4).map((f) => h('span', { class: 'tag tag-sm' }, f)))),
        h('div', { class: 'node-end' }, res ? stars(res.stars) : isNext ? h('span', { class: 'node-go' }, 'Start', icon('arrowRight')) : null)));
    });

    const sources = topic.sources && topic.sources.length
      ? h('details', { class: 'sources card' },
          h('summary', null, icon('link'), `Quellen & weiterführende Literatur (${topic.sources.length})`),
          h('ul', null, topic.sources.map((s) => h('li', null, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title) : s.title, s.note ? h('span', { class: 'muted' }, ' – ' + s.note) : null))))
      : null;

    // Labs (Übungen am Rechner): Zahl im Knopf = gemerkte, noch offene
    const labN = LA.topicLabs(topic).length;
    const labLater = LA.store.labCount(id);

    // Lernreise: Position und Nachbar-Stationen
    const sr = LA.seriesOf(id);
    const seriesBar = sr
      ? h('nav', { class: 'series-bar', 'aria-label': 'Lernreise' },
          h('span', { class: 'sb-label' }, icon('route'), h('span', null, h('strong', null, sr.series.title), ` · Station ${sr.index + 1} von ${sr.series.topics.length}`)),
          h('span', { class: 'sb-nav' },
            sr.prev ? h('a', { href: `#/t/${sr.prev.id}`, title: sr.prev.title }, icon('arrowLeft'), h('span', null, sr.prev.icon + ' ' + sr.prev.title)) : null,
            sr.next ? h('a', { href: `#/t/${sr.next.id}`, title: sr.next.title }, h('span', null, sr.next.icon + ' ' + sr.next.title), icon('arrowRight')) : null))
      : null;

    return {
      el: h('div', { class: 'page topic-page' },
        h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite'),
        seriesBar,
        h('section', { class: 'topic-hero', style: { '--pastel': LA.pastelOf(id) } },
          h('div', { class: 'th-icon' }, topic.icon),
          h('div', { class: 'th-body' },
            h('h1', null, topic.title),
            topic.subtitle ? h('p', { class: 'th-sub' }, topic.subtitle) : null,
            // Hauptaktion vor dem Einführungstext – mobil sonst erst nach dem Scrollen sichtbar
            h('div', { class: 'th-go' },
              cta,
              h('div', { class: 'th-progress' },
                h('div', { class: 'mini-bar lg', role: 'progressbar', 'aria-label': 'Lektionen geschafft', 'aria-valuemin': '0', 'aria-valuemax': String(prog.count), 'aria-valuenow': String(prog.done) },
                  h('div', { style: { width: prog.pct * 100 + '%' } })),
                h('span', null, `${prog.done} / ${prog.count} geschafft`))),
            h('div', { class: 'th-meta' },
              topic.level ? h('span', { class: 'tag' }, topic.level) : null,
              h('span', { class: 'tag' }, LA.plural(topic.lessons.length, 'Lektion', 'Lektionen')),
              h('span', { class: 'tag' }, `~${topic.lessons.reduce((a, l) => a + lessonMinutes(l), 0)} min`)),
            topic.intro ? h('div', { class: 'md th-intro', html: LA.md(topic.intro) }) : null)),
        h('section', { class: 'action-grid' },
          action(`#/t/${id}/karten`, 'cards', 'Karteikarten', due ? `${due} fällig · ${fresh} neu` : `${cards.length} Karten · ${fresh} neu`, due || null),
          action(`#/t/${id}/spiele`, 'gamepad', 'Spielhalle', 'Memory, Zuordnen, Blitzrunde'),
          action(`#/t/${id}/test`, 'target', 'Abschlusstest',
            (tState.test ? `Bestwert ${Math.round(tState.test.best * 100)} %` : 'Gemischte Fragen aus allen Lektionen') +
            (favN ? ` · ${LA.plural(favN, 'Favorit', 'Favoriten')}` : '')),
          action(`#/t/${id}/glossar`, 'list', 'Glossar', LA.plural(topic.glossary.length, 'Begriff', 'Begriffe'))),
        h('section', null,
          h('div', { class: 'section-head' }, h('h2', null, 'Lernpfad'),
            h('div', { class: 'btn-row' },
              labN ? h('a', { class: 'btn btn-ghost', href: `#/t/${id}/labs`, title: 'Übungen fürs Terminal – merken und abhaken' }, icon('laptop'), 'Labs',
                labLater ? h('span', { class: 'sc-count' }, labLater) : null) : null,
              prog.done ? h('a', { class: 'btn btn-ghost', href: `#/t/${id}/nachlesen`, title: 'Erklärungen geschaffter Lektionen ohne Quiz' }, icon('book'), 'Nachlesen') : null)),
          path),
        sources),
    };
  };

  /* ---------- Lektion ---------- */
  LA.views.lesson = async ({ id, lessonId, query }) => {
    const topic = await LA.loadTopic(id);
    const lesson = topic.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new Error(`Lektion „${lessonId}“ gibt es in diesem Thema nicht`);
    LA.store.visit(id);
    LA.current = { topic };
    // Vorschau ab einem bestimmten Schritt: #/t/<id>/l/<lesson>?schritt=5 (Ergebnis wird nicht gespeichert)
    const from = Math.max(1, parseInt((query && query.schritt) || '1', 10) || 1);
    const preview = from > 1;

    let player;
    const start = () => {
      if (player) player.destroy();
      player = LA.createPlayer({
        topic,
        steps: lesson.steps.slice(from - 1),
        retryWrong: true,
        onExit: () => LA.router.go(`#/t/${id}`),
        result(sum) {
          if (preview) return { title: 'Vorschau beendet', subtitle: `Gestartet ab Schritt ${from} – das Ergebnis wird nicht gespeichert.`, actions: [{ label: 'Zur Übersicht', primary: true, href: `#/t/${id}` }], noConfetti: true };
          const bonus = 20 + (sum.stars === 3 ? 15 : 0);
          sum.gain(bonus);
          LA.store.lessonResult(id, lesson.id, sum);
          const allDone = topic.lessons.every((l) => (LA.store.topic(id).lessons[l.id] || {}).done);
          if (allDone) LA.store.award('master');
          const nextL = topic.lessons[lesson.index + 1];
          const titles = { 3: 'Hervorragend!', 2: 'Gut gemacht!', 1: 'Geschafft!' };
          return {
            stars: sum.stars,
            title: titles[sum.stars],
            subtitle: `Lektion „${lesson.title}“ abgeschlossen${sum.stars === 3 ? ' – inklusive Perfekt-Bonus.' : '.'}`,
            stats: [
              { label: 'Genauigkeit', value: Math.round(sum.accuracy * 100) + ' %' },
              { label: 'XP', value: '+' + sum.xp },
              { label: 'Zeit', value: LA.formatTime(sum.time) },
            ],
            extra: lesson.recap ? h('div', { class: 'recap card' }, h('div', { class: 'callout-head' }, icon('star'), 'Das Wichtigste'), h('div', { class: 'md', html: LA.md(lesson.recap) })) : null,
            actions: [
              nextL ? { label: 'Nächste Lektion', primary: true, href: `#/t/${id}/l/${nextL.id}` } : { label: 'Zum Abschlusstest', primary: true, href: `#/t/${id}/test` },
              { label: 'Wiederholen', onClick: () => wrap.replaceChildren((start(), player.el)) },
              { label: 'Zur Übersicht', href: `#/t/${id}` },
            ],
          };
        },
      });
      return player;
    };
    const wrap = h('div', { class: 'player-wrap' }, start().el);
    return { el: wrap, focus: true, destroy: () => player && player.destroy() };
  };

  /* ---------- Tests ---------- */

  /** Eine Test-Runde: zieht bei jedem Start neu (Favoriten öfter), zeigt am Ende das Ergebnis.
   *  record(pct) speichert das Ergebnis und liefert { best, newBest } – oder fehlt (nichts speichern). */
  function testRun({ topic, pool, size, back, backLabel, showTopic, record, hint }) {
    let player;
    const start = () => {
      if (player) player.destroy();
      player = LA.createPlayer({
        topic,
        steps: LA.sampleQuestions(pool, size),
        retryWrong: false,
        gradeAll: true,
        showTopic,
        onExit: () => LA.router.go(back),
        result(sum) {
          const pct = sum.accuracy;
          const correct = sum.results.filter((r) => r.correct).length;
          const rec = record ? record(pct) : null;
          sum.gain(Math.round(pct * 30));
          return {
            stars: sum.stars,
            title: pct === 1 ? 'Perfekt! 🏆' : pct >= 0.8 ? 'Sehr stark!' : pct >= 0.6 ? 'Solide Leistung!' : 'Da geht noch was!',
            subtitle: `${correct} von ${size} Fragen komplett richtig.` + (rec && rec.newBest ? ' **Neuer Bestwert!**' : '') + (hint ? ' ' + hint : ''),
            stats: [
              { label: 'Ergebnis', value: Math.round(pct * 100) + ' %' },
              rec ? { label: 'Bestwert', value: Math.round(rec.best * 100) + ' %' } : { label: 'Richtig', value: `${correct} / ${size}` },
              { label: 'XP', value: '+' + sum.xp },
            ],
            actions: [
              { label: backLabel, primary: true, href: back },
              { label: 'Neuer Test', onClick: () => wrap.replaceChildren(start().el) },
            ],
          };
        },
      });
      return player;
    };
    const wrap = h('div', { class: 'player-wrap' }, start().el);
    return { el: wrap, focus: true, destroy: () => player && player.destroy() };
  }

  /* ---------- Abschlusstest eines Themas ---------- */
  LA.views.test = async ({ id }) => {
    const topic = await LA.loadTopic(id);
    LA.current = { topic };
    const pool = LA.questionPool(topic);
    return testRun({
      topic,
      pool,
      size: Math.min(topic.testSize || 10, pool.length),
      back: `#/t/${id}`,
      backLabel: 'Zur Übersicht',
      record(pct) {
        const prev = LA.store.topic(id).test;
        LA.store.testResult(id, pct);
        if (pct === 1) LA.store.award('ace');
        return { best: Math.max(pct, prev ? prev.best : 0), newBest: !!prev && pct > prev.best };
      },
    });
  };

  /* ---------- Reise-Test: Fragen aus allen Stationen einer Lernreise ----------
   * #/r/<reise>/test                 gemischt, Favoriten kommen öfter dran
   * #/r/<reise>/test?nur=favoriten   alle Favoriten, in zufälliger Reihenfolge */
  const SERIES_TEST_SIZE = 15;

  LA.views.seriesTest = async ({ seriesId, query }) => {
    const sr = LA.series.find((s) => s.id === seriesId);
    if (!sr) throw new Error(`Die Lernreise „${seriesId}“ gibt es nicht`);
    const favOnly = query.nur === 'favoriten';
    const topics = await Promise.all(sr.topics.filter((t) => LA.catalogEntry(t)).map((t) => LA.loadTopic(t)));
    let pool = topics.flatMap((t) => LA.questionPool(t));
    if (favOnly) pool = pool.filter((q) => LA.store.isFav(q._topic, q._qid));

    if (!pool.length) {
      return {
        el: h('div', { class: 'page' },
          h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite'),
          h('div', { class: 'card error-card' },
            h('div', { class: 'result-emoji' }, '🤍'),
            h('h2', null, 'Noch keine Favoriten'),
            h('p', null, `Tippe in einer Lektion oder einem Test oben rechts auf das Herz, um eine Frage zu merken. Danach kannst du alle Favoriten aus „${sr.title}“ hier gesammelt testen.`),
            h('a', { class: 'btn btn-primary', href: '#/' }, 'Zur Startseite'))),
      };
    }

    return testRun({
      topic: topics[0],
      pool,
      size: favOnly ? pool.length : Math.min(SERIES_TEST_SIZE, pool.length),
      back: '#/',
      backLabel: 'Zur Startseite',
      showTopic: true,
      hint: favOnly ? 'Sitzt eine Frage inzwischen sicher? Nimm ihr das Herz wieder weg.' : '',
    });
  };

  /* ---------- Glossar ---------- */
  LA.views.glossary = async ({ id }) => {
    const topic = await LA.loadTopic(id);
    const terms = topic.glossary.slice().sort((a, b) => a.term.localeCompare(b.term, 'de'));
    const list = h('div', { class: 'glossary' });
    const render = (q = '') => {
      const ql = q.toLowerCase();
      list.replaceChildren(...terms
        .filter((g) => !ql || (g.term + ' ' + g.def + ' ' + (g.aliases || []).join(' ')).toLowerCase().includes(ql))
        .map((g) => h('div', { class: 'gl-item', id: 'term-' + LA.slug(g.term) },
          h('div', { class: 'gl-term' }, g.term, g.aliases ? h('span', { class: 'muted' }, ' · ' + g.aliases.join(', ')) : null),
          h('div', { class: 'gl-def md', html: LA.md(g.def) }))));
      if (!list.children.length) list.appendChild(h('p', { class: 'muted' }, 'Kein Begriff gefunden.'));
    };
    render();
    return {
      el: h('div', { class: 'page' },
        h('a', { class: 'back-link', href: `#/t/${id}` }, icon('arrowLeft'), topic.title),
        h('div', { class: 'section-head' }, h('h1', null, 'Glossar'),
          h('label', { class: 'search' }, icon('search'), h('input', { type: 'search', placeholder: 'Begriff suchen …', oninput: (e) => render(e.target.value) }))),
        list),
    };
  };

  /* ---------- Nachlesen: Erklärungen geschaffter Lektionen, ohne Quiz ----------
   * #/t/<id>/nachlesen?lektion=<lesson>  springt direkt zu einer Lektion */
  const READ_TYPES = ['explain', 'hotspots'];

  /** Hotspot-Grafik zum Lesen: Nummern fest in der Grafik, alle Erklärungen darunter */
  function readHotspots(step, topic) {
    const base = step.svg
      ? h('div', { class: 'hs-base', html: step.svg })
      : h('img', { class: 'hs-base', src: /^(https?:|data:)/.test(step.image) ? step.image : `topics/${topic.id}/${step.image}`, alt: step.alt || '' });
    return h('div', { class: 'step step-hotspots' },
      step.title ? h('h2', { class: 'step-title', html: LA.mdi(step.title) }) : null,
      step.body ? h('div', { class: 'step-prompt md', html: LA.md(step.body) }) : null,
      h('div', { class: 'hs-wrap' + (step.minWidth ? ' hs-scroll' : '') },
        h('div', { class: 'hs-inner', style: step.minWidth ? { '--hs-min': step.minWidth + 'px' } : null }, base,
          step.spots.map((sp, i) => h('span', { class: 'hs-marker hs-static', style: { left: sp.x + '%', top: sp.y + '%' }, 'aria-hidden': 'true' }, String(i + 1))))),
      step.caption ? h('div', { class: 'fig-caption', html: LA.mdi(step.caption) }) : null,
      h('ol', { class: 'read-spots' }, step.spots.map((sp, i) =>
        h('li', null, h('div', { class: 'hs-title' }, h('span', { class: 'hs-num' }, i + 1), sp.title), h('div', { class: 'md', html: LA.md(sp.text) })))));
  }

  LA.views.reader = async ({ id, query }) => {
    const topic = await LA.loadTopic(id);
    LA.store.visit(id);
    const tState = LA.store.topic(id);
    const isDone = (l) => !!(tState.lessons[l.id] || {}).done;
    const doneN = topic.lessons.filter(isDone).length;
    const ctx = { topic };

    const sections = new Map();
    const body = h('div', { class: 'reader', dataset: { topic: id } });
    let chapter;
    topic.lessons.forEach((l, i) => {
      if (l.chapter && l.chapter !== chapter) {
        chapter = l.chapter;
        body.appendChild(h('div', { class: 'path-chapter' }, l.chapter));
      }
      const head = h('div', { class: 'read-head' }, h('span', { class: 'node-circle' }, isDone(l) ? icon('check') : String(i + 1)), h('h2', null, l.title));
      if (!isDone(l)) {
        body.appendChild(h('section', { class: 'read-lesson locked' }, head,
          h('p', { class: 'muted' }, 'Schaffe die Lektion einmal, dann kannst du ihre Erklärungen hier nachlesen. ',
            h('a', { href: `#/t/${id}/l/${l.id}` }, 'Lektion starten'))));
        return;
      }
      const cards = l.steps.filter((st) => READ_TYPES.includes(st.type)).map((st) => {
        try {
          return h('div', { class: 'read-card card' }, st.type === 'hotspots' ? readHotspots(st, topic) : LA.steps.explain.render(st, ctx).el);
        } catch (e) {
          console.error(e);
          return h('div', { class: 'read-card card fig-error' }, 'Dieser Abschnitt konnte nicht angezeigt werden: ' + e.message);
        }
      });
      const sec = h('section', { class: 'read-lesson' }, head, cards,
        l.recap ? h('div', { class: 'recap card' }, h('div', { class: 'callout-head' }, icon('star'), 'Das Wichtigste'), h('div', { class: 'md', html: LA.md(l.recap) })) : null);
      sections.set(l.id, sec);
      body.appendChild(sec);
    });

    // Inhaltsverzeichnis: Buttons statt #-Links, die würden den Hash-Router auslösen
    const jump = (lid) => sections.get(lid).scrollIntoView({ behavior: 'smooth', block: 'start' });
    const toc = doneN
      ? h('nav', { class: 'read-toc', 'aria-label': 'Lektionen' }, topic.lessons.map((l, i) =>
          isDone(l) ? h('button', { class: 'tag', type: 'button', onclick: () => jump(l.id) }, `${i + 1}. ${l.title}`) : null))
      : null;

    if (query.lektion && sections.has(query.lektion)) requestAnimationFrame(() => sections.get(query.lektion).scrollIntoView({ block: 'start' }));

    return {
      el: h('div', { class: 'page reader-page' },
        h('a', { class: 'back-link', href: `#/t/${id}` }, icon('arrowLeft'), topic.title),
        h('h1', null, 'Nachlesen'),
        h('p', { class: 'muted' }, doneN
          ? `Die Erklärungen und Grafiken aus ${doneN === topic.lessons.length ? 'allen Lektionen' : `${doneN} von ${topic.lessons.length} Lektionen`} – ohne Quiz, zum Auffrischen in Ruhe.`
          : 'Hier erscheinen die Erklärungen jeder Lektion, sobald du sie einmal geschafft hast.'),
        toc,
        body),
    };
  };

  LA.ui.stars = stars;
})();
