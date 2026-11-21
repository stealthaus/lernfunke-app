/* Startseite (Themenübersicht) und Profil (Statistik, Abzeichen, Einstellungen). */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;
  LA.views = LA.views || {};

  /** Umschalter mit festen Werten: options = [[wert, label, extraKlasse?], …] */
  LA.ui.segmented = (options, current, onPick) => {
    const wrap = h('div', { class: 'segmented' });
    options.forEach(([val, label, cls]) => {
      const b = h('button', { type: 'button', class: [cls, val === current ? 'on' : ''].filter(Boolean).join(' '), 'aria-pressed': String(val === current) }, label);
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => (x.classList.toggle('on', x === b), x.setAttribute('aria-pressed', String(x === b))));
        onPick(val);
      });
      wrap.appendChild(b);
    });
    return wrap;
  };

  /** Rundengröße der Karteikarten – die 100 ist die Extremstufe und hebt sich ab */
  LA.ui.roundSizePicker = (onPick) => LA.ui.segmented(
    LA.store.ROUND_SIZES.map((n) => (n >= 100 ? [n, h('span', null, String(n), ' ', LA.glyph('flame')), 'seg-hot'] : [n, String(n)])), LA.store.roundSize(), onPick);

  /** Fortschrittsring als SVG */
  LA.ui.ring = (pct, size = 56, stroke = 6, label) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const ring = h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } });
    ring.innerHTML = `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - LA.clamp(pct, 0, 1))}"/></svg>`;
    if (label != null) ring.appendChild(h('div', { class: 'ring-label' }, label));
    return ring;
  };

  /** Nächste empfohlene Lektion eines (geladenen) Themas */
  LA.nextLesson = (topic) => {
    const done = (LA.store.get().topics[topic.id] || {}).lessons || {};
    return topic.lessons.find((l) => !(done[l.id] && done[l.id].done)) || null;
  };

  /** Joker-Angebot: gestern nicht gelernt, ein Klick hält die Serie. Ohne Angebot null. */
  function jokerOffer() {
    const si = LA.store.streakInfo();
    const o = si.offer;
    if (!o) return null;
    const n = o.gap.length;
    const since = new Date(o.gap[0] + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    return h('div', { class: 'joker-offer', role: 'group', 'aria-label': 'Joker einsetzen' },
      icon('shield'),
      h('p', null,
        h('strong', null, n === 1 ? 'Gestern nicht gelernt.' : `Seit dem ${since} nicht gelernt.`),
        ` Mit ${n === 1 ? 'einem Joker' : n + ' Jokern'} hältst du deine Serie von ${LA.plural(o.saves, 'Tag', 'Tagen')}. Diesen Monat hast du noch ${si.left} von ${si.perMonth}.`),
      h('button', {
        class: 'btn btn-ghost', type: 'button',
        onclick: () => {
          if (!LA.store.useJoker()) return;
          const after = LA.store.streakInfo();
          LA.fx.toast('Joker eingesetzt', `Deine Serie hält: ${LA.plural(after.days, 'Tag', 'Tage')}. Diesen Monat noch ${after.left} übrig.`);
          LA.router.refresh();
        },
      }, n === 1 ? 'Joker einsetzen' : `${n} Joker einsetzen`));
  }

  /** Kopf der Startseite im Fahrplan-Stil: Datum, XP von heute als große Zahl, darunter die Hauptaktion */
  function hero(continueRow) {
    const st = LA.store.get();
    const lvl = LA.store.levelInfo();
    const si = LA.store.streakInfo();
    const streak = si.days;
    const todayXP = LA.store.todayXP();
    const reached = todayXP >= st.goal;
    const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    return h('section', { class: 'home-hero' },
      h('h1', { class: 'sr-only' }, 'Lernfunke – Startseite'),
      h('div', { class: 'hh-line' },
        h('span', null, date),
        h('a', { href: '#/profil' }, `Level ${lvl.level}`)),
      h('a', { class: 'hh-figure', href: '#/profil', 'aria-label': `Heute ${todayXP} von ${st.goal} XP, ${LA.plural(streak, 'Tag', 'Tage')} in Folge, ${si.left} Joker übrig. Statistik und Abzeichen öffnen` },
        h('span', { class: 'hh-giant', 'aria-hidden': 'true' }, String(todayXP)),
        h('span', { class: 'hh-legend', 'aria-hidden': 'true' },
          h('span', { class: 'hh-unit' }, 'XP heute'),
          h('span', null, reached ? '✓ Tagesziel geschafft' : `Ziel ${st.goal} · noch ${st.goal - todayXP}`),
          h('span', null, streak ? `${LA.plural(streak, 'Tag', 'Tage')} in Folge · ${si.left} Joker` : 'Serie: heute starten'),
          h('span', null, `${lvl.into} / ${lvl.need} XP bis Level ${lvl.level + 1}`))),
      h('div', { class: 'mini-bar hh-bar', role: 'progressbar', 'aria-label': 'Tagesziel', 'aria-valuenow': String(Math.min(todayXP, st.goal)), 'aria-valuemax': String(st.goal) },
        h('div', { style: { width: Math.min(1, todayXP / st.goal) * 100 + '%' } })),
      continueRow);
  }

  /** Tagesfrage und Wochen-Quests als Fahrplan-Liste unter dem Kopf – geschafft = Mint mit ✓ */
  function challengesSection() {
    const dq = LA.challenges.daily();
    const wk = LA.challenges.week();
    const topic = dq.topicId && LA.catalogEntry(dq.topicId);
    // offen: Wiederholungen (zuerst) und/oder die neue Frage – je richtige Antwort 10 XP + Bonus
    const open = dq.retries + (dq.newAnswered || !topic ? 0 : 1);
    const sub = dq.answered
      ? `${dq.correct ? 'Richtig beantwortet' : 'Beantwortet'} – morgen gibt es die nächste.`
      : dq.retries
        ? `${dq.retries > 1 ? `${dq.retries} Fragen von neulich kommen` : 'Die Frage von neulich kommt'} noch einmal${dq.newAnswered || !topic ? '' : ` – danach eine neue aus „${topic.title}“`}.`
        : topic ? `Aus „${topic.title}“ – eine Frage aus einer Lektion, die schon etwas zurückliegt.` : '';
    const daily = topic || dq.retries
      ? h(dq.answered ? 'div' : 'a', { class: 'ch-row ch-daily' + (dq.answered ? ' done' : ''), href: dq.answered ? null : '#/tagesfrage' },
        h('span', { class: 'ch-num' }, icon(dq.answered ? 'check' : dq.retries ? 'refresh' : 'bulb')),
        h('span', { class: 'ch-text' },
          h('strong', null, dq.retries && !dq.answered ? 'Tagesfrage · Wiederholung' : 'Tagesfrage'),
          h('span', { class: 'ch-sub' }, sub)),
        h('span', { class: 'ch-state' }, dq.answered ? 'Erledigt' : `+${open * (10 + dq.bonus)} XP`, dq.answered ? null : icon('arrowRight')))
      : null;
    const quests = wk.list.map((q, i) => {
      const done = q.done || q.reached;
      return h('li', { class: 'ch-row' + (done ? ' done' : '') },
        h('span', { class: 'ch-num' }, done ? icon('check') : String(i + 1).padStart(2, '0')),
        h('span', { class: 'ch-text' },
          h('strong', null, q.text),
          h('span', { class: 'ch-meta' },
            h('span', { class: 'mini-bar', role: 'progressbar', 'aria-label': q.text, 'aria-valuenow': String(q.value), 'aria-valuemax': String(q.target) },
              h('div', { style: { width: (q.value / q.target) * 100 + '%' } })),
            `${q.value} / ${q.target}`)),
        h('span', { class: 'ch-state' }, done ? 'Geschafft' : `+${wk.questXP} XP`));
    });
    const allDone = wk.list.every((q) => q.done || q.reached);
    // Sync-Token läuft bald ab: erinnern, bevor der Abgleich (am iPhone: die ganze App) ausfällt
    const exp = LA.sync && LA.sync.tokenExpiry();
    const tokenRow = exp && exp.warn
      ? h('a', { class: 'ch-row ch-token', href: '#/profil' },
        h('span', { class: 'ch-num' }, icon('alert')),
        h('span', { class: 'ch-text' },
          h('strong', null, LA.sync.expiryText(exp)),
          h('span', { class: 'ch-sub' }, exp.daysLeft < 0
            ? 'Der Abgleich klappt nicht mehr. Leg auf GitHub einen neuen Token an und trag ihn im Profil ein.'
            : 'Leg auf GitHub einen neuen Token an und trag ihn im Profil ein – auf jedem Gerät.')),
        h('span', { class: 'ch-state' }, 'Profil', icon('arrowRight')))
      : null;
    return h('section', { class: 'challenges' },
      h('div', { class: 'section-head' }, h('h2', null, 'Heute & diese Woche')),
      tokenRow,
      daily,
      h('div', { class: 'ch-kicker' },
        h('strong', null, 'Wochen-Quests'),
        h('span', null, allDone ? `alle geschafft · +${wk.bonusXP} XP Bonus` : `noch ${LA.plural(wk.daysLeft, 'Tag', 'Tage')} · alle drei: +${wk.bonusXP} XP Bonus`)),
      h('ol', { class: 'ch-list' }, quests));
  }

  function topicCard(t) {
    const p = LA.topicProgress(t.id);
    const sr = LA.seriesOf(t.id);
    return h('a', { class: 'topic-card', href: `#/t/${t.id}`, style: { '--pastel': LA.pastelOf(t.id) } },
      h('div', { class: 'tc-band' },
        h('span', { class: 'tc-icon' }, LA.glyph(t.icon || 'book')),
        p.pct === 1 ? h('span', { class: 'tc-done' }, icon('check'), 'Fertig') : null,
        sr ? h('span', { class: 'tc-series', title: sr.series.title }, icon('route'), `Station ${sr.index + 1}`) : null),
      h('div', { class: 'tc-body' },
        h('h3', null, t.title),
        t.subtitle ? h('p', { class: 'muted' }, t.subtitle) : null,
        h('div', { class: 'tc-tags' }, [t.level, ...(t.tags || [])].filter(Boolean).map((x) => h('span', { class: 'tag' }, x))),
        h('div', { class: 'tc-progress' },
          h('div', { class: 'mini-bar' }, h('div', { style: { width: p.pct * 100 + '%' } })),
          h('span', { class: 'muted' }, `${p.done} / ${p.count} Lektionen`))));
  }

  /* Lernreisen auf- und zuklappen bzw. archivieren – beides bleibt in den Einstellungen gespeichert */
  const archivedSeries = () => LA.store.setting('seriesArchived') || [];
  const isArchived = (sr) => archivedSeries().includes(sr.id);
  function setArchived(sr, on) {
    LA.store.setting('seriesArchived', on ? [...archivedSeries(), sr.id] : archivedSeries().filter((x) => x !== sr.id));
  }
  /* Lernreisen von der Tagesfrage ausnehmen (Einstellung dailySkip, wird in LA.challenges ausgewertet) */
  const dailySkip = () => LA.store.setting('dailySkip') || [];
  const inDaily = (sr) => !dailySkip().includes(sr.id);
  function setInDaily(sr, on) {
    LA.store.setting('dailySkip', on ? dailySkip().filter((x) => x !== sr.id) : [...dailySkip(), sr.id]);
  }
  /** Ohne eigene Wahl ist nur die Reise offen, in der du zuletzt gelernt hast */
  function isOpen(sr) {
    const saved = (LA.store.setting('seriesOpen') || {})[sr.id];
    if (saved != null) return saved;
    const cur = LA.seriesOf(LA.store.get().lastTopic);
    return !isArchived(sr) && !!cur && cur.series.id === sr.id;
  }
  function setOpen(sr, on) {
    LA.store.setting('seriesOpen', { ...(LA.store.setting('seriesOpen') || {}), [sr.id]: on });
  }

  /** Stationen als Blockreihe: Mint füllt sich mit den Lektionen, fertige tragen ✓, die nächste hat eine rote Kante */
  function stationStrip(stations, progs, nextIdx) {
    const doneN = progs.filter((p) => p.pct === 1).length;
    return h('ol', { class: 'sc-strip', 'aria-label': `${doneN} von ${stations.length} Stationen fertig` },
      stations.map((t, i) => {
        const p = progs[i];
        const state = p.pct === 1 ? ' done' : i === nextIdx ? ' next' : p.done ? ' started' : '';
        return h('li', { class: 'sc-block' + state },
          h('a', { href: `#/t/${t.id}`, title: t.title, 'aria-label': `Station ${i + 1}: ${t.title}, ${p.done} von ${p.count} Lektionen` },
            h('span', { class: 'sb-fill', style: { height: p.pct * 100 + '%' } }),
            h('span', { class: 'sb-num' }, p.pct === 1 ? '✓' : String(i + 1).padStart(2, '0'))));
      }));
  }

  /** Lernreise: Themen als nummerierte Stationen, die nächste offene ist hervorgehoben.
   *  Zugeklappt bleibt nur die Kopfzeile mit der nächsten Station. onArchive: Reise wurde (ent)archiviert,
   *  onDaily: Reise wurde in die Tagesfrage aufgenommen oder aus ihr genommen */
  function seriesCard(sr, onArchive, onDaily) {
    const stations = sr.topics.map((id) => LA.catalogEntry(id)).filter(Boolean);
    const progs = stations.map((t) => LA.topicProgress(t.id));
    const done = progs.reduce((a, p) => a + p.done, 0);
    const total = progs.reduce((a, p) => a + p.count, 0);
    const nextIdx = progs.findIndex((p) => p.pct < 1);
    const pct = total ? done / total : 0;
    const favN = stations.reduce((a, t) => a + LA.store.favCount(t.id), 0);
    const labN = stations.reduce((a, t) => a + LA.store.labCount(t.id), 0);
    const today = LA.cardsToday(LA.seriesCardTopics(sr));
    const cardsLabel = today.size
      ? `Karteikarten: ${today.size} für heute (${today.dueNow} fällig, ${today.newNow} neu)`
      : 'Karteikarten: alles erledigt für heute';
    const archived = isArchived(sr);
    const next = stations[nextIdx];

    const toggle = h('button', { class: 'icon-btn sc-toggle', type: 'button', 'aria-label': 'Stationen ein- und ausblenden' }, icon('down'));
    const card = h('div', { class: 'series-card', style: { '--pastel': LA.seriesPastel(sr) } });
    const setState = (on) => {
      card.classList.toggle('open', on);
      toggle.setAttribute('aria-expanded', String(on));
    };
    const flip = () => {
      const on = !card.classList.contains('open');
      setState(on);
      setOpen(sr, on);
    };
    toggle.addEventListener('click', (e) => (e.stopPropagation(), flip()));
    setState(isOpen(sr));

    // Kurzinfo für die zugeklappte Reise: nächste Station und Karten für heute (fällige + neue, wie „Lernen starten“)
    const peek = h('div', { class: 'sc-peek' },
      next
        ? h('a', { class: 'sc-next', href: `#/t/${next.id}` }, `${progs[nextIdx].done ? 'Weiter' : 'Nächste Station'}: `, h('strong', null, `${nextIdx + 1}. ${next.title}`), icon('arrowRight'))
        : h('span', { class: 'sc-next' }, icon('check'), 'Alle Stationen geschafft'),
      h('a', { class: 'sc-cards' + (today.size ? ' has-due' : ''), href: `#/r/${sr.id}/karten`, 'aria-label': cardsLabel }, icon('cards'),
        h('span', { class: 'sc-cards-n', 'aria-hidden': 'true' }, today.size ? String(today.size) : icon('check'))),
      labN ? h('a', { class: 'sc-count sc-lab', href: `#/r/${sr.id}/labs`, title: 'Gemerkte Labs für den Rechner' }, icon('laptop'), `${labN} Lab${labN === 1 ? '' : 's'}`) : null);

    const head = h('div', { class: 'sc-head' },
      h('div', { class: 'sc-body' },
        h('div', { class: 'sc-kicker' }, icon('route'), `Lernreise · ${LA.plural(stations.length, 'Station', 'Stationen')}`, h('span', { class: 'sc-lessons' }, ` · ${LA.plural(total, 'Lektion', 'Lektionen')}`)),
        h('h3', null, sr.title),
        sr.subtitle ? h('p', { class: 'muted sc-sub' }, sr.subtitle) : null,
        peek),
      h('div', { class: 'sc-pct', 'aria-label': `${Math.round(pct * 100)} Prozent geschafft` }, String(Math.round(pct * 100)), h('span', null, '%')),
      toggle,
      stationStrip(stations, progs, nextIdx));
    // Klick auf die Kopfzeile klappt auf – außer auf Links darin
    head.addEventListener('click', (e) => !e.target.closest('a') && flip());

    const archiveBtn = h('button', { class: 'btn btn-ghost sc-archive', type: 'button' }, icon('archive'), archived ? 'Zurückholen' : 'Archivieren');
    archiveBtn.addEventListener('click', () => {
      setArchived(sr, !archived);
      if (!archived) setOpen(sr, false);
      LA.fx.toast(archived ? 'Lernreise zurückgeholt' : 'Lernreise archiviert', archived ? sr.title : 'Fortschritt und Karteikarten bleiben erhalten – du findest sie im Tab „Archiv“.');
      onArchive();
    });

    // Schalter mit Text (an/aus), nicht nur per Farbe; aria-pressed für Screenreader
    const dailyBtn = h('button', { class: 'btn btn-ghost sc-daily', type: 'button', title: 'Soll die Tagesfrage auch aus dieser Lernreise kommen?' });
    const paintDaily = () => {
      const on = inDaily(sr);
      dailyBtn.setAttribute('aria-pressed', String(on));
      dailyBtn.replaceChildren(icon(on ? 'bulb' : 'eyeOff'), on ? 'Tagesfrage: an' : 'Tagesfrage: aus');
    };
    paintDaily();
    dailyBtn.addEventListener('click', () => {
      const on = !inDaily(sr);
      setInDaily(sr, on);
      paintDaily();
      LA.fx.toast(on ? 'Wieder in der Tagesfrage' : 'Aus der Tagesfrage genommen', on ? sr.title : 'Karteikarten, Tests und Quests bleiben, nur die Tagesfrage kommt nicht mehr aus dieser Reise.');
      onDaily();
    });

    card.append(head, h('div', { class: 'sc-detail' },
      h('ol', { class: 'sc-stations' }, stations.map((t, i) => {
        const p = progs[i];
        const state = p.pct === 1 ? ' done' : i === nextIdx ? ' next' : '';
        return h('li', { class: 'sc-station' + state },
          h('a', { href: `#/t/${t.id}` },
            h('span', { class: 'sc-num' }, String(i + 1).padStart(2, '0')),
            h('span', { class: 'sc-text' },
              h('span', { class: 'sc-title' }, t.title),
              h('span', { class: 'sc-meta' },
                h('span', { class: 'mini-bar' }, h('div', { style: { width: p.pct * 100 + '%' } })),
                `${p.done}/${p.count}`)),
            h('span', { class: 'sc-state' },
              p.pct === 1 ? h('span', { class: 'sc-done' }, icon('check'), h('span', { class: 'sr-only' }, 'fertig'))
                : state === ' next' ? h('span', { class: 'sc-go' }, p.done ? 'Weiter' : 'Start', icon('arrowRight')) : null)));
      })),
      h('div', { class: 'sc-actions' },
        h('a', { class: 'btn btn-soft', href: `#/r/${sr.id}/test` }, icon('target'), 'Reise-Test'),
        h('a', { class: 'btn btn-soft', href: `#/r/${sr.id}/karten`, 'aria-label': cardsLabel }, icon('cards'), 'Karteikarten',
          today.size ? h('span', { class: 'sc-count sc-due', 'aria-hidden': 'true' }, today.size) : null),
        labN ? h('a', { class: 'btn btn-soft', href: `#/r/${sr.id}/labs`, title: 'Gemerkte Übungen fürs Terminal' }, icon('laptop'), 'Labs', h('span', { class: 'sc-count' }, labN)) : null,
        favN
          ? h('a', { class: 'btn btn-soft sc-fav', href: `#/r/${sr.id}/test?nur=favoriten` }, icon('heart'), 'Favoriten-Test', h('span', { class: 'sc-count' }, favN))
          : h('span', { class: 'sc-hint muted' }, icon('heart'), 'Markiere Fragen mit dem Herz – dann kannst du sie hier gesammelt testen.'),
        h('span', { class: 'sc-manage' }, dailyBtn, archiveBtn))));
    return card;
  }

  /** Reihenfolge nach Fortschritt: begonnene zuerst (weiteste oben), dann fertige – die bleiben wegen
   *  der Karteikarten in Gebrauch –, neue zuletzt. Gleichstand behält die Katalog-Reihenfolge. progress(x) → { done, pct } */
  LA.byProgress = (list, progress) => {
    const rank = (p) => (p.pct >= 1 ? 1 : p.done > 0 ? 0 : 2);
    return list
      .map((x, i) => ({ x, i, p: progress(x) }))
      .sort((a, b) => rank(a.p) - rank(b.p) || (rank(a.p) === 0 ? b.p.pct - a.p.pct : 0) || a.i - b.i)
      .map((e) => e.x);
  };
  const seriesProgress = (sr) => {
    const progs = sr.topics.filter((id) => LA.catalogEntry(id)).map(LA.topicProgress);
    const done = progs.reduce((a, p) => a + p.done, 0);
    const total = progs.reduce((a, p) => a + p.count, 0);
    return { done, pct: total ? done / total : 0 };
  };
  const topicsByProgress = (list) => LA.byProgress(list, (t) => LA.topicProgress(t.id));

  /* Tabs der Lernreisen: begonnen, fertig (100 %), noch nicht begonnen, archiviert.
   * Die Wahl gilt für diese Sitzung – zurück auf der Startseite bleibt der Tab offen. */
  const SERIES_TABS = [['progress', 'In Arbeit'], ['done', 'Abgeschlossen'], ['open', 'Offen'], ['archived', 'Archiv']];
  const SERIES_EMPTY = {
    progress: 'Gerade läuft keine Lernreise – starte eine unter „Offen“.',
    done: 'Noch keine Lernreise ganz geschafft.',
    open: 'Alle Lernreisen sind begonnen.',
    archived: 'Nichts archiviert. Über „Archivieren“ in einer Reise räumst du sie hierher – Fortschritt und Karteikarten bleiben.',
  };
  let seriesTab = null;

  /** Startseite: braucht nur Katalog und topics/meta.js – kein Thema wird dafür geladen */
  LA.views.home = async () => {
    const st = LA.store.get();
    const activeSeries = () => LA.byProgress(LA.series.filter((x) => !isArchived(x)), seriesProgress);
    // Ohne bisheriges Lernen: erste offene Station der obersten Lernreise (bzw. das erste Thema) vorschlagen
    const firstOpen = () => {
      const sr = activeSeries()[0];
      const ids = sr ? sr.topics : LA.catalog.map((t) => t.id);
      return ids.find((id) => LA.catalogEntry(id) && LA.topicProgress(id).pct < 1) || ids[0];
    };
    // Station fertig: weiter mit der nächsten offenen Station derselben Reise (sonst erste offene überhaupt)
    const openAfter = (id) => {
      const cur = LA.seriesOf(id);
      const rest = cur ? cur.series.topics.slice(cur.index + 1) : [];
      return rest.find((t) => LA.catalogEntry(t) && LA.topicProgress(t).pct < 1) || firstOpen();
    };
    // Lektionen kommen aus topics/meta.js; fehlt ein Thema dort (veraltete Metadaten), doch laden
    const known = (id) => LA.lessonsOf(id) || LA.loadTopic(id).then(() => true, () => false);
    let lastId = st.lastTopic && LA.catalogEntry(st.lastTopic) ? st.lastTopic : firstOpen();
    if (lastId && (await known(lastId)) && !LA.nextLessonOf(lastId)) {
      const nextId = openAfter(lastId);
      if (nextId && nextId !== lastId && (await known(nextId)) && LA.nextLessonOf(nextId)) lastId = nextId;
    }
    const last = lastId && LA.catalogEntry(lastId);
    let continueCard = null;
    if (last) {
      const next = LA.nextLessonOf(last.id);
      const started = !!st.lastTopic;
      continueCard = h('a', { class: 'now-row', href: next ? `#/t/${last.id}/l/${next.id}` : `#/t/${last.id}` },
        h('span', { class: 'nr-kicker' }, started ? 'Weiterlernen' : 'Hier starten'),
        h('span', { class: 'nr-body' },
          h('span', { class: 'nr-title' }, next ? next.title : 'Alle Lektionen geschafft – Zeit für Wiederholung!'),
          h('span', { class: 'nr-sub' }, last.title)),
        h('span', { class: 'nr-go' }, icon('arrowRight')));
      // Das Thema hinter „Weiterlernen“ schon im Hintergrund holen – der Tipp darauf öffnet dann sofort
      setTimeout(() => LA.loadTopic(last.id).catch(() => {}), 300);
    }

    // Tagesfrage und Quests: neu aufbauen, wenn eine Reise in die Tagesfrage kommt oder herausfällt
    let chEl = challengesSection();
    const renderChallenges = () => {
      const el = challengesSection();
      chEl.replaceWith(el);
      chEl = el;
    };

    // Lernreisen in vier Tabs: beim (Ent-)Archivieren nur diesen Teil neu aufbauen, die Scrollposition bleibt
    const seriesWrap = h('div');
    const groups = () => {
      const g = { progress: [], done: [], open: [], archived: [] };
      LA.byProgress(LA.series, seriesProgress).forEach((sr) => {
        const p = seriesProgress(sr);
        g[isArchived(sr) ? 'archived' : p.pct >= 1 ? 'done' : p.done > 0 ? 'progress' : 'open'].push(sr);
      });
      return g;
    };
    const renderSeries = () => {
      if (!LA.series.length) return;
      const g = groups();
      // Ohne eigene Wahl: der erste Tab, in dem etwas liegt
      if (!seriesTab || !SERIES_TABS.some(([k]) => k === seriesTab)) seriesTab = (SERIES_TABS.find(([k]) => g[k].length) || SERIES_TABS[0])[0];
      const tabs = h('div', { class: 'segmented series-tabs', role: 'group', 'aria-label': 'Lernreisen filtern' },
        SERIES_TABS.map(([key, label]) => {
          const on = key === seriesTab;
          return h('button', { type: 'button', class: on ? 'on' : null, 'aria-pressed': String(on), onclick: () => ((seriesTab = key), renderSeries()) },
            label, h('span', { class: 'st-count' }, String(g[key].length)));
        }));
      const list = g[seriesTab];
      seriesWrap.replaceChildren(h('section', { class: 'series-list' + (seriesTab === 'archived' ? ' is-archive' : '') },
        h('div', { class: 'section-head' }, h('h2', null, 'Lernreisen')),
        tabs,
        list.length ? list.map((sr) => seriesCard(sr, renderSeries, renderChallenges)) : h('p', { class: 'muted series-empty' }, SERIES_EMPTY[seriesTab])));
    };
    renderSeries();

    // Hier nur Themen ohne Lernreise – die übrigen stehen schon als Stationen oben
    const loose = topicsByProgress(LA.catalog.filter((t) => !LA.seriesOf(t.id)));

    return {
      el: h('div', { class: 'page home' },
        hero(continueCard),
        jokerOffer(),
        chEl,
        seriesWrap,
        h('section', null,
          h('div', { class: 'section-head' },
            h('h2', null, LA.series.length ? 'Weitere Themen' : 'Deine Themen'),
            h('a', { class: 'btn btn-soft', href: '#/themen' }, icon('search'), `Alle ${LA.catalog.length} Themen`)),
          h('div', { class: 'topic-grid' }, loose.map(topicCard), newTopicCard()))),
    };
  };

  /** Alle Themen mit Suche (Titel, Untertitel, Tags und Lernreise) */
  LA.views.allTopics = () => {
    const grid = h('div', { class: 'topic-grid' });
    const empty = h('p', { class: 'muted', hidden: true }, 'Kein Thema gefunden – sag Claude, was du lernen möchtest.');
    const text = (t) => [t.title, t.subtitle, ...(t.tags || []), (LA.seriesOf(t.id) || { series: {} }).series.title].join(' ').toLowerCase();
    const render = (q = '') => {
      const list = topicsByProgress(LA.catalog.filter((t) => text(t).includes(q.toLowerCase())));
      grid.replaceChildren(...list.map(topicCard), newTopicCard());
      empty.hidden = list.length > 0;
    };
    const input = h('input', { type: 'search', placeholder: 'Thema suchen …', oninput: (e) => render(e.target.value) });
    render();
    return {
      el: h('div', { class: 'page' },
        h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite'),
        h('div', { class: 'section-head' },
          h('h1', null, 'Alle Themen'),
          h('label', { class: 'search' }, icon('search'), input)),
        empty,
        grid),
    };
  };

  /** Themenwunsch als Notiz – Claude nimmt ihn beim nächsten /notizen in die Themenliste auf */
  function newTopicCard() {
    return h('button', { class: 'topic-card topic-new', type: 'button', onclick: () => LA.notes.open('topic') },
      h('span', { class: 'tn-plus', 'aria-hidden': 'true' }, '+'),
      h('h3', null, 'Neues Thema wünschen'),
      h('p', { class: 'muted' }, 'Schreib auf, was du lernen möchtest. Claude setzt es am Rechner auf deine Themenliste – daraus entstehen neue Lernreisen.'));
  }

  /* ---------- Profil ---------- */
  const shortDate = (d) => new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  /** Jahres-Heatmap: 53 Wochen × 7 Tage, Stufen nach XP im Verhältnis zum Tagesziel, Joker gestrichelt.
   *  Stufe steht zusätzlich im title und in der Zusammenfassung – nicht nur als Graustufe. */
  function yearHeatmap(st, si) {
    const today = LA.today();
    const start = LA.addDays(LA.challenges.weekStart(today), -52 * 7);
    const jokers = new Set(si.jokerDays);
    const level = (v) => (!v ? 0 : v < st.goal / 2 ? 1 : v < st.goal ? 2 : v < st.goal * 2 ? 3 : 4);
    const WEEKS = 53;
    const grid = h('div', { class: 'hm-grid', 'aria-hidden': 'true', style: { '--weeks': WEEKS } });
    // Kopfzeile: Monatsname über der Woche, in der der Monat beginnt
    grid.append(h('span'));
    for (let w = 0; w < WEEKS; w++) {
      const first = LA.addDays(start, w * 7);
      const monthStart = Array.from({ length: 7 }, (_, d) => LA.addDays(first, d)).find((d) => d.endsWith('-01'));
      grid.append(h('span', { class: 'hm-month' }, monthStart || w === 0
        ? new Date((monthStart || first) + 'T12:00').toLocaleDateString('de-DE', { month: 'short' }).replace('.', '') : ''));
    }
    let learned = 0;
    let hit = 0;
    ['Mo', '', 'Mi', '', 'Fr', '', 'So'].forEach((label, d) => {
      grid.append(h('span', { class: 'hm-wd' }, label));
      for (let w = 0; w < WEEKS; w++) {
        const day = LA.addDays(start, w * 7 + d);
        if (day > today) {
          grid.append(h('span', { class: 'hm-cell future' }));
          continue;
        }
        const v = st.days[day] || 0;
        if (v) learned++;
        if (v >= st.goal) hit++;
        const j = jokers.has(day);
        grid.append(h('span', { class: `hm-cell l${level(v)}` + (j ? ' hm-joker' : '') + (day === today ? ' today' : ''), title: `${shortDate(day)}: ${j ? 'Joker eingesetzt' : v + ' XP'}` }));
      }
    });
    const scroller = h('div', { class: 'hm-scroll' }, grid);
    // Mobil: die jüngsten Wochen zeigen (rechts)
    requestAnimationFrame(() => (scroller.scrollLeft = scroller.scrollWidth));
    const sample = (cls, label) => h('span', { class: 'hm-key' }, h('span', { class: 'hm-cell ' + cls }), label);
    return h('section', { class: 'card heatmap' },
      h('h2', null, 'Dein Jahr'),
      h('p', { class: 'muted' }, `${LA.plural(learned, 'Lerntag', 'Lerntage')} in den letzten 12 Monaten, davon ${hit} mit erreichtem Tagesziel · ${LA.plural(si.jokerDays.length, 'Joker', 'Joker')} eingesetzt.`),
      scroller,
      h('div', { class: 'hm-legend' },
        sample('l0', 'nichts'), sample('l1', 'unter ½ Ziel'), sample('l2', 'unter Ziel'), sample('l3', 'Ziel erreicht'), sample('l4', 'doppeltes Ziel'), sample('l0 hm-joker', 'Joker')));
  }

  /** Gedächtnis-Wert: Gesamtwert und je Thema (schwächste zuerst, mit Link zu den Karteikarten) */
  function memorySection() {
    const mem = LA.challenges.memoryAll();
    const pct = (x) => Math.round(x * 100) + ' %';
    const row = (x) => {
      const t = LA.catalogEntry(x.id);
      return h('li', null, h('a', { class: 'mem-row', href: `#/t/${x.id}/karten` },
        h('span', { class: 'mem-title' }, t.title),
        h('span', { class: 'mini-bar', role: 'progressbar', 'aria-label': `Gedächtnis-Wert ${t.title}`, 'aria-valuenow': String(Math.round(x.pct * 100)), 'aria-valuemax': '100' },
          h('div', { style: { width: x.pct * 100 + '%' } })),
        h('span', { class: 'mem-pct' }, pct(x.pct))));
    };
    const SHOW = 6;
    return h('section', { class: 'card memory' },
      h('h2', null, 'Gedächtnis-Wert'),
      h('p', { class: 'muted' }, 'Wie weit deine Karteikarten im Kasten sind: Fach 5 zählt voll, Fach 1 und nie geübte Karten zählen nichts. Lange überfällige Karten rutschen ein Fach ab – der Wert steigt nur, wenn du wiederholst.'),
      mem.topics.length
        ? [
          h('div', { class: 'mem-total' }, h('span', { class: 'mem-big' }, pct(mem.pct)), h('span', { class: 'muted' }, `über ${LA.plural(mem.topics.length, 'Thema', 'Themen')} mit geübten Karten`)),
          h('div', { class: 'mem-head muted' }, 'Am wackeligsten zuerst'),
          h('ol', { class: 'mem-list' }, mem.topics.slice(0, SHOW).map(row)),
          mem.topics.length > SHOW
            ? h('details', { class: 'mem-more' }, h('summary', null, `Alle ${mem.topics.length} Themen`), h('ol', { class: 'mem-list' }, mem.topics.slice(SHOW).map(row)))
            : null]
        : h('p', null, 'Noch keine Karteikarten geübt. Sobald du Karten wiederholst, siehst du hier, wie viel sitzt.'));
  }

  LA.views.profile = () => {
    const st = LA.store.get();
    const lvl = LA.store.levelInfo();

    const si = LA.store.streakInfo();
    const jokerSet = new Set(si.jokerDays);

    // XP der letzten 14 Tage, Joker-Tage mit Schild
    const days = Array.from({ length: 14 }, (_, i) => LA.addDays(LA.today(), i - 13));
    const maxXP = Math.max(st.goal, ...days.map((d) => st.days[d] || 0));
    const chart = h('div', { class: 'xp-chart' },
      h('div', { class: 'xp-goal-line', style: { bottom: `calc(22px + (100% - 22px) * ${st.goal / maxXP})` } }, h('span', null, 'Ziel')),
      days.map((d) => {
        const v = st.days[d] || 0;
        const [, , dd] = d.split('-');
        const joker = jokerSet.has(d);
        return h('div', { class: 'xp-col' + (d === LA.today() ? ' today' : ''), title: joker ? `${d}: Joker eingesetzt` : `${d}: ${v} XP` },
          joker ? h('div', { class: 'xp-joker' }, icon('shield'))
            : h('div', { class: 'xp-bar' + (v >= st.goal ? ' hit' : ''), style: { height: (v / maxXP) * 100 + '%' } }),
          h('div', { class: 'xp-day' }, dd));
      }));

    // Joker dieses Monats: bereite zuerst, dann die eingesetzten mit Datum
    const month = LA.today().slice(0, 7);
    const monthName = new Date().toLocaleDateString('de-DE', { month: 'long' });
    const usedDays = si.jokerDays.filter((d) => d.startsWith(month));
    const dayLabel = (d) => new Date(d + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    const jokers = h('section', { class: 'card streak-card' },
      h('h2', null, 'Serie & Joker'),
      h('p', { class: 'muted' }, `Verpasst du einen Tag, kannst du danach einen Joker einsetzen, damit deine Serie hält – solange die Lücke bis gestern reicht. Jeden Monat gibt es ${si.perMonth} neue, übrige verfallen. Joker-Tage halten die Serie, zählen aber nicht mit.`),
      jokerOffer(),
      h('ol', { class: 'joker-slots', 'aria-label': `Joker im ${monthName}: ${si.left} von ${si.perMonth} übrig` },
        Array.from({ length: si.perMonth }, (_, i) => {
          const used = i >= si.left ? usedDays[i - si.left] : null;
          return h('li', { class: 'joker' + (used ? ' used' : '') }, icon('shield'),
            h('span', { class: 'joker-state' }, used ? 'Eingesetzt' : 'Bereit'),
            h('span', { class: 'joker-date' }, used ? dayLabel(used) : monthName));
        })),
      h('dl', { class: 'streak-facts' },
        h('div', null, h('dt', null, 'Aktuelle Serie'), h('dd', null, LA.plural(si.days, 'Tag', 'Tage'))),
        h('div', null, h('dt', null, 'Längste Serie'), h('dd', null, LA.plural(si.best, 'Tag', 'Tage'))),
        h('div', null, h('dt', null, 'Heute'), h('dd', null, si.learnedToday ? '✓ gelernt' : si.days ? 'noch offen' : '–')),
        h('div', null, h('dt', null, 'XP-Boost'), h('dd', null, boostText()))),
      h('p', { class: 'muted' }, `Serien-Boost: ${LA.store.xpBoost().tiers.slice().reverse().map((b) => `ab ${b.days} Tagen ×${LA.fmtMult(b.mult)}`).join(', ')}. Er beschleunigt nur dein Level. Leichter wird dadurch nichts: Das Tagesziel zählt die XP ohne Boost, und die Serie hält jeder Tag, an dem du lernst.`));

    function boostText() {
      const b = LA.store.xpBoost();
      const now = b.mult > 1 ? `×${LA.fmtMult(b.mult)}` : 'keiner';
      return b.next ? `${now} · ×${LA.fmtMult(b.next.mult)} ab ${LA.plural(b.next.days, 'Tag', 'Tagen')}` : now;
    }

    const badges = h('div', { class: 'badges' }, LA.store.BADGES.map((b) =>
      h('div', { class: 'badge' + (st.badges[b.id] ? ' earned' : ''), title: st.badges[b.id] ? 'Erhalten am ' + st.badges[b.id] : 'Noch nicht erhalten' },
        h('div', { class: 'badge-emoji' }, LA.glyph(b.icon, 'tile')),
        h('div', { class: 'badge-title' }, b.title),
        h('div', { class: 'badge-desc' }, b.desc))));

    const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        LA.store.importJSON(await file.text());
        LA.fx.toast('Fortschritt importiert', 'Deine Sicherung wurde geladen.');
        LA.router.refresh();
      } catch (e) {
        LA.fx.toast('Import fehlgeschlagen', e.message, 'error');
      }
    });

    function exportProgress() {
      const blob = new Blob([LA.store.exportJSON()], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `lernfunke-sicherung-${LA.today()}.json` });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 500);
    }

    const synced = LA.sync.connected();
    const syncRow = LA.sync.settingRow();

    async function resetProgress() {
      const where = synced ? ' – auf allen verbundenen Geräten' : '';
      const ok = await LA.fx.dialog({ title: 'Fortschritt zurücksetzen?', text: `XP, Level, Serie, Abzeichen und alle Lektionsergebnisse werden gelöscht${where}. Tipp: Exportiere vorher eine Sicherung.`, ok: 'Alles löschen', danger: true });
      if (ok) {
        LA.store.reset();
        LA.router.refresh();
      }
    }

    return {
      el: h('div', { class: 'page profile' },
        h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite'),
        h('section', { class: 'profile-hero' },
          h('h1', { class: 'sr-only' }, `Level ${lvl.level}`),
          h('div', { class: 'hh-figure', 'aria-hidden': 'true' },
            h('span', { class: 'hh-giant' }, String(lvl.level)),
            h('span', { class: 'hh-legend' },
              h('span', { class: 'hh-unit' }, 'Level'),
              h('span', null, `${st.xp} XP gesamt`),
              h('span', null, `noch ${lvl.need - lvl.into} XP bis Level ${lvl.level + 1}`))),
          h('div', { class: 'mini-bar hh-bar', role: 'progressbar', 'aria-label': `Level ${lvl.level}, Fortschritt zum nächsten Level`, 'aria-valuenow': String(lvl.into), 'aria-valuemax': String(lvl.need) },
            h('div', { style: { width: lvl.pct * 100 + '%' } })),
          h('dl', { class: 'profile-stats' },
            [[LA.store.streak(), 'Tage Serie'], [st.stats.lessons, 'Lektionen'], [st.stats.reviews, 'Karten wiederholt'], [st.stats.games, 'Spiele']]
              .map(([n, label]) => h('div', null, h('dt', null, label), h('dd', null, String(n)))))),
        jokers,
        yearHeatmap(st, si),
        memorySection(),
        h('section', { class: 'card' }, h('h2', null, 'Die letzten 14 Tage'), chart),
        h('section', null, h('h2', null, 'Abzeichen'), badges),
        h('section', { class: 'card settings' },
          h('h2', null, 'Einstellungen'),
          h('div', { class: 'setting' }, h('div', null, h('strong', null, 'Tagesziel'), h('div', { class: 'muted' }, 'Wie viele XP möchtest du pro Tag sammeln?')),
            LA.ui.segmented([[20, 'Locker · 20'], [50, 'Normal · 50'], [100, 'Ehrgeizig · 100'], [200, 'Intensiv · 200']], st.goal, (v) => LA.store.setGoal(v))),
          h('div', { class: 'setting' }, h('div', null, h('strong', null, 'Karteikarten pro Runde'), h('div', { class: 'muted' }, 'Wie viele Karten eine Lernrunde höchstens hat – fällige zuerst, der Rest wird mit neuen aufgefüllt.')),
            LA.ui.roundSizePicker((v) => LA.store.setting('roundSize', v))),
          h('div', { class: 'setting' }, h('div', null, h('strong', null, 'Darstellung')),
            LA.ui.segmented([['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], st.settings.theme, (v) => LA.app.setTheme(v))),
          h('div', { class: 'setting' }, h('div', null, h('strong', null, 'Töne'), h('div', { class: 'muted' }, 'Kurze Klänge bei richtigen und falschen Antworten.')),
            LA.ui.segmented([[true, 'An'], [false, 'Aus']], st.settings.sound, (v) => LA.store.setting('sound', v))),
          h('div', { class: 'setting' }, h('div', null, h('strong', null, 'Notizen'), h('div', { class: 'muted' },
            `${LA.plural(LA.store.openNotes(), 'offene Notiz', 'offene Notizen')} – Kartenwünsche und Fragen, die Claude am Rechner abarbeitet.`)),
            h('a', { class: 'btn btn-soft', href: '#/notizen' }, icon('note'), 'Ansehen')),
          syncRow.el,
          h('div', { class: 'setting' }, h('div', null, h('strong', null, 'Daten'), h('div', { class: 'muted' }, synced
            ? 'Sichere deinen Fortschritt bei Bedarf als Datei. Importieren und Zurücksetzen gelten für alle verbundenen Geräte.'
            : 'Dein Fortschritt liegt nur in diesem Browser. Sichere ihn bei Bedarf als Datei.')),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn btn-soft', type: 'button', onclick: exportProgress }, icon('download'), 'Exportieren'),
              h('button', { class: 'btn btn-soft', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Importieren'),
              h('button', { class: 'btn btn-ghost danger-text', type: 'button', onclick: resetProgress }, 'Zurücksetzen'),
              fileInput)))),
      destroy: syncRow.destroy,
    };
  };
})();
