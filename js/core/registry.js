/* Katalog, Themen-Lader und Registries für Schritt- und Grafiktypen.
 *
 * topics/catalog.js   → LA.registerCatalog([...])  (Metadaten aller Themen, klein)
 * topics/meta.js      → LA.registerMeta({...})     (erzeugt: Lektionen und Datei-Hashes, für schnellen Start)
 * topics/<id>/topic.js → LA.registerTopic({...})   (Inhalt, wird erst bei Bedarf geladen) */
(function () {
  'use strict';
  const LA = window.LA;

  LA.catalog = [];
  LA.topics = {};
  LA.steps = {};
  LA.figures = {};
  const pending = {};

  LA.registerCatalog = (list) => {
    LA.catalog = list;
  };

  LA.catalogEntry = (id) => LA.catalog.find((t) => t.id === id);

  /** Erzeugte Metadaten (tools/meta.js): { catalog: hash, topics: { id: { h: hash, l: [[lessonId, titel], …] } } } */
  LA.meta = { catalog: null, topics: {} };
  LA.registerMeta = (m) => {
    LA.meta = m && m.topics ? m : { catalog: null, topics: {} };
  };

  /** Lektionen eines Themas als [{ id, title }] – aus dem geladenen Inhalt oder aus topics/meta.js.
   *  null, wenn beides fehlt (dann muss das Thema geladen werden). */
  LA.lessonsOf = (id) => {
    if (LA.topics[id]) return LA.topics[id].lessons;
    const m = LA.meta.topics[id];
    return m ? m.l.map(([lid, title]) => ({ id: lid, title })) : null;
  };

  /** Nächste offene Lektion eines Themas, ohne den Inhalt zu laden: { id, title } oder null */
  LA.nextLessonOf = (id) => {
    const lessons = LA.lessonsOf(id) || [];
    const done = (LA.store.get().topics[id] || {}).lessons || {};
    return lessons.find((l) => !(done[l.id] && done[l.id].done)) || null;
  };

  /** Lernreisen: geordnete Folgen von Themen (topics/catalog.js → LA.registerSeries([...])) */
  LA.series = [];
  LA.registerSeries = (list) => {
    LA.series = list;
  };

  /** Lernreise eines Themas samt Position, Vorgänger und Nachfolger – oder null */
  /** Pastellfläche (CSS-Wert): Lernreisen reihum aus der festen Palette, damit Nachbarn sich unterscheiden;
   *  Themen ohne Reise mischen ihre eigene Farbe mit dem Hintergrund */
  const PASTELS = [5, 3, 1, 4, 6]; // ohne Mint – das bedeutet in der Blockreihe „fertig“
  LA.seriesPastel = (sr) => `var(--p${PASTELS[Math.max(0, LA.series.indexOf(sr)) % PASTELS.length]})`;
  LA.pastelOf = (topicId) => {
    const sr = LA.seriesOf(topicId);
    if (sr) return LA.seriesPastel(sr.series);
    const color = (LA.catalogEntry(topicId) || {}).color;
    return color ? `color-mix(in srgb, ${color} var(--tint-mix), var(--bg))` : 'var(--surface-2)';
  };

  LA.seriesOf = (topicId) => {
    for (const sr of LA.series) {
      const i = sr.topics.indexOf(topicId);
      if (i < 0) continue;
      const entry = (k) => (k >= 0 && k < sr.topics.length ? LA.catalogEntry(sr.topics[k]) || null : null);
      return { series: sr, index: i, prev: entry(i - 1), next: entry(i + 1) };
    }
    return null;
  };

  /** Schritt-Typ registrieren. def = { mode, label, render(step, ctx) → { el, check?, key? } }
   *  mode: 'passive' (nur lesen) · 'check' (Prüfen-Button) · 'game' (meldet sich selbst fertig)
   *        · 'explore' (Weiter jederzeit, Bonus beim vollständigen Erkunden) */
  LA.defineStep = (type, def) => {
    LA.steps[type] = def;
  };

  /** Grafik-Typ registrieren: fn(fig, topic) → Element */
  LA.defineFigure = (type, fn) => {
    LA.figures[type] = fn;
  };

  /* ---------- Laden ---------- */
  LA.loadTopic = (id) => {
    if (LA.topics[id]) return Promise.resolve(LA.topics[id]);
    const meta = LA.catalogEntry(id);
    if (!meta) return Promise.reject(new Error(`Unbekanntes Thema „${id}“`));
    if (pending[id]) return pending[id].promise;
    let resolve, reject;
    const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
    pending[id] = { promise, resolve, reject };
    const path = `topics/${id}/topic.js`;
    const fail = () => {
      delete pending[id];
      reject(new Error(`Datei ${path} konnte nicht geladen werden`));
    };
    if (LA.remote) {
      // Online-Fassung: Inhalt über die GitHub-API aus dem privaten Repo – aus dem Cache, solange der Hash
      // in topics/meta.js passt (js/core/sync.js)
      LA.sync.cachedText(path, (LA.meta.topics[id] || {}).h).then((src) => {
        LA.sync.run(src, path);
        if (pending[id]) fail(); // Skript lief, hat sich aber nicht registriert
      }, fail);
      return promise;
    }
    const script = document.createElement('script');
    script.src = path;
    script.onerror = fail;
    document.head.appendChild(script);
    return promise;
  };

  LA.registerTopic = (def) => {
    const meta = LA.catalogEntry(def.id) || {};
    const topic = normalize({ ...meta, ...def });
    LA.topics[def.id] = topic;
    // Umformulierte Fragen nennen ihre alte Fassung in `was` – der Favorit wandert mit
    [...topic.lessons.flatMap((l) => l.steps), ...topic.exam].forEach((st) =>
      st._qid && [].concat(st.was || []).forEach((old) => LA.store.moveFav(topic.id, LA.questionId({ type: st.type, ...old }), st._qid)));
    LA.store.pruneFavs(topic.id, new Set(LA.favQuestionIds(topic)));
    LA.store.pruneLabs(topic.id, new Set(LA.topicLabs(topic).map((x) => x.step._lab)));
    const ids = (cards) => new Set(cards.map((c) => c.id));
    LA.store.pruneCardEdits(topic.id, ids(LA.topicCards(topic, { hidden: true }).filter((c) => !c.own)));
    LA.store.pruneCards(topic.id, ids(LA.topicCards(topic, { hidden: true })));
    if (pending[def.id]) {
      pending[def.id].resolve(topic);
      delete pending[def.id];
    }
    return topic;
  };

  /** Prüfbare Schritt-Typen: landen im Test und lassen sich als Favorit markieren */
  const TESTABLE = ['quiz', 'truefalse', 'cloze', 'order', 'categorize', 'estimate', 'codebug'];
  /** Offene Fragen (think) und Paar-Spiele (match, memory) lassen sich auch merken – in Tests kommen sie nur als Favorit */
  const FAVABLE = [...TESTABLE, 'think', 'match', 'memory'];
  LA.testOnlyAsFav = (type) => FAVABLE.includes(type) && !TESTABLE.includes(type);

  /** Stabile Fragen-ID aus dem Fragetext – übersteht Umsortieren und geänderte Antwortoptionen.
   *  Paare ohne Aufgabentext erkennt man an ihren linken Begriffen. */
  LA.questionId = (st) =>
    LA.hash(st.type + '|' + (st.question || st.statement || st.text || st.prompt || (st.pairs || []).map((p) => p[0]).join('|')));

  /** Stabile Lab-ID aus dem Kartentitel (Erklärkarten mit `lab: true`) */
  LA.labId = (st) => LA.hash('lab|' + (st.title || st.body));

  /** Alle Labs eines Themas in Lektionsreihenfolge: [{ lesson, step, index }] – index ab 1 (für ?schritt=) */
  LA.topicLabs = (topic) =>
    topic.lessons.flatMap((lesson) => lesson.steps.map((step, i) => ({ lesson, step, index: i + 1 })).filter((x) => x.step._lab));

  // _topic: Herkunft (Reise-Tests mischen Themen) · _qid: Favoriten-Schlüssel · _lab: Schlüssel der Lab-Liste
  function normalize(t) {
    const tag = (st, key) => ({
      ...st, _key: key, _topic: t.id,
      _qid: FAVABLE.includes(st.type) ? LA.questionId(st) : undefined,
      _lab: st.lab && st.type === 'explain' ? LA.labId(st) : undefined,
    });
    t.glossary = t.glossary || [];
    t.lessons = (t.lessons || []).map((l, i) => {
      const lesson = { ...l, id: l.id || LA.slug(l.title) || 'lektion-' + (i + 1), index: i };
      lesson.steps = (l.steps || []).map((st, j) => tag(st, `${lesson.id}#${j}`));
      return lesson;
    });
    t.exam = (t.exam || []).map((st, i) => tag(st, `exam#${i}`));
    return t;
  }

  /* ---------- Abgeleitete Inhalte für Übungsmodi ---------- */

  /** Fragen-Pool für den Abschlusstest: alle prüfbaren Schritte + topic.exam (gleiche Fragen nur einmal),
   *  dazu offene Fragen, die als Favorit markiert sind */
  LA.questionPool = (topic) => {
    const pool = [];
    const seen = new Set();
    const add = (st) => {
      if (!st._qid || seen.has(st._qid)) return;
      if (!TESTABLE.includes(st.type) && !LA.store.isFav(st._topic, st._qid)) return;
      seen.add(st._qid);
      pool.push(st);
    };
    topic.lessons.forEach((l) => l.steps.forEach(add));
    topic.exam.forEach(add);
    return pool;
  };

  /** Alle Fragen-IDs, die sich als Favorit markieren lassen */
  LA.favQuestionIds = (topic) =>
    [...topic.lessons.flatMap((l) => l.steps), ...topic.exam].map((st) => st._qid).filter(Boolean);

  /** Testfragen ziehen: Favoriten haben dreifaches Gewicht. Gewichtete Stichprobe ohne Zurücklegen
   *  (Efraimidis–Spirakis: Schlüssel u^(1/Gewicht), die n größten gewinnen), danach gemischt. */
  LA.FAV_WEIGHT = 3;
  LA.sampleQuestions = (pool, n) => {
    const keyed = pool.map((q) => ({ q, k: Math.random() ** (1 / (LA.store.isFav(q._topic, q._qid) ? LA.FAV_WEIGHT : 1)) }));
    keyed.sort((a, b) => b.k - a.k);
    return LA.shuffle(keyed.slice(0, n).map((x) => x.q));
  };

  /** Karteikarten des Themas: Glossar (ohne card: false, außer schon begonnen) + alle Flashcard-Schritte + topic.cards + eigene Karten,
   *  mit den eigenen Änderungen. Ausgeblendete nur mit opts.hidden (Kartenliste).
   *  _topic: Fortschritt (Leitner-Fach) liegt immer beim Thema – auch im Reise-Stapel */
  LA.topicCards = (topic, opts = {}) => {
    const cards = [];
    const seen = new Set();
    const edits = LA.store.cardEdits(topic.id);
    const add = (front, back, src) => {
      const id = LA.hash(front);
      if (seen.has(id)) return;
      seen.add(id);
      const card = LA.editedCard({ id, front, back, src, _topic: topic.id }, edits[id]);
      if (!card.hidden || opts.hidden) cards.push(card);
    };
    // card: false – außer die Karte hat schon ein Fach: begonnener Lernfortschritt bleibt im Stapel
    topic.glossary.forEach((g) => (g.card !== false || LA.store.cardState(topic.id, LA.hash(g.term))) && add(g.term, g.def, 'Glossar'));
    topic.lessons.forEach((l) => l.steps.forEach((st) => st.type === 'flashcards' && st.cards.forEach((c) => add(c.front, c.back, l.title))));
    (topic.cards || []).forEach((c) => add(c.front, c.back, 'Extra'));
    LA.store.ownCards(topic.id).forEach((c) => cards.push({ id: c.id, front: c.front, back: c.back, src: 'Eigene Karte', own: true, _topic: topic.id }));
    return cards;
  };

  /** Karte aus dem Inhalt mit eigener Fassung: orig hält immer den Inhaltstext */
  LA.editedCard = (card, edit = {}) => ({
    ...card,
    front: edit.front || card.front,
    back: edit.back || card.back,
    orig: { front: card.front, back: card.back },
    edited: !!edit.front,
    hidden: !!edit.hidden,
  });

  /** Karte nach dem Bearbeiten neu aus dem Speicher lesen (Zusatzfelder wie box bleiben) */
  LA.refreshCard = (c) => c.own
    ? { ...c, ...LA.store.ownCards(c._topic).find((x) => x.id === c.id) }
    : LA.editedCard({ ...c, ...c.orig }, LA.store.cardEdits(c._topic)[c.id]);

  /** Kartenstapel über mehrere Themen (Lernreise). Gleiche Vorderseite in mehreren Stationen
   *  → nur einmal: aus der ersten Station, in der die Karte schon ein Fach hat, sonst aus der ersten.
   *  Dieselbe Regel zählt LA.store.dueCount, damit Startseite und Stapel übereinstimmen. */
  LA.seriesCards = (topics, opts) => {
    const byId = new Map();
    topics.forEach((t) => LA.topicCards(t, opts).forEach((c) => {
      const prev = byId.get(c.id);
      if (!prev || (!LA.store.cardState(prev._topic, prev.id) && LA.store.cardState(c._topic, c.id))) byId.set(c.id, c);
    }));
    return [...byId.values()];
  };

  /** Stationen, deren Karten im Reise-Stapel landen – einzelne lassen sich abwählen (bleibt gespeichert) */
  LA.seriesCardTopics = (sr) => {
    const off = (LA.store.setting('cardsOff') || {})[sr.id] || [];
    return sr.topics.filter((id) => LA.catalogEntry(id) && !off.includes(id));
  };

  LA.setSeriesCardTopics = (sr, ids) => {
    const all = { ...(LA.store.setting('cardsOff') || {}) };
    all[sr.id] = sr.topics.filter((id) => !ids.includes(id));
    LA.store.setting('cardsOff', all);
  };

  /** Begriffspaare für Memory & Zuordnen (bevorzugt kurze Definitionen) */
  LA.topicPairs = (topic) => {
    const pairs = topic.glossary.map((g) => [g.term, g.short || g.def]);
    (topic.pairs || []).forEach((p) => pairs.push(p));
    return pairs;
  };

  /** Aussagen für die Blitzrunde: Wahr/Falsch-Schritte, topic.statements und generierte Glossar-Aussagen */
  LA.topicStatements = (topic) => {
    const list = [];
    topic.lessons.forEach((l) => l.steps.forEach((st) => st.type === 'truefalse' && list.push({ text: st.statement, answer: st.answer })));
    (topic.statements || []).forEach((st) => list.push(st));
    const g = topic.glossary.filter((x) => x.short || x.def.length < 90);
    g.forEach((entry, i) => {
      list.push({ text: `**${entry.term}:** ${entry.short || entry.def}`, answer: true });
      if (g.length > 1) {
        const other = g[(i + 1 + Math.floor(Math.random() * (g.length - 1))) % g.length];
        list.push({ text: `**${entry.term}:** ${other.short || other.def}`, answer: false });
      }
    });
    return list;
  };

  LA.findTerm = (topic, term) => {
    if (!topic) return null;
    const key = term.toLowerCase();
    return topic.glossary.find((g) => g.term.toLowerCase() === key || (g.aliases || []).some((a) => a.toLowerCase() === key));
  };

  /** Fortschritt eines Themas in Prozent – geht auch ohne geladenen Inhalt (topics/meta.js, sonst catalog.lessonCount) */
  LA.topicProgress = (id) => {
    const lessons = LA.lessonsOf(id);
    const count = lessons ? lessons.length : (LA.catalogEntry(id) || {}).lessonCount || 0;
    const done = Object.values((LA.store.get().topics[id] || {}).lessons || {}).filter((l) => l.done).length;
    return { done: Math.min(done, count), count, pct: count ? Math.min(1, done / count) : 0 };
  };
})();
