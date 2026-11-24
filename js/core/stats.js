/* Statistik: Karteikarten und Lektionen pro Tag, Trends und die Vorschau der fälligen Karten.
 *
 * Nur lesen – alles kommt aus der Tagesaktivität (LA.store.activity, siehe Kopf von store.js) und
 * den Fälligkeiten der Karten. Ältere Tage kennen nur die Summen (reviews, lessons): Fällige Karten
 * und die Aufteilung neu/wiederholt zeichnet die App erst seit dem Tag auf, an dem `due` dazukam
 * (trackStart). Davor sind diese Werte null statt 0, damit kein falscher Trend entsteht.
 *
 * Kartenzahlen gelten für die jetzige Auswahl (LA.cardTopics – ohne archivierte Reisen und abgewählte
 * Stationen), auch rückwirkend: Tage mit Zahlen je Thema ('reviews@thema' …) werden über die zählenden
 * Themen summiert. Ältere Tage kennen nur Tagessummen; sie werden geschätzt (estimated): Aus Fach und
 * Fälligkeit jeder Karte lässt sich rückwärts rechnen, wann sie zuletzt dran war (pünktlich wiederholt
 * angenommen); seit der letzten Wiederholung ist bekannt, ab wann sie fällig war. Der Anteil der zählenden
 * Themen daran skaliert die Tagessumme. */
