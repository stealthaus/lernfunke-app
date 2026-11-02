/* Fortschritt & Gamification – XP, Level, Streak, Tagesziel, Lektions-Sterne, Karteikarten-Fächer,
 * Bestwerte, Abzeichen. Liegt im localStorage und lässt sich zwischen Geräten abgleichen (js/core/sync.js).
 *
 * Gespeichert wird ein zusammenführbares Dokument (`doc`), aus dem der gewohnte Zustand (`state`)
 * abgeleitet wird. Views lesen nur `LA.store.get()`; geändert wird ausschließlich über die Funktionen hier.
 *  · Zähler (XP, Tages-XP, Statistik, Lektionsdurchläufe) je Gerät: { [gerät]: n } – Wert = Summe,
 *    Zusammenführen = Maximum je Gerät. So geht nichts verloren, wenn auf zwei Geräten gelernt wurde.
 *  · Einzelwerte mit Zeitstempel { v, t } – der neuere gewinnt. Löschen = { v: null, t } (Tombstone),
 *    sonst brächte das andere Gerät den Eintrag beim nächsten Abgleich zurück.
 *  · Bestwerte (Sterne, Rekorde, Blitzrunde) – Maximum bzw. Minimum; Abzeichen – frühestes Datum.
 *  · Epoche { id, t }: Zurücksetzen und Importieren beginnen eine neue; die neuere ersetzt alles.
 * Neues Feld im Zustand ⇒ auch in fresh(), merge(), derive() und fromV1() ergänzen. */
