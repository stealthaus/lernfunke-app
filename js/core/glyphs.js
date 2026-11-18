/* Glyphen: eigene Piktogramme statt Emojis (Stil „Fläche“: gefüllt, eckig, 24er-Raster).
 * Alle Formen sind Flächen in currentColor, Löcher über fill-rule evenodd – damit funktionieren
 * sie hell wie dunkel. LA.glyph(name) → <span class="gl">; LA.glyph(name, 'tile') mit Fläche dahinter.
 * Inhalte geben `icon` als Glyphenname an; Emojis aus älteren Inhalten werden über FROM_EMOJI
 * abgebildet. Unbekanntes bleibt als Text stehen (z. B. „λ“ oder eine Ziffer). */
(function (LA) {
  'use strict';

  const G = {
    // ---------- Lernen, Fortschritt, Spiele ----------
    spark: '<path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/>',
    diamond: '<path d="M6 3h12l4 5H2zM2 10h20L12 22z"/>',
    target: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"/><circle cx="12" cy="12" r="3.5"/>',
    flame: '<path d="M12 1l7 11v3a7 7 0 0 1-14 0v-3l3.5-5L11 11z"/>',
    medal: '<path d="M4 1h5.5L12 7l2.5-6H20l-4.5 9h-7z"/><circle cx="12" cy="16" r="7"/>',
    lifebuoy: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 6a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM10.8 2h2.4v5h-2.4zM10.8 17h2.4v5h-2.4zM2 10.8h5v2.4H2zM17 10.8h5v2.4h-5z"/>',
    calendar: '<path d="M2 4h20v19H2zm2 7v10h16V11z"/><path d="M6 1h2.5v5H6zM15.5 1H18v5h-2.5zM6 13h5v5H6z"/>',
    map: '<path d="M1 4l7-2.5v18L1 22zM9.5 1.5l5 2.5v18.5l-5-2.5zM16 4l7-2.5v18L16 22z"/>',
    rocket: '<path d="M12 1c4 3 5 7 5 11v5H7v-5c0-4 1-8 5-11zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M6 12l-4 4v5l4-3zM18 12l4 4v5l-4-3zM9.5 18.5h5L12 23z"/>',
    cards: '<path d="M8 1h14v17h-2.5V3.5H8z"/><path d="M2 5h15v18H2z"/>',
    bolt: '<path d="M14 1L3 14h7l-2 9 11-13h-7z"/>',
    gamepad: '<path d="M1 6h22v12H1zm4 5v2h2v2h2v-2h2v-2H9V9H7v2zm10-1v2.2h2.2V10zm3 3v2.2h2.2V13z"/>',
    cap: '<path d="M12 3L1 8.5l11 5.5 11-5.5z"/><path d="M5 12v5c2 2 4.5 3 7 3s5-1 7-3v-5l-7 3.5z"/><path d="M20.5 10h2v7h-2z"/>',
    trophy: '<path d="M6 2h12v7a6 6 0 0 1-12 0z"/><path d="M1.5 3H5v2.5H4V7a2 2 0 0 0 2 2v2.5A4.5 4.5 0 0 1 1.5 7zM22.5 3H19v2.5h1V7a2 2 0 0 1-2 2v2.5A4.5 4.5 0 0 0 22.5 7z"/><path d="M10.5 15h3v4h-3zM6.5 19h11v3h-11z"/>',
    question: '<path d="M6.5 8.5a5.5 5.5 0 1 1 8.4 4.7c-1.2.8-1.4 1.3-1.4 2.3v.5h-3.2v-.8c0-2.2 1-3.3 2.6-4.4a2.3 2.3 0 1 0-3.2-2.3z"/><path d="M10.3 18.3h3.2v3.2h-3.2z"/>',
    eye: '<path d="M12 4.5C5.5 4.5 1 12 1 12s4.5 7.5 11 7.5S23 12 23 12s-4.5-7.5-11-7.5zm0 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/><circle cx="12" cy="12" r="2"/>',
    heart: '<path d="M12 21.5L2.4 11.8A5.4 5.4 0 0 1 12 5.2a5.4 5.4 0 0 1 9.6 6.6z"/>',
    bulb: '<path d="M12 1a8 8 0 0 0-4.5 14.6V18h9v-2.4A8 8 0 0 0 12 1z"/><path d="M7.5 19.5h9V22h-9z"/>',
    book: '<path d="M1 3c4 0 8 1 10 3v16c-2-2-6-3-10-3zM23 3c-4 0-8 1-10 3v16c2-2 6-3 10-3z"/>',
    link: '<path d="M1 4h13v10H1zm2.6 2.6v4.8h7.8V6.6z"/><path d="M10 10h13v10H10zm2.6 2.6v4.8h7.8v-4.8z"/>',
    // ---------- Status ----------
    check: '<path d="M9 20.5L1.5 13l2.8-2.8L9 14.9 19.7 4.2l2.8 2.8z"/>',
    cross: '<path d="M4.2 1.4L12 9.2l7.8-7.8 2.8 2.8-7.8 7.8 7.8 7.8-2.8 2.8-7.8-7.8-7.8 7.8-2.8-2.8 7.8-7.8-7.8-7.8z"/>',
    plus: '<path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z"/>',
    stop: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM5 10.5h14v3H5z"/>',
    warning: '<path d="M12 1.5L23 22H1zM10.8 8.5v7h2.4v-7zm0 9v2.4h2.4v-2.4z"/>',
    dot: '<circle cx="12" cy="12" r="8"/>',
    ring: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"/>',
    // ---------- Pfeile & Abläufe ----------
    arrowRight: '<path d="M1 10h13.5V4l8.5 8-8.5 8v-6H1z"/>',
    arrowLeft: '<path d="M23 10H9.5V4L1 12l8.5 8v-6H23z"/>',
    arrowDown: '<path d="M10 1v13.5H4l8 8.5 8-8.5h-6V1z"/>',
    cycle: '<path d="M3.5 6H17V2.5l5 5-5 5V9H6.5v4h-3zM20.5 18H7v3.5l-5-5 5-5V15h10.5v-4h3z"/>',
    split: '<path d="M1 4h5.5l8.6 13H18v-3.5l5 5-5 5V20h-4.5L4.9 7H1z"/><path d="M1 17h3.9l2.9-4.4 1.8 2.7L6.5 20H1zM13.5 4H18V.5l5 5-5 5V7h-2.9l-2.9 4.4-1.8-2.7z"/>',
    play: '<path d="M5 2l16 10L5 22z"/>',
    pause: '<path d="M5 2h5v20H5zM14 2h5v20h-5z"/>',
    // ---------- Bauen & Struktur ----------
    box: '<path d="M2 6.5L12 1.5l10 5-10 5z"/><path d="M1.5 8.5l9.5 4.8V23l-9.5-4.8zM22.5 8.5L13 13.3V23l9.5-4.8z"/>',
    container: '<path d="M1 5h22v14H1zm3.5 3v8h2V8zm4.5 0v8h2V8zm4.5 0v8h2V8zM18 8v8h2V8z"/>',
    puzzle: '<path d="M2 7h6a3 3 0 0 1 6 0h6v5a3 3 0 0 1 0 6v4H2z"/>',
    bricks: '<path d="M1 2h10v5.5H1zM13 2h10v5.5H13zM1 9.25h4.5v5.5H1zM7.5 9.25h9v5.5h-9zM18.5 9.25H23v5.5h-4.5zM1 16.5h10V22H1zM13 16.5h10V22H13z"/>',
    crane: '<path d="M3 2h5v21H3zM8 3h15v3H8zM19 6h1.6v7.5H19zM16 13.5h7.5V19H16zM1 20.5h9V23H1z"/>',
    gear: '<path d="M20.05 8.97L22.73 9.6v4.8l-2.68.63-.22.52 1.46 2.34-3.4 3.4-2.34-1.46-.52.22-.63 2.68H9.6l-.63-2.68-.52-.22-2.34 1.46-3.4-3.4 1.46-2.34-.22-.52-2.68-.63V9.6l2.68-.63.22-.52-1.46-2.34 3.4-3.4 2.34 1.46.52-.22.63-2.68h4.8l.63 2.68.52.22 2.34-1.46 3.4 3.4-1.46 2.34zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>',
    wrench: '<g transform="rotate(45 12 12)"><path d="M10 9h4v14.5h-4z"/><path d="M6.5 .5h3.2V6h4.6V.5h3.2V7a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 6.5 7z"/></g>',
    ruler: '<path d="M1 7h22v10H1zM4 7v5h1.6V7zm4 0v3h1.6V7zm4 0v5h1.6V7zm4 0v3h1.6V7zm4 0v5h1.6V7z"/>',
    ladder: '<path d="M4.5 1h3v22h-3zM16.5 1h3v22h-3zM7.5 4h9v2.5h-9zM7.5 9.5h9V12h-9zM7.5 15h9v2.5h-9zM7.5 20.5h9V23h-9z"/>',
    hexagon: '<path d="M12 1l9.5 5.5v11L12 23l-9.5-5.5v-11zm0 4.5L6.4 8.75v6.5L12 18.5l5.6-3.25v-6.5z"/>',
    rings: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
    pyramid: '<path d="M12 2l4 7.3H8zM7.16 10.8h9.68L20.8 18H3.2zM2.38 19.5h19.24L23 22H1z"/>',
    pillar: '<path d="M12 1l11 5v2.5H1V6z"/><path d="M3 10h3v8.5H3zM8 10h3v8.5H8zM13 10h3v8.5h-3zM18 10h3v8.5h-3zM1 20h22v3H1z"/>',
    door: '<path d="M5 1h14v20h3v2H2v-2h3zm8.5 9.5v3h2.2v-3z"/>',
    building: '<path d="M2 1h13v22H2zm3 3v2.2h2.2V4zm4.8 0v2.2H12V4zM5 8.5v2.2h2.2V8.5zm4.8 0v2.2H12V8.5zM5 13v2.2h2.2V13zm4.8 0v2.2H12V13zM6.5 18v5h4v-5z"/><path d="M16.5 8H22v15h-5.5z"/>',
    network: '<g transform="rotate(45 12 12)"><path d="M1.5 10.9h21v2.2h-21zM10.9 1.5h2.2v21h-2.2z"/></g><circle cx="5" cy="5" r="3.2"/><circle cx="19" cy="5" r="3.2"/><circle cx="12" cy="12" r="3.2"/><circle cx="5" cy="19" r="3.2"/><circle cx="19" cy="19" r="3.2"/>',
    // ---------- Technik ----------
    search: '<path d="M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/><path d="M15.4 17.5l2.1-2.1 5.9 5.9-2.1 2.1z"/>',
    database: '<path d="M3 4.5c0-3.5 18-3.5 18 0V7c0 3.5-18 3.5-18 0z"/><path d="M3 10c4.5 2.5 13.5 2.5 18 0v3c0 3.5-18 3.5-18 0z"/><path d="M3 16c4.5 2.5 13.5 2.5 18 0v3c0 3.5-18 3.5-18 0z"/>',
    server: '<path d="M2 2h20v6H2zm2.5 2v2h2V4zM2 9.5h20v6H2zm2.5 2v2h2v-2zM2 17h20v5H2zm2.5 1.5v2h2v-2z"/>',
    screen: '<path d="M1 3h22v14.5H1zm2.5 2.5v9.5h17V5.5z"/><path d="M9.5 18.5h5V21h3v2h-11v-2h3z"/>',
    terminal: '<path d="M1 3h22v18H1zm3.5 4.3L8 10.8l-3.5 3.5 1.8 1.8 5.3-5.3-5.3-5.3zM12.5 15v2.5h7V15z"/>',
    phone: '<path d="M5.5 1h13v22h-13zM8 3.5v14h8v-14z"/>',
    code: '<path d="M7 5L1 12l6 7 2.2-1.9L4.9 12l4.3-5.1zM17 5l6 7-6 7-2.2-1.9 4.3-5.1-4.3-5.1z"/><path d="M13.6 3h2.7l-5.9 18H7.7z"/>',
    branch: '<circle cx="6" cy="4.5" r="3"/><circle cx="6" cy="19.5" r="3"/><circle cx="18" cy="7.5" r="3"/><path d="M4.75 4.5h2.5v15h-2.5z"/><path d="M16.75 7.5h2.5v2a6 6 0 0 1-6 6H9.5a2.25 2.25 0 0 0-2.25 2.25h-2.5A4.75 4.75 0 0 1 9.5 13h3.75a3.5 3.5 0 0 0 3.5-3.5z"/>',
    helm: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/><circle cx="12" cy="12" r="2.6"/><path d="M10.8 1h2.4v22h-2.4z"/><path d="M10.8 1h2.4v22h-2.4z" transform="rotate(60 12 12)"/><path d="M10.8 1h2.4v22h-2.4z" transform="rotate(120 12 12)"/>',
    plug: '<path d="M7 1h2.5v5h5V1H17v5h2v6a7 7 0 0 1-5.5 6.8V23h-3v-4.2A7 7 0 0 1 5 12V6h2z"/>',
    cloud: '<path d="M6 20a5 5 0 0 1-.6-10A7 7 0 0 1 19 9a5.5 5.5 0 0 1-1 11z"/>',
    globe: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 2.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/><path d="M12 1.5c-3.3 0-5.5 4.7-5.5 10.5s2.2 10.5 5.5 10.5 5.5-4.7 5.5-10.5S15.3 1.5 12 1.5zm0 2.5c1.6 0 3 3.6 3 8s-1.4 8-3 8-3-3.6-3-8 1.4-8 3-8z"/><path d="M2 10.8h20v2.4H2z"/>',
    thread: '<path d="M4 1.5h16v3H4zM4 19.5h16v3H4zM6 4.5h12v15H6zm0 3.5v1.5h12V8zm0 3.25v1.5h12v-1.5zm0 3.25v1.5h12V14.5z"/>',
    flask: '<path d="M7.5 1h9v2.5h-1.5v5.8l7 10.7V23H2v-3l7-10.7V3.5H7.5zm4 2.5v6.5L9 14h6l-2.5-4V3.5z"/>',
    lock: '<path d="M6.5 10V7a5.5 5.5 0 0 1 11 0v3h-3V7a2.5 2.5 0 0 0-5 0v3z"/><path d="M3 10h18v13H3zm7.8 4v5h2.4v-5z"/>',
    key: '<path d="M7 6a6 6 0 1 0 5.7 8H15v3h3v-3h2v3h3v-6H12.7A6 6 0 0 0 7 6zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
    shield: '<path d="M12 1l10 3.5V11c0 6-4.5 10.5-10 12C6.5 21.5 2 17 2 11V4.5z"/>',
    tag: '<path d="M1 1h10.5L23 12.5 12.5 23 1 11.5zm5.5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
    idcard: '<path d="M1 4h22v16H1zm3 4v8h6.5V8zm9.5 1v2.2H20V9zm0 4v2.2h5V13z"/>',
    card: '<path d="M1 4h22v4H1zM1 10.5h22V20H1zm3 4.5v2h6v-2z"/>',
    syringe: '<g transform="rotate(45 12 12)"><path d="M8.5 1h7v2.5h-7zM10.8 3.5h2.4V6h-2.4zM8.5 6h7v12h-7zM10.5 18h3v2.5h-3zM11.3 20.5h1.4V24h-1.4z"/></g>',
    magnet: '<path d="M2.5 2h6.5v10a3 3 0 0 0 6 0V2h6.5v10a9.5 9.5 0 0 1-19 0zm0 3.5V7H9V5.5zm12.5 0V7h6.5V5.5z"/>',
    // ---------- Kommunikation & Menschen ----------
    megaphone: '<path d="M1.5 8.5h4.5L18 2.5v19l-12-6H1.5z"/><path d="M6.5 16.5h3.2l1.5 6H8zM19.5 10h3.5v4h-3.5z"/>',
    bell: '<path d="M12 1a7 7 0 0 0-7 7v6l-3 4h20l-3-4V8a7 7 0 0 0-7-7z"/><path d="M8.5 19.5h7a3.5 3.5 0 0 1-7 0z"/>',
    siren: '<path d="M5 13a7 7 0 0 1 14 0v5H5z"/><path d="M3 19.5h18V23H3zM10.8 1h2.4v3.5h-2.4zM2.3 5.3l1.7-1.7 2.5 2.5-1.7 1.7zM21.7 5.3L20 3.6l-2.5 2.5 1.7 1.7z"/>',
    trafficLight: '<path d="M6 1h12v22H6zm6 2a2.6 2.6 0 1 0 0 5.2A2.6 2.6 0 0 0 12 3zm0 6.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zm0 6.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z"/>',
    mail: '<path d="M1 4h22v16H1zm2 2.5v2.4l9 7 9-7V6.5l-9 7z"/>',
    chat: '<path d="M1 2h22v15H9l-6 5v-5H1z"/>',
    doc: '<path d="M4 1h11l5 5v17H4zm3 8v2h10V9zm0 4v2h10v-2zm0 4v2h7v-2z"/>',
    pencil: '<path d="M17.5 1L23 6.5l-2.5 2.5L15 3.5z"/><path d="M13.5 5l5.5 5.5L8 21.5H2.5V16z"/>',
    folder: '<path d="M1 3.5h8.5l2.5 2.5h11v15H1z"/>',
    person: '<circle cx="12" cy="6.5" r="5"/><path d="M2.5 23a9.5 9.5 0 0 1 19 0z"/>',
    people: '<circle cx="6.5" cy="7.5" r="3.6"/><circle cx="17.5" cy="7.5" r="3.6"/><path d="M1 21a5.25 5.25 0 0 1 10.5 0zM12.5 21a5.25 5.25 0 0 1 10.5 0z"/>',
    robot: '<path d="M10.8 1h2.4v4.5h-2.4zM1 10h2.2v5H1zM20.8 10H23v5h-2.2z"/><path d="M4 5.5h16V20H4zm3 4v3.2h3.2V9.5zm6.8 0v3.2H17V9.5zM8 15v2h8v-2z"/>',
    brain: '<path d="M8 2a4 4 0 0 0-4 4 4 4 0 0 0-2 7 4 4 0 0 0 3 6 4 4 0 0 0 6 2.5V3.5A4 4 0 0 0 8 2zM16 2a4 4 0 0 1 4 4 4 4 0 0 1 2 7 4 4 0 0 1-3 6 4 4 0 0 1-6 2.5V3.5A4 4 0 0 1 16 2z"/>',
    bird: '<path d="M14 3.5a4.5 4.5 0 0 1 4.5 4.5v.5H23l-4.5 3v1a8.5 8.5 0 0 1-8.5 8.5H1.5l3.5-3.5v-5A6 6 0 0 1 11 6.5h.2A4.5 4.5 0 0 1 14 3.5zm.5 3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>',
    // ---------- Messen & Zeit ----------
    chartUp: '<path d="M1 1h2.5v19.5H23V23H1z"/><path d="M5 16.5l6-6 3 3 4.8-4.8L17 6.9h6v6l-1.8-1.8-7.2 7.2-3-3-4.2 4.2z"/>',
    bars: '<path d="M2 13h5v10H2zM9.5 7h5v16h-5zM17 1h5v22h-5z"/>',
    gauge: '<path d="M1 17a11 11 0 0 1 22 0h-3.5a7.5 7.5 0 0 0-15 0z"/><path d="M11 16.3l5.8-8.3 1.7 1.2-5 8.6z"/><circle cx="12" cy="17" r="2.4"/><path d="M1 20.5h22V23H1z"/>',
    pulse: '<path d="M1 10.8h5.2L8.6 5l4 12.6 2.9-8.6 1.4 1.8H23v2.4h-7.3l-.4-.5-2.8 8.7-4-12.7-1.7 3.7H1z"/>',
    thermometer: '<path d="M9.5 2h5v11.3a5.5 5.5 0 1 1-5 0z"/><path d="M16 4h3.5v1.8H16zM16 7.6h3.5v1.8H16zM16 11.2h3.5V13H16z"/>',
    hourglass: '<path d="M4 1h16v3h-1.5v2.5L13.5 12l5 5.5V20H20v3H4v-3h1.5v-2.5l5-5.5-5-5.5V4H4z"/>',
    stopwatch: '<path d="M12 4a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 3a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/><path d="M9 .5h6V3H9zM10.8 9h2.4v5.5h-2.4zM18.8 4.2l2.1 2.1-1.6 1.6-2.1-2.1z"/>',
    // ---------- Gegenstände ----------
    cup: '<path d="M2 7h15v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z"/><path d="M18 9h2a3 3 0 0 1 0 6h-2.6l.5-2.2H20a.8.8 0 0 0 0-1.6h-2zM6.5 1H9v4.5H6.5zM10.5 1H13v4.5h-2.5z"/>',
    leaf: '<path d="M21.5 1.5C9.5 1.5 3 7.5 3 16v6h6c8.5 0 12.5-6.5 12.5-20.5zM5.4 20.3L15.8 8.6l1.1 1L6.5 21.4z"/>',
    compass: '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 2.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/><path d="M17 7l-3.2 6.8L7 17l3.2-6.8z"/>',
    flag: '<path d="M3 1h3v22H3z"/><path d="M7 2h15l-3.5 5 3.5 5H7z"/>',
    dice: '<path d="M2 2h20v20H2zm5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
    ticket: '<path d="M1 5h22v4.5a2.5 2.5 0 0 0 0 5V19H1v-4.5a2.5 2.5 0 0 0 0-5zm14 2v2h1.6V7zm0 4v2h1.6v-2zm0 4v2h1.6v-2z"/>',
    hook: '<path d="M14 1h3v13a7 7 0 0 1-14 0v-4h3v4a4 4 0 0 0 8 0z"/>',
    extinguisher: '<path d="M6 8.5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3V23H6z"/><path d="M9 1h4v3H9zM13.5 1.5h5.5l3 4h-2.6l-1.9-2H13.5z"/>',
    trash: '<path d="M2.5 4h19v3h-19zM9 1h6v2.5H9z"/><path d="M4.5 8.5h15L18.5 23h-13zM8.3 11v9.5h1.8V11zm5.6 0v9.5h1.8V11z"/>',
    truck: '<path d="M1 4h14v12H1zM16.5 8h4l2.5 4v4h-6.5z"/><circle cx="6" cy="19.5" r="2.5"/><circle cx="18.5" cy="19.5" r="2.5"/>',
    dumbbell: '<path d="M1 9h3v6H1zM4.5 5.5H8v13H4.5zM16 5.5h3.5v13H16zM20 9h3v6h-3zM8 10.8h8v2.4H8z"/>',
    storm: '<path d="M1 2.5h22v3H1zM3.5 7.5h17v3h-17zM6.5 12.5h11v3h-11zM9 17.5h6.5V20H9zM11 21.5h3V23h-3z"/>',
    wave: '<path d="M1 6c3 0 3-3 5.5-3S9 6 12 6s3-3 5.5-3S20 6 23 6v3c-3 0-3-3-5.5-3S15 9 12 9 9 6 6.5 6 4 9 1 9z"/><path d="M1 13c3 0 3-3 5.5-3S9 13 12 13s3-3 5.5-3S20 13 23 13v3c-3 0-3-3-5.5-3S15 16 12 16s-3-3-5.5-3S4 16 1 16z"/><path d="M1 20c3 0 3-3 5.5-3S9 20 12 20s3-3 5.5-3S20 20 23 20v3c-3 0-3-3-5.5-3S15 23 12 23s-3-3-5.5-3S4 23 1 23z"/>',
    note: '<path d="M8 2h13.5v4.5H11V19H8z"/><circle cx="6.5" cy="19" r="4"/><path d="M18.5 6.5h3v10h-3z"/><circle cx="17" cy="16.5" r="3.5"/>',
    scale: '<path d="M10.8 2h2.4v18h-2.4zM5 20h14v3H5zM2 4.5h20v2.4H2z"/><path d="M1 13.5h8a4 4 0 0 1-8 0zM15 13.5h8a4 4 0 0 1-8 0zM4.3 6.9h1.4L3 13.5H1.6zM6.4 13.5L4.3 6.9h1.4l2.1 6.6zM18.3 6.9h1.4l-2.7 6.6h-1.4zM20.4 13.5l-2.1-6.6h1.4l2.1 6.6z"/>',
  };

  /** Emojis aus älteren Inhalten → Glyph (Variation Selector U+FE0F wird vorher entfernt) */
  const FROM_EMOJI = {
    '✨': 'spark', '🌟': 'spark', '🎉': 'spark', '🆕': 'spark',
    '💎': 'diamond', '🎯': 'target', '🔥': 'flame', '🏅': 'medal', '🎖': 'medal', '🛟': 'lifebuoy',
    '📅': 'calendar', '🗓': 'calendar', '📆': 'calendar', '🗺': 'map', '🚀': 'rocket', '🃏': 'cards',
    '⚡': 'bolt', '🎮': 'gamepad', '🎓': 'cap', '🏆': 'trophy',
    '❓': 'question', '❔': 'question', '🤷': 'question', '🙈': 'question',
    '👀': 'eye', '🤍': 'heart', '💚': 'heart', '❤': 'heart', '💡': 'bulb',
    '📘': 'book', '📚': 'book', '📖': 'book', '📓': 'book', '🔗': 'link',
    '✅': 'check', '✔': 'check', '👍': 'check', '❌': 'cross', '✖': 'cross', '👎': 'cross', '✂': 'split',
    '➕': 'plus', '⛔': 'stop', '🚫': 'stop', '🙅': 'stop', '🕳': 'stop', '⚠': 'warning',
    '🟢': 'dot', '🔵': 'dot', '🔴': 'dot', '🟣': 'dot', '⭕': 'ring',
    '👉': 'arrowRight', '⏭': 'arrowRight', '👈': 'arrowLeft', '⬇': 'arrowDown',
    '🔁': 'cycle', '🔄': 'cycle', '♻': 'cycle', '♾': 'cycle', '🔀': 'split', '▶': 'play', '⏸': 'pause', '💤': 'pause',
    '📦': 'box', '🐳': 'container', '🦭': 'container', '🫛': 'container', '🧩': 'puzzle', '🧱': 'bricks',
    '🏗': 'crane', '🚧': 'crane', '⚙': 'gear', '🔧': 'wrench', '🛠': 'wrench', '🧰': 'wrench',
    '📏': 'ruler', '📐': 'ruler', '🪜': 'ladder', '⬡': 'hexagon', '🍯': 'hexagon', '🧅': 'rings', '🧼': 'rings',
    '🔺': 'pyramid', '🏛': 'pillar', '🏢': 'building', '🚪': 'door', '🕸': 'network',
    '🗄': 'database', '🗃': 'database', '💾': 'database', '🎩': 'server', '🐺': 'server',
    '🖥': 'screen', '💻': 'screen', '🧑‍💻': 'screen', '🅰': 'screen', '🖼': 'screen', '🐧': 'terminal', '📱': 'phone',
    '🧬': 'code', '🔤': 'code', '🔢': 'code', '🦊': 'branch', '🐙': 'branch', '☸': 'helm', '⎈': 'helm',
    '🔌': 'plug', '🐪': 'plug', '☁': 'cloud', '🌤': 'cloud', '🌐': 'globe', '🧵': 'thread', '🪶': 'thread',
    '🧪': 'flask', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '🛡': 'shield', '🦺': 'shield', '🏷': 'tag',
    '🪪': 'idcard', '🎭': 'idcard', '💳': 'card', '💉': 'syringe', '🧲': 'magnet',
    '📣': 'megaphone', '🗣': 'megaphone', '📡': 'megaphone', '🔔': 'bell', '🔕': 'bell',
    '🚨': 'siren', '🚑': 'siren', '🚦': 'trafficLight',
    '📮': 'mail', '📬': 'mail', '📨': 'mail', '✉': 'mail', '📥': 'mail', '📤': 'mail', '💬': 'chat',
    '📜': 'doc', '📃': 'doc', '📄': 'doc', '🧾': 'doc', '📋': 'doc', '📰': 'doc',
    '📝': 'pencil', '✏': 'pencil', '✍': 'pencil', '🗂': 'folder', '📁': 'folder', '📂': 'folder',
    '👤': 'person', '🙋': 'person', '🤵': 'person', '🧑‍🤝‍🧑': 'people', '👥': 'people', '💃': 'people', '🏉': 'people',
    '🤝': 'people', '🤖': 'robot', '🧠': 'brain', '🧮': 'brain', '🐤': 'bird',
    '🔍': 'search', '🔎': 'search', '🔭': 'search', '🕵': 'search',
    '📈': 'chartUp', '📊': 'bars', '🎚': 'gauge', '🩺': 'pulse', '💓': 'pulse', '🌡': 'thermometer',
    '⏳': 'hourglass', '🐢': 'hourglass', '⏱': 'stopwatch',
    '☕': 'cup', '🍃': 'leaf', '🌱': 'leaf', '🌿': 'leaf', '🧭': 'compass', '🚩': 'flag', '🏕': 'flag', '📍': 'flag',
    '🎲': 'dice', '🎟': 'ticket', '🪝': 'hook', '🎣': 'hook', '🧯': 'extinguisher', '🚒': 'extinguisher',
    '🗑': 'trash', '🚚': 'truck', '💪': 'dumbbell', '🏋': 'dumbbell', '🌪': 'storm', '💥': 'burst', '🔪': 'burst',
    '🌊': 'wave', '🎼': 'note', '⚖': 'scale',
  };
  G.burst = '<path d="M12 .5l1.55 5.7 4.2-4.16-1.51 5.72 5.72-1.51-4.16 4.2L23.5 12l-5.7 1.55 4.16 4.2-5.72-1.51 1.51 5.72-4.2-4.16L12 23.5l-1.55-5.7-4.2 4.16 1.51-5.72-5.72 1.51 4.16-4.2L.5 12l5.7-1.55-4.16-4.2 5.72 1.51-1.51-5.72 4.2 4.16z"/>';

  /** Glyphenname zu einem icon-Wert (Name oder Emoji) – null, wenn es keinen gibt */
  function glyphName(x) {
    if (typeof x !== 'string' || !x) return null;
    if (G[x]) return x;
    const k = x.replace(/[️⃣]/g, '').trim();
    return G[FROM_EMOJI[k]] ? FROM_EMOJI[k] : null;
  }

  /** <span class="gl">: Glyph oder – wenn unbekannt – der Text selbst (z. B. „λ“, „1“).
   *  variant 'tile' legt eine Fläche dahinter (Stil „Fläche“). */
  function glyph(x, variant) {
    const name = glyphName(x);
    const span = document.createElement('span');
    span.className = 'gl' + (variant ? ' gl-' + variant : '') + (name ? '' : ' gl-text');
    span.setAttribute('aria-hidden', 'true');
    if (name) span.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd">${G[name]}</svg>`;
    else span.textContent = String(x == null ? '' : x).replace(/[️⃣]/g, '');
    return span;
  }

  /** Glyph als <svg>-Element für eigene SVG-Grafiken (x/y = linke obere Ecke, size in px) */
  function glyphSvg(x, px, py, size) {
    const name = glyphName(x);
    if (!name) return null;
    const NS = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(NS, 'svg');
    [['x', px], ['y', py], ['width', size], ['height', size], ['viewBox', '0 0 24 24'], ['fill', 'currentColor'], ['fill-rule', 'evenodd'], ['class', 'gl-svg'], ['aria-hidden', 'true']]
      .forEach(([k, v]) => el.setAttribute(k, v));
    el.innerHTML = G[name];
    return el;
  }

  Object.assign(LA, { GLYPHS: G, glyphName, glyph, glyphSvg });
})(window.LA = window.LA || {});
