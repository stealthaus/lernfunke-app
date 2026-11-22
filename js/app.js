/* App-Rahmen: Hash-Router, Kopfzeile, Theme, Glossar-Popover. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;

  const ROUTES = [
    [/^\/?$/, 'home', []],
    [/^\/profil$/, 'profile', []],
    [/^\/statistik$/, 'profile', []], // Statistik steht jetzt auf der Seite „Fortschritt“
    [/^\/einstellungen$/, 'settings', []],
    [/^\/reisen$/, 'journeys', []],
    [/^\/themen$/, 'journeys', []],
    [/^\/t\/([^/]+)$/, 'topic', ['id']],
    [/^\/t\/([^/]+)\/l\/([^/]+)$/, 'lesson', ['id', 'lessonId']],
    [/^\/t\/([^/]+)\/karten$/, 'cards', ['id']],
    [/^\/t\/([^/]+)\/spiele$/, 'arcade', ['id']],
    [/^\/t\/([^/]+)\/spiele\/([^/]+)$/, 'game', ['id', 'game']],
    [/^\/t\/([^/]+)\/test$/, 'test', ['id']],
    [/^\/t\/([^/]+)\/glossar$/, 'glossary', ['id']],
    [/^\/t\/([^/]+)\/nachlesen$/, 'reader', ['id']],
    [/^\/r\/([^/]+)\/test$/, 'seriesTest', ['seriesId']],
    [/^\/r\/([^/]+)\/karten$/, 'seriesCards', ['seriesId']],
    [/^\/t\/([^/]+)\/labs$/, 'labs', ['id']],
    [/^\/r\/([^/]+)\/labs$/, 'labs', ['seriesId']],
    [/^\/labs$/, 'labs', []],
    [/^\/notizen$/, 'notes', []],
    [/^\/karten$/, 'allCards', []],
    [/^\/tagesfrage$/, 'daily', []],
  ];

  const main = h('main', { id: 'main' });
  let current = null;
  let token = 0;

  /* ---------- Theme ---------- */
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = LA.store.setting('theme');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    updateHeader();
  }
  media.addEventListener && media.addEventListener('change', applyTheme);

  /* ---------- Kopfzeile ---------- */
  /** Logo wie Favicon und App-Icon: schwarzes L mit Viertelkreis in Signalrot auf Mint */
  function brandMark() {
    const el = h('span', { class: 'brand-mark', 'aria-hidden': 'true' });
    el.innerHTML = '<svg viewBox="0 0 24 24"><rect class="bm-bg" width="24" height="24"/><path class="bm-arc" d="M8 17V7a10 10 0 0 1 10 10z"/>'
      + '<rect class="bm-ink" x="4" y="3" width="4" height="18"/><rect class="bm-ink" x="4" y="17" width="16" height="4"/></svg>';
    return el;
  }
  const streakEl = h('span');
  const boostEl = h('span', { class: 'tstat-boost' });
  const levelEl = h('span');
  const ringBox = h('span', { class: 'tstat-ring' });
  /* Feste Navigation: am Handy unten am Rand (Daumen), am Rechner in der Kopfzeile */
  const TABS = [['heute', '#/', 'home', 'Heute'], ['karten', '#/karten', 'cards', 'Karten'], ['reisen', '#/reisen', 'route', 'Reisen'], ['ich', '#/profil', 'user', 'Ich']];
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Bereiche' },
    TABS.map(([key, href, ic, label]) => h('a', { href, 'data-tab': key }, icon(ic), h('span', null, label))));
  const header = h('header', { class: 'topbar' },
    h('div', { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '#/' }, brandMark(), h('span', { class: 'brand-name' }, 'Lernfunke')),
      tabbar,
      h('nav', { class: 'top-stats', 'aria-label': 'Dein Stand' },
        h('a', { class: 'tstat tstat-streak', href: '#/profil', title: 'Lernserie (Tage in Folge) und Joker' }, h('span', { class: 'tstat-emoji' }, icon('flame')), streakEl, boostEl),
        h('a', { class: 'tstat tstat-level', href: '#/profil', title: 'Dein Level – der Ring zeigt, wie weit es bis zum nächsten ist' }, ringBox, levelEl)),
      h('div', { class: 'top-actions' }, LA.notes.button())));

  /** Reiter der Ansicht: jede Seite gehört zu genau einem Bereich */
  const TAB_OF = {
    home: 'heute', daily: 'heute',
    allCards: 'karten', seriesCards: 'karten', cards: 'karten',
    profile: 'ich', settings: 'ich', notes: 'ich',
  };
  function setTab(view) {
    const key = TAB_OF[view] || (view ? 'reisen' : null);
    tabbar.querySelectorAll('a').forEach((a) => {
      const on = a.dataset.tab === key;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function updateHeader() {
    const si = LA.store.streakInfo();
    streakEl.textContent = si.days;
    streakEl.parentElement.classList.toggle('dim', !si.days);
    // Flamme: gefüllt und farbig, sobald heute gelernt wurde – sonst nur Umriss (Form + Farbe, nicht nur Farbe)
    streakEl.parentElement.classList.toggle('is-lit', si.learnedToday);
    const boost = LA.store.xpBoost();
    const boostTxt = boost.mult > 1 ? '×' + LA.fmtMult(boost.mult) : '';
    boostEl.textContent = boostTxt;
    boostEl.hidden = !boostTxt;
    streakEl.parentElement.setAttribute('aria-label', `Lernserie: ${LA.plural(si.days, 'Tag', 'Tage')}, heute ${si.learnedToday ? 'geschafft' : 'noch offen'}${boostTxt ? `, XP-Boost ${boostTxt}` : ''}, ${si.left} von ${si.perMonth} Jokern übrig`);
    const lvl = LA.store.levelInfo();
    ringBox.replaceChildren(LA.ui.ring(lvl.pct, 22, 4));
    levelEl.textContent = `Lv ${lvl.level}`;
    levelEl.parentElement.setAttribute('aria-label', `Level ${lvl.level}, ${lvl.into} von ${lvl.need} XP bis Level ${lvl.level + 1}`);
  }

  /* ---------- Router ---------- */
  function match(path) {
    for (const [re, view, keys] of ROUTES) {
      const m = path.match(re);
      if (m) return { view, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }

  /** opts.keepScroll: dieselbe Ansicht mit neuem Stand – ohne Ladekreisel und ohne nach oben zu springen */
  async function render(opts) {
    const keep = !!(opts && opts.keepScroll);
    const y = window.scrollY;
    const my = ++token;
    const [path, qs] = location.hash.replace(/^#/, '').split('?');
    const route = match(path);
    if (route) route.params.query = Object.fromEntries(new URLSearchParams(qs || ''));
    closePopover();
    if (current && current.destroy) current.destroy();
    current = null;
    if (!keep) main.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'spinner' })));

    let view;
    try {
      if (!route) throw new Error('Diese Seite gibt es nicht.');
      view = await LA.views[route.view](route.params);
    } catch (e) {
      console.error(e);
      view = errorView(e);
    }
    if (my !== token) {
      if (view && view.destroy) view.destroy();
      return;
    }
    current = view;
    LA.current = { topic: route && route.params.id ? LA.topics[route.params.id] || null : null };
    LA.app.setFocus(!!view.focus);
    setTab(route && route.view);
    main.replaceChildren(view.el);
    window.scrollTo(0, keep ? y : 0);
    const topic = LA.current.topic;
    document.title = topic ? `${topic.title} · Lernfunke` : 'Lernfunke';
  }

  function errorView(e) {
    return {
      el: h('div', { class: 'page' },
        h('div', { class: 'card error-card' },
          h('div', { class: 'result-emoji' }, LA.glyph('question', 'tile')),
          h('h2', null, 'Hoppla!'),
          h('p', null, e.message),
          h('a', { class: 'btn btn-primary', href: '#/' }, 'Zur Startseite'))),
    };
  }

  /* ---------- Glossar-Popover für [[Begriffe]] ---------- */
  let popover = null;
  function closePopover() {
    if (popover) popover.remove();
    popover = null;
  }
  function openPopover(btn) {
    closePopover();
    const holder = btn.closest('[data-topic]');
    const topic = (holder && LA.topics[holder.dataset.topic]) || (LA.current && LA.current.topic);
    const entry = LA.findTerm(topic, btn.dataset.term);
    popover = h('div', { class: 'popover', role: 'tooltip' },
      h('div', { class: 'popover-term' }, entry ? entry.term : btn.dataset.term),
      h('div', { class: 'md', html: entry ? LA.md(entry.def) : '<p class="muted">Noch nicht im Glossar.</p>' }));
    document.body.appendChild(popover);
    const r = btn.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const left = LA.clamp(r.left + r.width / 2 - pw / 2, 8, window.innerWidth - pw - 8);
    const below = r.bottom + 8 + popover.offsetHeight < window.innerHeight;
    popover.style.left = left + 'px';
    popover.style.top = (below ? r.bottom + 8 : r.top - popover.offsetHeight - 8) + 'px';
  }
  document.addEventListener('click', (e) => {
    const term = e.target.closest('.term');
    if (term) {
      e.preventDefault();
      e.stopPropagation();
      popover && popover._for === term ? closePopover() : (openPopover(term), (popover._for = term));
    } else if (popover && !e.target.closest('.popover')) closePopover();
  }, true); // Capture-Phase: Begriffe in Antwort-Buttons lösen nicht die Antwort aus
  document.addEventListener('scroll', closePopover, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popover) {
      e.stopPropagation(); // nur das Popover schließen, nicht die Lektion
      closePopover();
    }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('term')) {
      e.preventDefault();
      e.stopPropagation();
      openPopover(e.target);
    }
  }, true);

  /* ---------- Öffentliche API ---------- */
  LA.app = {
    setTheme(t) {
      LA.store.setting('theme', t);
      applyTheme();
    },
    setFocus(on) {
      document.body.classList.toggle('focus-mode', on);
    },
  };
  LA.router = {
    go: (hash) => (location.hash === hash ? render() : (location.hash = hash)),
    refresh: render,
  };

  /* ---------- Start ---------- */
  function init() {
    const app = document.getElementById('app');
    app.replaceChildren(header, main);
    applyTheme();
    LA.store.on(updateHeader);
    // Online-Fassung: erst Katalog und Stand holen (oder Einrichtung zeigen), lokal nur kurz auf den Sync warten
    main.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'spinner' })));
    LA.sync.ready().then((blocker) => {
      if (blocker) return main.replaceChildren(blocker.el);
      window.addEventListener('hashchange', () => render());
      render();
      LA.challenges.check();
      LA.store.recordDue(); // fällige Karten von heute für die Statistik
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
