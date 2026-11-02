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
    LA.store.ROUND_SIZES.map((n) => (n >= 100 ? [n, `${n} 🔥`, 'seg-hot'] : [n, String(n)])), LA.store.roundSize(), onPick);

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

  function greeting() {
    const hr = new Date().getHours();
    if (hr < 5) return 'Nachtschicht? 🌙';
    if (hr < 11) return 'Guten Morgen! ☀️';
    if (hr < 18) return 'Hallo! 👋';
    return 'Guten Abend! 🌆';
  }

  /** Kompakter Tagesstatus: Tagesziel, Serie, Level – eine Karte statt vier Kacheln (die Kopfzeile zeigt dieselben Zahlen) */
  function todayCard() {
    const st = LA.store.get();
    const lvl = LA.store.levelInfo();
    const streak = LA.store.streak();
    const todayXP = LA.store.todayXP();
    const reached = todayXP >= st.goal;
    return h('a', { class: 'today-card', href: '#/profil', 'aria-label': `Heute ${todayXP} von ${st.goal} XP. Statistik und Abzeichen öffnen` },
      LA.ui.ring(todayXP / st.goal, 64, 7, reached ? '✓' : Math.round((todayXP / st.goal) * 100) + '%'),
      h('div', { class: 'td-body' },
        h('div', { class: 'td-title' }, reached ? 'Tagesziel geschafft' : `Noch ${st.goal - todayXP} XP bis zum Tagesziel`),
        h('div', { class: 'td-meta' },
          h('span', { class: streak ? '' : 'dim' }, '🔥 ', streak ? LA.plural(streak, 'Tag', 'Tage') + ' in Folge' : 'Heute starten'),
          h('span', null, `Level ${lvl.level} · ${lvl.into}/${lvl.need} XP`))),
      h('span', { class: 'td-go' }, icon('arrowRight')));
  }

  function topicCard(t) {
    const p = LA.topicProgress(t.id);
    const sr = LA.seriesOf(t.id);
    return h('a', { class: 'topic-card', href: `#/t/${t.id}`, style: { '--accent': t.color || 'var(--brand)' } },
      h('div', { class: 'tc-band' },
        h('span', { class: 'tc-icon' }, t.icon || '📘'),
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

  /** Lernreise: Themen als nummerierte Stationen, die nächste offene ist hervorgehoben.
   *  Zugeklappt bleibt nur die Kopfzeile mit der nächsten Station. onArchive: Reise wurde (ent)archiviert */
  function seriesCard(sr, onArchive) {
    const stations = sr.topics.map((id) => LA.catalogEntry(id)).filter(Boolean);
    const progs = stations.map((t) => LA.topicProgress(t.id));
    const done = progs.reduce((a, p) => a + p.done, 0);
    const total = progs.reduce((a, p) => a + p.count, 0);
    const nextIdx = progs.findIndex((p) => p.pct < 1);
    const pct = total ? done / total : 0;
    const favN = stations.reduce((a, t) => a + LA.store.favCount(t.id), 0);
    const dueN = LA.store.dueCount(LA.seriesCardTopics(sr));
    const archived = isArchived(sr);
    const next = stations[nextIdx];

    const toggle = h('button', { class: 'icon-btn sc-toggle', type: 'button', 'aria-label': 'Stationen ein- und ausblenden' }, icon('down'));
    const card = h('div', { class: 'series-card', style: { '--accent': sr.color || 'var(--brand)' } });
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

    // Kurzinfo für die zugeklappte Reise: nächste Station und fällige Karten
    const peek = h('div', { class: 'sc-peek' },
      next
        ? h('a', { class: 'sc-next', href: `#/t/${next.id}` }, `${progs[nextIdx].done ? 'Weiter' : 'Nächste Station'}: `, h('strong', null, `${nextIdx + 1}. ${next.title}`), icon('arrowRight'))
        : h('span', { class: 'sc-next' }, icon('check'), 'Alle Stationen geschafft'),
      dueN ? h('a', { class: 'sc-count sc-due', href: `#/r/${sr.id}/karten`, title: 'Fällige Karteikarten' }, `${dueN} fällig`) : null);

    const head = h('div', { class: 'sc-head' },
      h('div', { class: 'sc-icon' }, sr.icon || '🧭'),
      h('div', { class: 'sc-body' },
        h('div', { class: 'sc-kicker' }, icon('route'), `Lernreise · ${LA.plural(stations.length, 'Station', 'Stationen')}`, h('span', { class: 'sc-lessons' }, ` · ${LA.plural(total, 'Lektion', 'Lektionen')}`)),
        h('h3', null, sr.title),
        sr.subtitle ? h('p', { class: 'muted sc-sub' }, sr.subtitle) : null,
        peek),
      LA.ui.ring(pct, 60, 7, Math.round(pct * 100) + '%'),
      toggle);
    // Klick auf die Kopfzeile klappt auf – außer auf Links darin
    head.addEventListener('click', (e) => !e.target.closest('a') && flip());

    const archiveBtn = h('button', { class: 'btn btn-ghost sc-archive', type: 'button' }, icon('archive'), archived ? 'Zurückholen' : 'Archivieren');
    archiveBtn.addEventListener('click', () => {
      setArchived(sr, !archived);
      if (!archived) setOpen(sr, false);
      LA.fx.toast(archived ? 'Lernreise zurückgeholt' : 'Lernreise archiviert', archived ? sr.title : 'Fortschritt und Karteikarten bleiben erhalten – du findest sie unten im Archiv.');
      onArchive();
    });

    card.append(head, h('div', { class: 'sc-detail' },
      h('ol', { class: 'sc-stations' }, stations.map((t, i) => {
        const p = progs[i];
        const state = p.pct === 1 ? ' done' : i === nextIdx ? ' next' : '';
        return h('li', { class: 'sc-station' + state, style: { '--accent': t.color || 'var(--brand)' } },
          h('a', { href: `#/t/${t.id}` },
            h('span', { class: 'sc-num' }, p.pct === 1 ? icon('check') : String(i + 1)),
            h('span', { class: 'sc-ticon' }, t.icon || '📘'),
            h('span', { class: 'sc-text' },
              h('span', { class: 'sc-title' }, t.title),
              h('span', { class: 'sc-meta' },
                h('span', { class: 'mini-bar' }, h('div', { style: { width: p.pct * 100 + '%' } })),
                `${p.done}/${p.count}`,
                state === ' next' ? h('span', { class: 'sc-go' }, p.done ? 'Weiter' : 'Start', icon('arrowRight')) : null))));
      })),
      h('div', { class: 'sc-actions' },
        h('a', { class: 'btn btn-soft', href: `#/r/${sr.id}/test` }, icon('target'), 'Reise-Test'),
        h('a', { class: 'btn btn-soft', href: `#/r/${sr.id}/karten`, title: dueN ? `${dueN} Karten fällig` : null }, icon('cards'), 'Karteikarten',
          dueN ? h('span', { class: 'sc-count sc-due' }, dueN) : null),
        favN
          ? h('a', { class: 'btn btn-soft sc-fav', href: `#/r/${sr.id}/test?nur=favoriten` }, icon('heart'), 'Favoriten-Test', h('span', { class: 'sc-count' }, favN))
          : h('span', { class: 'sc-hint muted' }, icon('heart'), 'Markiere Fragen mit dem Herz – dann kannst du sie hier gesammelt testen.'),
        archiveBtn)));
    return card;
  }

  LA.views.home = async () => {
    const st = LA.store.get();
    // Ohne bisheriges Lernen: erste offene Station der ersten Lernreise (bzw. das erste Thema) vorschlagen
    const firstOpen = () => {
      const sr = LA.series.find((x) => !isArchived(x));
      const ids = sr ? sr.topics : LA.catalog.map((t) => t.id);
      return ids.find((id) => LA.catalogEntry(id) && LA.topicProgress(id).pct < 1) || ids[0];
    };
    const lastId = st.lastTopic && LA.catalogEntry(st.lastTopic) ? st.lastTopic : firstOpen();
    const last = lastId ? await LA.loadTopic(lastId).catch(() => null) : null;
    let continueCard = null;
    if (last) {
      const next = LA.nextLesson(last);
      const started = !!st.lastTopic;
      continueCard = h('a', { class: 'continue-card', href: next ? `#/t/${last.id}/l/${next.id}` : `#/t/${last.id}`, style: { '--accent': last.color } },
        h('div', { class: 'cc-icon' }, last.icon),
        h('div', { class: 'cc-body' },
          h('div', { class: 'cc-kicker' }, started ? 'Weiterlernen' : 'Hier starten'),
          h('div', { class: 'cc-title' }, next ? next.title : 'Alle Lektionen geschafft – Zeit für Wiederholung!'),
          h('div', { class: 'cc-sub' }, last.title)),
        h('div', { class: 'cc-go' }, icon('play')));
    }

    // Lernreisen und Archiv: beim (Ent-)Archivieren nur diesen Teil neu aufbauen, die Scrollposition bleibt
    const seriesWrap = h('div');
    const renderSeries = () => {
      const active = LA.series.filter((sr) => !isArchived(sr));
      const archived = LA.series.filter(isArchived);
      seriesWrap.replaceChildren(...[
        active.length
          ? h('section', { class: 'series-list' }, h('div', { class: 'section-head' }, h('h2', null, active.length > 1 ? 'Lernreisen' : 'Lernreise')), active.map((sr) => seriesCard(sr, renderSeries)))
          : null,
        archived.length
          ? h('details', { class: 'series-archive' },
              h('summary', null, icon('archive'), `Archiv · ${LA.plural(archived.length, 'Lernreise', 'Lernreisen')}`),
              archived.map((sr) => seriesCard(sr, renderSeries)))
          : null,
      ].filter(Boolean));
    };
    renderSeries();

    // Hier nur Themen ohne Lernreise – die übrigen stehen schon als Stationen oben
    const loose = LA.catalog.filter((t) => !LA.seriesOf(t.id));

    return {
      el: h('div', { class: 'page home' },
        h('section', { class: 'home-hero' },
          h('h1', null, greeting()),
          h('div', { class: 'home-top' }, continueCard, todayCard())),
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
      const list = LA.catalog.filter((t) => text(t).includes(q.toLowerCase()));
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

  function newTopicCard() {
    return h('div', { class: 'topic-card topic-new' },
      h('div', { class: 'tn-plus' }, '+'),
      h('h3', null, 'Neues Thema'),
      h('p', { class: 'muted' }, 'Sag Claude einfach, was du lernen möchtest – daraus entstehen neue Lerninhalte mit Erklärungen, Quiz und Spielen.'));
  }

  /* ---------- Profil ---------- */
  LA.views.profile = () => {
    const st = LA.store.get();
    const lvl = LA.store.levelInfo();

    // XP der letzten 14 Tage
    const days = Array.from({ length: 14 }, (_, i) => LA.addDays(LA.today(), i - 13));
    const maxXP = Math.max(st.goal, ...days.map((d) => st.days[d] || 0));
    const chart = h('div', { class: 'xp-chart' },
      h('div', { class: 'xp-goal-line', style: { bottom: `calc(22px + (100% - 22px) * ${st.goal / maxXP})` } }, h('span', null, 'Ziel')),
      days.map((d) => {
        const v = st.days[d] || 0;
        const [, , dd] = d.split('-');
        return h('div', { class: 'xp-col' + (d === LA.today() ? ' today' : ''), title: `${d}: ${v} XP` },
          h('div', { class: 'xp-bar' + (v >= st.goal ? ' hit' : ''), style: { height: (v / maxXP) * 100 + '%' } }),
          h('div', { class: 'xp-day' }, dd));
      }));

    const badges = h('div', { class: 'badges' }, LA.store.BADGES.map((b) =>
      h('div', { class: 'badge' + (st.badges[b.id] ? ' earned' : ''), title: st.badges[b.id] ? 'Erhalten am ' + st.badges[b.id] : 'Noch nicht erhalten' },
        h('div', { class: 'badge-emoji' }, b.emoji),
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
          LA.ui.ring(lvl.pct, 96, 9, lvl.level),
          h('div', null,
            h('h1', null, `Level ${lvl.level}`),
            h('p', { class: 'muted' }, `${st.xp} XP gesamt · noch ${lvl.need - lvl.into} XP bis Level ${lvl.level + 1}`),
            h('div', { class: 'profile-chips' },
              h('span', { class: 'chip-stat' }, '🔥 ', LA.plural(LA.store.streak(), 'Tag', 'Tage'), ' Serie'),
              h('span', { class: 'chip-stat' }, '📚 ', LA.plural(st.stats.lessons, 'Lektion', 'Lektionen')),
              h('span', { class: 'chip-stat' }, '🃏 ', LA.plural(st.stats.reviews, 'Karte', 'Karten'), ' wiederholt'),
              h('span', { class: 'chip-stat' }, '🎮 ', LA.plural(st.stats.games, 'Spiel', 'Spiele'))))),
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