(function () {
  'use strict';
  const LA = window.LA;
  const KEY = 'lernfunke.v2';
  const KEY_V1 = 'lernfunke.v1'; // alter Stand, bleibt als Rückfallebene liegen
  const KEY_DEVICE = 'lernfunke.device';
  const KEY_STALE = 'lernfunke.stale';
  const DEFAULT_SETTINGS = { theme: 'auto', sound: true, roundSize: 20 };
  const KEEP_DAYS = 400;

  const readLS = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  };
  const writeLS = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* privater Modus o. ä. – App funktioniert trotzdem, nur ohne Speichern */
    }
  };

  // Jeder Browser (genauer: jede Origin) zählt als eigenes Gerät
  const device = readLS(KEY_DEVICE) || 'd' + Math.random().toString(36).slice(2, 10);
  writeLS(KEY_DEVICE, device);

  // Zeitstempel streng steigend, damit zwei Änderungen in derselben Millisekunde geordnet bleiben
  let clock = 0;
  const now = () => (clock = Math.max(Date.now(), clock + 1));
  const reg = (v) => ({ v, t: now() });
  const inc = (g, n = 1) => (g[device] = (g[device] || 0) + n);
  const sum = (g) => Object.values(g || {}).reduce((a, n) => a + n, 0);

  /** JSON mit sortierten Schlüsseln – zum Vergleichen zweier Dokumente */
  const canon = (x) =>
    x === null || typeof x !== 'object'
      ? JSON.stringify(x)
      : Array.isArray(x)
        ? '[' + x.map(canon).join(',') + ']'
        : '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const fresh = () => ({
    v: 2,
    epoch: { id: '0', t: 0 }, // fester Anfang: ein neues Gerät verdrängt so keinen vorhandenen Stand
    xp: {},
    days: {}, // 'YYYY-MM-DD' → Zähler
    stats: { lessons: {}, perfect: {}, reviews: {}, games: {}, blitzBest: 0 },
    goal: { v: 50, t: 0 },
    settings: {}, // Schlüssel → { v, t }; fehlt einer, gilt DEFAULT_SETTINGS
    lastTopic: { v: null, t: 0 },
    badges: {},
    topics: {},
  });
  const freshTopic = () => ({ lessons: {}, cards: {}, games: {}, test: null, favs: {}, cardEdits: {}, ownCards: {} });
  /** Fehlende Felder ergänzen (Dokument von einem Gerät mit älterer App-Fassung) */
  const normalize = (d) => {
    const base = fresh();
    return { ...base, ...d, stats: { ...base.stats, ...d.stats } };
  };

  /* ---------- Zusammenführen ---------- */
  const newer = (a, b) => b.t > a.t || (b.t === a.t && b.id > a.id);
  const lww = (a, b) => (b.t > a.t || (b.t === a.t && canon(b.v) > canon(a.v)) ? b : a);
  const maxG = (a, b) => {
    const o = { ...a };
    for (const k in b) o[k] = Math.max(o[k] || 0, b[k]);
    return o;
  };
  const both = (a = {}, b = {}, fn) => {
    const o = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => (o[k] = !(k in a) ? b[k] : !(k in b) ? a[k] : fn(a[k], b[k])));
    return o;
  };
  const maxStr = (a, b) => ((a || '') > (b || '') ? a : b);
  const minStr = (a, b) => (a < b ? a : b);

  function mergeTopic(a, b) {
    return {
      lessons: both(a.lessons, b.lessons, (x, y) => ({
        stars: Math.max(x.stars, y.stars),
        best: Math.max(x.best, y.best),
        at: maxStr(x.at, y.at),
        runs: maxG(x.runs, y.runs),
      })),
      cards: both(a.cards, b.cards, lww),
      games: both(a.games, b.games, (x, y) => ({ v: (x.lo ? Math.min : Math.max)(x.v, y.v), lo: x.lo })),
      test: !a.test ? b.test : !b.test ? a.test : { best: Math.max(a.test.best, b.test.best), last: lww(a.test.last, b.test.last) },
      favs: both(a.favs, b.favs, lww),
      cardEdits: both(a.cardEdits, b.cardEdits, lww),
      ownCards: both(a.ownCards, b.ownCards, lww),
    };
  }

  /** Zwei Dokumente zusammenführen (rein, verändert keins) */
  function merge(a, b) {
    a = normalize(a);
    b = normalize(b);
    if (a.epoch.id !== b.epoch.id) return clone(newer(a.epoch, b.epoch) ? b : a);
    const d = {
      v: 2,
      epoch: a.epoch,
      xp: maxG(a.xp, b.xp),
      days: both(a.days, b.days, maxG),
      stats: {
        lessons: maxG(a.stats.lessons, b.stats.lessons),
        perfect: maxG(a.stats.perfect, b.stats.perfect),
        reviews: maxG(a.stats.reviews, b.stats.reviews),
        games: maxG(a.stats.games, b.stats.games),
        blitzBest: Math.max(a.stats.blitzBest, b.stats.blitzBest),
      },
      goal: lww(a.goal, b.goal),
      settings: both(a.settings, b.settings, lww),
      lastTopic: lww(a.lastTopic, b.lastTopic),
      badges: both(a.badges, b.badges, minStr),
      topics: both(a.topics, b.topics, mergeTopic),
    };
    pruneDays(d);
    return clone(d);
  }

  function pruneDays(d) {
    const keys = Object.keys(d.days).sort();
    while (keys.length > KEEP_DAYS) delete d.days[keys.shift()];
  }

  /* ---------- Abgeleiteter Zustand ----------
   * stale: nur in der Online-Fassung (LA.remote) – dort können die Inhalte älter sein als auf dem Gerät,
   * an dem Claude gerade schreibt. Karten und Favoriten, die es im geladenen Inhalt nicht gibt, werden
   * deshalb nur ausgeblendet und nicht gelöscht. Endgültig aufgeräumt wird lokal (neuester Inhalt). */
  let stale = {};
  try {
    stale = JSON.parse(readLS(KEY_STALE)) || {};
  } catch (e) {}

  function derive(d) {
    const live = (m, skip = []) => {
      const o = {};
      for (const k in m) if (m[k].v != null && !skip.includes(k)) o[k] = m[k].v;
      return o;
    };
    const topics = {};
    for (const id in d.topics) {
      const t = d.topics[id];
      const st = stale[id] || {};
      const lessons = {};
      for (const lid in t.lessons) {
        const l = t.lessons[lid];
        lessons[lid] = { done: true, stars: l.stars, best: l.best, at: l.at, runs: sum(l.runs) };
      }
      const games = {};
      for (const k in t.games) games[k] = t.games[k].v;
      const own = live(t.ownCards);
      topics[id] = {
        lessons,
        cards: live(t.cards, st.cards),
        games,
        test: t.test ? { best: t.test.best, last: t.test.last.v.pct, at: t.test.last.v.at } : null,
        favs: live(t.favs, st.favs),
        cardEdits: live(t.cardEdits),
        ownCards: Object.keys(own).sort().map((cid) => ({ id: cid, ...own[cid] })), // IDs enthalten die Uhrzeit
      };
    }
    const days = {};
    for (const k in d.days) days[k] = sum(d.days[k]);
    return {
      xp: sum(d.xp),
      days,
      goal: d.goal.v,
      topics,
      badges: { ...d.badges },
      stats: {
        lessons: sum(d.stats.lessons),
        perfect: sum(d.stats.perfect),
        reviews: sum(d.stats.reviews),
        games: sum(d.stats.games),
        blitzBest: d.stats.blitzBest,
      },
      settings: { ...DEFAULT_SETTINGS, ...live(d.settings) },
      lastTopic: d.lastTopic.v,
    };
  }

  /* ---------- Alter Stand (v1, auch alte Sicherungsdateien) ---------- */
  const LOWER_IS_BETTER = ['memory', 'zuordnen']; // Züge bzw. Sekunden

  function fromV1(s) {
    const d = fresh();
    const g = (n) => (n ? { [device]: n } : {});
    const r0 = (v) => ({ v, t: 0 }); // Zeitstempel 0: jede echte Änderung gewinnt
    const stats = s.stats || {};
    d.xp = g(s.xp);
    for (const k in s.days || {}) d.days[k] = g(s.days[k]);
    ['lessons', 'perfect', 'reviews', 'games'].forEach((k) => (d.stats[k] = g(stats[k])));
    d.stats.blitzBest = stats.blitzBest || 0;
    d.goal = r0(s.goal || 50);
    for (const k in s.settings || {}) d.settings[k] = r0(s.settings[k]);
    d.lastTopic = r0(s.lastTopic || null);
    d.badges = { ...s.badges };
    for (const id in s.topics || {}) {
      const o = s.topics[id];
      const t = (d.topics[id] = freshTopic());
      for (const lid in o.lessons || {}) {
        const l = o.lessons[lid];
        t.lessons[lid] = { stars: l.stars || 0, best: l.best || 0, at: l.at || '', runs: g(l.runs || 1) };
      }
      for (const k in o.cards || {}) t.cards[k] = r0(o.cards[k]);
      for (const k in o.games || {}) t.games[k] = { v: o.games[k], lo: LOWER_IS_BETTER.includes(k) };
      if (o.test) t.test = { best: o.test.best, last: r0({ pct: o.test.last, at: o.test.at }) };
      for (const k in o.favs || {}) t.favs[k] = r0(o.favs[k]);
      for (const k in o.cardEdits || {}) t.cardEdits[k] = r0(o.cardEdits[k]);
      (o.ownCards || []).forEach((c) => (t.ownCards[c.id] = r0({ front: c.front, back: c.back, at: c.at })));
    }
    return d;
  }

  function load() {
    try {
      const raw = readLS(KEY);
      if (raw) return normalize(JSON.parse(raw));
      const old = readLS(KEY_V1);
      if (old) return fromV1(JSON.parse(old));
    } catch (e) {
      console.warn('Fortschritt konnte nicht geladen werden', e);
    }
    return fresh();
  }

  let doc = load();
  let state = derive(doc);
  const listeners = new Set();

  /** Nach jeder Änderung: speichern, Zustand neu ableiten, Bescheid geben (local: auch an den Sync) */
  function save(local = true) {
    writeLS(KEY, JSON.stringify(doc));
    state = derive(doc);
    listeners.forEach((fn) => fn(state));
    if (local && LA.sync) LA.sync.touched();
  }

  const dt = (id) => doc.topics[id] || (doc.topics[id] = freshTopic());

  /* ---------- Level ---------- */
  // Level n → n+1 braucht 100 + 50·(n−1) XP
  const need = (lvl) => 100 + 50 * (lvl - 1);
  function levelInfo(xp = state.xp) {
    let lvl = 1;
    let rest = xp;
    while (rest >= need(lvl)) rest -= need(lvl++);
    return { level: lvl, into: rest, need: need(lvl), pct: rest / need(lvl) };
  }

  /* ---------- Streak: Tage in Folge mit XP, bis heute oder gestern ---------- */
  function streak() {
    let d = LA.today();
    if (!state.days[d]) d = LA.addDays(d, -1);
    let n = 0;
    while (state.days[d] > 0) (n++, (d = LA.addDays(d, -1)));
    return n;
  }

  /* ---------- XP ---------- */
  function addXP(n) {
    if (!n) return;
    const before = levelInfo().level;
    const t = LA.today();
    const todayBefore = state.days[t] || 0;
    inc(doc.xp, n);
    inc(doc.days[t] || (doc.days[t] = {}), n);
    pruneDays(doc);
    save();
    if (levelInfo().level > before) LA.fx && LA.fx.levelUp(levelInfo().level);
    if (todayBefore < state.goal && state.days[t] >= state.goal) {
      LA.fx && LA.fx.toast('Tagesziel erreicht! 🎯', 'Stark – du hast heute ' + state.goal + ' XP gesammelt.');
      award('goal');
    }
    checkBadges();
  }

  const todayXP = () => state.days[LA.today()] || 0;

  /* ---------- Themen ---------- */
  /** Abgeleiteter Stand eines Themas (nur lesen) */
  function topic(id) {
    return state.topics[id] || (state.topics[id] = { lessons: {}, cards: {}, games: {}, test: null, favs: {}, cardEdits: {}, ownCards: [] });
  }

  function visit(topicId) {
    if (state.lastTopic === topicId) return;
    doc.lastTopic = reg(topicId);
    save();
  }

  /** Speichert ein Lektionsergebnis (nur Verbesserungen überschreiben). */
  function lessonResult(topicId, lessonId, { accuracy, stars }) {
    const t = dt(topicId);
    const prev = t.lessons[lessonId];
    const l = (t.lessons[lessonId] = prev || { stars: 0, best: 0, at: '', runs: {} });
    l.stars = Math.max(l.stars, stars);
    l.best = Math.max(l.best, accuracy);
    l.at = maxStr(l.at, LA.today());
    inc(l.runs);
    inc(doc.stats.lessons);
    if (stars === 3) inc(doc.stats.perfect);
    save();
    checkBadges();
    return !prev;
  }

  /** Bestwert speichern; gibt true zurück, wenn es ein neuer Rekord ist. */
  function best(topicId, key, value, lowerIsBetter) {
    const t = dt(topicId);
    const prev = t.games[key];
    const better = !prev || (lowerIsBetter ? value < prev.v : value > prev.v);
    if (better) t.games[key] = { v: value, lo: !!lowerIsBetter };
    inc(doc.stats.games);
    save();
    return better && !!prev;
  }

  function testResult(topicId, pct) {
    const t = dt(topicId);
    const isBest = !t.test || pct > t.test.best;
    t.test = { best: Math.max(pct, t.test ? t.test.best : 0), last: reg({ pct, at: LA.today() }) };
    save();
    return isBest;
  }

  /* ---------- Favoriten ----------
   * Markierte Fragen (Schlüssel: Inhalts-Hash aus LA.questionId) kommen im Test öfter dran
   * und lassen sich je Lernreise gesammelt testen. */
  const favMap = (topicId) => (state.topics[topicId] || {}).favs || {};
  const isFav = (topicId, qid) => !!favMap(topicId)[qid];

  /** Anzahl Favoriten eines Themas – ohne topicId über alle Themen */
  const favCount = (topicId) =>
    topicId ? Object.keys(favMap(topicId)).length : Object.keys(state.topics).reduce((a, id) => a + favCount(id), 0);

  function toggleFav(topicId, qid) {
    const on = !isFav(topicId, qid);
    dt(topicId).favs[qid] = reg(on ? LA.today() : null);
    save();
    return on;
  }

  /** Favorit auf eine umformulierte Frage übertragen (Schritt-Feld `was` im Inhalt) */
  function moveFav(topicId, fromQid, toQid) {
    const favs = favMap(topicId);
    if (!favs[fromQid] || fromQid === toQid) return;
    const t = dt(topicId);
    if (!favs[toQid]) t.favs[toQid] = reg(favs[fromQid]);
    t.favs[fromQid] = reg(null);
    save();
  }

  /** Online-Fassung: Einträge zu Inhalten, die dieses Gerät (noch) nicht kennt, nur ausblenden */
  function markStale(topicId, kind, ids) {
    const before = canon((stale[topicId] || {})[kind] || []);
    if (before === canon(ids)) return;
    stale[topicId] = { ...stale[topicId], [kind]: ids };
    writeLS(KEY_STALE, JSON.stringify(stale));
    save(false);
  }

  /** Favoriten entfernen, deren Frage es nicht mehr gibt (Fragetext geändert oder gelöscht) */
  function pruneFavs(topicId, validIds) {
    const favs = (doc.topics[topicId] || {}).favs || {};
    const gone = Object.keys(favs).filter((qid) => favs[qid].v != null && !validIds.has(qid));
    if (LA.remote) return markStale(topicId, 'favs', gone);
    if (!gone.length) return;
    gone.forEach((qid) => (favs[qid] = reg(null)));
    save();
  }

  /* ---------- Karteikarten (Leitner) ----------
   * Fach 1–5. Gewusst → ein Fach weiter. Nicht gewusst → zurück in Fach 1.
   * Wiederholungsabstände in Tagen je Fach: */
  const INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

  function cardState(topicId, cardId) {
    return topic(topicId).cards[cardId] || null;
  }

  function reviewCard(topicId, cardId, known) {
    const prev = cardState(topicId, cardId);
    // Neue Karten gelten als Fach 1 – gewusst heißt also mindestens Fach 2
    const box = known ? Math.min(5, (prev ? prev.box : 1) + 1) : 1;
    dt(topicId).cards[cardId] = reg({ box, due: LA.addDays(LA.today(), INTERVALS[box]), n: (prev ? prev.n : 0) + 1 });
    inc(doc.stats.reviews);
    save();
    checkBadges();
    return box;
  }

  /** Fällige Karten mehrerer Themen, ohne deren Inhalte zu laden. Gleiche Karte (gleiche
   *  Vorderseite) in mehreren Themen zählt einmal – mit dem Fach aus dem ersten Thema (wie LA.seriesCards).
   *  Ausgeblendete Karten zählen nicht. */
  function dueCount(topicIds) {
    const seen = new Set();
    let n = 0;
    topicIds.forEach((id) => Object.entries((state.topics[id] || {}).cards || {}).forEach(([cardId, cs]) => {
      if (seen.has(cardId) || (cardEdits(id)[cardId] || {}).hidden) return;
      seen.add(cardId);
      if (cs.due <= LA.today()) n++;
    }));
    return n;
  }

  /** Fächer von Karten entfernen, die es nicht mehr gibt (Vorderseite geändert oder gelöscht) */
  function pruneCards(topicId, validIds) {
    const cards = (doc.topics[topicId] || {}).cards || {};
    const gone = Object.keys(cards).filter((id) => cards[id].v != null && !validIds.has(id));
    if (LA.remote) return markStale(topicId, 'cards', gone);
    if (!gone.length) return;
    gone.forEach((id) => (cards[id] = reg(null)));
    save();
  }

  /* ---------- Eigene Kartentexte ----------
   * cardEdits[cardId] = { front, back, hidden } überschreibt eine Karte aus dem Inhalt. Ihre ID
   * (Hash der Original-Vorderseite) bleibt, das Fach also auch. ownCards: selbst angelegte Karten. */
  const cardEdits = (topicId) => (state.topics[topicId] || {}).cardEdits || {};
  const ownCards = (topicId) => (state.topics[topicId] || {}).ownCards || [];
  const ownId = () => 'own-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** Änderung zusammenführen: Felder mit null/false fallen weg, bleibt nichts übrig → wieder Original */
  function editCard(topicId, cardId, patch) {
    const edit = { ...cardEdits(topicId)[cardId], ...patch };
    Object.keys(edit).forEach((k) => (edit[k] == null || edit[k] === false) && delete edit[k]);
    dt(topicId).cardEdits[cardId] = reg(Object.keys(edit).length ? edit : null);
    save();
  }

  /** Eigene Karte anlegen (ohne id) oder ändern; gibt die id zurück */
  function saveOwnCard(topicId, { id, front, back }) {
    const prev = id && ownCards(topicId).find((c) => c.id === id);
    if (!prev) id = ownId();
    dt(topicId).ownCards[id] = reg({ front, back, at: prev ? prev.at : LA.today() });
    save();
    return id;
  }

  function deleteOwnCard(topicId, cardId) {
    const t = dt(topicId);
    t.ownCards[cardId] = reg(null);
    if (t.cards[cardId]) t.cards[cardId] = reg(null);
    save();
  }

  /** Änderungen an Karten, die es im Inhalt nicht mehr gibt: Selbstgeschriebenes wird zur eigenen
   *  Karte (samt Fach), bloßes Ausblenden fällt weg. Läuft vor pruneCards. Nur lokal (siehe stale). */
  function pruneCardEdits(topicId, validIds) {
    if (LA.remote) return;
    const edits = cardEdits(topicId);
    const gone = Object.keys(edits).filter((id) => !validIds.has(id));
    if (!gone.length) return;
    const t = dt(topicId);
    gone.forEach((id) => {
      const e = edits[id];
      if (e.front) {
        const nid = ownId();
        t.ownCards[nid] = reg({ front: e.front, back: e.back, at: LA.today() });
        const cs = cardState(topicId, id);
        if (cs) t.cards[nid] = reg(cs);
      }
      t.cardEdits[id] = reg(null);
    });
    save();
  }

  /* ---------- Abzeichen ---------- */
  const BADGES = [
    { id: 'first', emoji: '✨', title: 'Erster Funke', desc: 'Erste Lektion abgeschlossen', test: (s) => s.stats.lessons >= 1 },
    { id: 'perfect', emoji: '💎', title: 'Fehlerfrei', desc: 'Eine Lektion mit 3 Sternen', test: (s) => s.stats.perfect >= 1 },
    { id: 'goal', emoji: '🎯', title: 'Zielstrebig', desc: 'Tagesziel erreicht' },
    { id: 'streak3', emoji: '🔥', title: 'Dranbleiber', desc: '3 Tage in Folge gelernt', test: () => streak() >= 3 },
    { id: 'streak7', emoji: '🏅', title: 'Wochenheld', desc: '7 Tage in Folge gelernt', test: () => streak() >= 7 },
    { id: 'level5', emoji: '🚀', title: 'Aufsteiger', desc: 'Level 5 erreicht', test: () => levelInfo().level >= 5 },
    { id: 'level10', emoji: '🌟', title: 'Durchstarter', desc: 'Level 10 erreicht', test: () => levelInfo().level >= 10 },
    { id: 'cards50', emoji: '🃏', title: 'Kartenprofi', desc: '50 Karteikarten wiederholt', test: (s) => s.stats.reviews >= 50 },
    { id: 'blitz', emoji: '⚡', title: 'Blitzmerker', desc: '200 Punkte in der Blitzrunde', test: (s) => s.stats.blitzBest >= 200 },
    { id: 'gamer', emoji: '🎮', title: 'Spielkind', desc: '10 Mini-Spiele gespielt', test: (s) => s.stats.games >= 10 },
    { id: 'master', emoji: '🎓', title: 'Themen-Meister', desc: 'Alle Lektionen eines Themas abgeschlossen' },
    { id: 'ace', emoji: '🏆', title: 'Prüfungsass', desc: '100 % im Abschlusstest' },
  ];

  function award(id) {
    if (state.badges[id]) return false;
    const b = BADGES.find((x) => x.id === id);
    if (!b) return false;
    doc.badges[id] = LA.today();
    save();
    LA.fx && LA.fx.toast(`${b.emoji} Abzeichen: ${b.title}`, b.desc, 'badge');
    return true;
  }

  function checkBadges() {
    for (const b of BADGES) if (b.test && !state.badges[b.id] && b.test(state)) award(b.id);
  }

  function setBlitz(score) {
    if (score > doc.stats.blitzBest) {
      doc.stats.blitzBest = score;
      save();
    }
    checkBadges();
  }

  /* ---------- Einstellungen & Datensicherung ---------- */
  function setting(key, value) {
    if (value === undefined) return state.settings[key];
    doc.settings[key] = reg(value);
    save();
  }

  // Karteikarten pro Lernrunde (Profil und Kartenübersicht)
  const ROUND_SIZES = [10, 20, 30, 50, 100];
  const roundSize = () => (ROUND_SIZES.includes(state.settings.roundSize) ? state.settings.roundSize : 20);

  function setGoal(n) {
    doc.goal = reg(n);
    save();
  }

  const newEpoch = () => ({ id: Math.random().toString(36).slice(2, 10), t: now() });

  const exportJSON = () => JSON.stringify(doc, null, 2);

  /** Sicherung laden – ersetzt den Stand auf allen verbundenen Geräten (neue Epoche) */
  function importJSON(text) {
    const data = JSON.parse(text);
    let next;
    if (data && data.v === 2 && data.epoch) next = normalize(data);
    else if (data && typeof data.xp === 'number') next = fromV1(data);
    else throw new Error('Keine gültige Lernfunke-Sicherung');
    next.epoch = newEpoch();
    doc = next;
    save();
  }

  function reset() {
    const settings = doc.settings;
    doc = fresh();
    doc.epoch = newEpoch();
    doc.settings = settings;
    save();
  }

  /* ---------- Für den Sync ---------- */
  /** Zusammengeführten Stand übernehmen (kommt vom anderen Gerät, löst keinen neuen Sync aus) */
  function applyDoc(next) {
    doc = clone(next);
    save(false);
    checkBadges();
  }

  LA.store = {
    get: () => state,
    on: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    levelInfo, streak, addXP, todayXP, topic, visit, lessonResult, best, testResult,
    isFav, favCount, toggleFav, moveFav, pruneFavs, cardState, reviewCard, dueCount, pruneCards, INTERVALS,
    cardEdits, ownCards, editCard, saveOwnCard, deleteOwnCard, pruneCardEdits,
    BADGES, award, setBlitz, setting, setGoal, ROUND_SIZES, roundSize,
    exportJSON, importJSON, reset,
    doc: () => doc, applyDoc, merge, canon, device,
  };
})();
