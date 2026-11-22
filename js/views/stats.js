/* Statistik-Seite: Karteikarten pro Tag (fällig und geschafft), Vorschau der fälligen Karten,
 * Lektionen pro Tag – jeweils mit Trend gegenüber dem Zeitraum davor. Zahlen aus js/core/stats.js. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;
  LA.views = LA.views || {};

  const RANGES = [14, 30, 90];
  const KEY_RANGE = 'lernfunke.statsRange'; // nur Ansicht, je Gerät
  let range = 30;
  try {
    const r = Number(localStorage.getItem(KEY_RANGE));
    if (RANGES.includes(r)) range = r;
  } catch (e) {}

  /* ---------- Zahlen ---------- */
  const de = (x, digits) => x.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  /** Durchschnitt: ab 10 ganzzahlig, darunter eine Nachkommastelle */
  const fmt = (x) => (x == null ? '–' : de(x >= 10 ? Math.round(x) : Math.round(x * 10) / 10, 1));
  const pct = (x) => (x == null ? '–' : Math.round(x * 100) + ' %');
  const dm = (d) => `${+d.slice(8)}.${+d.slice(5, 7)}.`;
  const wd = (d) => new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');

  /** Trend als Pfeil + Wort (nicht nur Farbe): ±5 % gilt als gleich */
  function trendText(t, more = 'mehr', less = 'weniger') {
    if (!t) return 'zu wenig Daten';
    const p = t.pct;
    if (p == null) return t.delta > 0 ? `↑ ${more} als vorher (vorher 0)` : '→ gleich';
    if (Math.abs(p) < 0.05) return '→ etwa gleich';
    return p > 0 ? `↑ ${Math.round(p * 100)} % ${more}` : `↓ ${Math.round(-p * 100)} % ${less}`;
  }

  /** Trend als ganzer Satz für die große Zahl */
  function heroTrend(t, n) {
    const before = `in den ${n} Tagen davor`;
    if (!t) return 'Trend: noch zu wenig Daten';
    if (t.pct == null) return t.delta > 0 ? `↑ mehr als ${before}` : `→ so viele wie ${before}`;
    if (Math.abs(t.pct) < 0.05) return `→ etwa so viele wie ${before}`;
    return t.pct > 0 ? `↑ ${Math.round(t.pct * 100)} % mehr als ${before}` : `↓ ${Math.round(-t.pct * 100)} % weniger als ${before}`;
  }

  /** Runde Obergrenze fürs Diagramm (1, 2, 5 × 10ⁿ) */
  function niceMax(x) {
    if (x <= 1) return 1;
    const p = 10 ** Math.floor(Math.log10(x));
    const f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  /* ---------- Säulendiagramm ----------
   * cols: [{ label, title, segs: [{ v, cls }], tick?, today? }] – Segmente von unten nach oben,
   * tick = Strich (z. B. fällige Karten) über dem Balken. values: Zahl über jedem Balken.
   * whole: nur ganze Zahlen – die Mittellinie bleibt dann ohne Beschriftung, wenn sie keine wäre. */
  function columnChart({ cols, values = false, whole = false, ariaLabel }) {
    const total = (c) => c.segs.reduce((a, s) => a + s.v, 0);
    const max = niceMax(Math.max(1, ...cols.map((c) => Math.max(total(c), c.tick || 0))));
    const at = (v) => (v / max) * 100 + '%';
    const plot = h('div', { class: 'st-plot', style: { '--gap': cols.length > 20 ? '2px' : '6px' } },
      h('span', { class: 'st-grid', style: { bottom: '100%' } }, h('span', null, de(max, 0))),
      h('span', { class: 'st-grid', style: { bottom: '50%' } }, whole && max % 2 ? null : h('span', null, de(max / 2, 1))),
      cols.map((c) => {
        const t = total(c);
        return h('div', { class: 'st-col' + (c.today ? ' today' : ''), title: c.title },
          t ? h('div', { class: 'st-stack', style: { height: at(t) } },
            c.segs.filter((s) => s.v > 0).map((s) => h('div', { class: 'st-seg ' + s.cls, style: { flexGrow: String(s.v) } }))) : null,
          c.tick != null ? h('span', { class: 'st-tick', style: { bottom: at(c.tick) } }) : null,
          values && t ? h('span', { class: 'st-val', style: { bottom: at(t) } }, de(Math.round(t), 0)) : null);
      }));
    const axis = h('div', { class: 'st-axis', style: { '--gap': cols.length > 20 ? '2px' : '6px' } },
      cols.map((c) => h('span', { class: c.today ? 'today' : '' }, c.label || '')));
    return h('div', { class: 'st-chart', role: 'img', 'aria-label': ariaLabel }, plot, axis);
  }

  const swatch = (cls, label) => h('span', { class: 'hm-key' }, h('span', { class: 'st-swatch ' + cls }), label);
  const facts = (rows) => h('dl', { class: 'streak-facts st-facts' },
    rows.filter(Boolean).map(([dt, dd]) => h('div', null, h('dt', null, dt), h('dd', null, dd))));

  /** Tage des Zeitraums als Säulen: bis 30 Tage einzeln, darüber wochenweise */
  function groups(n, s) {
    const size = n > 30 ? 7 : 1;
    const today = LA.today();
    return LA.stats.buckets(LA.stats.lastDays(n), size).map((ds, i, all) => {
      const list = ds.map((d) => LA.stats.day(d, s));
      const back = all.length - 1 - i; // 0 = jüngste Säule
      const every = size > 1 ? 2 : n > 14 ? 7 : 1;
      return {
        list,
        size,
        first: ds[0],
        today: ds.includes(today),
        label: back % every ? '' : size > 1 ? dm(ds[0]) : String(+ds[0].slice(8)),
      };
    });
  }

  /* ---------- Abschnitte ---------- */
  function cardsSection(sum, s, n) {
    const gs = groups(n, s);
    let untracked = false;
    const cols = gs.map((g) => {
      const len = g.list.length;
      const tr = g.list.filter((x) => x.tracked);
      const old = g.list.filter((x) => !x.tracked).reduce((a, x) => a + x.reviews, 0);
      if (old) untracked = true;
      const fresh = tr.reduce((a, x) => a + x.fresh, 0);
      const repeat = tr.reduce((a, x) => a + x.repeat, 0);
      const dues = g.list.filter((x) => x.due != null);
      const tick = dues.length ? dues.reduce((a, x) => a + x.due, 0) / dues.length : null;
      const all = fresh + repeat + old;
      const title = g.size > 1
        ? `Woche ab ${dm(g.first)}: Ø ${fmt(all / len)} Karten pro Tag` + (tick != null ? ` · Ø ${fmt(tick)} fällig` : '')
        : `${wd(g.first)} ${dm(g.first)}: ${LA.plural(all, 'Karte', 'Karten')}` + (tr.length ? ` (${fresh} neu, ${repeat} wiederholt)` : '') + (tick != null ? ` · ${tick} fällig` : '');
      return {
        label: g.label, today: g.today, title, tick,
        segs: [{ v: repeat / len, cls: 'seg-repeat' }, { v: fresh / len, cls: 'seg-new' }, { v: old / len, cls: 'seg-old' }],
      };
    });
    const weekly = n > 30;
    const since = s.trackStart && s.trackStart > LA.stats.lastDays(n)[0] ? s.trackStart : null;
    return h('section', { class: 'card st-card' },
      h('h2', null, 'Karteikarten pro Tag'),
      h('p', { class: 'muted' }, `Balken: Karten, die du geschafft hast – wiederholt und neu gelernt. Strich: so viele waren fällig.${weekly ? ' Je Woche gemittelt.' : ''}`),
      columnChart({
        cols,
        values: cols.length <= 14,
        ariaLabel: `Karteikarten pro Tag, letzte ${n} Tage: im Schnitt ${fmt(sum.avgReviews)} geschafft und ${fmt(sum.avgDue)} fällig.`,
      }),
      h('div', { class: 'hm-legend' },
        swatch('seg-repeat', 'wiederholt'), swatch('seg-new', 'neu gelernt'), untracked ? swatch('seg-old', 'ältere Tage, nur Summe') : null,
        swatch('st-swatch-tick', 'fällig')),
      facts([
        ['Ø fällig pro Tag', fmt(sum.avgDue)],
        ['Ø wiederholt pro Tag', fmt(sum.avgRepeat)],
        ['Ø neu pro Tag', fmt(sum.avgFresh)],
        ['Fällige geschafft', pct(sum.doneRate)],
        ['Gewusst', pct(sum.okRate)],
        ['Fällig – Trend', trendText(sum.trend.due)],
      ]),
      since ? h('p', { class: 'muted st-note' }, `Fällige Karten und die Aufteilung in neu und wiederholt zeichnet die App seit ${dm(since)} auf.`) : null);
  }

  function forecastSection(sum) {
    const fc = LA.stats.forecast(14);
    const ids = LA.catalog.map((t) => t.id);
    const fresh = LA.cardsToday(ids).fresh;
    const cols = fc.days.map((x, i) => ({
      label: String(+x.day.slice(8)),
      today: i === 0,
      title: i === 0 ? `Heute: ${x.due} fällig${fc.overdue ? `, davon ${fc.overdue} überfällig` : ''}` : `${wd(x.day)} ${dm(x.day)}: ${x.due} fällig`,
      segs: i === 0 ? [{ v: fc.overdue, cls: 'seg-over' }, { v: x.due - fc.overdue, cls: 'seg-due' }] : [{ v: x.due, cls: 'seg-due' }],
    }));
    const next7 = fc.days.slice(1, 8).reduce((a, x) => a + x.due, 0);
    // Wächst der Stapel? Was in den nächsten 13 Tagen neu fällig wird vs. was du zuletzt wiederholt hast
    const comingPerDay = fc.days.slice(1).reduce((a, x) => a + x.due, 0) / 13;
    const done = sum.avgRepeat != null ? sum.avgRepeat : sum.avgReviews;
    const verdict = done == null ? null
      : comingPerDay > done * 1.1 ? `Es wird mehr fällig (Ø ${fmt(comingPerDay)} pro Tag), als du zuletzt wiederholt hast (Ø ${fmt(done)}) – der Stapel wächst.`
        : comingPerDay < done * 0.9 ? `Du wiederholst mehr (Ø ${fmt(done)} pro Tag), als fällig wird (Ø ${fmt(comingPerDay)}) – du hast Luft für neue Karten.`
          : `Fällig wird etwa so viel, wie du wiederholst (Ø ${fmt(comingPerDay)} pro Tag) – der Stapel bleibt gleich.`;
    return h('section', { class: 'card st-card' },
      h('h2', null, 'Vorschau: die nächsten 14 Tage'),
      h('p', { class: 'muted' }, 'So viele Karten werden fällig, wenn du nichts wiederholst – berechnet aus den Fächern deiner Karten. Der erste Balken ist heute, samt überfälligen.'),
      verdict ? h('p', { class: 'st-verdict' }, verdict) : null,
      columnChart({ cols, values: true, whole: true, ariaLabel: `Fällige Karten in den nächsten 14 Tagen: heute ${fc.days[0].due}, in den 7 Tagen danach ${next7}.` }),
      h('div', { class: 'hm-legend' }, swatch('seg-due', 'wird fällig'), fc.overdue ? swatch('seg-over', 'überfällig') : null),
      facts([
        ['Heute fällig', fc.overdue ? `${fc.days[0].due} (${fc.overdue} überfällig)` : String(fc.days[0].due)],
        ['Morgen', String(fc.days[1].due)],
        ['Nächste 7 Tage', String(next7)],
        ['Neue Karten bereit', String(fresh)],
      ]));
  }

  function lessonsSection(sum, s, n) {
    const gs = groups(n, s);
    let untracked = false;
    const cols = gs.map((g) => {
      const tr = g.list.filter((x) => x.tracked);
      const old = g.list.filter((x) => !x.tracked).reduce((a, x) => a + x.lessons, 0);
      if (old) untracked = true;
      const fresh = tr.reduce((a, x) => a + x.lessonsNew, 0);
      const repeat = tr.reduce((a, x) => a + x.lessons, 0) - fresh;
      const all = fresh + repeat + old;
      const what = LA.plural(all, 'Lektion', 'Lektionen') + (tr.length && all ? ` (${fresh} neu)` : '');
      return {
        label: g.label, today: g.today,
        title: g.size > 1 ? `Woche ab ${dm(g.first)}: ${what}` : `${wd(g.first)} ${dm(g.first)}: ${what}`,
        segs: [{ v: repeat, cls: 'seg-repeat' }, { v: fresh, cls: 'seg-new' }, { v: old, cls: 'seg-old' }],
      };
    });
    const weekly = n > 30;
    return h('section', { class: 'card st-card' },
      h('h2', null, weekly ? 'Lektionen pro Woche' : 'Lektionen pro Tag'),
      h('p', { class: 'muted' }, 'Abgeschlossene Lektionen – zum ersten Mal oder wiederholt.'),
      columnChart({ cols, values: cols.length <= 14, whole: true, ariaLabel: `Lektionen, letzte ${n} Tage: ${sum.lessons} abgeschlossen.` }),
      h('div', { class: 'hm-legend' },
        swatch('seg-new', 'neue Lektion'), swatch('seg-repeat', 'wiederholt'), untracked ? swatch('seg-old', 'ältere Tage, nur Summe') : null),
      facts([
        ['Abgeschlossen', String(sum.lessons)],
        ['Davon neu', sum.lessonsNew == null ? '–' : String(sum.lessonsNew)],
        ['Ø pro Woche', fmt(sum.avgLessons == null ? null : sum.avgLessons * 7)],
        ['Trend', trendText(sum.trend.lessons)],
      ]));
  }

  LA.views.stats = () => {
    LA.store.recordDue();
    const n = range;
    const sum = LA.stats.summary(n);
    const s = LA.stats.starts();
    const today = LA.cardsToday(LA.catalog.map((t) => t.id));

    const picker = LA.ui.segmented(RANGES.map((r) => [r, `${r} Tage`]), n, (v) => {
      range = v;
      try {
        localStorage.setItem(KEY_RANGE, String(v));
      } catch (e) {}
      LA.router.refresh({ keepScroll: true });
    });
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Zeitraum');

    return {
      el: h('div', { class: 'page stats' },
        h('a', { class: 'back-link', href: '#/profil' }, icon('arrowLeft'), 'Profil'),
        h('section', { class: 'profile-hero' },
          h('h1', { class: 'sr-only' }, 'Statistik'),
          h('div', { class: 'hh-figure', 'aria-hidden': 'true' },
            h('span', { class: 'hh-giant' }, fmt(sum.avgReviews || 0)),
            h('span', { class: 'hh-legend' },
              h('span', { class: 'hh-unit' }, 'Karten pro Tag'),
              h('span', null, `Ø der letzten ${n} Tage`),
              h('span', null, heroTrend(sum.trend.reviews, n)))),
          h('p', { class: 'sr-only' }, `Im Schnitt ${fmt(sum.avgReviews)} Karteikarten pro Tag in den letzten ${n} Tagen. ${heroTrend(sum.trend.reviews, n)}.`),
          h('div', { class: 'st-head' },
            today.open
              ? h('a', { class: 'btn btn-primary', href: '#/karten' }, icon('cards'), today.due ? `${LA.plural(today.due, 'Karte', 'Karten')} fällig – lernen` : `${today.fresh} neue Karten lernen`)
              : h('a', { class: 'btn btn-soft', href: '#/karten' }, icon('cards'), 'Alle Karteikarten'),
            picker)),
        cardsSection(sum, s, n),
        forecastSection(sum),
        lessonsSection(sum, s, n)),
    };
  };
})();
