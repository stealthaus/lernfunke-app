/* Geräte-Sync über ein privates GitHub-Repo – ohne eigenen Server.
 *
 * Zwei Fassungen derselben App:
 *  · lokal (Doppelklick, localhost): Inhalte kommen per <script> aus topics/, der Sync ist optional.
 *  · online (öffentliche Hülle auf GitHub Pages, erzeugt von tools/publish-app.sh): topics/ fehlt,
 *    LA.remote ist true, Katalog und Themen kommen mit dem Token über die GitHub-API aus dem privaten Repo.
 * Der Fortschritt liegt als progress.json auf dem Branch `fortschritt` (jeder Sync ist ein Commit –
 * so bleibt main sauber). Zusammengeführt wird mit LA.store.merge, deshalb geht nichts verloren.
 * Token und Repo stehen nur im localStorage des jeweiligen Browsers.
 *
 * Schneller Start: Nichts wartet auf den Fortschritts-Abgleich – die App zeichnet sofort mit dem lokalen
 * Stand und zeichnet die Ansicht neu, falls vom anderen Gerät etwas kommt. Online liegen Katalog, Metadaten
 * und Themen im Cache des Browsers (Cache API); Themen gelten, solange ihr Hash in topics/meta.js passt.
 * Beim Start zeichnet die App aus dem Cache und prüft im Hintergrund, ob es Neues gibt. */
