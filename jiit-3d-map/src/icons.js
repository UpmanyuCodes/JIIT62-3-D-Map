// Line icons (24x24 grid, 1.75px stroke) drawn as inline SVG, so no emoji or icon font is needed.
// The shapes follow the Lucide icon style (ISC licence); several are custom.
const P = {
  // places & categories
  landmark: '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M9.5 21V10"/><path d="M14.5 21V10"/><path d="M19 21V10"/><path d="M2 10 12 3l10 7z"/>',
  tower: '<path d="M7 22V3.5A1.5 1.5 0 0 1 8.5 2h7A1.5 1.5 0 0 1 17 3.5V22"/><path d="M3 22h18"/><path d="M10 6h1"/><path d="M13 6h1"/><path d="M10 10h1"/><path d="M13 10h1"/><path d="M10 14h1"/><path d="M13 14h1"/><path d="M10.5 22v-4h3v4"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>',
  stage: '<path d="M2 21h20"/><path d="M4 21V9"/><path d="M20 21V9"/><path d="M2 9c3-3.5 6.5-5 10-5s7 1.5 10 5"/><path d="M4 9c2 2.5 4 3.5 6 3.5"/><path d="M20 9c-2 2.5-4 3.5-6 3.5"/><path d="M7 21v-3h10v3"/>',
  field: '<rect x="2" y="5" width="20" height="14" rx="1.5"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/><path d="M2 9.5h2.5v5H2"/><path d="M22 9.5h-2.5v5H22"/>',
  basketball: '<circle cx="12" cy="12" r="9.5"/><path d="M12 2.5v19"/><path d="M2.5 12h19"/><path d="M5.3 5.3a10 10 0 0 1 0 13.4"/><path d="M18.7 5.3a10 10 0 0 0 0 13.4"/>',
  shuttle: '<path d="M9 17h6l3-13-3.5 1.5L12 2 9.5 5.5 6 4z"/><path d="M9 17a3 3 0 0 0 6 0"/><path d="M12 2v15"/>',
  volleyball: '<circle cx="12" cy="12" r="9.5"/><path d="M12 12a9 9 0 0 1 9.2 2.6"/><path d="M12 12a9 9 0 0 1-6.9 6.3"/><path d="M12 12a9 9 0 0 1-2.3-9.2"/><path d="M8.2 3.4A9 9 0 0 1 19 8.6"/>',
  goal: '<path d="M3 20V6h18v14"/><path d="M3 10h18"/><path d="M3 14h18"/><path d="M8 6v14"/><path d="M12 6v14"/><path d="M16 6v14"/>',
  waves: '<path d="M2 7c1.2 1 2.2 1.4 3.3 1.4C7.6 8.4 7.6 6 10 6s2.4 2.4 4.7 2.4S17 6 19.4 6c1 0 1.8.4 2.6 1"/><path d="M2 12.5c1.2 1 2.2 1.4 3.3 1.4 2.3 0 2.3-2.4 4.7-2.4s2.4 2.4 4.7 2.4 2.3-2.4 4.7-2.4c1 0 1.8.4 2.6 1"/><path d="M2 18c1.2 1 2.2 1.4 3.3 1.4 2.3 0 2.3-2.4 4.7-2.4s2.4 2.4 4.7 2.4 2.3-2.4 4.7-2.4c1 0 1.8.4 2.6 1"/>',
  utensils: '<path d="M4 2v6.5A2.5 2.5 0 0 0 6.5 11h1A2.5 2.5 0 0 0 10 8.5V2"/><path d="M7 2v20"/><path d="M20 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7"/>',
  coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v3"/><path d="M10 2v3"/><path d="M14 2v3"/>',
  cart: '<circle cx="8" cy="20.5" r="1.3"/><circle cx="18" cy="20.5" r="1.3"/><path d="M2 2.5h2.6l2.6 12.3a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.5L21.5 7H5.5"/>',
  palette: '<path d="M12 2.5C6.8 2.5 2.5 6.6 2.5 11.8s4.3 9.7 9.3 9.7c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2c3 0 5.3-2.4 5.3-5.4C21.5 6.4 17.3 2.5 12 2.5z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/><circle cx="17" cy="11" r="1.2"/>',
  dumbbell: '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3.5 9v6"/><path d="M20.5 9v6"/><path d="M6.5 12h11"/><path d="M3.5 9h3"/><path d="M3.5 15h3"/><path d="M17.5 9h3"/><path d="M17.5 15h3"/>',
  temple: '<path d="M12 2v2.5"/><path d="M12 4.5 7.5 10h9z"/><path d="M4 10h16"/><path d="M5.5 10v11"/><path d="M18.5 10v11"/><path d="M2.5 21h19"/><path d="M10 21v-4.5a2 2 0 0 1 4 0V21"/>',
  bed: '<path d="M2 5v15"/><path d="M2 9h17a3 3 0 0 1 3 3v8"/><path d="M2 16h20"/><circle cx="6.5" cy="12.5" r="1.8"/><path d="M10 13h8"/>',
  residence: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 12h2"/><path d="M13 12h2"/><path d="M10 21v-5h4v5"/>',
  gate: '<path d="M3 21V7"/><path d="M21 21V7"/><path d="M1.5 7h21"/><path d="M3 4h18"/><path d="M7.5 21v-14"/><path d="M12 21v-14"/><path d="M16.5 21v-14"/>',
  walk: '<circle cx="13.5" cy="4" r="2"/><path d="m10 21 2.2-5.5 2.8 2.5V22"/><path d="M6 11l2.5-3.5 4-1 3 3.5 3 1"/><path d="m12.5 6.5-1.5 6 1.2 3"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  pin: '<path d="M19.5 10c0 5-5.6 10.2-7 11.4a.8.8 0 0 1-1 0C10.1 20.2 4.5 15 4.5 10a7.5 7.5 0 0 1 15 0z"/><circle cx="12" cy="10" r="2.6"/>',
  cap: '<path d="M22 9.5 12 5 2 9.5 12 14z"/><path d="M6 11.5v5c3.5 2.8 8.5 2.8 12 0v-5"/><path d="M22 9.5v5"/>',
  // interface
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.5-4.5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  tour: '<path d="M4 22V3.5"/><path d="M4 4.5c1.5-1 3-1.5 4.5-1.5 3 0 4.5 2 7.5 2 1.5 0 3-.5 4-1v10c-1 .5-2.5 1-4 1-3 0-4.5-2-7.5-2-1.5 0-3 .5-4.5 1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
  sunset: '<path d="M12 9V2"/><path d="m8.5 5.5 3.5 3.5 3.5-3.5"/><path d="M4.9 10.9l1.4 1.4"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.1 10.9-1.4 1.4"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  moon: '<path d="M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  map: '<path d="M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.9a1 1 0 0 1 1.4.9v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.9A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0z"/><path d="M15 5.8v15"/><path d="M9 3.2v15"/>',
  locate: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1.5v3"/><path d="M12 19.5v3"/><path d="M1.5 12h3"/><path d="M19.5 12h3"/>',
  help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  swap: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  frame: '<path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>',
  mouse: '<rect x="5.5" y="2" width="13" height="20" rx="6.5"/><path d="M12 6v4"/>',
  phone: '<rect x="5.5" y="2" width="13" height="20" rx="2.5"/><path d="M11 18h2"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01"/><path d="M10 9h.01"/><path d="M14 9h.01"/><path d="M18 9h.01"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M7 16h10"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  flagEnd: '<path d="M5 22V3"/><path d="M5 3h12l-2.5 4L17 11H5"/>',
};

/** Returns an inline SVG string. `cls` is added to the svg element. */
export function icon(name, cls = 'icn') {
  const body = P[name] || P.pin;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Swap every <i data-icon="name"></i> placeholder in the page for its SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    const t = document.createElement('template');
    t.innerHTML = icon(el.dataset.icon, 'icn ' + (el.className || ''));
    el.replaceWith(t.content.firstChild);
  });
}
