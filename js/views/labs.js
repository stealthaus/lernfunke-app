/* Lab-Liste: Übungen am Rechner (Erklärkarten mit `lab: true`) – am Handy gemerkt, am Rechner abgearbeitet.
 *
 * #/r/<reise>/labs   alle Labs einer Lernreise
 * #/t/<id>/labs      alle Labs eines Themas
 * #/labs             alle Themen, in denen schon ein Lab gemerkt oder erledigt ist
 * ?zeige=later|open|done wählt den Filter vor
 *
 * Jedes Lab lässt sich aufklappen und zeigt die ganze Karte samt Befehlen – so kann man direkt
 * aus der Liste heraus arbeiten. Der Status ändert sich über dieselben Knöpfe wie in der Lektion. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;
  LA.views = LA.views || {};

  const STATUS = {
    later: { icon: 'bookmark', label: 'Gemerkt' },
    done: { icon: 'check', label: 'Erledigt' },
  };
  const FILTERS = [
    ['later', 'Gemerkt'],
    ['open', 'Offen'],
    ['done', 'Erledigt'],
  ];

  LA.views.labs = async ({ id: topicId, seriesId, query }) => {
    const series = seriesId ? LA.series.find((s) => s.id === seriesId) : null;
    if (seriesId && !series) throw new Error(`Unbekannte Lernreise „${seriesId}“`);
    const st = LA.store.get();
    const ids = series
      ? series.topics.filter((id) => LA.catalogEntry(id))
      : topicId
        ? [topicId]
        : LA.catalog.map((t) => t.id).filter((id) => Object.keys((st.topics[id] || {}).labs || {}).length);
    const topics = await Promise.all(ids.map((id) => LA.loadTopic(id)));
    const single = topicId ? topics[0] : null;

    const status = (topicId, lab) => (LA.store.labState(topicId, lab) || {}).s || 'open';
    const groups = topics
      .map((topic) => ({ topic, labs: LA.topicLabs(topic) }))
      .filter((g) => g.labs.length);
    const all = groups.flatMap((g) => g.labs.map((x) => ({ ...x, topic: g.topic })));
    const counts = () => {
      const c = { later: 0, open: 0, done: 0 };
      all.forEach((x) => c[status(x.topic.id, x.step._lab)]++);
      return c;
    };

    // Ohne Gemerktes zeigt die Liste die offenen Labs – sonst wäre sie beim ersten Besuch leer
    let filter = FILTERS.some(([k]) => k === query.zeige) ? query.zeige : counts().later ? 'later' : 'open';

    const list = h('div', { class: 'lab-list' });
    const empty = h('p', { class: 'muted lab-empty', hidden: true });
    const tabs = h('div', { class: 'segmented lab-filter', role: 'group', 'aria-label': 'Labs filtern' });
    const tabBtns = FILTERS.map(([key, label]) => {
      const b = h('button', { type: 'button' });
      b.addEventListener('click', () => {
        filter = key;
        paintTabs();
        renderList();
      });
      b.dataset.key = key;
      b.dataset.label = label;
      tabs.appendChild(b);
      return b;
    });
    function paintTabs() {
      const c = counts();
      tabBtns.forEach((b) => {
        const on = b.dataset.key === filter;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
        b.textContent = `${b.dataset.label} · ${c[b.dataset.key]}`;
      });
    }

    // Karten bleiben offen und an ihrem Platz, wenn sich der Status ändert – nur Kennzeichen und Zähler folgen
    const chips = [];
    function chip(x) {
      const el = h('span', { class: 'lab-chip' });
      const paint = () => {
        const s = status(x.topic.id, x.step._lab);
        el.className = 'lab-chip' + (STATUS[s] ? ' is-' + s : '');
        el.replaceChildren(...(STATUS[s] ? [icon(STATUS[s].icon), STATUS[s].label] : []));
        el.hidden = !STATUS[s];
      };
      paint();
      chips.push(paint);
      return el;
    }

    function item(x) {
      const body = h('div', { class: 'lab-body', dataset: { topic: x.topic.id } });
      const d = h('details', { class: 'lab-item card' },
        h('summary', null,
          h('span', { class: 'lab-sum' },
            h('span', { class: 'lab-title', html: LA.mdi(x.step.title.replace(/^🧪\s*Lab:\s*/, '')) }),
            h('span', { class: 'lab-where muted' }, `Lektion ${x.lesson.index + 1}: ${x.lesson.title}`)),
          chip(x),
          icon('down', 'lab-caret')),
        body);
      // Inhalt erst beim Aufklappen bauen – die Liste kann viele Grafiken und Codeblöcke enthalten
      d.addEventListener('toggle', () => {
        if (!d.open || body.childElementCount) return;
        body.append(
          LA.steps.explain.render(x.step, { topic: x.topic }).el,
          h('a', { class: 'btn btn-ghost lab-open', href: `#/t/${x.topic.id}/l/${x.lesson.id}?schritt=${x.index}` }, icon('book'), 'In der Lektion ansehen'));
      });
      return d;
    }

    function renderList() {
      chips.length = 0;
      const show = (x) => status(x.topic.id, x.step._lab) === filter;
      const parts = groups.map((g) => {
        const labs = g.labs.map((x) => ({ ...x, topic: g.topic })).filter(show);
        if (!labs.length) return null;
        return h('section', { class: 'lab-group' },
          single ? null : h('h2', { class: 'lab-group-head' }, h('span', { 'aria-hidden': 'true' }, g.topic.icon || '📘'), g.topic.title),
          labs.map(item));
      }).filter(Boolean);
      list.replaceChildren(...parts);
      empty.hidden = parts.length > 0;
      empty.textContent = !all.length
        ? 'Hier gibt es (noch) keine Labs.'
        : filter === 'later'
          ? 'Nichts gemerkt. Tippe bei einem Lab auf „Später machen“, dann erscheint es hier.'
          : filter === 'done'
            ? 'Noch kein Lab abgehakt.'
            : 'Alle Labs sind gemerkt oder erledigt.';
    }

    paintTabs();
    renderList();
    const off = LA.store.on(() => {
      paintTabs();
      chips.forEach((fn) => fn());
    });

    const back = series
      ? h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite')
      : single
        ? h('a', { class: 'back-link', href: `#/t/${single.id}` }, icon('arrowLeft'), single.title)
        : h('a', { class: 'back-link', href: '#/' }, icon('arrowLeft'), 'Startseite');
    const scope = series ? series.title : single ? single.title : 'Alle Themen';

    return {
      el: h('div', { class: 'page lab-page' },
        back,
        h('div', { class: 'lab-hero' },
          h('span', { class: 'lab-hero-icon', 'aria-hidden': 'true' }, icon('laptop')),
          h('div', null,
            h('h1', null, 'Labs'),
            h('p', { class: 'muted' }, `${scope} · ${LA.plural(all.length, 'Lab', 'Labs')}. Übungen fürs Terminal: unterwegs merken, am Rechner abarbeiten.`))),
        all.length ? tabs : null,
        empty,
        list),
      destroy: off,
    };
  };
})();