(function () {
  'use strict';
  const LA = window.LA;
  const { h, icon } = LA;
  const KEY = 'lernfunke.sync';
  const BRANCH = 'fortschritt';
  const FILE = 'progress.json';
  const DEFAULT_REPO = 'stealthaus/lernfunke';
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
  const DEBOUNCE = 15000;

  LA.remote = !LA.catalog.length;

  let cfg = null;
  try {
    cfg = JSON.parse(localStorage.getItem(KEY));
  } catch (e) {}

  /* ---------- GitHub-API ---------- */
  async function gh(path, { method = 'GET', body, raw, conf = cfg } = {}) {
    const headers = {
      Authorization: 'Bearer ' + conf.token,
      // raw: Dateiinhalt als Text statt JSON mit Base64. Keine weiteren Header – sonst scheitert der CORS-Preflight
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
    };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch('https://api.github.com/repos/' + conf.repo + path, {
      method, headers, cache: 'no-store', body: body && JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return raw ? res.text() : res.json();
  }

  // Base64 mit UTF-8 (Umlaute!) – btoa/atob allein kennen nur Latin-1
  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  function describe(e) {
    if (e.status === 401) return 'Token ungültig oder abgelaufen';
    if (e.status === 403) return 'Token darf das nicht (nötig: Contents – Read and write)';
    if (e.status === 404) return 'Repo nicht gefunden oder kein Zugriff';
    if (!e.status) return 'Keine Verbindung zu GitHub';
    return e.message;
  }

   /* ---------- Inhalte (nur online) ---------- */
  const fetchText = (path) => gh('/contents/' + path, { raw: true });

  /* Cache für Inhalte: Schlüssel = Pfad + Hash. Ohne Cache API (oder wenn sie scheitert) einfach immer laden. */
  const CACHE = 'lernfunke-inhalte';
  const cacheKey = (path, hash) => new URL('__inhalt/' + path + '?h=' + (hash || 'neu'), location.href).href;
  async function cacheGet(path, hash) {
    try {
      const res = await (await caches.open(CACHE)).match(cacheKey(path, hash));
      return res ? await res.text() : null;
    } catch (e) {
      return null;
    }
  }
  /** Speichern und ältere Fassungen derselben Datei entfernen */
  async function cachePut(path, hash, text) {
    try {
      const c = await caches.open(CACHE);
      const key = cacheKey(path, hash);
      const base = key.split('?')[0];
      await Promise.all((await c.keys()).filter((r) => r.url.split('?')[0] === base && r.url !== key).map((r) => c.delete(r)));
      await c.put(key, new Response(text, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } }));
    } catch (e) {}
  }
  /** Datei mit bekanntem Hash: aus dem Cache, sonst laden und ablegen */
  async function cachedText(path, hash) {
    const hit = hash && (await cacheGet(path, hash));
    if (hit != null) return hit;
    const text = await fetchText(path);
    if (hash) cachePut(path, hash, text);
    return text;
  }

  /** Quelltext wie eine <script>-Datei im globalen Scope ausführen */
  function run(src, name) {
    const s = document.createElement('script');
    s.textContent = src + '\n//# sourceURL=' + name;
    document.head.appendChild(s);
    s.remove();
  }

  /* ---------- Fortschritt ---------- */
  async function readRemote() {
    try {
      const file = await gh(`/contents/${FILE}?ref=${BRANCH}`);
      // Ab 1 MB liefert die Contents-API keinen Inhalt mehr mit – dann über den Blob
      const text = file.content ? fromBase64(file.content) : await gh('/git/blobs/' + file.sha, { raw: true });
      return { doc: JSON.parse(text), sha: file.sha };
    } catch (e) {
      if (e.status === 404) return { doc: null, sha: null };
      throw e;
    }
  }

  /** Branch `fortschritt` beim ersten Mal vom Standard-Branch abzweigen */
  async function ensureBranch() {
    const repo = await gh('');
    const ref = await gh('/git/ref/heads/' + repo.default_branch);
    try {
      await gh('/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + BRANCH, sha: ref.object.sha } });
    } catch (e) {
      if (e.status !== 422) throw e; // 422: gibt es schon
    }
  }

  const writeRemote = (doc, sha) =>
    gh('/contents/' + FILE, {
      method: 'PUT',
      body: { message: 'Fortschritt (' + LA.store.device + ')', content: toBase64(JSON.stringify(doc)), branch: BRANCH, ...(sha ? { sha } : {}) },
    });

  let dirty = false;

  /** Holen → zusammenführen → nur wenn nötig zurückschreiben. Gibt zurück, ob sich hier etwas geändert hat. */
  async function syncOnce(tries) {
    const remote = await readRemote();
    if (!remote.sha) await ensureBranch();
    dirty = false;
    const local = LA.store.doc();
    const merged = LA.store.merge(local, remote.doc || local);
    const c = LA.store.canon(merged);
    const changedHere = c !== LA.store.canon(local);
    if (changedHere) LA.store.applyDoc(merged);
    if (!remote.doc || c !== LA.store.canon(remote.doc)) {
      try {
        await writeRemote(merged, remote.sha);
      } catch (e) {
        // 409/422: ein anderes Gerät hat zwischendurch geschrieben → noch einmal von vorn
        if ((e.status === 409 || e.status === 422) && tries > 0) return (await syncOnce(tries - 1)) || changedHere;
        throw e;
      }
    }
    return changedHere;
  }

  /* ---------- Status ---------- */
  let status = cfg ? { kind: 'idle', text: 'Noch nicht synchronisiert' } : { kind: 'off', text: 'Nicht verbunden' };
  const listeners = new Set();
  function setStatus(kind, text) {
    status = { kind, text };
    listeners.forEach((fn) => fn(status));
  }
  const hhmm = () => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  /* ---------- Ablauf: alles nacheinander, damit sich zwei Syncs nie überholen ---------- */
  let queue = Promise.resolve();
  let timer = null;
  let lastOk = 0;
  let booted = false;

  function schedule(ms = DEBOUNCE) {
    clearTimeout(timer);
    timer = setTimeout(() => sync(), ms);
  }

  function sync({ ifDirty = false, ifStale = false } = {}) {
    if (!cfg) return Promise.resolve();
    queue = queue.then(async () => {
      if ((ifDirty && !dirty) || (ifStale && Date.now() - lastOk < 5000)) return;
      clearTimeout(timer);
      setStatus('busy', 'Synchronisiere …');
      try {
        const changed = await syncOnce(2);
        lastOk = Date.now();
        setStatus('ok', 'Synchronisiert ' + hhmm());
        if (changed) refreshView();
        if (dirty) schedule();
      } catch (e) {
        console.warn('Sync fehlgeschlagen', e);
        dirty = true;
        if (e.status) setStatus('error', 'Sync-Fehler: ' + describe(e));
        else (setStatus('offline', 'Offline – wird später synchronisiert'), schedule(60000));
      }
    });
    return queue;
  }

  /** Neues vom anderen Gerät zeigen – aber nie mitten in einer Lektion oder Kartenrunde.
   *  Scrollposition bleibt, damit die Seite nicht unter dem Finger springt. */
  function refreshView() {
    if (!booted || document.body.classList.contains('focus-mode')) return;
    if (/^#?\/?(profil|themen|t\/[^/]+)?$/.test(location.hash) && LA.router) LA.router.refresh({ keepScroll: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sync({ ifDirty: true }); // App-Wechsel auf dem iPhone
    else sync({ ifStale: true }); // zurück: Neues vom anderen Gerät holen
  });
  window.addEventListener('pagehide', () => sync({ ifDirty: true }));
  window.addEventListener('online', () => sync({ ifDirty: true }));


  /* ---------- Verbinden ---------- */
  function connectForm(onDone) {
    const repo = h('input', { class: 'ce-input', id: 'sync-repo', value: (cfg && cfg.repo) || DEFAULT_REPO, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', required: true });
    const token = h('input', { class: 'ce-input', id: 'sync-token', type: 'password', autocomplete: 'off', placeholder: 'github_pat_…', required: true });
    const error = h('p', { class: 'sync-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Verbinden');
    const form = h('form', { class: 'sync-form' },
      h('h3', null, 'Geräte verbinden'),
      h('p', { class: 'muted' }, 'Inhalte und Fortschritt liegen in deinem privaten GitHub-Repo. Den Token gibst du auf jedem Gerät einmal ein – er bleibt nur in diesem Browser.'),
      h('div', { class: 'ce-field' }, h('label', { class: 'ce-label', for: 'sync-repo' }, 'Repo'), repo),
      h('div', { class: 'ce-field' }, h('label', { class: 'ce-label', for: 'sync-token' }, 'Token'), token),
      h('p', { class: 'muted sync-hint' },
        h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener' }, 'Fine-grained Token anlegen'),
        ': nur dieses Repo, Berechtigung „Contents: Read and write“.'),
      error,
      h('div', { class: 'modal-actions' }, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const conf = { repo: repo.value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), token: token.value.trim() };
      submit.disabled = true;
      submit.textContent = 'Prüfe …';
      error.hidden = true;
      try {
        await gh('', { conf }); // Zugriffstest
        cfg = conf;
        localStorage.setItem(KEY, JSON.stringify(cfg));
        setStatus('idle', 'Noch nicht synchronisiert');
        onDone();
      } catch (err) {
        error.textContent = describe(err);
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Verbinden';
      }
    });
    return form;
  }

  function connectDialog() {
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
    const form = connectForm(() => {
      close();
      if (LA.remote) return location.reload();
      LA.fx.toast('Verbunden', 'Dein Fortschritt wird jetzt mit dem Repo abgeglichen.');
      sync().then(() => LA.router.refresh());
    });
    form.querySelector('.modal-actions').prepend(h('button', { class: 'btn btn-ghost', type: 'button', onclick: close }, 'Abbrechen'));
    const overlay = h('div', { class: 'modal-overlay', onclick: (e) => e.target === overlay && close() },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Geräte verbinden' }, form));
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    form.querySelector(cfg ? '#sync-token' : '#sync-repo').focus();
  }

  async function disconnect() {
    const ok = await LA.fx.dialog({ title: 'Sync trennen?', text: 'Der Token wird aus diesem Browser gelöscht. Dein Fortschritt bleibt hier und im Repo erhalten.', ok: 'Trennen', danger: true });
    if (!ok) return;
    cfg = null;
    localStorage.removeItem(KEY);
    if (LA.remote) return location.reload();
    setStatus('off', 'Nicht verbunden');
    LA.router.refresh();
  }

  /* ---------- Seiten der Online-Fassung, solange keine Inhalte da sind ---------- */
  const page = (...children) => ({ el: h('div', { class: 'page' }, h('section', { class: 'card sync-page' }, ...children)) });

  const setupView = () => page(connectForm(() => location.reload()));

  const errorView = (e) =>
    page(
      h('div', { class: 'result-emoji' }, '🙈'),
      h('h2', null, 'Inhalte nicht erreichbar'),
      h('p', { class: 'muted' }, describe(e)),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, icon('refresh'), 'Erneut versuchen'),
        h('button', { class: 'btn btn-soft', type: 'button', onclick: connectDialog }, 'Verbindung ändern')));

  /* ---------- Katalog und Metadaten der Online-Fassung ---------- */
  const CATALOG = 'topics/catalog.js';
  const META = 'topics/meta.js';

  /** Neuen Katalog bzw. neue Metadaten übernehmen; geänderte Themen fliegen aus dem Speicher */
  function applyContent(catalogSrc, metaSrc) {
    const before = LA.meta.topics;
    if (metaSrc) run(metaSrc, META);
    if (catalogSrc) run(catalogSrc, CATALOG);
    Object.keys(LA.topics).forEach((id) => {
      const now = LA.meta.topics[id];
      if (!now || !before[id] || now.h !== before[id].h) delete LA.topics[id];
    });
  }

  /** Katalog und Metadaten frisch holen. Der Katalog wird nur geladen, wenn sein Hash sich geändert hat.
   *  Rückgabe: true, wenn sich etwas geändert hat */
  async function refreshContent(cached) {
    // Ältere Inhalte ohne topics/meta.js: dann eben nur den Katalog
    const metaSrc = await fetchText(META).catch((e) => (e.status === 404 ? '' : Promise.reject(e)));
    const metaHash = (/"catalog":"(\w+)"/.exec(metaSrc) || [])[1];
    const catalogSrc = cached && metaHash && cached.metaHash === metaHash && cached.catalog ? null : await fetchText(CATALOG);
    if (cached && cached.meta === metaSrc && (catalogSrc == null || catalogSrc === cached.catalog)) return false;
    applyContent(catalogSrc, metaSrc);
    if (!LA.catalog.length) throw new Error('Der Katalog ist leer oder fehlerhaft');
    cachePut(META, 'aktuell', metaSrc);
    if (catalogSrc != null) cachePut(CATALOG, 'aktuell', catalogSrc);
    return true;
  }

  /** Vor dem ersten Zeichnen. Lokal: sofort. Online: aus dem Cache sofort (Neues kommt im Hintergrund),
   *  beim allerersten Start Katalog und Metadaten laden. Der Fortschritts-Abgleich läuft immer nebenher.
   *  Liefert null oder eine Ansicht, die statt der App erscheint (Einrichtung, Fehler). */
  async function ready() {
    const done = (blocker = null) => ((booted = !blocker), blocker);
    if (!LA.remote) {
      if (cfg) sync();
      return done();
    }
    if (!cfg) return done(setupView());
    sync();
    const [catalog, meta] = await Promise.all([cacheGet(CATALOG, 'aktuell'), cacheGet(META, 'aktuell')]);
    if (catalog) {
      const metaHash = (/"catalog":"(\w+)"/.exec(meta || '') || [])[1];
      try {
        applyContent(catalog, meta);
      } catch (e) {}
      if (LA.catalog.length) {
        refreshContent({ catalog, meta: meta || '', metaHash }).then((changed) => changed && refreshView(), (e) => console.warn('Inhalte nicht aktualisiert', e));
        return done();
      }
    }
    try {
      await refreshContent(null);
      return done();
    } catch (e) {
      return done(errorView(e));
    }
  }

  /** Zeile für die Einstellungen im Profil */
  function settingRow() {
    const text = h('span');
    const show = (s) => {
      text.textContent = s.text;
      line.className = 'muted sync-status is-' + s.kind;
    };
    const line = h('div', null, icon('refresh'), text);
    const off = h('div', { class: 'setting' },
      h('div', null, h('strong', null, 'Geräte-Sync'), h('div', { class: 'muted' }, 'Teile deinen Fortschritt über ein privates GitHub-Repo mit deinen anderen Geräten.')),
      h('button', { class: 'btn btn-soft', type: 'button', onclick: connectDialog }, icon('link'), 'Einrichten'));
    if (!cfg) return { el: off, destroy() {} };
    const el = h('div', { class: 'setting' },
      h('div', null, h('strong', null, 'Geräte-Sync'), h('div', { class: 'muted' }, cfg.repo), line),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-soft', type: 'button', onclick: () => sync() }, icon('refresh'), 'Jetzt abgleichen'),
        h('button', { class: 'btn btn-ghost danger-text', type: 'button', onclick: disconnect }, 'Trennen')));
    show(status);
    listeners.add(show);
    return { el, destroy: () => listeners.delete(show) };
  }

  LA.sync = {
    ready, sync, settingRow, connectDialog, fetchText, cachedText, run,
    connected: () => !!cfg,
    status: () => status,
    on: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    /** Vom Store bei jeder lokalen Änderung: gesammelt nach 15 s abgleichen */
    touched() {
      if (!cfg) return;
      dirty = true;
      schedule();
    },
  };
})();
