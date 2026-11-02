/* Grafik-Bausteine für Erklärungen. Jede Grafik ist reine Daten → wird hier gerendert.
 * Farben laufen über CSS-Variablen (--c1 … --c6, --accent), damit Hell/Dunkel automatisch passt.
 * Übersicht aller Typen und Felder: docs/CONTENT_GUIDE.md */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, s } = LA;

  const color = (c, i) => {
    if (c === 'accent') return 'var(--accent)';
    if (typeof c === 'string' && c.startsWith('#')) return c;
    const n = typeof c === 'number' ? c : i;
    return `var(--c${(((n - 1) % 6) + 6) % 6 + 1})`;
  };
  // Index ab 0 → Farbe 1..6
  const nth = (i, c) => (c != null ? color(c, i) : `var(--c${(i % 6) + 1})`);

  /** Text für SVG in Zeilen umbrechen */
  function wrap(text, max) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > max) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function svgText(x, y, text, max, attrs = {}) {
    const lines = wrap(text, max);
    const lh = attrs.lh || 15;
    const t = s('text', { x, y: y - ((lines.length - 1) * lh) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...attrs });
    lines.forEach((l, i) => t.appendChild(s('tspan', { x, dy: i ? lh : 0 }, l)));
    return t;
  }

  const animateLater = (fn) => setTimeout(fn, 60);

  LA.renderFigure = (fig, topic) => {
    if (!fig) return null;
    if (Array.isArray(fig)) return h('div', { class: 'fig-stack' }, fig.map((f) => LA.renderFigure(f, topic)));
    const fn = LA.figures[fig.type];
    let inner;
    try {
      inner = fn ? fn(fig, topic) : h('div', { class: 'fig-error' }, `Unbekannter Grafik-Typ „${fig.type}“`);
    } catch (e) {
      console.error(e);
      inner = h('div', { class: 'fig-error' }, `Grafik „${fig.type}“ konnte nicht gezeichnet werden: ${e.message}`);
    }
    return h('figure', { class: `fig fig-${fig.type}`, style: fig.maxWidth ? { maxWidth: fig.maxWidth + 'px' } : null },
      fig.title ? h('div', { class: 'fig-title' }, fig.title) : null,
      inner,
      fig.caption ? h('figcaption', { html: LA.mdi(fig.caption) }) : null);
  };

  const resolveSrc = (src, topic) => (/^(https?:|data:|\/)/.test(src) || !topic ? src : `topics/${topic.id}/${src}`);

  /* ---------- svg: eigene Zeichnung ---------- */
  // minWidth: dichte Zeichnungen auf schmalen Bildschirmen nicht stauchen, sondern seitlich verschiebbar machen
  LA.defineFigure('svg', (f) =>
    h('div', { class: 'fig-svg' + (f.minWidth ? ' fig-scroll' : ''), style: f.minWidth ? { '--fig-min': f.minWidth + 'px' } : null, html: f.svg }));

  /* ---------- image ---------- */
  LA.defineFigure('image', (f, topic) =>
    h('div', { class: 'fig-image' },
      h('img', { src: resolveSrc(f.src, topic), alt: f.alt || '', loading: 'lazy' }),
      f.credit ? h('div', { class: 'fig-credit', html: LA.mdi(f.credit) }) : null));

  /* ---------- flow: Prozess mit Pfeilen ---------- */
  LA.defineFigure('flow', (f) => {
    const steps = f.steps.map((x) => (typeof x === 'string' ? { label: x } : x));
    const wrapEl = h('div', { class: `flow flow-${f.direction || 'row'}${steps.length > 4 ? ' flow-many' : ''}` });
    steps.forEach((st, i) => {
      if (i) wrapEl.appendChild(h('div', { class: 'flow-arrow' }, LA.icon('arrowRight')));
      wrapEl.appendChild(h('div', { class: 'flow-node', style: { '--node': nth(i, st.color) } },
        st.icon ? h('div', { class: 'flow-icon' }, st.icon) : h('div', { class: 'flow-num' }, i + 1),
        h('div', { class: 'flow-label', html: LA.mdi(st.label) }),
        st.sub ? h('div', { class: 'flow-sub', html: LA.mdi(st.sub) }) : null));
    });
    if (!f.loop) return wrapEl;
    return h('div', null, wrapEl, h('div', { class: 'flow-loop' }, LA.icon('refresh'), f.loop === true ? 'und wieder von vorn' : f.loop));
  });

  /* ---------- cycle: Kreislauf ---------- */
  LA.defineFigure('cycle', (f) => {
    const items = f.items.map((x) => (typeof x === 'string' ? { label: x } : x));
    const n = items.length;
    const W = 480, H = 440, cx = W / 2, cy = H / 2;
    const R = n > 6 ? 168 : 150;
    const nw = n > 6 ? 108 : 124, nh = 52;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cycle-svg', role: 'img', 'aria-label': items.map((x) => x.label).join(' → ') });
    svg.appendChild(s('circle', { cx, cy, r: R, class: 'cycle-ring' }));
    const ang = (i) => (-90 + (i * 360) / n) * (Math.PI / 180);
    for (let i = 0; i < n; i++) {
      const a = (ang(i) + ang(i + 1)) / 2;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      // Tangente im Uhrzeigersinn = Winkel + 90°
      const deg = (a * 180) / Math.PI + 90;
      svg.appendChild(s('path', { d: 'M-7 -6 L5 0 L-7 6 Z', transform: `translate(${x} ${y}) rotate(${deg})`, class: 'cycle-arrow' }));
    }
    if (f.center) svg.appendChild(svgText(cx, cy, f.center, 16, { class: 'cycle-center', lh: 18 }));
    items.forEach((it, i) => {
      const x = cx + R * Math.cos(ang(i)), y = cy + R * Math.sin(ang(i));
      const g = s('g', { class: 'cycle-node', style: `--node:${nth(i, it.color)}` });
      g.appendChild(s('rect', { x: x - nw / 2, y: y - nh / 2, width: nw, height: nh, rx: 14 }));
      g.appendChild(svgText(x, y, (it.icon ? it.icon + ' ' : '') + it.label, n > 6 ? 13 : 15, { class: 'cycle-label' }));
      if (it.sub) g.appendChild(s('title', null, it.sub));
      svg.appendChild(g);
    });
    const subs = items.filter((x) => x.sub);
    return h('div', { class: 'cycle' }, svg,
      subs.length ? h('ol', { class: 'cycle-legend' }, items.map((it) => h('li', { html: `<strong>${LA.mdi(it.label)}</strong>${it.sub ? ' – ' + LA.mdi(it.sub) : ''}` }))) : null);
  });

  /* ---------- compare: Gegenüberstellung ---------- */
  LA.defineFigure('compare', (f) =>
    h('div', { class: 'compare', style: { '--cols': f.columns.length } },
      f.columns.map((col, i) =>
        h('div', { class: `compare-col${col.tone ? ' tone-' + col.tone : ''}`, style: col.tone ? null : { '--col': nth(i, col.color) } },
          h('div', { class: 'compare-head' }, col.icon ? h('span', { class: 'compare-icon' }, col.icon) : null, h('span', { html: LA.mdi(col.title) })),
          h('ul', null, (col.items || []).map((it) => h('li', { html: LA.mdi(it) }))),
          col.footer ? h('div', { class: 'compare-foot', html: LA.mdi(col.footer) }) : null))));

  /* ---------- bars: Balkendiagramm (horizontal) ---------- */
  LA.defineFigure('bars', (f) => {
    const max = f.max || Math.max(...f.data.map((d) => d.value));
    const unit = f.unit || '';
    const root = h('div', { class: 'bars' });
    let group = null;
    f.data.forEach((d, i) => {
      if (d.group && d.group !== group) {
        group = d.group;
        root.appendChild(h('div', { class: 'bars-group' }, group));
      }
      const fill = h('div', { class: 'bar-fill', style: { background: nth(i, d.color) } });
      root.appendChild(h('div', { class: 'bar-row' + (d.highlight ? ' hl' : '') },
        h('div', { class: 'bar-label', html: LA.mdi(d.label) }),
        h('div', { class: 'bar-track' }, fill),
        h('div', { class: 'bar-value' }, `${String(d.value).replace('.', ',')}${unit}`)));
      animateLater(() => (fill.style.width = Math.max(1, (d.value / max) * 100) + '%'));
    });
    return root;
  });

  /* ---------- line: Liniendiagramm ---------- */
  LA.defineFigure('line', (f) => {
    const cat = f.x && f.x.labels;
    // Kategorie-Achsen brauchen rechts Platz für das zentrierte letzte Label
    const W = 640, Hh = 320, m = { l: 56, r: cat ? 36 : 20, t: 18, b: f.x && f.x.label ? 58 : 40 };
    const iw = W - m.l - m.r, ih = Hh - m.t - m.b;
    const series = f.series.map((sr) => ({ ...sr, pts: sr.points || sr.values.map((v, i) => [i, v]) }));
    const xs = series.flatMap((sr) => sr.pts.map((p) => p[0]));
    const ys = series.flatMap((sr) => sr.pts.map((p) => p[1]));
    const x0 = cat ? 0 : f.x && f.x.min != null ? f.x.min : Math.min(...xs);
    const x1 = cat ? cat.length - 1 : f.x && f.x.max != null ? f.x.max : Math.max(...xs);
    const y0 = f.y && f.y.min != null ? f.y.min : Math.min(0, ...ys);
    const y1 = f.y && f.y.max != null ? f.y.max : Math.max(...ys);
    const X = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * iw;
    const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'line-svg', role: 'img', 'aria-label': f.title || 'Liniendiagramm' });

    const yTicks = (f.y && f.y.ticks) || niceTicks(y0, y1, 5);
    const yUnit = (f.y && f.y.unit) || '';
    yTicks.forEach((v) => {
      svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'grid' }));
      svg.appendChild(s('text', { x: m.l - 8, y: Y(v), class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, fmt(v) + yUnit));
    });
    const xTicks = cat ? cat.map((_, i) => i) : (f.x && f.x.ticks) || niceTicks(x0, x1, 6);
    xTicks.forEach((v) => svg.appendChild(s('text', { x: X(v), y: m.t + ih + 20, class: 'tick', 'text-anchor': 'middle' }, cat ? cat[v] : fmt(v) + ((f.x && f.x.unit) || ''))));
    svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, class: 'axis' }));
    if (f.x && f.x.label) svg.appendChild(s('text', { x: m.l + iw / 2, y: Hh - 8, class: 'axis-label', 'text-anchor': 'middle' }, f.x.label));
    if (f.y && f.y.label) svg.appendChild(s('text', { x: 14, y: m.t + ih / 2, class: 'axis-label', 'text-anchor': 'middle', transform: `rotate(-90 14 ${m.t + ih / 2})` }, f.y.label));

    (f.marks || []).forEach((mk) => {
      svg.appendChild(s('line', { x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: m.t + ih, class: 'mark' }));
      if (mk.label) svg.appendChild(s('text', { x: X(mk.x) + 6, y: m.t + 12, class: 'mark-label' }, mk.label));
    });

    series.forEach((sr, i) => {
      const pts = sr.pts.map(([x, y]) => [X(x), Y(y)]);
      const col = nth(i, sr.color);
      if (sr.area) svg.appendChild(s('path', { d: path(pts, f.smooth !== false) + ` L${pts[pts.length - 1][0]} ${m.t + ih} L${pts[0][0]} ${m.t + ih} Z`, fill: col, class: 'area' }));
      const line = s('path', { d: path(pts, f.smooth !== false), stroke: col, class: 'series' + (sr.dashed ? ' dashed' : '') });
      svg.appendChild(line);
      if (f.dots !== false)
        sr.pts.forEach(([x, y], j) => {
          const c = s('circle', { cx: pts[j][0], cy: pts[j][1], r: 4.5, fill: col, class: 'dot' });
          c.appendChild(s('title', null, `${sr.name ? sr.name + ': ' : ''}${cat ? cat[x] : fmt(x)} → ${fmt(y)}${yUnit}`));
          svg.appendChild(c);
        });
      if (!sr.dashed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animateLater(() => {
          const len = line.getTotalLength ? line.getTotalLength() : 0;
          if (!len) return;
          line.style.strokeDasharray = len;
          line.style.strokeDashoffset = len;
          line.getBoundingClientRect();
          line.style.transition = 'stroke-dashoffset 1.1s ease';
          line.style.strokeDashoffset = 0;
        });
      }
    });

    const legend = series.length > 1 || series[0].name
      ? h('div', { class: 'legend' }, series.map((sr, i) => h('span', null, h('i', { style: { background: nth(i, sr.color) } }), sr.name)))
      : null;
    return h('div', { class: 'line-chart' }, svg, legend);
  });

  function fmt(v) {
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');
  }
  function niceTicks(a, b, n) {
    const span = b - a || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  function path(pts, smooth) {
    if (!smooth || pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const t = 0.18;
      d += ` C${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t}, ${p2[0] - (p3[0] - p1[0]) * t} ${p2[1] - (p3[1] - p1[1]) * t}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  /* ---------- tiles: Kacheln mit Icon ---------- */
  LA.defineFigure('tiles', (f) =>
    h('div', { class: 'tiles', style: f.columns ? { '--tile-cols': f.columns } : null },
      f.items.map((it, i) =>
        h('div', { class: 'tile', style: { '--tile': nth(i, it.color) } },
          it.icon ? h('div', { class: 'tile-icon' }, it.icon) : null,
          h('div', { class: 'tile-title', html: LA.mdi(it.title) }),
          it.text ? h('div', { class: 'tile-text', html: LA.mdi(it.text) }) : null))));

  /* ---------- timeline: Zeitstrahl ---------- */
  LA.defineFigure('timeline', (f) =>
    h('ol', { class: 'timeline' },
      f.events.map((ev, i) =>
        h('li', { style: { '--dot': nth(i, ev.color) } },
          h('div', { class: 'tl-date' }, ev.date),
          h('div', { class: 'tl-body' }, h('div', { class: 'tl-title', html: LA.mdi(ev.title) }), ev.text ? h('div', { class: 'tl-text', html: LA.mdi(ev.text) }) : null)))));

  /* ---------- layers: Schichten / Stapel ---------- */
  LA.defineFigure('layers', (f) =>
    h('div', { class: 'layers' },
      h('div', { class: 'layers-stack' },
        f.layers.map((l, i) => {
          const L = typeof l === 'string' ? { label: l } : l;
          return h('div', { class: 'layer', style: { '--layer': nth(i, L.color) } },
            L.tag ? h('span', { class: 'layer-tag' }, L.tag) : null,
            h('div', { class: 'layer-label', html: LA.mdi(L.label) }),
            L.sub ? h('div', { class: 'layer-sub', html: LA.mdi(L.sub) }) : null);
        })),
      f.arrow ? h('div', { class: 'layers-arrow' }, h('span', null, f.arrow)) : null));

  /* ---------- table ---------- */
  LA.defineFigure('table', (f) =>
    h('div', { class: 'table-wrap' },
      h('table', null,
        f.head ? h('thead', null, h('tr', null, f.head.map((c) => h('th', { html: LA.mdi(c) })))) : null,
        h('tbody', null, f.rows.map((r) => h('tr', null, r.map((c) => h('td', { html: LA.mdi(c) }))))))));

  /* ---------- code: schlichtes Syntax-Highlighting ----------
   * Zeilenweiser Tokenizer: pro Sprache eine Liste [Klasse, sticky-RegExp]. Die erste passende Regel gewinnt,
   * sonst wird ein ganzes Wort als Klartext übernommen (damit z. B. "int" nicht in "interval" greift).
   * Klassen: c Kommentar · s String · k Schlüsselwort · a Annotation/Präfix · n Zahl · t Typ · f Schlüssel/Funktion · v Variable */
  const R = (src) => new RegExp(src, 'y');
  const words = (list) => R(`\\b(?:${list.trim().split(/\s+/).join('|')})\\b`);
  const esc = (t) => LA.escapeHtml(t);
  const tok = (cls, t) => (!t ? '' : cls ? `<span class="tk-${cls}">${esc(t)}</span>` : esc(t));
  const STR = [['s', R('"(?:[^"\\\\]|\\\\.)*"?')], ['s', R("'(?:[^'\\\\]|\\\\.)*'?")]];
  const NUM = ['n', R('\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[LlFfDd]?\\b')];
  const BLOCK = ['c', R('/\\*.*?(?:\\*/|$)'), (t, st) => (st.block = !(t.length > 3 && t.endsWith('*/')))];
  const cLike = (kw, extra = []) => [['c', R('//.*')], BLOCK, ...STR, ['s', R('`[^`]*`?')], ['a', R('@[A-Za-z_][\\w.]*')], ...extra, NUM, ['k', words(kw)], ['t', R('\\b[A-Z][A-Za-z0-9_]*\\b')]];

  const LANGS = {
    java: cLike('abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public record return sealed static super switch this throw throws try var void volatile while yield null true false'),
    kotlin: cLike('as break class companion constructor data do else enum false for fun if import in init interface internal is lateinit null object open override package private protected public return sealed super suspend this throw true try val var when while'),
    groovy: cLike('pipeline agent any stages stage steps sh when branch environment post always success failure def true false null'),
    typescript: cLike('as async await class const constructor export extends false from function if implements import interface let new null private public readonly return this true type undefined'),
    drl: cLike('rule when then end package import global function modify insert retract salience not exists and or from accumulate collect eval true false null', [['v', R('\\$\\w+')]]),
    hcl: [['c', R('(?:#|//).*')], ...STR, ['f', R('[\\w-]+(?=\\s*=(?!=))')], NUM, ['k', words('resource provider variable output module data locals terraform true false null')]],
    promql: [['c', R('#.*')], ['s', R('"[^"]*"')], ['a', R('\\[\\d+[smhdwy]\\]')], ['f', words('rate irate increase sum avg min max count histogram_quantile topk bottomk by without on ignoring delta deriv absent label_replace')], NUM],
    json: [['f', R('"(?:[^"\\\\]|\\\\.)*"(?=\\s*:)')], STR[0], ['n', R('-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b')], ['k', words('true false null')]],
    xml: [['c', R('<!--.*?(?:-->|$)')], ['a', R('#\\{[^}]*\\}')], ['k', R('</?[\\w:.-]+')], ['k', R('/?>')], ['f', R('[\\w:.-]+(?==)')], ['s', R('"[^"]*"')]],
    dockerfile: [['c', R('#.*')], ['k', R('\\b(?:FROM|RUN|COPY|ADD|ENV|EXPOSE|USER|WORKDIR|ENTRYPOINT|CMD|ARG|LABEL|AS)\\b')], ...STR, ['a', R('--[\\w-]+(?:=\\S*)?')], ['v', R('\\$\\{?\\w+\\}?')], NUM],
  };
  const YAML_VAL = [['c', R('(?<=^|\\s)#.*')], ['a', R('\\{\\{.*?\\}\\}')], ...STR, ['n', R('(?<=^|[\\s\\[,])(?:true|false|null|-?\\d+(?:\\.\\d+)?)(?=$|[\\s,\\]}])')]];
  const BASH = [['c', R('(?<=^|\\s)#.*')], ...STR, ['v', R('\\$\\{?\\w+\\}?')], ['a', R('(?<=\\s)--?[\\w-]+')]];
  const ALIAS = { kt: 'kotlin', jenkinsfile: 'groovy', ts: 'typescript', terraform: 'hcl', tf: 'hcl', html: 'xml', xhtml: 'xml', containerfile: 'dockerfile', yml: 'yaml', sh: 'bash', shell: 'bash', cli: 'bash' };

  function run(line, rules, st) {
    let out = '';
    let plain = '';
    let i = 0;
    outer: while (i < line.length) {
      for (const [cls, re, onMatch] of rules) {
        re.lastIndex = i;
        const m = re.exec(line);
        if (m && m[0].length) {
          out += esc(plain) + tok(cls, m[0]);
          plain = '';
          i += m[0].length;
          if (onMatch) onMatch(m[0], st);
          continue outer;
        }
      }
      const w = /[\w$]+|[^]/y;
      w.lastIndex = i;
      const m = w.exec(line);
      plain += m[0];
      i += m[0].length;
    }
    return out + esc(plain);
  }

  /** Eine Codezeile als HTML mit Token-Spans; st trägt Zustand über Zeilen (Blockkommentare) */
  LA.highlight = (line, lang, st = {}) => {
    lang = ALIAS[lang] || lang;
    if (lang === 'yaml') {
      const m = /^(\s*(?:-\s+)?)([^\s#'"{-][^:#]*?|"[^"]*"|'[^']*')(:)(?=\s|$)/.exec(line);
      return m ? esc(m[1]) + tok('f', m[2]) + esc(m[3]) + run(line.slice(m[0].length), YAML_VAL, st) : run(line, YAML_VAL, st);
    }
    if (lang === 'properties') {
      if (/^\s*[#!]/.test(line)) return tok('c', line);
      const m = /^(\s*)(%[\w,-]+\.)?([^=:\s]+)(\s*[=:]\s*)(.*)$/.exec(line);
      return m ? esc(m[1]) + tok('a', m[2]) + tok('f', m[3]) + esc(m[4]) + tok('s', m[5]) : esc(line);
    }
    if (lang === 'bash') {
      if (/^\s*#/.test(line)) return tok('c', line);
      const m = /^(\s*)(\$\s+|\[[^\]]*\]\s*)?([\w./:=-]+)/.exec(line);
      return m ? esc(m[1]) + tok('c', m[2]) + tok('k', m[3]) + run(line.slice(m[0].length), BASH, st) : run(line, BASH, st);
    }
    const rules = LANGS[lang];
    if (!rules) return esc(line);
    if (st.block) {
      const end = line.indexOf('*/');
      if (end < 0) return tok('c', line);
      st.block = false;
      return tok('c', line.slice(0, end + 2)) + run(line.slice(end + 2), rules, st);
    }
    return run(line, rules, st);
  };

  LA.defineFigure('code', (f) => {
    const lines = String(f.code).replace(/\n$/, '').split('\n');
    const hl = new Set(f.highlight || []);
    const st = {};
    return h('pre', { class: 'code' + (f.lang ? ' lang-' + f.lang : '') },
      f.lang ? h('span', { class: 'code-lang' }, f.lang) : null,
      h('code', null, lines.map((ln, i) => h('span', { class: 'code-line' + (hl.has(i + 1) ? ' hl' : ''), html: LA.highlight(ln, f.lang, st) + '\n' }))));
  });

  LA.figureWrap = wrap;
})();
