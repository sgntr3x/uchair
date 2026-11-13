// Çizgi ikonlar (24x24, currentColor). İçerik sabit string olduğu için innerHTML güvenli.
const P = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.6 3.6-5.5 7-5.5s6.4 1.9 7 5.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  phone: '<path d="M5.5 4h3.2l1.8 4.6-2.3 1.4a10.5 10.5 0 0 0 5.8 5.8l1.4-2.3 4.6 1.8v3.2a1.8 1.8 0 0 1-1.9 1.8A15.5 15.5 0 0 1 3.7 5.9 1.8 1.8 0 0 1 5.5 4z"/>',
  chat: '<path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M14.5 5l-7 7 7 7"/>',
  right: '<path d="M9.5 5l7 7-7 7"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.4-2"/>',
  note: '<path d="M6 3.5h8.5L18.5 7.5v13H6z"/><path d="M9 12h6M9 16h6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9M5 14.5v5h14v-5"/>',
  download: '<path d="M12 4.5V15M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13"/>',
  move: '<path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5M20 16H7M10.5 12.5 7 16l3.5 3.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.6"/><circle cx="6.5" cy="17.5" r="2.6"/><path d="M8.6 8l11 9.6M8.6 16l11-9.6"/>',
  // Dolu (siluet) ikon: kullanıcının verdiği sakal görselinden vektörleştirildi
  beard: '<path fill-rule="evenodd" d="M12.17 20.26L11.50 20.18L10.84 19.87L10.17 19.85L9.43 19.52L7.93 17.74L7.77 17.81L7.68 18.10L7.52 18.12L6.31 16.42L6.11 16.31L5.84 16.42L5.26 15.68L4.68 14.52L4.45 13.67L4.28 14.12L4.20 14.19L4.06 14.10L3.83 13.10L3.82 12.44L3.47 11.11L2.10 8.54L1.52 7.13L1.00 4.64L1.00 3.97L1.12 3.77L1.35 3.81L2.18 5.22L2.78 5.88L4.36 7.17L5.15 7.96L5.52 8.56L5.77 8.69L6.44 8.39L8.18 7.11L9.01 6.78L9.76 6.59L10.42 6.59L11.42 6.94L12.00 7.41L12.91 6.78L13.58 6.59L14.08 6.59L14.99 6.78L15.82 7.11L17.56 8.39L18.31 8.71L19.22 7.62L20.80 6.34L21.75 5.38L22.63 4.03L22.96 3.98L23.00 4.55L22.83 5.80L22.48 7.38L20.53 11.36L20.35 12.02L20.17 13.60L19.98 14.18L19.87 14.18L19.75 13.77L19.63 13.68L19.32 14.76L18.83 15.68L18.23 16.40L18.06 16.45L17.89 16.25L16.65 18.12L16.41 18.17L16.33 17.84L16.15 17.74L14.66 19.52L13.74 19.85L13.08 19.89ZM9.63 11.78L10.01 11.71L10.75 11.26L11.17 11.15L12.08 11.32L13.16 11.16L14.16 11.63L14.82 11.73L15.98 11.05L16.30 10.70L16.15 10.58L15.24 10.57L13.91 10.21L12.75 9.55L12.25 9.10L11.83 9.08L10.78 9.87L10.09 10.21L8.76 10.57L7.77 10.62L7.85 10.90L9.01 11.71Z"/>',
  mask: '<path d="M12 3.5c-4 0-6.5 3-6.5 7.5 0 5 3 9.5 6.5 9.5s6.5-4.5 6.5-9.5c0-4.5-2.5-7.5-6.5-7.5z"/><path d="M8.3 10.5h2.6M13.1 10.5h2.6M10.5 16h3"/>',
  drop: '<path d="M12 3.5c3.2 4.2 5.8 7 5.8 10.2a5.8 5.8 0 0 1-11.6 0c0-3.2 2.6-6 5.8-10.2z"/><path d="M9.3 14.5a2.9 2.9 0 0 0 2.2 2.6"/>',
  sparkle: '<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/>',
  paste: '<rect x="5" y="5" width="14" height="15.5" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>',
};

const FILLED = new Set(['beard']); // çizgi yerine dolu çizilen ikonlar

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = FILLED.has(name)
    ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" stroke="none">${P[name]}</svg>`
    : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}

/** İşlem adına göre ikon (işlemler Ayarlar'dan değiştirilebildiği için ada bakılır) */
export function serviceIconName(name) {
  const n = name.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o');
  if (/sac|kesim|fon|firca/.test(n)) return 'scissors';
  if (/sakal|tras|biyik/.test(n)) return 'beard';
  if (/maske|cilt|bakim|agda/.test(n)) return 'mask';
  if (/boya|renk|mesh|röfle|rofle/.test(n)) return 'drop';
  return 'sparkle';
}

/** Berber direği motifi (inline SVG pattern; renkler tema değişkenlerinden) */
export function poleMark() {
  const s = document.createElement('span');
  s.className = 'pole';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<svg viewBox="0 0 20 48" width="20" height="48">'
    + '<defs><pattern id="pp" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
    + '<rect width="12" height="12" style="fill:var(--surface)"/><rect width="4" height="12" style="fill:var(--red)"/>'
    + '<rect x="6" width="4" height="12" style="fill:var(--blue)"/></pattern></defs>'
    + '<rect x="3" y="6" width="14" height="36" rx="3" fill="url(#pp)"/>'
    + '<rect x="3" y="6" width="14" height="36" rx="3" fill="none" stroke-width="2" style="stroke:var(--ink)"/>'
    + '<rect x="1" y="2" width="18" height="5" rx="1.5" style="fill:var(--ink)"/>'
    + '<rect x="1" y="41" width="18" height="5" rx="1.5" style="fill:var(--ink)"/></svg>';
  return s;
}
