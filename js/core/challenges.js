/* Spielerische Ziele neben den Lektionen: Wochen-Quests, Tagesfrage, Gedächtnis-Wert.
 *
 * Alles wird aus dem Store abgeleitet. Gespeichert werden nur die Tagesaktivität (LA.store.activity)
 * und abgehakte Quests (LA.store.claimQuest). Auswahl von Quests und Tagesfrage hängt nur vom Datum
 * und vom Lernstand ab – so sehen alle Geräte dieselben Aufgaben. */
(function () {
  'use strict';
  const LA = window.LA;

  /** Zufallszahlen aus einem Text (mulberry32) – gleicher Text, gleiche Folge */
  function seeded(text) {
    let a = parseInt(LA.hash(text), 36) | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

  /** Montag der Woche als 'YYYY-MM-DD' */
  function weekStart(day = LA.today()) {
    const [y, m, d] = day.split('-').map(Number);
    return LA.addDays(day, -((new Date(y, m - 1, d).getDay() + 6) % 7));
  }

  /* ---------- Wochen-Quests ----------
   * Jede Woche drei Quests: immer eine mit Karteikarten (Wiederholen bringt das meiste fürs Behalten),
   * dazu zwei aus verschiedenen Gruppen. Jede bringt QUEST_XP, alle drei zusammen zusätzlich BONUS_XP. */
  const QUEST_XP = 30;
  const BONUS_XP = 50;
  const st = () => LA.store.get();
  const QUESTS = [
    { id: 'reviews', group: 'cards', targets: [20, 30, 40], text: (n) => `Wiederhole ${n} Karteikarten`,
      value: (w) => w.sum('reviews') },
    { id: 'lessons', group: 'lessons', targets: [2, 3], text: (n) => `Schließe ${n} Lektionen ab`,
      value: (w) => w.sum('lessons') },
    { id: 'perfect', group: 'lessons', targets: [1, 2], text: (n) => (n === 1 ? 'Schaffe eine Lektion mit 3 Sternen' : `Schaffe ${n} Lektionen mit 3 Sternen`),
      value: (w) => w.sum('perfect') },
    { id: 'goaldays', group: 'days', targets: [3, 4], text: (n) => `Erreiche an ${n} Tagen dein Tagesziel`,
      value: (w) => w.days.filter((d) => (st().days[d] || 0) >= st().goal).length },
    { id: 'activedays', group: 'days', targets: [5], text: (n) => `Lerne an ${n} Tagen`,
      value: (w) => w.days.filter((d) => st().days[d] > 0).length },
    { id: 'daily', group: 'daily', targets: [3, 4, 5], text: (n) => `Beantworte ${n} Tagesfragen`, needsDaily: true,
      value: (w) => w.days.filter((d) => LA.store.activity(d).dq > 0).length },
    { id: 'blitz', group: 'games', targets: [100, 150], text: (n) => `Hol ${n} Punkte in einer Blitzrunde`,
      value: (w) => Math.max(0, ...w.days.map((d) => LA.store.activity(d).blitz || 0)) },
    { id: 'games', group: 'games', targets: [2, 3], text: (n) => `Spiele ${n} Mini-Spiele`,
      value: (w) => w.sum('games') },
    { id: 'xp', group: 'xp', targets: [250, 350], text: (n) => `Sammle ${n} XP`,
      value: (w) => w.days.reduce((a, d) => a + (st().days[d] || 0), 0) },
  ];

  /** Die Quests dieser Woche mit Stand: { start, daysLeft, list: [{ key, text, target, value, done }], allDone, bonus } */
  function week() {
    const start = weekStart();
    const today = LA.today();
    const days = Array.from({ length: 7 }, (_, i) => LA.addDays(start, i)).filter((d) => d <= today);
    const w = { days, sum: (key) => days.reduce((a, d) => a + (LA.store.activity(d)[key] || 0), 0) };
    const rnd = seeded('quests|' + start);
    // Tagesfragen-Quest nur, wenn es die ganze Woche Tagesfragen gibt (Lektion vor Wochenbeginn geschafft) –
    // hängt nur am gespeicherten Stand, damit sich die Auswahl mitten in der Woche nicht ändert
    const hasDaily = Object.values(st().topics).some((t) => Object.values(t.lessons || {}).some((l) => l.at && l.at < start));
    const cards = QUESTS.filter((q) => q.group === 'cards');
    const chosen = [pick(rnd, cards)];
    let rest = QUESTS.filter((q) => q.group !== 'cards' && (!q.needsDaily || hasDaily));
    while (chosen.length < 3 && rest.length) {
      const q = pick(rnd, rest);
      chosen.push(q);
      rest = rest.filter((x) => x.group !== q.group);
    }
    const list = chosen.map((q) => {
      const target = pick(rnd, q.targets);
      const key = `${start}|${q.id}`;
      const value = q.value(w);
      return { key, id: q.id, text: q.text(target), target, value: Math.min(value, target), done: LA.store.questDone(key), reached: value >= target };
    });
    const bonusKey = `${start}|alle`;
    return {
      start, list, bonusKey, questXP: QUEST_XP, bonusXP: BONUS_XP,
      daysLeft: LA.daysBetween(today, LA.addDays(start, 6)) + 1,
      allDone: list.every((q) => q.done),
      bonus: LA.store.questDone(bonusKey),
    };
  }

  /** Erreichte Quests abhaken und belohnen. Läuft nach jeder Änderung am Fortschritt (verzögert). */
  let checking = false;
  function check() {
    if (checking) return;
    checking = true;
    try {
      const wk = week();
      wk.list.forEach((q) => {
        if (q.reached && !q.done && LA.store.claimQuest(q.key, QUEST_XP)) LA.fx.toast('Quest geschafft', `${q.text} · +${QUEST_XP} XP`, 'badge');
      });
      const after = week();
      if (after.allDone && !after.bonus && LA.store.claimQuest(after.bonusKey, BONUS_XP)) {
        LA.fx.toast('Alle Wochen-Quests geschafft!', `Bonus: +${BONUS_XP} XP`, 'level');
        LA.store.award('quests');
      }
    } finally {
      checking = false;
    }
  }
  let pending = null;
  LA.store.on(() => {
    if (!pending) pending = setTimeout(() => ((pending = null), check()), 0);
  });

  /* ---------- Tagesfrage ----------
   * Eine Frage pro Tag aus einem Thema, das du länger nicht angefasst hast – nur aus Lektionen, die
   * schon vor heute geschafft waren (so bleibt die Wahl den ganzen Tag gleich). Richtig: doppelte XP. */
  const DAILY_BONUS = 10; // zusätzlich zu den 10 XP für eine richtige Antwort

  /** Lektionen eines Themas, die vor heute abgeschlossen wurden: { lessonId: at } */
  function doneBefore(topicId, today) {
    const lessons = (st().topics[topicId] || {}).lessons || {};
    const o = {};
    for (const lid in lessons) if (lessons[lid].done && lessons[lid].at && lessons[lid].at < today) o[lid] = lessons[lid].at;
    return o;
  }

  /** Lernreisen, die der Nutzer von der Tagesfrage ausgenommen hat (Einstellung dailySkip: Reise-IDs) */
  const dailySkipped = (topicId) => {
    const skip = LA.store.setting('dailySkip') || [];
    return skip.length > 0 && LA.series.some((sr) => skip.includes(sr.id) && sr.topics.includes(topicId));
  };

  /** Thema der heutigen Tagesfrage – oder null, wenn noch keine Lektion (vor heute) geschafft ist
   *  bzw. alle Themen mit geschafften Lektionen in ausgenommenen Lernreisen liegen */
  function dailyTopicId() {
    const today = LA.today();
    const cands = LA.catalog
      .filter((t) => !dailySkipped(t.id))
      .map((t) => {
        const done = doneBefore(t.id, today);
        const ats = Object.values(done);
        return ats.length ? { id: t.id, last: ats.sort().pop() } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0)); // am längsten nicht angefasst zuerst
    if (!cands.length) return null;
    return pick(seeded('daily|' + today), cands.slice(0, 3)).id;
  }

  /** Stand der Tagesfrage: { topicId, answered, correct, bonus } */
  function daily() {
    const dq = LA.store.activity(LA.today()).dq || 0;
    return { topicId: dailyTopicId(), answered: dq > 0, correct: dq === 2, bonus: DAILY_BONUS };
  }

  /** Die Frage selbst (lädt das Thema): Schritt oder null */
  async function dailyQuestion() {
    const id = dailyTopicId();
    if (!id) return null;
    const topic = await LA.loadTopic(id);
    const today = LA.today();
    const done = doneBefore(id, today);
    const pool = topic.lessons
      .filter((l) => done[l.id])
      .flatMap((l) => l.steps)
      .filter((s) => LA.isTestable(s.type));
    if (!pool.length) return null;
    return { topic, step: pick(seeded('dq|' + today + '|' + id), pool) };
  }

  /* ---------- Gedächtnis-Wert ----------
   * Wie weit die Karten eines Themas im Karteikasten sind: Fach 1 (oder nie geübt) = 0 %, Fach 5 = 100 %,
   * dazwischen linear. Karten, die länger als ihr eigener Abstand überfällig sind, zählen ein Fach weniger –
   * der Wert sinkt also, wenn du nicht wiederholst. Kartenzahl aus dem geladenen Thema, sonst topics/meta.js. */
  function memoryOf(topicId) {
    const ts = st().topics[topicId];
    const loaded = LA.topics[topicId];
    const metaCount = (LA.meta.topics[topicId] || {}).c;
    if (!ts || (!loaded && metaCount == null)) return null;
    const today = LA.today();
    const hidden = new Set(Object.keys(ts.cardEdits || {}).filter((k) => ts.cardEdits[k].hidden));
    const total = loaded ? LA.topicCards(loaded).length : metaCount + (ts.ownCards || []).length - hidden.size;
    let score = 0;
    let started = 0;
    for (const [cid, cs] of Object.entries(ts.cards || {})) {
      if (hidden.has(cid)) continue;
      started++;
      let box = cs.box;
      if (LA.daysBetween(cs.due, today) > LA.store.INTERVALS[box]) box = Math.max(1, box - 1);
      score += (box - 1) / 4;
    }
    if (!started || total <= 0) return { pct: 0, total: Math.max(total, 0), started, score: 0 };
    return { pct: Math.min(1, score / Math.max(total, started)), total: Math.max(total, started), started, score };
  }

  /** Über alle Themen mit begonnenen Karten: { pct, topics: [{ id, pct, … }] } (schwächste zuerst) */
  function memoryAll() {
    const topics = LA.catalog.map((t) => ({ id: t.id, ...memoryOf(t.id) })).filter((x) => x.started);
    const total = topics.reduce((a, x) => a + x.total, 0);
    const score = topics.reduce((a, x) => a + x.score, 0);
    topics.sort((a, b) => a.pct - b.pct);
    return { pct: total ? score / total : 0, topics };
  }

  LA.challenges = { weekStart, week, check, daily, dailyQuestion, memoryOf, memoryAll };
})();
