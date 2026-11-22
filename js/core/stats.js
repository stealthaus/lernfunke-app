/* Statistik: Karteikarten und Lektionen pro Tag, Trends und die Vorschau der fälligen Karten.
 *
 * Nur lesen – alles kommt aus der Tagesaktivität (LA.store.activity, siehe Kopf von store.js) und
 * den Fälligkeiten der Karten. Ältere Tage kennen nur die Summen (reviews, lessons): Fällige Karten
 * und die Aufteilung neu/wiederholt zeichnet die App erst seit dem Tag auf, an dem `due` dazukam
 * (trackStart). Davor sind diese Werte null statt 0, damit kein falscher Trend entsteht. */
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

  /** Erster Tag mit Aktivität überhaupt und erster Tag mit aufgezeichneten fälligen Karten */
  function starts() {
    const act = LA.store.get().act;
    const keys = Object.keys(act).sort();
    return { dataStart: keys[0] || null, trackStart: keys.find((k) => act[k].due != null) || null };
  }

  /** Werte eines Tages. tracked = Aufteilung und fällige Karten liegen vor */
  function day(d, s = starts()) {
    const a = LA.store.activity(d);
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
   *  ausgeblendete Karten zählen nicht. */
  function forecast(n = 14) {
    const today = LA.today();
    const end = LA.addDays(today, n - 1);
    const counts = new Array(n).fill(0);
    const index = new Map(daysBetween(today, end).map((d, i) => [d, i]));
    const topics = LA.store.get().topics;
    const seen = new Set();
    let overdue = 0;
    Object.keys(topics).forEach((id) => {
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

  LA.stats = { day, summary, buckets, forecast, lastDays, starts };
})();
