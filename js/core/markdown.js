/* Mini-Markdown für Lerninhalte.
 * Block:  Absätze (Leerzeile), "- " Listen, "1. " Listen, "### " Zwischenüberschrift, "> " Zitat
 * Inline: **fett**, *kursiv*, `code`, ==markiert==, [Text](url), H~2~O, x^2^,
 *         [[Begriff]] bzw. [[Begriff|Anzeigetext]] → Glossar-Popover */
(function () {
  'use strict';
  const LA = window.LA;

  function inline(src) {
    let s = LA.escapeHtml(src);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = s
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, term, label) =>
        `<span class="term" role="button" tabindex="0" data-term="${term.trim()}">${(label || term).trim()}</span>`)
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\.{0,2}\/|#)[^)\s]+)\)/g, (_, t, url) =>
        `<a href="${url}"${url.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>')
      .replace(/~([^~\s]+)~/g, '<sub>$1</sub>')
      .replace(/\^([^^\s]+)\^/g, '<sup>$1</sup>')
      .replace(/\n/g, '<br>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function block(src) {
    const blocks = String(src).trim().split(/\n\s*\n/);
    return blocks
      .map((b) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('') + '</ul>';
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return '<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
        if (/^###\s+/.test(b)) return `<h4>${inline(b.replace(/^###\s+/, ''))}</h4>`;
        if (lines.every((l) => /^>\s?/.test(l)))
          return `<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, '')).join('\n'))}</blockquote>`;
        return `<p>${inline(b)}</p>`;
      })
      .join('');
  }

  /** Block-Markdown → HTML-String */
  LA.md = (src) => (src == null ? '' : block(src));
  /** Nur Inline-Formatierung (für Antworten, Buttons, Labels) */
  LA.mdi = (src) => (src == null ? '' : inline(String(src)));
  /** Bequem: Element mit gerendertem Markdown */
  LA.mdEl = (tag, cls, src, isInline) => LA.h(tag, { class: cls, html: isInline ? LA.mdi(src) : LA.md(src) });
})();
