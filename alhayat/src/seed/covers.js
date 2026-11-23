// صور أغلفة تجريبية مولَّدة برمجياً (بدون نصوص) لكل تصنيف
const PALETTES = {
  local: ['#0a2150', '#1e4fa3', '#c9d8f5'], world: ['#0d2b5c', '#2f6fd0', '#bbd3fa'], economy: ['#5c4208', '#b8860b', '#f3e2a9'],
  sports: ['#0b2a5b', '#d4a62a', '#fff3c9'], tech: ['#102a63', '#3a7bd5', '#d3e3fb'], health: ['#14376f', '#4f8fe0', '#d9e8fc'], culture: ['#6b4b0a', '#c9a227', '#f7e8b5'],
};
const rnd = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

const MOTIF = {
  local: (r, c) => Array.from({ length: 7 }, (_, i) => `<rect x="${180 + i * 190}" y="${520 - (120 + r() * 300)}" width="${110 + r() * 40}" height="${120 + r() * 300}" fill="${c[2]}" opacity="${0.12 + r() * 0.2}"/>`).join('') +
    `<rect x="0" y="720" width="1600" height="180" fill="${c[0]}" opacity=".5"/>`,
  world: (r, c) => `<circle cx="1050" cy="430" r="330" fill="none" stroke="${c[2]}" stroke-width="3" opacity=".5"/>` +
    Array.from({ length: 6 }, (_, i) => `<ellipse cx="1050" cy="430" rx="${60 + i * 55}" ry="330" fill="none" stroke="${c[2]}" opacity=".25"/>`).join('') +
    Array.from({ length: 5 }, (_, i) => `<ellipse cx="1050" cy="430" rx="330" ry="${40 + i * 62}" fill="none" stroke="${c[2]}" opacity=".2"/>`).join(''),
  economy: (r, c) => Array.from({ length: 9 }, (_, i) => `<rect x="${200 + i * 140}" y="${700 - (80 + i * 38 + r() * 60)}" width="90" height="${80 + i * 38 + r() * 60}" rx="8" fill="${c[2]}" opacity="${0.18 + i * .04}"/>`).join('') +
    `<polyline points="200,620 340,560 480,590 620,470 760,490 900,380 1040,330 1180,250 1320,190" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>`,
  sports: (r, c) => `<circle cx="1000" cy="420" r="260" fill="${c[2]}" opacity=".18"/><circle cx="1000" cy="420" r="260" fill="none" stroke="#fff" stroke-width="6" opacity=".6"/>` +
    `<path d="M1000 420 L1130 330 M1000 420 L880 330 M1000 420 L1040 560 M1000 420 L960 560 M1000 420 L1000 160" stroke="#fff" stroke-width="5" opacity=".55"/>` +
    `<rect x="0" y="760" width="1600" height="140" fill="${c[0]}" opacity=".6"/><line x1="800" y1="760" x2="800" y2="900" stroke="#fff" opacity=".4" stroke-width="4"/>`,
  tech: (r, c) => { const pts = Array.from({ length: 22 }, () => [150 + r() * 1300, 120 + r() * 640]);
    return pts.map((p, i) => `<line x1="${p[0]}" y1="${p[1]}" x2="${pts[(i * 7 + 3) % 22][0]}" y2="${pts[(i * 7 + 3) % 22][1]}" stroke="${c[2]}" opacity=".3" stroke-width="2"/>`).join('') +
      pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${5 + r() * 9}" fill="${c[2]}" opacity=".7"/>`).join(''); },
  health: (r, c) => `<rect x="920" y="200" width="120" height="440" rx="30" fill="${c[2]}" opacity=".22"/><rect x="760" y="360" width="440" height="120" rx="30" fill="${c[2]}" opacity=".22"/>` +
    `<polyline points="120,640 420,640 480,560 560,720 640,500 720,640 1500,640" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`,
  culture: (r, c) => Array.from({ length: 12 }, (_, i) => `<path d="M${200 + i * 100} 820 Q ${250 + i * 100} ${300 + r() * 200} ${300 + i * 100} 820" fill="none" stroke="${c[2]}" stroke-width="${3 + r() * 5}" opacity="${0.2 + r() * .3}"/>`).join('') +
    `<circle cx="1180" cy="260" r="110" fill="${c[2]}" opacity=".25"/>`,
};

export function coverSvg(slug, variant = 0) {
  const c = PALETTES[slug] || PALETTES.local;
  const r = rnd(variant + slug.length * 17 + 3);
  const angle = 20 + r() * 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><linearGradient id="g" gradientTransform="rotate(${angle.toFixed(0)} .5 .5)"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>
<radialGradient id="v" cx=".5" cy=".5" r=".8"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/>
<circle cx="${200 + r() * 400}" cy="${100 + r() * 200}" r="${220 + r() * 160}" fill="#fff" opacity=".07"/>
<circle cx="${1100 + r() * 400}" cy="${600 + r() * 200}" r="${200 + r() * 200}" fill="#fff" opacity=".06"/>
${(MOTIF[slug] || MOTIF.local)(r, c)}
<rect width="1600" height="900" fill="url(#v)"/></svg>`;
}