(function () {
  'use strict';
  const LA = window.LA;

  /** Tage von–bis (beide einschließlich) */
  function daysBetween(from, to) {
    const out = [];
    for (let d = from; d <= to; d = LA.addDays(d, 1)) out.push(d);
    return out;
  }
  /** Die letzten n Tage bis end (einschließlich) */
  const lastDays = (n, end = LA.today()) => daysBetween(LA.addDays(end, 1 - n), end);

  const KEYS = ['reviews', 'rnew', 'rdue', 'rok', 'due'];
  // Ab hier zählt die Tagessumme der fälligen Karten schon nur die damalige Auswahl – nicht mehr skalieren
  const SELECTED_FROM = '2026-11-23';
  const SPAN_MAX = 190; // so weit zurück zählt die Schätzung überfällige Karten

  /** Erster Tag mit Aktivität überhaupt und erster Tag mit aufgezeichneten fälligen Karten,
   *  dazu die zählenden Themen (sel) und die geschätzten Wiederholungen je Tag (chains) */
  function starts() {
    const act = LA.store.get().act;
    const keys = Object.keys(act).sort();
    const sel = new Set(LA.catalog.length ? LA.cardTopics() : Object.keys(LA.store.get().topics));
    return { dataStart: keys[0] || null, trackStart: keys.find((k) => act[k].due != null) || null, sel, chains: chains(sel) };
  }

  /** Wiederholungen einer Karte rückwärts aus Fach und Fälligkeit, pünktliches Wiederholen angenommen:
   *  [{ day, ok, fresh }]. Fach b heißt: die letzten b−1 Wiederholungen waren gewusst. */
  function chainOf(cs) {
    const I = LA.store.INTERVALS;
    let day = LA.addDays(cs.due, -I[cs.box]);
    if (cs.box === 1) return [{ day, ok: 0, fresh: cs.n === 1 }];
    const out = [];
    const k = Math.min(cs.n, cs.box - 1);
    let b = cs.box - 1; // Fach vor dieser Wiederholung
    for (let j = 0; j < k; j++) {
      out.push({ day, ok: 1, fresh: b === 1 && cs.n === cs.box - 1 });
      if (b === 1) break;
      day = LA.addDays(day, -I[b]);
      b--;
    }
    return out;
  }

  /** Geschätzte Wiederholungen je Tag: { [Tag]: { all: {…}, sel: {…} } } – all über alle Themen,
   *  sel über die zählenden. Gleiche Karte zählt einmal (zuerst bei den zählenden Themen). */
  let chainCache = null;
  function chains(sel) {
    const st = LA.store.get();
    const selKey = [...sel].join('|');
    if (chainCache && chainCache.st === st && chainCache.selKey === selKey) return chainCache.map;
    const map = {};
    const today = LA.today();
    const seenAll = new Set();
    const seenSel = new Set();
    const add = (bag, r) => {
      bag.reviews++;
      bag.rok += r.ok;
      if (r.fresh) bag.rnew++;
      else (bag.rdue++, bag.due++);
    };
    const empty = () => ({ reviews: 0, rnew: 0, rdue: 0, rok: 0, due: 0 });
    [...new Set([...sel, ...Object.keys(st.topics)])].forEach((id) => {
      const hidden = LA.store.cardEdits(id);
      Object.entries((st.topics[id] || {}).cards || {}).forEach(([cid, cs]) => {
        if ((hidden[cid] || {}).hidden || !cs || !cs.due) return;
        const inSel = sel.has(id) && !seenSel.has(cid);
        const inAll = !seenAll.has(cid);
        if (!inSel && !inAll) return;
        seenAll.add(cid);
        if (inSel) seenSel.add(cid);
        const at = (d) => map[d] || (map[d] = { all: empty(), sel: empty() });
        chainOf(cs).forEach((r) => {
          const m = at(r.day);
          if (inAll) add(m.all, r);
          if (inSel) add(m.sel, r);
        });
        // Seit der letzten Wiederholung ist der Stand bekannt: ab der Fälligkeit bis heute war sie fällig
        for (let d = cs.due, i = 0; d < today && i < SPAN_MAX; d = LA.addDays(d, 1), i++) {
          const m = at(d);
          if (inAll) m.all.due++;
          if (inSel) m.sel.due++;
        }
      });
    });
    chainCache = { st, selKey, map };
    return map;
  }

  /** Kartenzahlen eines Tages für die jetzige Auswahl: { reviews, rnew, rdue, rok, due, estimated } */
  function selected(d, a, s) {
    const out = {};
    KEYS.forEach((k) => (out[k] = a[k]));
    out.estimated = false;
    let rev = 0;
    let split = false;
    for (const k in a) {
      if (!k.includes('@')) continue;
      split = true;
      if (k.startsWith('reviews@')) rev += a[k];
    }
    if (split && rev === (a.reviews || 0)) {
      // Zahlen je Thema vollständig: nur die zählenden Themen summieren
      KEYS.forEach((k) => {
        if (a[k] == null) return;
        let n = 0;
        s.sel.forEach((id) => (n += a[k + '@' + id] || 0));
        out[k] = n;
      });
      return out;
    }
    const c = d < SELECTED_FROM ? s.chains[d] : null;
    if (!c) return out;
    const ratio = (k) => (c.all[k] ? c.sel[k] / c.all[k] : null);
    const base = ratio('reviews');
    KEYS.forEach((k) => {
      if (a[k] == null) return;
      const r = ratio(k);
      const f = r != null ? r : base != null ? base : 1;
      out[k] = Math.min(a[k], Math.round(a[k] * f));
      if (out[k] !== a[k]) out.estimated = true;
    });
    return out;
  }

  /** Werte eines Tages. tracked = Aufteilung und fällige Karten liegen vor */
  function day(d, s = starts()) {
    const raw = LA.store.activity(d);
    const a = { ...raw, ...selected(d, raw, s) };
    const tracked = !!s.trackStart && d >= s.trackStart;
    const reviews = a.reviews || 0;
    const fresh = tracked ? a.rnew || 0 : null;
    return {
      day: d,
      tracked,
      reviews,
      fresh, // neu gelernt
      repeat: tracked ? reviews - fresh : null, // wiederholt (fällig oder zusätzlich)
      due: a.due != null ? a.due : null, // fällige Karten zu Tagesbeginn
      dueDone: tracked ? a.rdue || 0 : null, // davon wiederholt
      ok: tracked ? a.rok || 0 : null, // gewusst
      lessons: a.lessons || 0,
      lessonsNew: tracked ? a.lnew || 0 : null,
      estimated: a.estimated, // Kartenzahlen geschätzt (Tag ohne Zahlen je Thema, Auswahl weicht ab)
    };
  }

  const sumOf = (list, k) => list.reduce((a, x) => a + (x[k] || 0), 0);
  const mean = (list, k) => {
    const xs = list.filter((x) => x[k] != null);
    return xs.length ? sumOf(xs, k) / xs.length : null;
  };

  /** Kennzahlen eines Zeitraums. Gezählt werden nur Tage ab dem ersten Lerntag (sonst verwässern
   *  die Tage vor dem Start den Schnitt); covered = Anteil des Zeitraums, für den es Daten gibt. */
  function windowStats(days, s) {
    const known = s.dataStart ? days.filter((d) => d >= s.dataStart) : [];
    const list = known.map((d) => day(d, s));
    const tracked = list.filter((x) => x.tracked);
    const dueDays = list.filter((x) => x.due != null);
    const dueSum = sumOf(dueDays, 'due');
    const reviewsTracked = sumOf(tracked, 'reviews');
    return {
      days: list,
      covered: days.length ? known.length / days.length : 0,
      avgReviews: list.length ? sumOf(list, 'reviews') / list.length : null,
      avgDue: mean(dueDays, 'due'),
      avgFresh: tracked.length ? sumOf(tracked, 'fresh') / tracked.length : null,
      avgRepeat: tracked.length ? sumOf(tracked, 'repeat') / tracked.length : null,
      // Anteil der fälligen Karten, die am selben Tag wiederholt wurden
      doneRate: dueSum ? Math.min(1, sumOf(dueDays.filter((x) => x.tracked), 'dueDone') / dueSum) : null,
      okRate: reviewsTracked ? sumOf(tracked, 'ok') / reviewsTracked : null,
      lessons: sumOf(list, 'lessons'),
      lessonsNew: tracked.length ? sumOf(tracked, 'lessonsNew') : null,
      avgLessons: list.length ? sumOf(list, 'lessons') / list.length : null,
      dueDays: dueDays.length,
      estimatedDays: list.filter((x) => x.estimated).length,
    };
  }

  /** Veränderung gegenüber dem Zeitraum davor – null, wenn einer der beiden Werte fehlt */
  function trend(cur, prev) {
    if (cur == null || prev == null) return null;
    return { delta: cur - prev, pct: prev ? (cur - prev) / prev : null };
  }

  /** Zeitraum der letzten n Tage, verglichen mit den n Tagen davor.
   *  Trends gibt es erst, wenn beide Zeiträume mindestens zur Hälfte Daten haben (fällig: je 3 Tage). */
  function summary(n, end = LA.today()) {
    const s = starts();
    const cur = windowStats(lastDays(n, end), s);
    const prev = windowStats(lastDays(n, LA.addDays(end, -n)), s);
    const enough = cur.covered >= 0.5 && prev.covered >= 0.5;
    const enoughDue = cur.dueDays >= 3 && prev.dueDays >= 3;
    return {
      ...cur,
      ...s,
      prev,
      trend: {
        reviews: enough ? trend(cur.avgReviews, prev.avgReviews) : null,
        due: enoughDue ? trend(cur.avgDue, prev.avgDue) : null,
        lessons: enough ? trend(cur.avgLessons, prev.avgLessons) : null,
      },
    };
  }

  /** Tage in Gruppen zu je size Tagen (die jüngste Gruppe endet mit dem letzten Tag) */
  function buckets(list, size) {
    const out = [];
    for (let i = list.length; i > 0; i -= size) out.unshift(list.slice(Math.max(0, i - size), i));
    return out;
  }

  /** Vorschau: wie viele Karten an den nächsten n Tagen fällig werden, wenn nichts wiederholt wird.
   *  Tag 0 = heute samt überfälligen. Gleiche Karte in mehreren Themen zählt einmal (wie dueCount),
   *  ausgeblendete Karten und pausierte Themen (archivierte Lernreisen, LA.cardTopics) zählen nicht. */
  function forecast(n = 14) {
    const today = LA.today();
    const end = LA.addDays(today, n - 1);
    const counts = new Array(n).fill(0);
    const index = new Map(daysBetween(today, end).map((d, i) => [d, i]));
    const topics = LA.store.get().topics;
    const seen = new Set();
    let overdue = 0;
    const counted = LA.catalog.length ? new Set(LA.cardTopics()) : null;
    Object.keys(topics).forEach((id) => {
      if (counted && !counted.has(id)) return;
      const hidden = LA.store.cardEdits(id);
      Object.entries(topics[id].cards || {}).forEach(([cid, cs]) => {
        if (seen.has(cid) || (hidden[cid] || {}).hidden) return;
        seen.add(cid);
        if (cs.due < today) (overdue++, counts[0]++);
        else if (index.has(cs.due)) counts[index.get(cs.due)]++;
      });
    });
    return { days: daysBetween(today, end).map((d, i) => ({ day: d, due: counts[i] })), overdue };
  }

  /* ---------- Waage halten: wie viele Stationen am Tag ----------
   * Rechnet die nächsten 7 Tage durch: alle zählenden Karten (Fach, Fälligkeit) und die neuen Karten, wenn du
   * jeden Tag s Stationen lernst. Jede fällige Karte wird am Tag wiederholt; gewusst (Anteil okRate) → ein Fach
   * weiter, sonst Fach 1. Neue Karten lernst du am selben Tag. Ziel: so viele fällige wie im Schnitt der
   * letzten 7 Tage. Ergebnis als Erwartungswert, keine Vorhersage einzelner Karten. */
  const STATION_STEPS = [0, 0.5, 1, 1.5, 2, 3];
  const HORIZON = 7;

  /** Erwartete fällige Karten je Tag (0 = heute … HORIZON) */
  function simulate(cards, newPerDay, readyNew, ok) {
    const I = LA.store.INTERVALS;
    const mass = Array.from({ length: HORIZON + 1 }, () => [0, 0, 0, 0, 0, 0]); // [Tag][Fach]
    cards.forEach(([t, box]) => (mass[t][box] += 1));
    const put = (t, box, m) => t <= HORIZON && (mass[t][box] += m);
    const learnNew = (t, n) => (put(t + I[2], 2, n * ok), put(t + I[1], 1, n * (1 - ok)));
    const due = [];
    for (let t = 0; t <= HORIZON; t++) {
      due.push(mass[t].reduce((a, x) => a + x, 0));
      for (let b = 1; b <= 5; b++) {
        const m = mass[t][b];
        if (!m) continue;
        const nb = Math.min(5, b + 1);
        put(t + I[nb], nb, m * ok);
        put(t + I[1], 1, m * (1 - ok));
      }
      learnNew(t, newPerDay + (t === 0 ? readyNew : 0));
    }
    return due;
  }

  /** stationIds: die nächsten offenen Stationen der aktiven Lernreise. null ohne Daten.
   *  { target, perStation, ok, options: [{ s, tomorrow, week, avg }], best } */
  function balance(stationIds) {
    const st = LA.store.get();
    const today = LA.today();
    const sel = LA.catalog.length ? LA.cardTopics() : Object.keys(st.topics);
    // neue Karten je Station: Mittel der nächsten (bis zu zwei) Stationen, ohne schon begonnene
    const counts = (stationIds || []).slice(0, 2).map((id) => {
      const k = (LA.meta.topics[id] || {}).k || [];
      const started = (st.topics[id] || {}).cards || {};
      return k.filter((cid) => !started[cid]).length;
    }).filter((n) => n > 0);
    if (!counts.length) return null;
    const perStation = counts.reduce((a, n) => a + n, 0) / counts.length;
    const seen = new Set();
    const cards = [];
    sel.forEach((id) => {
      const hidden = LA.store.cardEdits(id);
      Object.entries((st.topics[id] || {}).cards || {}).forEach(([cid, cs]) => {
        if (seen.has(cid) || (hidden[cid] || {}).hidden || !cs || !cs.due) return;
        seen.add(cid);
        const t = Math.max(0, LA.daysBetween(today, cs.due));
        if (t <= HORIZON) cards.push([t, cs.box]);
      });
    });
    const recent = summary(HORIZON);
    const fc = forecast(1);
    const target = recent.avgDue != null ? recent.avgDue : fc.days[0].due;
    const ok = recent.okRate != null ? Math.min(0.98, Math.max(0.5, recent.okRate)) : 0.85;
    const readyNew = 0; // schon freigeschaltete neue Karten stecken in den Karten der aktuellen Station
    const options = STATION_STEPS.map((s) => {
      const due = simulate(cards, s * perStation, readyNew, ok);
      const rest = due.slice(1);
      return { s, tomorrow: due[1], week: due[HORIZON], avg: rest.reduce((a, x) => a + x, 0) / rest.length };
    });
    const best = options.reduce((a, o) => (Math.abs(o.avg - target) < Math.abs(a.avg - target) ? o : a));
    return { target, perStation, ok, options, best };
  }

  LA.stats = { day, summary, buckets, forecast, lastDays, starts, balance, simulate };
})();
