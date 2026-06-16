'use strict';
// ================================================================
// SHARED DATA & UTILITIES — Stjernekikkert (v2)
// ================================================================

var STORAGE_KEY = 'stjernekikkert_v1';
var LOG_KEY     = 'stjernekikkert_log_v1';
var NM_KEY      = 'stjernekikkert_nightmode';

var DEFAULT_SETUP = {
  telescope: {model:'1200-203', ap:203, fl:1200},
  barlow: 1,
  location: {lat:59.91, lon:10.63},
  bortle: null, // COND-2 (null = ikke satt)
  eyepieces: {
    'sw-25': {owned:true,  price:null, link:''},
    'sw-10': {owned:true,  price:null, link:''}
  }
};

function loadSetup() {
  try {
    var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s) {
      if (!s.telescope) s.telescope = DEFAULT_SETUP.telescope;
      if (!s.location)  s.location  = DEFAULT_SETUP.location;
      if (!s.eyepieces) s.eyepieces = {};
      if (s.barlow == null) s.barlow = 1;
      if (s.bortle === undefined) s.bortle = null;
      return s;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_SETUP));
}
function saveSetup(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch(e) {}
}

// ---- Observasjonslogg (FIND-1) ----
// ---- Vær / skydekke (COND-1) ----
// Henter skydekke fra Open-Meteo (gratis, ingen nøkkel, åpen CORS — kalles rett
// fra nettleseren). Returnerer et promise. Faller pent tilbake ved offline/feil.
function fetchCloudCover(lat, lon) {
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) +
            '&longitude=' + lon.toFixed(3) +
            '&hourly=cloud_cover&forecast_days=2&timezone=auto';
  return fetch(url).then(function(r){
    if (!r.ok) throw new Error('vær utilgjengelig');
    return r.json();
  }).then(function(d){
    if (!d.hourly || !d.hourly.time) throw new Error('mangler data');
    var out = [];
    for (var i = 0; i < d.hourly.time.length; i++){
      out.push({ time: new Date(d.hourly.time[i]), cloud: d.hourly.cloud_cover[i] });
    }
    return out;
  });
}
// Offisielt norsk varsel (met.no) for posisjonen — som «fasit»-lenke.
function yrUrl(lat, lon) {
  return 'https://www.yr.no/nb/v\u00e6rvarsel/daglig-tabell/' + lat.toFixed(4) + ',' + lon.toFixed(4);
}
function cloudWord(pct) {
  if (pct <= 12) return 'klart';
  if (pct <= 37) return 'lettskyet';
  if (pct <= 62) return 'delvis skyet';
  if (pct <= 87) return 'skyet';
  return 'overskyet';
}

function loadLog() {
  try {
    var l = JSON.parse(localStorage.getItem(LOG_KEY)) || {};
    // Migrering: tidligere ble Månen lagret som 'moon', nå 'luna'
    if (l.moon && !l.luna) { l.luna = l.moon; delete l.moon; saveLog(l); }
    return l;
  } catch(e) { return {}; }
}
function saveLog(l) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch(e) {}
}
function isSeen(id) { var l = loadLog(); return !!(l[id] && l[id].seen); }
function toggleSeen(id) {
  var l = loadLog();
  if (l[id] && l[id].seen) { delete l[id]; saveLog(l); return false; }
  l[id] = {seen:true, date:todayISO()}; saveLog(l); return true;
}
function seenCount() { var l = loadLog(), n = 0; for (var k in l) if (l[k] && l[k].seen) n++; return n; }

// ---- Merker / prestasjoner (ENG-1) ----
// Hvert merke har en test(seenIds, catalog) som gir true når oppnådd.
var BADGES = [
  {id:'first',  emo:'🌟', name:'Første lys',        desc:'Sett ditt aller første objekt', test:function(s){ return s.length>=1; }},
  {id:'five',   emo:'✋', name:'Femkløver',          desc:'Sett 5 objekter', test:function(s){ return s.length>=5; }},
  {id:'ten',    emo:'🔟', name:'Ti på rad',          desc:'Sett 10 objekter', test:function(s){ return s.length>=10; }},
  {id:'moon',   emo:'🌕', name:'Månevandrer',        desc:'Sett Månen', test:function(s){ return s.indexOf('luna')>=0; }},
  {id:'planet3',emo:'🪐', name:'Planetjeger',        desc:'Sett 3 planeter', test:function(s,cat){ return countType(s,cat,'planet')>=3; }},
  {id:'gx3',    emo:'🌀', name:'Galaksesamler',      desc:'Sett 3 galakser', test:function(s,cat){ return countType(s,cat,'galaxy')>=3; }},
  {id:'neb3',   emo:'🌫', name:'Tåkefanger',         desc:'Sett 3 tåker', test:function(s,cat){ return countType(s,cat,'nebula')>=3; }},
  {id:'glob3',  emo:'⭐', name:'Hopesamler',         desc:'Sett 3 kulehoper', test:function(s,cat){ return countType(s,cat,'globular')>=3; }},
  {id:'dbl3',   emo:'✦', name:'Dobbeltseer',        desc:'Sett 3 dobbeltstjerner', test:function(s,cat){ return countType(s,cat,'double')>=3; }},
  {id:'allcat', emo:'🏆', name:'Mester',             desc:'Sett alle objektene i katalogen', test:function(s,cat){ return s.filter(function(id){return findInCat(cat,id);}).length >= cat.length; }}
];
function countType(seenIds, cat, type){
  var n=0; for(var i=0;i<seenIds.length;i++){ var o=findInCat(cat,seenIds[i]); if(o && o.type===type) n++; } return n;
}
function findInCat(cat, id){ for(var i=0;i<cat.length;i++) if(cat[i].id===id) return cat[i]; return null; }
function computeBadges(catalog){
  var log = loadLog(), seen=[]; for(var k in log) if(log[k]&&log[k].seen) seen.push(k);
  return BADGES.map(function(b){ return {emo:b.emo, name:b.name, desc:b.desc, earned:!!b.test(seen, catalog)}; });
}

// ---- Sikkerhet (SEC-1) ----
function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeUrl(u) {
  u = String(u || '').trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

// ================================================================
// EYEPIECE PRESET DATABASE   (prices in NOK, approx. May 2026)
// ================================================================
var EP_PRESETS = [
  {id:'sw-25', brand:'Sky-Watcher', model:'25 mm Super Plössl',     fl:25, afov:52, barrel:1.25, price:null, note:'Medfølger kikkerten', included:true},
  {id:'sw-10', brand:'Sky-Watcher', model:'10 mm Super Plössl',     fl:10, afov:52, barrel:1.25, price:null, note:'Medfølger kikkerten', included:true},

  {id:'sv-gl-6',  brand:'SVBONY', model:'6 mm Goldline 66°',   fl:6,  afov:66, barrel:1.25, price:220, note:'Utmerket for planeter i f/6 — anbefalt'},
  {id:'sv-gl-9',  brand:'SVBONY', model:'9 mm Goldline 66°',   fl:9,  afov:66, barrel:1.25, price:220, note:'Utmerket allround — anbefalt'},
  {id:'sv-gl-15', brand:'SVBONY', model:'15 mm Goldline 66°',  fl:15, afov:66, barrel:1.25, price:220, note:'Fyller gap mellom 10 og 25'},
  {id:'sv-gl-20', brand:'SVBONY', model:'20 mm Goldline 66°',  fl:20, afov:66, barrel:1.25, price:240, note:'God mellomforstørrelse'},

  {id:'sv-68-6',  brand:'SVBONY', model:'6 mm 68° UWA',   fl:6,  afov:68, barrel:1.25, price:280},
  {id:'sv-68-9',  brand:'SVBONY', model:'9 mm 68° UWA',   fl:9,  afov:68, barrel:1.25, price:280},
  {id:'sv-68-15', brand:'SVBONY', model:'15 mm 68° UWA',  fl:15, afov:68, barrel:1.25, price:280},
  {id:'sv-68-20', brand:'SVBONY', model:'20 mm 68° UWA',  fl:20, afov:68, barrel:1.25, price:300},

  {id:'sv-pl-4',  brand:'SVBONY', model:'4 mm Plössl (SV131)',  fl:4,  afov:52, barrel:1.25, price:130},
  {id:'sv-pl-6',  brand:'SVBONY', model:'6 mm Plössl (SV131)',  fl:6,  afov:52, barrel:1.25, price:130},
  {id:'sv-pl-10', brand:'SVBONY', model:'10 mm Plössl (SV131)', fl:10, afov:52, barrel:1.25, price:130},
  {id:'sv-pl-15', brand:'SVBONY', model:'15 mm Plössl (SV131)', fl:15, afov:52, barrel:1.25, price:140},
  {id:'sv-pl-20', brand:'SVBONY', model:'20 mm Plössl (SV131)', fl:20, afov:52, barrel:1.25, price:150},
  {id:'sv-pl-25', brand:'SVBONY', model:'25 mm Plössl (SV131)', fl:25, afov:52, barrel:1.25, price:150},
  {id:'sv-pl-32', brand:'SVBONY', model:'32 mm Plössl (SV131)', fl:32, afov:52, barrel:1.25, price:180, note:'Lavest brukbar i 1.25"'},
  {id:'sv-pl-40', brand:'SVBONY', model:'40 mm Plössl (SV131)', fl:40, afov:43, barrel:1.25, price:200, note:'Smalt synsfelt'},

  {id:'sv-asp-4',  brand:'SVBONY', model:'4 mm Aspheric (SV133)',  fl:4,  afov:62, barrel:1.25, price:100},
  {id:'sv-asp-10', brand:'SVBONY', model:'10 mm Aspheric (SV133)', fl:10, afov:62, barrel:1.25, price:100},
  {id:'sv-asp-23', brand:'SVBONY', model:'23 mm Aspheric (SV133)', fl:23, afov:62, barrel:1.25, price:130},

  {id:'sv-zoom-135-7',  brand:'SVBONY', model:'SV135 zoom — 7 mm (57° AFOV)',  fl:7,  afov:57, barrel:1.25, price:450, note:'Korteste pos. — høy forstørrelse; pris gjelder hele zoomet'},
  {id:'sv-zoom-135-14', brand:'SVBONY', model:'SV135 zoom — 14 mm (48° AFOV)', fl:14, afov:48, barrel:1.25, price:null, note:'Midtre posisjon'},
  {id:'sv-zoom-135-21', brand:'SVBONY', model:'SV135 zoom — 21 mm (40° AFOV)', fl:21, afov:40, barrel:1.25, price:null, note:'Lengste pos. — lav forstørrelse'},

  {id:'sv-2-26', brand:'SVBONY', model:'26 mm SWA 70° (SV154)', fl:26, afov:70, barrel:2, price:700, note:'2" — vidvinkel for store dypromobjekter'},
  {id:'sv-2-32', brand:'SVBONY', model:'32 mm Plössl 2"',       fl:32, afov:52, barrel:2, price:550, note:'2"'},

  {id:'bst-5',  brand:'BST', model:'5 mm StarGuider ED 60°',  fl:5,  afov:60, barrel:1.25, price:650, note:'Planeter — utmerket i f/6'},
  {id:'bst-8',  brand:'BST', model:'8 mm StarGuider ED 60°',  fl:8,  afov:60, barrel:1.25, price:650, note:'Planeter'},
  {id:'bst-12', brand:'BST', model:'12 mm StarGuider ED 60°', fl:12, afov:60, barrel:1.25, price:650, note:'All-rounder — sterkt anbefalt'},
  {id:'bst-15', brand:'BST', model:'15 mm StarGuider ED 60°', fl:15, afov:60, barrel:1.25, price:650, note:'Fyller gap mellom 10 og 25'},
  {id:'bst-18', brand:'BST', model:'18 mm StarGuider ED 60°', fl:18, afov:60, barrel:1.25, price:650},
  {id:'bst-25', brand:'BST', model:'25 mm StarGuider ED 60°', fl:25, afov:60, barrel:1.25, price:650, note:'Bedre enn medfølgende 25 mm'},
];

function presetById(id) {
  for (var i = 0; i < EP_PRESETS.length; i++) if (EP_PRESETS[i].id === id) return EP_PRESETS[i];
  return null;
}

// ================================================================
// OBJECT CATALOG  (ra decimal hours, dec degrees, idealMag for 8",
//   mag = tilsynelatende magnitude, size = vinkelstørrelse i ',
//   sep = separasjon i " for dobbeltstjerner, expect = forventning EYE-1)
// ================================================================
var SKY_CATALOG = [
  // Åpne stjernehoper
  {id:'m45',  emo:'✨', name:'M45 — Pleiadene',           type:'cluster', ra:3.783, dec:24.12, idealMag:30, mag:1.6, size:110, why:'«Sjustjernen» — stor og vakker på lav forstørrelse', expect:'En knippe klare blå stjerner; trenger vidt synsfelt for å fange hele.', anchor:'Lett synlig for blotte øye som en liten «mini-Karlsvogn» sør for Perseus — sikt rett på.', season:'Høst/Vinter'},
  {id:'hchi', emo:'✨', name:'Dobbelthopen (h og χ Per)', type:'cluster', ra:2.333, dec:57.13, idealMag:40, mag:4.3, size:60,  why:'To hoper side om side — sirkumpolar fra Norge', expect:'To tette stjernesverm i samme felt — et av himmelens fineste syn.', anchor:'Følg den lyse linjen i Cassiopeia («W») mot Perseus; ligger midtveis mellom dem som en tåkeflekk for blotte øye.', season:'Hele året'},
  {id:'m34',  emo:'✨', name:'M34 (Perseus)',             type:'cluster', ra:2.700, dec:42.78, idealMag:40, mag:5.5, size:35,  why:'Stor og ren åpen hop', expect:'Løs samling med noen titalls stjerner.', anchor:'Halvveis mellom Algol (Perseus) og Almach (Andromeda) — feltstikk langs linjen mellom dem.', season:'Høst/Vinter'},
  {id:'m103', emo:'✨', name:'M103 (Cassiopeia)',         type:'cluster', ra:1.550, dec:60.65, idealMag:60, mag:7.4, size:6,   why:'Kileformet hop — sirkumpolar fra Norge', expect:'Liten, kileformet gruppe.', anchor:'Like ved Ruchbah (δ Cas), den nest siste stjernen i Cassiopeias «W».', season:'Hele året'},
  {id:'m36',  emo:'✨', name:'M36 (Auriga)',              type:'cluster', ra:5.600, dec:34.13, idealMag:60, mag:6.3, size:12,  why:'Del av Auriga-tripletten', expect:'Kompakt hop med klare stjerner.', anchor:'Inne i femkanten Auriga; sveip mellom Capella og Elnath etter tre hoper på rad.', season:'Vinter'},
  {id:'m37',  emo:'✨', name:'M37 — Auriga (rikeste)',    type:'cluster', ra:5.872, dec:32.55, idealMag:80, mag:6.2, size:24,  why:'Rikeste av Auriga-hopene — hundrevis av stjerner', expect:'Tett, rik hop — som strødd sukker.', anchor:'Rett utenfor Auriga-femkanten, på motsatt side av Elnath — den østligste av de tre.', season:'Vinter'},
  {id:'m38',  emo:'✨', name:'M38 (Auriga)',              type:'cluster', ra:5.478, dec:35.83, idealMag:60, mag:7.4, size:21,  why:'Del av Auriga-tripletten', expect:'Løsere hop, kryssformet mønster.', anchor:'Den nordligste av Auriga-trioen; nærmest Capella av de tre hopene.', season:'Vinter'},
  {id:'m35',  emo:'✨', name:'M35 (Tvillingene)',         type:'cluster', ra:6.150, dec:24.33, idealMag:60, mag:5.3, size:28,  why:'Pen åpen hop i Gemini', expect:'Stor, rik hop som fyller feltet fint.', anchor:'Ved «føttene» til Tvillingene, like ved stjernen Tejat — synlig som tåkeflekk i søker.', season:'Vinter'},
  {id:'m44',  emo:'✨', name:'M44 — Krybbehopen',         type:'cluster', ra:8.667, dec:19.67, idealMag:30, mag:3.7, size:95,  why:'Stor og løs hop i Cancer', expect:'Stor, spredt hop — best på lav forstørrelse.', anchor:'Midt i Krepsen, synlig for blotte øye som en tåkeflekk mellom Regulus (Løven) og Pollux (Tvillingene).', season:'Vinter/Vår'},
  {id:'m11',  emo:'✨', name:'M11 — Villandhopen',        type:'cluster', ra:18.851,dec:-6.27, idealMag:80, mag:6.3, size:14,  why:'Tettpakket V-form med hundrevis av stjerner', expect:'Svært tett — nesten som en kulehop.', anchor:'I den lille stjernerekken Scutum, sør for Ørnen (Aquila); følg Melkeveien sørover fra Altair.', season:'Sommer/Høst'},
  {id:'m39',  emo:'✨', name:'M39 (Svanen)',              type:'cluster', ra:21.533,dec:48.43, idealMag:25, mag:4.6, size:32,  why:'Løs og fin på lav forstørrelse', expect:'Stor, åpen trekant av lyse stjerner.', anchor:'Nordøst for Deneb i Svanen — et stort, løst felt; feltstikk fra Deneb.', season:'Sommer/Høst'},
  {id:'mel25', emo:'✨', name:'Hyadene (Melotte 25)',      type:'cluster', ra:4.470, dec:15.87, idealMag:20, mag:0.5, size:330, why:'Den store V-formen som danner Tyrens ansikt — svært lett', expect:'Enorm, lyssterk V av stjerner rundt Aldebaran. For stor for kikkerten — bruk søker eller håndkikkert.', anchor:'V-formen av stjerner rundt den oransje Aldebaran. Lett å se for blotte øye.', season:'Vinter'},
  {id:'col69', emo:'✨', name:'Collinder 69 — Orions hode', type:'cluster', ra:5.585, dec:9.93,  idealMag:30, mag:2.8, size:70,  why:'Stor løs hop rundt Meissa, Orions hode — lett', expect:'En håndfull lyse stjerner spredt rundt Meissa; best i søker eller på lav forstørrelse.', anchor:'Stjernen Meissa — Orions hode, like over de to skulderstjernene.', season:'Vinter'},
  {id:'m41',  emo:'✨', name:'M41 (Store hund)',           type:'cluster', ra:6.767, dec:-20.75,idealMag:40, mag:4.5, size:38,  why:'Lett, fin hop rett sør for Sirius', expect:'Vakker spredt hop, nesten månestor — synlig som tåkeflekk for blotte øye under mørk himmel.', anchor:'Cirka 4° rett sør for Sirius, himmelens klareste stjerne — umulig å bomme på.', season:'Vinter'},

  // Kulehoper
  {id:'m13', emo:'⭐', name:'M13 — Herkuleshopen', type:'globular', ra:16.694,dec:36.46, idealMag:160, mag:5.8, size:20, why:'Nordhimmelens flotteste kulehop — over 300 000 stjerner', expect:'Rund tåkeball som løses opp i stjerner mot kanten ved høy forstørrelse.', anchor:'På linjen mellom Vega og Arcturus: finn «Herkules-firkanten», M13 sitter på vestsiden mellom de to øverste stjernene.', season:'Vår/Sommer'},
  {id:'m92', emo:'⭐', name:'M92 (Herkules)',      type:'globular', ra:17.285,dec:43.13, idealMag:150, mag:6.4, size:14, why:'Nesten like fin som M13, men lite kjent', expect:'Kompakt, lyssterk kule.', anchor:'Også i Herkules, nord for firkanten — sveip oppover fra M13.', season:'Vår/Sommer'},
  {id:'m3',  emo:'⭐', name:'M3 (Jakthundene)',    type:'globular', ra:13.703,dec:28.38, idealMag:150, mag:6.2, size:18, why:'Vårens beste kulehop — veldig rik og rund', expect:'Tett kjerne med svermende kant.', anchor:'Halvveis mellom Arcturus (Bootes) og Cor Caroli (Jakthundene) — feltstikk langs linjen.', season:'Vår'},
  {id:'m5',  emo:'⭐', name:'M5 (Slangen)',        type:'globular', ra:15.310,dec:2.08,  idealMag:120, mag:5.7, size:23, why:'Stor kulehop, nesten like god som M13', expect:'Stor og lyssterk, lett å løse opp.', anchor:'Like ved stjernen 5 Serpentis, sørvest for Arcturus.', season:'Vår/Sommer'},
  {id:'m53', emo:'⭐', name:'M53 (Berenikes hår)', type:'globular', ra:13.215,dec:18.17, idealMag:140, mag:7.6, size:13, why:'Pen vår-kandidat', expect:'Jevn, rund tåkeflekk.', anchor:'Rett ved Diadem (α Com) i Berenikes hår.', season:'Vår'},
  {id:'m15', emo:'⭐', name:'M15 (Pegasus)',       type:'globular', ra:21.500,dec:12.17, idealMag:150, mag:6.2, size:18, why:'Tettpakket høst-favoritt', expect:'Svært tett kjerne.', anchor:'Følg «nesen» til Pegasus: en kort hopp fra Enif (ε Peg) mot nordvest.', season:'Sommer/Høst'},
  {id:'m2',  emo:'⭐', name:'M2 (Vannmannen)',     type:'globular', ra:21.558,dec:-0.82, idealMag:150, mag:6.5, size:16, why:'Stor og rik kulehop', expect:'Rund og rik, litt lavt på himmelen.', anchor:'Nord for Sadalsuud i Vannmannen; ligger ganske isolert, så feltstikk rolig.', season:'Sommer/Høst'},

  // Galakser
  {id:'m81',    emo:'🌀', name:'M81 — Bodes galakse',     type:'galaxy', ra:9.926, dec:69.07, idealMag:80,  mag:6.9, size:27, why:'Sirkumpolar — fin spiral, alltid tilgjengelig fra Norge', expect:'Klar oval kjerne; spiralarmer krever mørk himmel.', anchor:'Tegn en linje fra de to ytterste stjernene i Karlsvognas kar (Dubhe→Phecda), forleng like langt forbi Dubhe.', season:'Hele året'},
  {id:'m82',    emo:'🌀', name:'M82 — Sigarrgalaksen',    type:'galaxy', ra:9.932, dec:69.68, idealMag:120, mag:8.4, size:11, why:'Starburst-galakse rett ved siden av M81', expect:'Tynn, avlang lysstripe — «sigaren».', anchor:'I samme synsfelt som M81 — rett nord for den.', season:'Hele året'},
  {id:'m31',    emo:'🌀', name:'M31 — Andromedagalaksen', type:'galaxy', ra:0.712, dec:41.27, idealMag:50,  mag:3.4, size:180,why:'Vår nabogalakse — 2,5 mill. lysår unna', expect:'Stor avlang lysflekk; mye større enn synsfeltet. Ikke Hubble-bildet.', anchor:'Fra Andromedas «kjede»: hopp fra Mirach (β And) via μ And to stjernehopp nordover — synlig for blotte øye under mørk himmel.', season:'Høst'},
  {id:'m33',    emo:'🌀', name:'M33 — Triangulumgalaksen',type:'galaxy', ra:1.564, dec:30.66, idealMag:50,  mag:5.7, size:70, why:'Flat spiral, trenger mørk himmel', expect:'Stor, men svak og diffus — krever mørke.', anchor:'På motsatt side av Mirach fra M31, omtrent like langt unna — krever mørk himmel.', season:'Høst'},
  {id:'ngc891', emo:'🌀', name:'NGC 891 (Andromeda)',     type:'galaxy', ra:2.383, dec:42.35, idealMag:120, mag:9.9, size:14, why:'Klassisk kantvendt galakse med tydelig støvbånd', expect:'Tynn nål; støvbåndet er en utfordring i 8".', anchor:'Midtveis mellom Almach (γ And) og Algol — feltstikk forsiktig, den er svak.', season:'Høst'},
  {id:'m65',    emo:'🌀', name:'M65/M66 — Leo-tripletten', type:'galaxy', ra:11.314,dec:13.09, idealMag:80,  mag:8.9, size:9,  why:'To galakser i samme synsfelt', expect:'To avlange tåkeflekker side om side.', anchor:'Under «bakbeinet» til Løven, mellom Theta Leonis og Iota Leonis (Leo-tripletten).', season:'Vår'},
  {id:'m64',    emo:'🌀', name:'M64 — Svart Øye-galaksen', type:'galaxy', ra:12.944,dec:21.68, idealMag:150, mag:8.5, size:10, why:'Mørk støvring rundt kjernen — tydelig i 8"', expect:'Lys kjerne; det «svarte øyet» krever god himmel.', anchor:'Nær stjernen 35 Com i Berenikes hår, nordøst for Diadem.', season:'Vår'},
  {id:'m106',   emo:'🌀', name:'M106 (Jakthundene)',       type:'galaxy', ra:12.317,dec:47.30, idealMag:100, mag:8.4, size:19, why:'Stor galakse, god kandidat i 8"', expect:'Avlang glød med lysere kjerne.', anchor:'Sørvest for Phecda i Karlsvogna, ved stjernen 3 CVn.', season:'Vår'},
  {id:'m63',    emo:'🌀', name:'M63 — Solsikkegalaksen',   type:'galaxy', ra:13.263,dec:42.03, idealMag:120, mag:8.6, size:13, why:'Karakteristisk tett spiralmønster', expect:'Jevn oval glød.', anchor:'Mellom Cor Caroli og slutten av Karlsvognas håndtak.', season:'Vår'},
  {id:'m51',    emo:'🌀', name:'M51 — Virvelgalaksen',     type:'galaxy', ra:13.498,dec:47.20, idealMag:80,  mag:8.4, size:11, why:'Vakker spiralgalakse med satellittgalakse', expect:'To tåkeflekker; spiralform anes under mørk himmel.', anchor:'Rett under den siste stjernen i Karlsvognas håndtak (Alkaid) — hopp litt sørvest.', season:'Vår'},
  {id:'m101',   emo:'🌀', name:'M101 — Vindmøllegalaksen', type:'galaxy', ra:14.054,dec:54.35, idealMag:60,  mag:7.9, size:29, why:'Stor ansiktsvendt spiral nær Karlsvogna', expect:'Stor, men diffus og lavkontrast — krever mørke.', anchor:'Danner en likebeint trekant med de to siste håndtaks-stjernene Mizar og Alkaid.', season:'Vår'},

  // Tåker
  {id:'m42',     emo:'🌫', name:'M42 — Oriontåken',   type:'nebula', ra:5.588, dec:-5.39, idealMag:75,  mag:4.0, size:85,  why:'Vinterens absolutt beste objekt — enorm gasssky', expect:'Lysende gråsky med Trapezet i midten — spektakulær.', anchor:'Det midterste «sverdet» som henger under Orions belte — synlig for blotte øye som en uskarp stjerne.', season:'Vinter'},
  {id:'m1',      emo:'🌫', name:'M1 — Krabbtåken',    type:'nebula', ra:5.575, dec:22.01, idealMag:80,  mag:8.4, size:6,   why:'Supernovarester fra år 1054', expect:'Svak, formløs gråflekk.', anchor:'Like over hornspissen Tianguan (ζ Tau) i Tyren.', season:'Vinter'},
  {id:'m78',     emo:'🌫', name:'M78 (Orion)',         type:'nebula', ra:5.780, dec:0.05,  idealMag:80,  mag:8.3, size:8,   why:'Refleksjonståke — sjelden type å se', expect:'Liten, diffus glød rundt et par stjerner.', anchor:'Like nord for den østligste beltestjernen Alnitak i Orion.', season:'Vinter'},
  {id:'ngc2392', emo:'🌫', name:'NGC 2392 — Eskimotåken', type:'nebula', ra:7.488, dec:20.91, idealMag:200, mag:9.1, size:0.8, why:'Liten men tydelig — trenger forstørrelse', expect:'Liten blålig disk — øk forstørrelsen.', anchor:'Ved stjernen Wasat (δ Gem) i Tvillingene; ligner først en uskarp stjerne.', season:'Vinter/Vår'},
  {id:'m97',     emo:'🌫', name:'M97 — Uglentåken',   type:'nebula', ra:11.245,dec:55.02, idealMag:130, mag:9.9, size:3.4, why:'Svak «ugle» — utfordring men mulig i 8"', expect:'Rund, svak skive; «øynene» krever mørke + filter.', anchor:'Rett under «karet» i Karlsvogna, nær Merak — i samme felt som M108.', season:'Vår'},
  {id:'m57',     emo:'🌫', name:'M57 — Ringtåken',     type:'nebula', ra:18.892,dec:33.03, idealMag:180, mag:8.8, size:1.4, why:'Perfekt røykring der en stjerne har dødd', expect:'Liten, men tydelig røykring — øk forstørrelsen.', anchor:'Midt mellom Sheliak og Sulafat, de to nederste stjernene i Lyras parallellogram.', season:'Sommer'},
  {id:'m27',     emo:'🌫', name:'M27 — Hanteltåken',   type:'nebula', ra:19.994,dec:22.72, idealMag:80,  mag:7.4, size:8,   why:'Stor lyssterk planetarisk tåke', expect:'Tydelig timeglass-/eple-form — lyssterk.', anchor:'Rett nord for pilen Sagitta; feltstikk opp fra pilespissen.', season:'Sommer/Høst'},

  // Dobbeltstjerner
  {id:'etacas',  emo:'✦', name:'Eta Cassiopeiae',           type:'double', ra:0.815, dec:57.82, idealMag:80,  mag:3.4, sep:13,  why:'Gul + rød kontrast — sirkumpolar', expect:'Lett å splitte; fin gul/rødlig fargekontrast.', anchor:'Like ved Schedar/Caph i Cassiopeia — pek på den nest øverste W-stjernen.', season:'Hele året'},
  {id:'almach',  emo:'✦', name:'Almach (γ Andromedae)',     type:'double', ra:2.065, dec:42.33, idealMag:80,  mag:2.3, sep:9.6, why:'Oransje/blågrønn kontrast nær Andromeda', expect:'Vakker oransje + blå kontrast.', anchor:'Den ytterste stjernen i Andromeda-kjeden, lengst fra Pegasus-firkanten — sikt rett på.', season:'Høst'},
  {id:'castor',  emo:'✦', name:'Castor (α Geminorum)',      type:'double', ra:7.576, dec:31.89, idealMag:100, mag:1.9, sep:5.0, why:'Hvit/hvit dobbelt — splittes fint i 8"', expect:'To hvite stjerner tett sammen — krever litt forstørrelse.', anchor:'Det nordligste av Tvillingenes to «hoder» (det andre er Pollux) — sikt rett på.', season:'Vinter/Vår'},
  {id:'corcaro', emo:'✦', name:'Cor Caroli (α CVn)',        type:'double', ra:12.934,dec:38.32, idealMag:80,  mag:2.9, sep:19,  why:'Pen blå/hvit dobbelt i Jakthundene', expect:'Lett par med svak fargeforskjell.', anchor:'Den klart lyseste stjernen under Karlsvognas håndtak — sikt rett på.', season:'Vår'},
  {id:'mizar',   emo:'✦', name:'Mizar og Alcor',            type:'double', ra:13.398,dec:54.93, idealMag:50,  mag:2.2, sep:14,  why:'Karlsvognhåndtaket — sirkumpolar', expect:'Mizar splittes i to; Alcor synlig med blotte øye ved siden av.', anchor:'Den midterste stjernen i Karlsvognas håndtak — synlig for blotte øye.', season:'Hele året'},
  {id:'epslyrae',emo:'✦', name:'Epsilon Lyrae (dobbel-dobbel)', type:'double', ra:18.746,dec:39.67, idealMag:150, mag:4.7, sep:2.3, why:'Fire stjerner i to par — trenger høy forstørrelse', expect:'Hvert par krever ~100×+ for å splittes — en klassisk test.', anchor:'Like ved Vega i Lyra — pek rett over Vega.', season:'Sommer'},
  {id:'albireo', emo:'✦', name:'Albireo (β Cygni)',         type:'double', ra:19.512,dec:27.96, idealMag:80,  mag:3.1, sep:35,  why:'Gylden + blå — det vakreste dobbeltparet', expect:'Praktfull gyllen + safirblå kontrast — lett å splitte.', anchor:'Nebbet på Svanen (Cygnus) — bunnen av «Det nordlige kors».', season:'Sommer/Høst'},
  {id:'sigmaori', emo:'✦', name:'Sigma Orionis',            type:'double', ra:5.645, dec:-2.60, idealMag:120, mag:3.8, sep:11,  why:'Femdobbelt system rett under Alnitak — lett å finne', expect:'Et tett lite knippe av flere stjerner samlet — fint i en 8" ved middels forstørrelse.', anchor:'Rett under Alnitak, den venstre stjernen i Orions belte.', season:'Vinter'},
];

// Planet metadata — RA/Dec beregnes dynamisk av planetPos().
// mag/diam er typiske verdier (de varierer gjennom året); diam = tilsynelatende
// diameter i buesekunder (″). season-feltet brukes som en kort synlighetsnotis.
var PLANETS_2026 = [
  {id:'venus',   emo:'♀',  name:'Venus',   ra:0, dec:0, type:'planet', idealMag:120, why:'Tydelige faser som en mini-måne',     mag:-4.2, diam:'10–60', season:'Morgen- eller kveldsstjerne',      expect:'Skarp fase som en liten hvit måne — sigd eller halv. Ingen overflatedetaljer (tett skydekke), bare en blendende hvit form.'},
  {id:'jupiter', emo:'🪐', name:'Jupiter', ra:0, dec:0, type:'planet', idealMag:160, why:'Skybelter + fire Galilei-måner',       mag:-2.3, diam:'35–50', season:'Synlig mesteparten av året',       expect:'To mørke skybelter tvers over skiven, og fire måner på rad som flytter seg fra natt til natt. I stødig luft anes Den store røde flekken.'},
  {id:'mars',    emo:'🔴', name:'Mars',    ra:0, dec:0, type:'planet', idealMag:200, why:'Liten oransje skive — best ved opposisjon', mag:0.5,  diam:'4–25',  season:'Best ved opposisjon (~hver 26. måned)', expect:'En liten oransje skive. Nær opposisjon kan du ane mørke markeringer og en hvit polkalott; ellers bare en lysende prikk med farge.'},
  {id:'saturn',  emo:'💍', name:'Saturn',  ra:0, dec:0, type:'planet', idealMag:200, why:'Ringene er alltid wow',                mag:0.7,  diam:'16–20', season:'Synlig mesteparten av året',       expect:'Ringene er det store øyeblikket — tydelig løsrevet fra planeten. I stødig luft sees Cassini-delingen. Månen Titan står som en stjerne ved siden av.'},
  {id:'uranus',  emo:'🔵', name:'Uranus',  ra:0, dec:0, type:'planet', idealMag:150, why:'Liten blågrønn disk',                  mag:5.7,  diam:'3.7',   season:'Høst/vinter, mørk himmel',         expect:'En bitteliten blågrønn skive, knapt forskjellig fra en stjerne. Du trenger høy forstørrelse for å se at det faktisk er en skive og ikke en prikk.'},
  {id:'neptune', emo:'🔷', name:'Neptun',  ra:0, dec:0, type:'planet', idealMag:200, why:'Solsystemets ytterste — en blå prikk', mag:7.8,  diam:'2.3',   season:'Høst — krever stjernekart',        expect:'En svært svak, blå «stjerne» (mag 7,8) — umulig å finne uten stjernekart. Selv ved høy forstørrelse er den knapt til å skille fra en stjerne; du aner så vidt en bitteliten skive.'},
];

// Måner — vår egen Måne + de lyse månene som er innen rekkevidde i en 8".
// type:'moon' så de havner i solsystem-kategorien. parent = planeten de går rundt.
var MOONS = [
  {id:'luna',     emo:'🌙', name:'Månen',           type:'moon', parent:null,      idealMag:60,  why:'Krater, hav og fjell — det mest detaljrike objektet på himmelen', mag:-12.7, season:'Hele året (faser)', expect:'Overveldende detaljrik: kratere, fjellkjeder og mørke «hav». Best langs skygge­grensen (terminatoren) der relieffet trer tydeligst fram — ikke ved fullmåne.'},
  {id:'io',       emo:'🟡', name:'Io (Jupiter I)',       type:'moon', parent:'jupiter', idealMag:160, why:'Innerste Galilei-måne', mag:5.0, season:'Når Jupiter er oppe', expect:'En av fire «stjerner» på rad ved Jupiter. Skifter plass fra natt til natt; av og til foran/bak planeten.'},
  {id:'europa',   emo:'⚪', name:'Europa (Jupiter II)',   type:'moon', parent:'jupiter', idealMag:160, why:'Ismåne — Galilei-måne', mag:5.3, season:'Når Jupiter er oppe', expect:'En av de fire lyspunktene ved Jupiter. Kan kaste skygge på planeten ved passasje.'},
  {id:'ganymede', emo:'⚫', name:'Ganymedes (Jupiter III)', type:'moon', parent:'jupiter', idealMag:160, why:'Solsystemets største måne', mag:4.6, season:'Når Jupiter er oppe', expect:'Det klareste av Jupiters fire lyspunkter — større enn planeten Merkur.'},
  {id:'callisto', emo:'⚫', name:'Callisto (Jupiter IV)', type:'moon', parent:'jupiter', idealMag:160, why:'Ytterste Galilei-måne', mag:5.7, season:'Når Jupiter er oppe', expect:'Det ytterste av de fire lyspunktene; vandrer lengst fra Jupiter.'},
  {id:'titan',    emo:'🟠', name:'Titan (Saturn VI)',     type:'moon', parent:'saturn',  idealMag:200, why:'Saturns store måne — med atmosfære', mag:8.4, season:'Når Saturn er oppe', expect:'En lysprikk (mag 8,4) som står et stykke fra Saturn og flytter seg fra natt til natt. Eneste Saturn-måne lett synlig i en 8".'}
];

// ================================================================
// HIMMELBEGIVENHETER 2026 (TIME-3)
// Kilde: astroevents.no (Knut Jørgen Røed Ødegaard & Anne Mette Sannes) m.fl.
// date = ISO (hendelsens dato/natt); kind styrer ikon/farge.
// ================================================================
var SKY_EVENTS = [
  {date:'2026-01-03', kind:'moon',    title:'Supermåne + supersol', desc:'Fullmåne nær jorda samtidig som jorda er nærmest sola — månen ser ekstra stor ut.'},
  {date:'2026-01-03', kind:'meteor',  title:'Quadrantidene (maks natt til 4.)', desc:'Nordens kraftigste sverm, normalt 100–120 meteorer/t, men superfullmånen vasker ut mange i år (~10/t). Best fra Sør-Norge.'},
  {date:'2026-02-24', kind:'planet',  title:'Planetparade — 6 planeter', desc:'Jupiter, Saturn, Venus, Merkur og Uranus på kveldshimmelen (Neptun i kikkert). Fem synlige for blotte øye. Varer ca. 24.–28. feb.'},
  {date:'2026-03-03', kind:'eclipse', title:'Total måneformørkelse (blodmåne)', desc:'Månen farges rødlig i jordas skygge; total fase ~58 min. Synlig fra deler av Norge avhengig av månens nedgang.'},
  {date:'2026-08-12', kind:'eclipse', title:'Stor delvis solformørkelse', desc:'Tiårets største — 81–93 % av sola dekkes (mest i nord). Total i Spania/Island. Krever godkjente solformørkelsesbriller. God sikt mot vest-nordvest.'},
  {date:'2026-08-12', kind:'meteor',  title:'Perseidene (maks 12.–13.)', desc:'Et av de beste Perseide-årene på lenge — nymåne, ingen månestøy, opptil 150/t. Best fra Sør-Norge pga. lyse netter.'},
  {date:'2026-08-28', kind:'eclipse', title:'Delvis måneformørkelse', desc:'Natt til fredag 28. august — del av månen i jordas skygge.'},
  {date:'2026-12-14', kind:'meteor',  title:'Geminidene (maks 13.–14. des)', desc:'Årets rikeste pålitelige sverm, opptil ~120/t. Mørke vinternetter i Norge gir gode forhold.'}
];

// Kommende hendelser fra og med en gitt dato (Date), inntil n stk.
function upcomingEvents(fromDate, n) {
  n = n || 5;
  var f = new Date(fromDate); f.setHours(0,0,0,0);
  var out = [];
  for (var i=0;i<SKY_EVENTS.length;i++){
    var e = SKY_EVENTS[i], d = new Date(e.date + 'T00:00:00');
    if (d >= f) out.push(e);
  }
  return out.slice(0, n);
}

// ================================================================
// LYSE NAVIGASJONSSTJERNER (for finnekart, FIND-4)
// ra i timer, dec i grader, m tilsynelatende magnitude. Et utvalg lyse
// stjerner + asterisme-stjerner som dekker himmelen brukeren ser fra Norge.
// ================================================================
var BRIGHT_STARS = [
  {n:'Dubhe',ra:11.062,dec:61.75,m:1.8},{n:'Merak',ra:11.031,dec:56.38,m:2.4},
  {n:'Phecda',ra:11.897,dec:53.69,m:2.4},{n:'Megrez',ra:12.257,dec:57.03,m:3.3},
  {n:'Alioth',ra:12.900,dec:55.96,m:1.8},{n:'Mizar',ra:13.399,dec:54.93,m:2.2},
  {n:'Alkaid',ra:13.792,dec:49.31,m:1.9},
  {n:'Caph',ra:0.153,dec:59.15,m:2.3},{n:'Schedar',ra:0.675,dec:56.54,m:2.2},
  {n:'Navi',ra:0.945,dec:60.72,m:2.2},{n:'Ruchbah',ra:1.430,dec:60.24,m:2.7},
  {n:'Segin',ra:1.907,dec:63.67,m:3.4},
  {n:'Polaris',ra:2.530,dec:89.26,m:2.0},{n:'Kochab',ra:14.845,dec:74.16,m:2.1},
  {n:'Vega',ra:18.615,dec:38.78,m:0.0},{n:'Sheliak',ra:18.835,dec:33.36,m:3.5},
  {n:'Sulafat',ra:18.982,dec:32.69,m:3.2},{n:'Deneb',ra:20.690,dec:45.28,m:1.3},
  {n:'Sadr',ra:20.371,dec:40.26,m:2.2},{n:'Albireo',ra:19.512,dec:27.96,m:3.1},
  {n:'Altair',ra:19.846,dec:8.87,m:0.8},
  {n:'Arcturus',ra:14.261,dec:19.18,m:0.0},{n:'Cor Caroli',ra:12.934,dec:38.32,m:2.9},
  {n:'Diadem',ra:13.166,dec:17.53,m:4.3},
  {n:'Zeta Her',ra:16.688,dec:31.60,m:2.8},{n:'Eta Her',ra:16.715,dec:38.92,m:3.5},
  {n:'Pi Her',ra:17.251,dec:36.81,m:3.2},{n:'Epsilon Her',ra:17.005,dec:30.93,m:3.9},
  {n:'Alpheratz',ra:0.140,dec:29.09,m:2.1},{n:'Mirach',ra:1.162,dec:35.62,m:2.1},
  {n:'Almach',ra:2.065,dec:42.33,m:2.3},{n:'Enif',ra:21.736,dec:9.88,m:2.4},
  {n:'Mirfak',ra:3.405,dec:49.86,m:1.8},{n:'Algol',ra:3.136,dec:40.96,m:2.1},
  {n:'Capella',ra:5.278,dec:46.00,m:0.1},{n:'Elnath',ra:5.438,dec:28.61,m:1.6},
  {n:'Aldebaran',ra:4.599,dec:16.51,m:0.9},
  {n:'Betelgeuse',ra:5.919,dec:7.41,m:0.5},{n:'Rigel',ra:5.242,dec:-8.20,m:0.1},
  {n:'Bellatrix',ra:5.418,dec:6.35,m:1.6},{n:'Alnitak',ra:5.679,dec:-1.94,m:1.7},
  {n:'Alnilam',ra:5.604,dec:-1.20,m:1.7},{n:'Mintaka',ra:5.533,dec:-0.30,m:2.2},
  {n:'Castor',ra:7.577,dec:31.89,m:1.6},{n:'Pollux',ra:7.755,dec:28.03,m:1.1},
  {n:'Procyon',ra:7.655,dec:5.22,m:0.4},{n:'Regulus',ra:10.139,dec:11.97,m:1.4},
  {n:'Denebola',ra:11.818,dec:14.57,m:2.1},{n:'Algieba',ra:10.333,dec:19.84,m:2.0},
  {n:'Gienah Cyg',ra:20.770,dec:33.97,m:2.5},
];

// Bygg et lite finnekart (SVG-streng) sentrert på et objekt (FIND-4).
// Viser lyse stjerner i nærheten projisert lokalt; nord opp, øst til venstre
// (slik en stjernekart ser ut når du ser mot sør). raH i timer, decDeg i grader.
function buildFinderChart(raH, decDeg, name, radiusDeg) {
  radiusDeg = radiusDeg || 28;
  var VB = 260, cx = VB/2, cy = VB/2, plotR = VB/2 - 16;
  // lokal projeksjon: dRA korrigert for cos(dec); øst (økende RA) til venstre
  function project(sRaH, sDec) {
    var dRa = (sRaH - raH); if (dRa > 12) dRa -= 24; if (dRa < -12) dRa += 24;
    var dx = -dRa * 15 * Math.cos(deg2rad(decDeg)); // grader, øst venstre
    var dy = (sDec - decDeg);                        // grader, nord opp
    return {x: cx + (dx/radiusDeg)*plotR, y: cy - (dy/radiusDeg)*plotR, dist: Math.sqrt(dx*dx+dy*dy)};
  }
  var stars = '';
  for (var i = 0; i < BRIGHT_STARS.length; i++) {
    var s = BRIGHT_STARS[i], p = project(s.ra, s.dec);
    if (p.dist > radiusDeg) continue;
    var rr = Math.max(1.1, 3.6 - s.m*0.45);
    stars += '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+rr.toFixed(1)+'" fill="#dde6ff"/>';
    // navngi lyse stjerner, og svakere stjerner som er nær målet (nyttige pekepinner)
    if (s.m < 2.8 || p.dist < radiusDeg*0.55) stars += '<text x="'+(p.x+rr+2).toFixed(1)+'" y="'+(p.y+3).toFixed(1)+'" fill="#8590bd" font-family="monospace" font-size="8">'+s.n+'</text>';
  }
  // målet i midten — gull retikkel
  var tgt = '<circle cx="'+cx+'" cy="'+cy+'" r="9" fill="none" stroke="#f0c46a" stroke-width="1.5"/>'+
    '<line x1="'+cx+'" y1="'+(cy-13)+'" x2="'+cx+'" y2="'+(cy-5)+'" stroke="#f0c46a" stroke-width="1.5"/>'+
    '<line x1="'+cx+'" y1="'+(cy+5)+'" x2="'+cx+'" y2="'+(cy+13)+'" stroke="#f0c46a" stroke-width="1.5"/>'+
    '<line x1="'+(cx-13)+'" y1="'+cy+'" x2="'+(cx-5)+'" y2="'+cy+'" stroke="#f0c46a" stroke-width="1.5"/>'+
    '<line x1="'+(cx+5)+'" y1="'+cy+'" x2="'+(cx+13)+'" y2="'+cy+'" stroke="#f0c46a" stroke-width="1.5"/>';
  // himmelretninger
  var compass = '<text x="'+cx+'" y="12" fill="#6fd8e0" font-family="monospace" font-size="9" text-anchor="middle">N</text>'+
    '<text x="'+cx+'" y="'+(VB-4)+'" fill="#8590bd" font-family="monospace" font-size="9" text-anchor="middle">S</text>'+
    '<text x="10" y="'+(cy+3)+'" fill="#8590bd" font-family="monospace" font-size="9" text-anchor="middle">Ø</text>'+
    '<text x="'+(VB-10)+'" y="'+(cy+3)+'" fill="#8590bd" font-family="monospace" font-size="9" text-anchor="middle">V</text>';
  // skala-ring (radius/2)
  var ring = '<circle cx="'+cx+'" cy="'+cy+'" r="'+(plotR/2).toFixed(1)+'" fill="none" stroke="rgba(160,176,230,.15)" stroke-dasharray="2 4"/>';

  return '<svg viewBox="0 0 '+VB+' '+VB+'" xmlns="http://www.w3.org/2000/svg">'+
    '<rect x="0" y="0" width="'+VB+'" height="'+VB+'" rx="12" fill="#0a0d1e"/>'+
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+plotR+'" fill="#0c1024" stroke="rgba(160,176,230,.2)"/>'+
    ring + stars + tgt + compass + '</svg>';
}

// ================================================================
// STJERNEBILDE-FINNEKART (FIND-4, kalibrert)
// Tegner et stjernebilde med navngitte stjerner + forbindelseslinjer,
// og en pil ut til objektet. Avstandene er ekte vinkelavstander (kalibrert),
// med en skalastrek som referanse.
// ================================================================
var CONSTELLATIONS = {
  cas: {
    name:'Cassiopeia (W-en)',
    stars:[
      {n:'Caph',    ra:0.153, dec:59.15, m:2.3},
      {n:'Schedar', ra:0.675, dec:56.54, m:2.2},
      {n:'Navi',    ra:0.945, dec:60.72, m:2.2},
      {n:'Ruchbah', ra:1.430, dec:60.24, m:2.7},
      {n:'Segin',   ra:1.907, dec:63.67, m:3.4}
    ],
    lines:[[0,1],[1,2],[2,3],[3,4]]
  },
  uma: {
    name:'Karlsvogna (Store bjørn)',
    stars:[
      {n:'Dubhe',   ra:11.062, dec:61.75, m:1.8},
      {n:'Merak',   ra:11.031, dec:56.38, m:2.4},
      {n:'Phecda',  ra:11.897, dec:53.69, m:2.4},
      {n:'Megrez',  ra:12.257, dec:57.03, m:3.3},
      {n:'Alioth',  ra:12.900, dec:55.96, m:1.8},
      {n:'Mizar',   ra:13.399, dec:54.93, m:2.2},
      {n:'Alkaid',  ra:13.792, dec:49.31, m:1.9}
    ],
    lines:[[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]]
  },
  ori: {
    name:'Orion',
    stars:[
      {n:'Betelgeuse',ra:5.919, dec:7.41,  m:0.5},
      {n:'Bellatrix', ra:5.418, dec:6.35,  m:1.6},
      {n:'Mintaka',   ra:5.533, dec:-0.30, m:2.2},
      {n:'Alnilam',   ra:5.604, dec:-1.20, m:1.7},
      {n:'Alnitak',   ra:5.679, dec:-1.94, m:1.7},
      {n:'Saiph',     ra:5.796, dec:-9.67, m:2.1},
      {n:'Rigel',     ra:5.242, dec:-8.20, m:0.1}
    ],
    lines:[[0,1],[1,2],[2,3],[3,4],[0,4],[4,5],[2,6]]
  },
  lyr: {
    name:'Lyra (Lyren)',
    stars:[
      {n:'Vega',    ra:18.615, dec:38.78, m:0.0},
      {n:'Sheliak', ra:18.835, dec:33.36, m:3.5},
      {n:'Sulafat', ra:18.982, dec:32.69, m:3.2},
      {n:'Zeta Lyr',ra:18.746, dec:37.61, m:4.3},
      {n:'Delta Lyr',ra:18.908,dec:36.90, m:4.3}
    ],
    lines:[[0,3],[3,1],[1,2],[2,4],[4,3]]
  },
  cyg: {
    name:'Svanen (Det nordlige kors)',
    stars:[
      {n:'Deneb',     ra:20.690, dec:45.28, m:1.3},
      {n:'Sadr',      ra:20.371, dec:40.26, m:2.2},
      {n:'Albireo',   ra:19.512, dec:27.96, m:3.1},
      {n:'Gienah',    ra:20.770, dec:33.97, m:2.5},
      {n:'Delta Cyg', ra:19.749, dec:45.13, m:2.9}
    ],
    lines:[[0,1],[1,2],[3,1],[1,4]]
  },
  and: {
    name:'Andromeda',
    stars:[
      {n:'Alpheratz',ra:0.140, dec:29.09, m:2.1},
      {n:'Mirach',   ra:1.162, dec:35.62, m:2.1},
      {n:'Almach',   ra:2.065, dec:42.33, m:2.3},
      {n:'Mu And',   ra:0.946, dec:38.50, m:3.9},
      {n:'Nu And',   ra:0.830, dec:41.08, m:4.5}
    ],
    lines:[[0,1],[1,2],[1,3],[3,4]]
  },
  her: {
    name:'Herkules (Kilesteinen)',
    stars:[
      {n:'Eta Her',    ra:16.715, dec:38.92, m:3.5},
      {n:'Zeta Her',   ra:16.688, dec:31.60, m:2.8},
      {n:'Epsilon Her',ra:17.005, dec:30.93, m:3.9},
      {n:'Pi Her',     ra:17.251, dec:36.81, m:3.2}
    ],
    lines:[[0,1],[1,2],[2,3],[3,0]]
  },
  aur: {
    name:'Auriga (Kjøresvennen)',
    stars:[
      {n:'Capella',   ra:5.278, dec:46.00, m:0.1},
      {n:'Menkalinan',ra:5.992, dec:44.95, m:1.9},
      {n:'Mahasim',   ra:5.995, dec:37.21, m:2.6},
      {n:'Elnath',    ra:5.438, dec:28.61, m:1.6},
      {n:'Hassaleh',  ra:4.950, dec:33.17, m:2.7}
    ],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,0]]
  },
  gem: {
    name:'Tvillingene',
    stars:[
      {n:'Castor',  ra:7.577, dec:31.89, m:1.6},
      {n:'Pollux',  ra:7.755, dec:28.03, m:1.1},
      {n:'Mebsuta', ra:6.732, dec:25.13, m:3.0},
      {n:'Tejat',   ra:6.383, dec:22.51, m:2.9},
      {n:'Alhena',  ra:6.629, dec:16.40, m:1.9},
      {n:'Mekbuda', ra:7.068, dec:20.57, m:3.8}
    ],
    lines:[[0,1],[0,2],[2,3],[1,5],[5,4]]
  },
  tau: {
    name:'Tyren',
    stars:[
      {n:'Aldebaran',ra:4.599, dec:16.51, m:0.9},
      {n:'Elnath',   ra:5.438, dec:28.61, m:1.6},
      {n:'Zeta Tau', ra:5.627, dec:21.14, m:3.0},
      {n:'Gamma Tau',ra:4.330, dec:15.63, m:3.6}
    ],
    lines:[[3,0],[0,1],[0,2]]
  },
  leo: {
    name:'Løven',
    stars:[
      {n:'Regulus', ra:10.139, dec:11.97, m:1.4},
      {n:'Algieba', ra:10.333, dec:19.84, m:2.0},
      {n:'Zosma',   ra:11.235, dec:20.52, m:2.6},
      {n:'Chort',   ra:11.237, dec:15.43, m:3.3},
      {n:'Denebola',ra:11.818, dec:14.57, m:2.1}
    ],
    lines:[[0,1],[1,2],[2,4],[4,3],[3,0],[2,3]]
  },
  peg: {
    name:'Pegasus (Den store firkanten)',
    stars:[
      {n:'Markab',   ra:23.079, dec:15.21, m:2.5},
      {n:'Scheat',   ra:23.063, dec:28.08, m:2.4},
      {n:'Alpheratz',ra:0.140,  dec:29.09, m:2.1},
      {n:'Algenib',  ra:0.221,  dec:15.18, m:2.8},
      {n:'Enif',     ra:21.736, dec:9.88,  m:2.4}
    ],
    lines:[[0,1],[1,2],[2,3],[3,0],[0,4]]
  },
  cvn: {
    name:'Jakthundene',
    stars:[
      {n:'Cor Caroli',ra:12.934, dec:38.32, m:2.9},
      {n:'Chara',     ra:12.562, dec:41.36, m:4.2}
    ],
    lines:[[0,1]]
  },
  per: {
    name:'Perseus',
    stars:[
      {n:'Mirfak',     ra:3.405, dec:49.86, m:1.8},
      {n:'Algol',      ra:3.136, dec:40.96, m:2.1},
      {n:'Gamma Per',  ra:3.080, dec:53.51, m:2.9},
      {n:'Delta Per',  ra:3.715, dec:47.79, m:3.0},
      {n:'Epsilon Per',ra:3.964, dec:40.01, m:2.9}
    ],
    lines:[[2,0],[0,1],[0,3],[3,4]]
  },
  cnc: {
    name:'Krepsen',
    stars:[
      {n:'Altarf',         ra:8.275, dec:9.19,  m:3.5},
      {n:'Asellus Australis',ra:8.745,dec:18.15,m:3.9},
      {n:'Asellus Borealis',ra:8.721, dec:21.47, m:4.7},
      {n:'Acubens',        ra:8.974, dec:11.86, m:4.3}
    ],
    lines:[[0,1],[1,2],[1,3]]
  },
  aql: {
    name:'Ørnen (Aquila)',
    stars:[
      {n:'Altair',    ra:19.846, dec:8.87,  m:0.8},
      {n:'Tarazed',   ra:19.771, dec:10.61, m:2.7},
      {n:'Alshain',   ra:19.921, dec:6.41,  m:3.7},
      {n:'Delta Aql', ra:19.425, dec:3.11,  m:3.4},
      {n:'Lambda Aql',ra:19.104, dec:-4.88, m:3.4}
    ],
    lines:[[1,0],[0,2],[0,3],[3,4]]
  },
  ser: {
    name:'Slangen (Serpens)',
    stars:[
      {n:'Unukalhai',ra:15.738, dec:6.43,  m:2.6},
      {n:'Mu Ser',   ra:15.827, dec:-3.43, m:3.5}
    ],
    lines:[[0,1]]
  },
  com: {
    name:'Berenikes hår',
    stars:[
      {n:'Diadem',   ra:13.166, dec:17.53, m:4.3},
      {n:'Beta Com', ra:13.198, dec:27.88, m:4.2},
      {n:'Gamma Com',ra:12.449, dec:28.27, m:4.4}
    ],
    lines:[[0,1],[1,2]]
  },
  aqr: {
    name:'Vannmannen',
    stars:[
      {n:'Sadalsuud', ra:21.526, dec:-5.57, m:2.9},
      {n:'Sadalmelik',ra:22.096, dec:-0.32, m:2.9},
      {n:'Sadachbia', ra:22.361, dec:-1.39, m:3.8}
    ],
    lines:[[0,1],[1,2]]
  },
  cma: {
    name:'Store hund (Canis Major)',
    stars:[
      {n:'Sirius', ra:6.752, dec:-16.72, m:-1.5},
      {n:'Mirzam', ra:6.378, dec:-17.96, m:2.0},
      {n:'Wezen',  ra:7.140, dec:-26.39, m:1.8},
      {n:'Adhara', ra:6.977, dec:-28.97, m:1.5}
    ],
    lines:[[1,0],[0,2],[2,3]]
  }
};

// Hvilke objekter har et stjernebilde-finnekart. from = stjernen pila starter fra.
var OBJECT_FINDERS = {
  etacas:{con:'cas',from:'Schedar'}, m103:{con:'cas',from:'Ruchbah'}, hchi:{con:'cas',from:'Segin'},
  m81:{con:'uma',from:'Dubhe'}, m82:{con:'uma',from:'Dubhe'}, m51:{con:'uma',from:'Alkaid'},
  m101:{con:'uma',from:'Alkaid'}, m97:{con:'uma',from:'Merak'}, mizar:{con:'uma',from:'Alioth'},
  m42:{con:'ori',from:'Alnilam'}, m78:{con:'ori',from:'Alnitak'},
  m57:{con:'lyr',from:'Sheliak'}, epslyrae:{con:'lyr',from:'Vega'},
  m39:{con:'cyg',from:'Deneb'}, albireo:{con:'cyg',from:'Sadr'}, m27:{con:'cyg',from:'Albireo'},
  m31:{con:'and',from:'Nu And'}, m33:{con:'and',from:'Mirach'}, ngc891:{con:'and',from:'Almach'}, almach:{con:'and',from:'Mirach'},
  m13:{con:'her',from:'Eta Her'}, m92:{con:'her',from:'Eta Her'},
  m36:{con:'aur',from:'Mahasim'}, m37:{con:'aur',from:'Elnath'}, m38:{con:'aur',from:'Mahasim'},
  m35:{con:'gem',from:'Tejat'}, ngc2392:{con:'gem',from:'Mekbuda'}, castor:{con:'gem',from:'Pollux'},
  m45:{con:'tau',from:'Aldebaran'}, m1:{con:'tau',from:'Zeta Tau'},
  m65:{con:'leo',from:'Chort'},
  m15:{con:'peg',from:'Enif'},
  corcaro:{con:'cvn',from:'Chara'}, m3:{con:'cvn',from:'Cor Caroli'}, m63:{con:'cvn',from:'Cor Caroli'}, m106:{con:'cvn',from:'Chara'},
  sigmaori:{con:'ori',from:'Alnitak'}, col69:{con:'ori',from:'Betelgeuse'}, mel25:{con:'tau',from:'Aldebaran'}, m41:{con:'cma',from:'Sirius'},
  m34:{con:'per',from:'Algol'}, m44:{con:'cnc',from:'Asellus Australis'}, m11:{con:'aql',from:'Lambda Aql'},
  m5:{con:'ser',from:'Unukalhai'}, m53:{con:'com',from:'Diadem'}, m64:{con:'com',from:'Diadem'}, m2:{con:'aqr',from:'Sadalsuud'}
};

// Vinkelavstand mellom to himmelpunkter (grader)
function angSep(raH1, dec1, raH2, dec2) {
  var r1=deg2rad(raH1*15), d1=deg2rad(dec1), r2=deg2rad(raH2*15), d2=deg2rad(dec2);
  var c = Math.sin(d1)*Math.sin(d2) + Math.cos(d1)*Math.cos(d2)*Math.cos(r1-r2);
  return rad2deg(Math.acos(Math.max(-1, Math.min(1, c))));
}

function buildConstellationFinder(tRaH, tDec, tName, spec) {
  var con = CONSTELLATIONS[spec.con];
  var VB_W=340, VB_H=300, PAD=30;
  var refRa = con.stars[0].ra;
  // sentrer dec på snittet av stjerner + mål
  var sumDec = tDec, i;
  for (i=0;i<con.stars.length;i++) sumDec += con.stars[i].dec;
  var cDec = sumDec/(con.stars.length+1);
  function dxdy(raH, dec){
    var dRa=(raH-refRa); if(dRa>12)dRa-=24; if(dRa<-12)dRa+=24;
    return {dx:-dRa*15*Math.cos(deg2rad(cDec)), dy:dec-cDec}; // grader; øst venstre, nord opp
  }
  // alle punkter (stjerner + mål) i grader
  var P=[], xs=[], ys=[];
  for (i=0;i<con.stars.length;i++){ var d=dxdy(con.stars[i].ra, con.stars[i].dec); P.push(d); xs.push(d.dx); ys.push(d.dy); }
  var tg = dxdy(tRaH, tDec); xs.push(tg.dx); ys.push(tg.dy);
  var minx=Math.min.apply(null,xs), maxx=Math.max.apply(null,xs), miny=Math.min.apply(null,ys), maxy=Math.max.apply(null,ys);
  var spanx=Math.max(maxx-minx,0.5), spany=Math.max(maxy-miny,0.5);
  var scale=Math.min((VB_W-2*PAD)/spanx, (VB_H-2*PAD)/spany);   // px per grad
  var midx=(minx+maxx)/2, midy=(miny+maxy)/2, cx=VB_W/2, cy=VB_H/2;
  function sx(dx){ return cx + (dx-midx)*scale; }
  function sy(dy){ return cy - (dy-midy)*scale; }

  // forbindelseslinjer
  var lines='';
  for (i=0;i<con.lines.length;i++){
    var a=P[con.lines[i][0]], b=P[con.lines[i][1]];
    lines += '<line x1="'+sx(a.dx).toFixed(1)+'" y1="'+sy(a.dy).toFixed(1)+'" x2="'+sx(b.dx).toFixed(1)+'" y2="'+sy(b.dy).toFixed(1)+'" stroke="rgba(140,160,220,.5)" stroke-width="1.3"/>';
  }
  // stjerner + navn
  var stars='', fromP=null;
  for (i=0;i<con.stars.length;i++){
    var s=con.stars[i], px=sx(P[i].dx), py=sy(P[i].dy), rr=Math.max(1.9, 4.8-s.m*0.55);
    if (s.n===spec.from) fromP={x:px,y:py};
    stars += '<circle cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="'+rr.toFixed(1)+'" fill="#dde6ff"/>'+
             '<text x="'+(px+rr+3).toFixed(1)+'" y="'+(py+3).toFixed(1)+'" fill="#aab6dc" font-family="monospace" font-size="10">'+s.n+'</text>';
  }
  // mål + pil fra "from"-stjernen
  var tx=sx(tg.dx), ty=sy(tg.dy);
  var target='<circle cx="'+tx.toFixed(1)+'" cy="'+ty.toFixed(1)+'" r="7" fill="none" stroke="#f0c46a" stroke-width="1.6"/>'+
    '<line x1="'+tx.toFixed(1)+'" y1="'+(ty-11)+'" x2="'+tx.toFixed(1)+'" y2="'+(ty-4)+'" stroke="#f0c46a" stroke-width="1.6"/>'+
    '<line x1="'+tx.toFixed(1)+'" y1="'+(ty+4)+'" x2="'+tx.toFixed(1)+'" y2="'+(ty+11)+'" stroke="#f0c46a" stroke-width="1.6"/>'+
    '<line x1="'+(tx-11)+'" y1="'+ty.toFixed(1)+'" x2="'+(tx-4)+'" y2="'+ty.toFixed(1)+'" stroke="#f0c46a" stroke-width="1.6"/>'+
    '<line x1="'+(tx+4)+'" y1="'+ty.toFixed(1)+'" x2="'+(tx+11)+'" y2="'+ty.toFixed(1)+'" stroke="#f0c46a" stroke-width="1.6"/>'+
    '<text x="'+tx.toFixed(1)+'" y="'+(ty+22)+'" fill="#f0c46a" font-family="monospace" font-size="9" text-anchor="middle" font-weight="bold">'+htmlEscape(tName)+'</text>';

  var arrow='';
  // Hvis målet i praksis ER en av stjernene i bildet (f.eks. Albireo, Mizar, Castor),
  // dropp pila — sikteringen på selve stjernen er nok.
  var onStar=false;
  for (i=0;i<con.stars.length;i++){ if(angSep(con.stars[i].ra,con.stars[i].dec,tRaH,tDec) < 0.6){ onStar=true; break; } }
  if (fromP && !onStar){
    var dxp=tx-fromP.x, dyp=ty-fromP.y, len=Math.sqrt(dxp*dxp+dyp*dyp);
    if (len>14){
      var ux=dxp/len, uy=dyp/len;
      var sxp=fromP.x+ux*9, syp=fromP.y+uy*9;       // start litt utenfor stjernen
      var exp=tx-ux*11, eyp=ty-uy*11;                // stopp litt før målringen
      var ax=exp-ux*7, ay=eyp-uy*7, perpx=-uy*4, perpy=ux*4;
      arrow='<line x1="'+sxp.toFixed(1)+'" y1="'+syp.toFixed(1)+'" x2="'+exp.toFixed(1)+'" y2="'+eyp.toFixed(1)+'" stroke="#e8835a" stroke-width="1.6" stroke-dasharray="4 3"/>'+
        '<polygon points="'+exp.toFixed(1)+','+eyp.toFixed(1)+' '+(ax+perpx).toFixed(1)+','+(ay+perpy).toFixed(1)+' '+(ax-perpx).toFixed(1)+','+(ay-perpy).toFixed(1)+'" fill="#e8835a"/>';
      var sep=angSep(CONSTELLATIONS[spec.con].stars[indexOfStar(con,spec.from)].ra, CONSTELLATIONS[spec.con].stars[indexOfStar(con,spec.from)].dec, tRaH, tDec);
      var mxp=(sxp+exp)/2, myp=(syp+eyp)/2;
      arrow+='<text x="'+(mxp+6).toFixed(1)+'" y="'+(myp-3).toFixed(1)+'" fill="#e8835a" font-family="monospace" font-size="8.5">'+sep.toFixed(1)+'°</text>';
    }
  }

  // skalastrek (velg pent gradtall)
  var ref = spanx>20?10:(spanx>8?5:2);
  var barpx = ref*scale, bx0=14, by=VB_H-14;
  var scaleBar='<line x1="'+bx0+'" y1="'+by+'" x2="'+(bx0+barpx).toFixed(1)+'" y2="'+by+'" stroke="#8590bd" stroke-width="1.4"/>'+
    '<line x1="'+bx0+'" y1="'+(by-3)+'" x2="'+bx0+'" y2="'+(by+3)+'" stroke="#8590bd" stroke-width="1.4"/>'+
    '<line x1="'+(bx0+barpx).toFixed(1)+'" y1="'+(by-3)+'" x2="'+(bx0+barpx).toFixed(1)+'" y2="'+(by+3)+'" stroke="#8590bd" stroke-width="1.4"/>'+
    '<text x="'+(bx0+barpx/2).toFixed(1)+'" y="'+(by-5)+'" fill="#8590bd" font-family="monospace" font-size="8.5" text-anchor="middle">'+ref+'°</text>';
  // himmelretning
  var compass='<text x="'+(VB_W-12)+'" y="16" fill="#6fd8e0" font-family="monospace" font-size="9" text-anchor="end">N ↑ · Ø ←</text>';

  return '<svg viewBox="0 0 '+VB_W+' '+VB_H+'" xmlns="http://www.w3.org/2000/svg">'+
    '<rect x="0" y="0" width="'+VB_W+'" height="'+VB_H+'" rx="12" fill="#0a0d1e"/>'+
    lines + stars + arrow + target + scaleBar + compass + '</svg>';
}
function indexOfStar(con, name){ for(var i=0;i<con.stars.length;i++) if(con.stars[i].n===name) return i; return 0; }

// Velger riktig finnekart for et objekt: stjernebilde hvis definert, ellers generisk.
function buildFinder(id, raH, decDeg, name) {
  var spec = OBJECT_FINDERS[id];
  if (spec && CONSTELLATIONS[spec.con]) return buildConstellationFinder(raH, decDeg, name, spec);
  return buildFinderChart(raH, decDeg, name);
}

// Beregn planetposisjon (RA/Dec J2000) for en gitt dato med kepleriansk banemekanikk.
// Nøyaktighet ~0.5–1° (Meeus low-precision elementer, J2000-epoke).
function planetPos(id, date) {
  var T = (julianDate(date) - 2451545.0) / 36525;
  // [L0, L1, a, e0, e1, i0, i1, Om0, Om1, wbar0, wbar1]
  var EL = {
    earth:   [100.466457, 36000.7698278,  1.000001018, 0.01670862,-0.000042037, 0,        0,          0,          0,          102.937348, 1.7195366],
    venus:   [181.979801, 58517.8156760,  0.72332982,  0.00676399,-0.000047516, 3.394662, 0.0010037,  76.679920,  0.9011190,  131.563703, 1.4022288],
    mars:    [355.433275, 19140.2993313,  1.52371243,  0.09336511, 0.000009149, 1.849691,-0.0006010,  49.558093,  0.7720959,  336.060234, 1.8410449],
    jupiter: [ 34.351519,  3034.9056606,  5.20177489,  0.04849793, 0.000163225, 1.303267,-0.0054965, 100.464407,  1.0209774,   14.331207, 1.6126352],
    saturn:  [ 50.077444,  1222.1137943,  9.54149883,  0.05550825,-0.000346641, 2.488879,-0.0037362, 113.665503,  0.8770880,   93.057237, 1.9637613],
    uranus:  [314.055005,   428.4669983, 19.18797948,  0.04629590,-0.000027337, 0.773197, 0.0007744,  74.005957,  0.5211278,  173.005291, 1.4863790],
    neptune: [304.879970,   218.4594533, 30.06992276,  0.00859048, 0.00005105,  1.770043,-0.0003537, 131.784226, -0.0050866,   44.964762,-0.3224146],
  };
  if (!EL[id]) return null;

  function keplerE(Mdeg, ecc) {
    var M = Mdeg * Math.PI / 180, E = M;
    for (var n = 0; n < 8; n++) E -= (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
    return E;
  }
  function helio(el) {
    var L    = norm360(el[0] + el[1] * T);
    var a    = el[2];
    var e    = el[3] + el[4] * T;
    var iRad = (el[5] + el[6] * T) * Math.PI / 180;
    var OmRad  = (el[7] + el[8] * T) * Math.PI / 180;
    var wbarDeg = el[9] + el[10] * T;
    var wRad  = (wbarDeg - (el[7] + el[8] * T)) * Math.PI / 180;
    var M    = norm360(L - wbarDeg);
    var E    = keplerE(M, e);
    var v    = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    var r    = a * (1 - e * Math.cos(E));
    var cosOm = Math.cos(OmRad), sinOm = Math.sin(OmRad);
    var cosw  = Math.cos(wRad),  sinw  = Math.sin(wRad);
    var cosi  = Math.cos(iRad),  sini  = Math.sin(iRad);
    var cosv  = Math.cos(v),     sinv  = Math.sin(v);
    return {
      x: r * (cosOm * (cosw*cosv - sinw*sinv) - sinOm * (sinw*cosv + cosw*sinv) * cosi),
      y: r * (sinOm * (cosw*cosv - sinw*sinv) + cosOm * (sinw*cosv + cosw*sinv) * cosi),
      z: r * (sini * (sinw*cosv + cosw*sinv))
    };
  }
  var pe = helio(EL.earth), pp = helio(EL[id]);
  var dx = pp.x - pe.x, dy = pp.y - pe.y, dz = pp.z - pe.z;
  var lam = Math.atan2(dy, dx);
  var bet = Math.atan2(dz, Math.sqrt(dx*dx + dy*dy));
  var eps = (23.439291 - 0.013004 * T) * Math.PI / 180;
  var raRad  = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  var decRad = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  var raDeg = raRad * 180 / Math.PI;
  if (raDeg < 0) raDeg += 360;
  return { ra: raDeg / 15, dec: decRad * 180 / Math.PI };
}

// ================================================================
// ASTRONOMY MATH
// ================================================================
function julianDate(d)  { return d.getTime() / 86400000 + 2440587.5; }
function deg2rad(x)     { return x * Math.PI / 180; }
function rad2deg(x)     { return x * 180 / Math.PI; }
function norm360(x)     { x = x % 360; return x < 0 ? x + 360 : x; }
function sind(x){ return Math.sin(x*Math.PI/180); }
function cosd(x){ return Math.cos(x*Math.PI/180); }

function gmstDeg(date) {
  return norm360(280.46061837 + 360.98564736629 * (julianDate(date) - 2451545.0));
}

function altAz(raH, decDeg, date, latDeg, lonDeg) {
  var raDeg = raH * 15;
  var lst = norm360(gmstDeg(date) + lonDeg);
  var ha  = lst - raDeg;
  if (ha >  180) ha -= 360;
  if (ha < -180) ha += 360;
  var latR = deg2rad(latDeg), decR = deg2rad(decDeg), haR = deg2rad(ha);
  var sinAlt = Math.sin(decR)*Math.sin(latR) + Math.cos(decR)*Math.cos(latR)*Math.cos(haR);
  var alt = rad2deg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));
  var denom = Math.cos(deg2rad(alt)) * Math.cos(latR);
  if (Math.abs(denom) < 1e-9) return {alt:alt, az:0};
  var cosAz = (Math.sin(decR) - Math.sin(deg2rad(alt))*Math.sin(latR)) / denom;
  var az = rad2deg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (Math.sin(haR) > 0) az = 360 - az;
  return {alt:alt, az:az};
}

function sunPos(date) {
  var n = julianDate(date) - 2451545.0;
  var L = norm360(280.460 + 0.9856474*n);
  var g = deg2rad(norm360(357.528 + 0.9856003*n));
  var lam = deg2rad(L + 1.915*Math.sin(g) + 0.020*Math.sin(2*g));
  var eps = deg2rad(23.439 - 0.0000004*n);
  var raH = rad2deg(Math.atan2(Math.cos(eps)*Math.sin(lam), Math.cos(lam))) / 15;
  if (raH < 0) raH += 24;
  return {ra:raH, dec:rad2deg(Math.asin(Math.sin(eps)*Math.sin(lam))), eclLon:rad2deg(lam)%360};
}

// ---- MÅNEN (AST-1) ----
// Lavpresisjons geosentrisk posisjon (Schlyter / stjarnhimlen), nøyaktighet ~2'.
// Topo-parallakse (opptil ~1°) er ikke korrigert — holder for å finne Månen.
function moonEcliptic(date) {
  var d = julianDate(date) - 2451543.5; // Schlyters epoke (2000 Jan 0.0)
  var N = norm360(125.1228 - 0.0529538083 * d);
  var i = 5.1454;
  var w = norm360(318.0634 + 0.1643573223 * d);
  var a = 60.2666;
  var e = 0.054900;
  var M = norm360(115.3654 + 13.0649929509 * d);

  // Kepler (grader)
  var E = M + (180/Math.PI) * e * sind(M) * (1 + e * cosd(M));
  for (var it = 0; it < 6; it++) {
    E = E - (E - (180/Math.PI)*e*sind(E) - M) / (1 - e*cosd(E));
  }
  var xv = a * (cosd(E) - e);
  var yv = a * (Math.sqrt(1 - e*e) * sind(E));
  var v = norm360(rad2deg(Math.atan2(yv, xv)));
  var r = Math.sqrt(xv*xv + yv*yv);

  // Geosentrisk i ekliptikk-koordinater
  var xh = r * (cosd(N)*cosd(v+w) - sind(N)*sind(v+w)*cosd(i));
  var yh = r * (sind(N)*cosd(v+w) + cosd(N)*sind(v+w)*cosd(i));
  var zh = r * (sind(v+w)*sind(i));
  var lon = norm360(rad2deg(Math.atan2(yh, xh)));
  var lat = rad2deg(Math.atan2(zh, Math.sqrt(xh*xh + yh*yh)));

  // Sol- og måne-vinkler for perturbasjoner
  var ws = 282.9404 + 4.70935e-5 * d;
  var Ms = norm360(356.0470 + 0.9856002585 * d);
  var Ls = norm360(ws + Ms);
  var Lm = norm360(N + w + M);
  var D  = norm360(Lm - Ls);
  var F  = norm360(Lm - N);

  lon += -1.274*sind(M-2*D) + 0.658*sind(2*D) - 0.186*sind(Ms)
        - 0.059*sind(2*M-2*D) - 0.057*sind(M-2*D+Ms) + 0.053*sind(M+2*D)
        + 0.046*sind(2*D-Ms) + 0.041*sind(M-Ms) - 0.035*sind(D)
        - 0.031*sind(M+Ms) - 0.015*sind(2*F-2*D) + 0.011*sind(M-4*D);
  lat += -0.173*sind(F-2*D) - 0.055*sind(M-F-2*D) - 0.046*sind(M+F-2*D)
        + 0.033*sind(F+2*D) + 0.017*sind(2*M+F);
  lon = norm360(lon);

  // Ekliptikk → ekvator
  var ecl = 23.4393 - 3.563e-7 * d;
  var xg = cosd(lon)*cosd(lat);
  var yg = sind(lon)*cosd(lat);
  var zg = sind(lat);
  var xe = xg;
  var ye = yg*cosd(ecl) - zg*sind(ecl);
  var ze = yg*sind(ecl) + zg*cosd(ecl);
  var raH = norm360(rad2deg(Math.atan2(ye, xe))) / 15;
  var dec = rad2deg(Math.atan2(ze, Math.sqrt(xe*xe + ye*ye)));
  return {lon:lon, lat:lat, ra:raH, dec:dec};
}
function moonPos(date) { var m = moonEcliptic(date); return {ra:m.ra, dec:m.dec}; }

function moonPhase(date) {
  var m = moonEcliptic(date);
  var s = sunPos(date);
  var dl = norm360(m.lon - s.eclLon);          // 0..360, >0..180 = voksende
  var elong = dl > 180 ? 360 - dl : dl;        // 0..180 vinkelavstand
  var k = (1 - cosd(elong)) / 2;               // belyst andel 0..1
  var waxing = dl < 180;
  var name, emoji;
  if (k < 0.04) { name = 'Nymåne'; emoji = '🌑'; }
  else if (k > 0.96) { name = 'Fullmåne'; emoji = '🌕'; }
  else if (waxing) {
    if (k < 0.45) { name = 'Voksende månesigd'; emoji = '🌒'; }
    else if (k < 0.55) { name = 'Første kvarter'; emoji = '🌓'; }
    else { name = 'Voksende måne'; emoji = '🌔'; }
  } else {
    if (k > 0.55) { name = 'Avtagende måne'; emoji = '🌖'; }
    else if (k > 0.45) { name = 'Siste kvarter'; emoji = '🌗'; }
    else { name = 'Avtagende månesigd'; emoji = '🌘'; }
  }
  return {k:k, waxing:waxing, name:name, emoji:emoji, illum:Math.round(k*100)};
}

// Rise/set times above minAlt on a given day
function riseSet(raH, decDeg, date, latDeg, lonDeg, minAlt) {
  minAlt = minAlt !== undefined ? minAlt : 15;
  var start = new Date(date); start.setHours(0,0,0,0);
  var samp = [];
  for (var i = 0; i <= 144; i++) {
    var t = new Date(start.getTime() + i * 10 * 60000);
    samp.push({t:t, alt:altAz(raH, decDeg, t, latDeg, lonDeg).alt});
  }
  var rises = [], sets = [];
  for (var j = 0; j < samp.length-1; j++) {
    var a0 = samp[j].alt, a1 = samp[j+1].alt;
    if (a0 < minAlt && a1 >= minAlt) {
      rises.push(new Date(samp[j].t.getTime() + (minAlt-a0)/(a1-a0)*600000));
    } else if (a0 >= minAlt && a1 < minAlt) {
      sets.push(new Date(samp[j].t.getTime() + (a0-minAlt)/(a0-a1)*600000));
    }
  }
  var above = 0, peak = -90, peakTime = samp[0].t;
  for (var k = 0; k < samp.length; k++) {
    if (samp[k].alt >= minAlt) above++;
    if (samp[k].alt > peak) { peak = samp[k].alt; peakTime = samp[k].t; }
  }
  return {rises:rises, sets:sets, alwaysAbove:above===samp.length, neverAbove:above===0, peakAlt:peak, peakTime:peakTime};
}

// ---- Observasjonsutsikt fremover (punkt 2) ----
// Edruelig modell: et objekt er SYNLIG når det er høyt nok OG himmelen er mørk
// nok for objektets lysstyrke. Lyse objekter (Måne, planeter) ses i skumring og
// til og med dagslys; svake dypromobjekter krever ekte mørke. Vi dømmer ikke alt
// som umulig om sommeren — vi vurderer hver natt på sitt beste tidspunkt.
//
// "Mørkekrav": hvor lavt sola må stå for at objektet skal kunne sees.
//   Tilnærming basert på magnitude (grov, men ærlig):
//     mag <= -3  (Måne, Venus): ses i dagslys      -> krever sol < +10°
//     mag <= -1  (Jupiter):     ses i lys skumring  -> sol < -3°
//     mag <=  1  (Mars/Saturn, lyse stjerner):      -> sol < -6°  (borgerlig)
//     mag <=  4  (lyse DSO, Galilei-måner):          -> sol < -9°
//     mag <=  6  (middels DSO):                      -> sol < -12° (nautisk)
//     mag  >  6  (svake DSO):                        -> sol < -15° (nær astronomisk)
function sunDarkReqForMag(mag){
  if (mag == null) mag = 6;
  if (mag <= -6) return 90;   // Månen: synlig når som helst den er oppe, også høylys dag
  if (mag <= -3) return 15;   // Venus: synlig i dagslys
  if (mag <= -1) return 0;    // Jupiter: fra solnedgang
  if (mag <= 1)  return -4;   // Mars/Saturn, lyse stjerner: tidlig skumring
  if (mag <= 4)  return -8;   // lyse DSO, Galilei-måner: borgerlig/nautisk
  if (mag <= 6)  return -11;  // middels DSO: nautisk
  return -14;                 // svake DSO: nær astronomisk mørke
}
function bestViewingNights(raH, decDeg, lat, lon, fromDate, nDays, opts) {
  opts = opts || {};
  var posFn = opts.posFn || null;          // funksjon(date)->{ra,dec} for objekter i bevegelse
  var mag = (opts.mag != null) ? opts.mag : 6;
  var faint = (opts.faint != null) ? opts.faint : (mag > 6);  // svake DSO straffes av måneskinn
  var minAlt = opts.minAlt != null ? opts.minAlt : 8;         // under dette: for lavt for Dobson
  var sunReq = sunDarkReqForMag(mag);                          // solhøyde som kreves for synlighet
  nDays = nDays || 30;
  var out = [];
  for (var day = 0; day < nDays; day++) {
    var base = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + day, 12, 0, 0, 0); // middag
    // Finn tidspunktet der objektet står høyest MENS det er synlig (sol mørk nok for mag),
    // og det høyeste det når i det hele tatt over horisonten (for "for lavt"-vurdering).
    var best = null, peakAnytime = -90, darkEnoughMin = 0, peakWhenDark = -90, darkExists = false;
    for (var m = 0; m <= 1440; m += 15) {
      var t = new Date(base.getTime() + m * 60000);
      var sp = sunPos(t);
      var sa = altAz(sp.ra, sp.dec, t, lat, lon).alt;
      var pr = posFn ? posFn(t) : {ra:raH, dec:decDeg};
      var oa = altAz(pr.ra, pr.dec, t, lat, lon).alt;
      if (oa > peakAnytime) peakAnytime = oa;
      var darkEnough = (sa <= sunReq);
      if (darkEnough){ darkExists = true; if (oa > peakWhenDark) peakWhenDark = oa; }
      var visibleNow = darkEnough && (oa >= minAlt);
      if (visibleNow){
        darkEnoughMin += 15;
        if (!best || oa > best.alt){ best = { time: t, alt: oa, sunAlt: sa }; }
      }
    }
    var mph = moonPhase(base);
    var moonIllum = mph.illum != null ? mph.illum : Math.round((mph.k != null ? mph.k : 0) * 100);

    var score = 0, verdict;
    if (best){
      // kvalitet: høyde (hvor godt plassert) + hvor god mørkemargin + lite måneskinn for svake
      var altScore = Math.max(0, Math.min(1, (best.alt - minAlt) / (55 - minAlt)));   // minAlt..55°
      // mørkemargin: hvor mye mørkere enn kravet (0 = akkurat synlig, 1 = godt mørkt)
      var margin = (sunReq - best.sunAlt) / 8;                 // hver 8° ekstra mørke = +1 trinn
      var darkScore = Math.max(0, Math.min(1, margin));
      var moonPenalty = faint ? (moonIllum / 100) * 0.25 : 0;
      // grunnpoeng (objektet ER synlig) + høyde + mørke − måneskinn
      score = Math.round(Math.max(0, Math.min(1, 0.25 + 0.45*altScore + 0.30*darkScore - moonPenalty)) * 100);
      if (score >= 72) verdict = 'Utmerket';
      else if (score >= 50) verdict = 'Bra';
      else verdict = 'Mulig';
    } else if (!darkExists){
      // himmelen blir aldri mørk nok for dette objektet (lyse netter, svakt objekt)
      verdict = 'For lyse netter';
    } else if (peakWhenDark < minAlt){
      // mørke finnes, men objektet er under horisonten/for lavt akkurat da
      verdict = (peakAnytime >= minAlt) ? 'Nede når det er mørkt' : 'For lavt på himmelen';
    } else {
      verdict = 'For lavt på himmelen';
    }
    var yyyy = base.getFullYear(), mm = ('0'+(base.getMonth()+1)).slice(-2), dd = ('0'+base.getDate()).slice(-2);
    out.push({
      date: yyyy+'-'+mm+'-'+dd,
      best: best ? { time: best.time, alt: Math.round(best.alt), sunAlt: Math.round(best.sunAlt) } : null,
      peakAlt: Math.round(peakAnytime),
      darkMinutes: darkEnoughMin, moonIllum: moonIllum, score: score, verdict: verdict
    });
  }
  return out;
}

// Ranger en liste objekter etter beste natt de neste nDays dagene.
// objs: [{id,name,emo,type,ra,dec,mag,parent,...}], posResolver(o) -> posFn|null.
// Returnerer sortert (best først) med {o, bestNight, bestDate, score, verdict}.
function rankObjects(objs, lat, lon, fromDate, nDays, posResolver){
  var ranked = [];
  for (var i = 0; i < objs.length; i++){
    var o = objs[i];
    var posFn = posResolver ? posResolver(o) : null;
    var nights = bestViewingNights(o.ra, o.dec, lat, lon, fromDate, nDays, {mag:o.mag, posFn:posFn});
    var top = null;
    for (var j = 0; j < nights.length; j++){
      if (nights[j].best && (!top || nights[j].score > top.score)) top = nights[j];
    }
    if (top){
      ranked.push({ o:o, bestNight:top, bestDate:top.date, score:top.score, verdict:top.verdict });
    }
  }
  ranked.sort(function(a,b){ return b.score - a.score; });
  return ranked;
}

function compassSimple(az) {
  var d = ['Nord','Nordøst','Øst','Sørøst','Sør','Sørvest','Vest','Nordvest'];
  return d[Math.round(az/45) % 8];
}
function fmtTime(d) {
  var h=d.getHours(), m=d.getMinutes();
  return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
}
function intc(x) { return Math.round(x).toString(); }
function todayISO() {
  var d = new Date(), y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate();
  return y+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
}

// ================================================================
// EYEPIECE HELPERS
// ================================================================
function getOwnedEyepieces(setup) {
  var result = [], eps = setup.eyepieces || {};
  for (var id in eps) {
    if (!eps[id].owned) continue;
    var ep = eps[id];
    if (id.indexOf('custom-') === 0) {
      if (ep.fl > 0) result.push({id:id, fl:ep.fl, afov:ep.afov||52, barrel:ep.barrel||1.25,
        price:ep.price||null, link:ep.link||'', name:ep.name||ep.fl+' mm', brand:'Egendefinert', kind:'custom'});
    } else {
      var p = presetById(id);
      if (p && p.fl) result.push({id:id, fl:p.fl, afov:p.afov, barrel:p.barrel,
        price:(ep.price!=null&&ep.price!=='') ? ep.price : p.price,
        link:ep.link||'', name:p.model, brand:p.brand, kind:p.included?'incl':'extra'});
    }
  }
  return result.sort(function(a,b){return b.fl-a.fl;});
}

function bestComboFor(targetMag, tFl, ap, ownedEps, barlow) {
  if (!ownedEps.length) return null;
  var maxMag = ap * 2.2, opts = [1];
  if (barlow > 1) opts.push(barlow);
  var best = null;
  ownedEps.forEach(function(ep) {
    opts.forEach(function(b) {
      var mag = (tFl/ep.fl)*b;
      if (mag > maxMag) return;
      var dist = Math.abs(mag-targetMag)/targetMag + (b>1?0.02:0);
      if (!best || dist < best.dist) best = {ep:ep, b:b, mag:mag, dist:dist};
    });
  });
  if (!best) return null;
  var rd = Math.abs(best.mag-targetMag)/targetMag;
  best.quality = rd <= 0.20 ? 'good' : (rd <= 0.40 ? 'fair' : 'poor');
  return best;
}

function bestUpgradeFor(targetMag, tFl, setup) {
  var owned = setup.eyepieces||{}, ap=(setup.telescope||{}).ap||203;
  var maxMag = ap*2.2, best=null, bestDist=Infinity;
  EP_PRESETS.forEach(function(p) {
    if (!p.fl) return;
    if (owned[p.id] && owned[p.id].owned) return;
    var dist = Math.abs(tFl/p.fl - targetMag) / targetMag;
    if (tFl/p.fl > maxMag) return;
    if (dist < bestDist) { bestDist=dist; best=p; }
  });
  return bestDist <= 0.40 ? best : null;
}

// Topp-N okularer blant ALLE presets (også de man ikke eier) for en målforstørrelse.
// Vurderer både uten og med barlow. Markerer om man eier hvert okular.
function topEyepiecesFor(targetMag, tFl, ap, setup, n) {
  n = n || 3;
  var maxMag = ap * 2.2, owned = (setup && setup.eyepieces) || {}, barlow = (setup && setup.barlow) || 1;
  var cand = [];
  EP_PRESETS.forEach(function(p) {
    if (!p.fl) return;
    var opts = [1]; if (barlow > 1) opts.push(barlow);
    opts.forEach(function(b) {
      var mag = (tFl/p.fl)*b;
      if (mag > maxMag) return;
      var rd = Math.abs(mag-targetMag)/targetMag;
      cand.push({preset:p, b:b, mag:mag, rd:rd,
        quality: rd<=0.20?'good':(rd<=0.40?'fair':'poor'),
        owned: !!(owned[p.id] && owned[p.id].owned)});
    });
  });
  cand.sort(function(a,b){ return a.rd - b.rd; });
  // unngå duplikat av samme okular (behold beste barlow-variant per id)
  var seen = {}, out = [];
  for (var i=0;i<cand.length && out.length<n;i++){
    if (seen[cand[i].preset.id]) continue;
    seen[cand[i].preset.id] = true; out.push(cand[i]);
  }
  return out;
}

// ---- Synsfelt / innramming (FIND-2) ----
function trueFovArcmin(afovDeg, magnification) {
  if (!afovDeg || !magnification) return null;
  return (afovDeg / magnification) * 60;
}
// Drift-tid (EYE-2): minutter før jordrotasjonen flytter et objekt tvers over synsfeltet.
// Himmelen beveger seg 15'/min ved ekvator; mindre nær polen (×cos(dec)).
function driftMinutes(fovArcmin, decDeg) {
  if (!fovArcmin) return null;
  var c = Math.cos(deg2rad(decDeg)); if (c < 0.02) c = 0.02;
  return fovArcmin / (15.041 * c);
}
// Returnerer {text, tight} for et objekt med vinkelstørrelse size (')
function framingVerdict(sizeArcmin, fovArcmin) {
  if (!sizeArcmin || !fovArcmin) return null;
  var r = sizeArcmin / fovArcmin;
  if (r > 1.0)  return {text:'større enn synsfeltet — bruk lavere forstørrelse', tight:true};
  if (r > 0.5)  return {text:'fyller feltet godt', tight:false};
  if (r > 0.12) return {text:'god ramme med rom rundt', tight:false};
  if (r > 0.03) return {text:'lite i feltet — tåler mer forstørrelse', tight:false};
  return {text:'svært lite — øk forstørrelsen', tight:false};
}

// ================================================================
// SENSOR-ASSISTERT SIKTING (telefon som push-to)
// ================================================================
var ALIGN_KEY = 'stjernekikkert_align_v1';

// Lyse, lett gjenkjennelige kalibreringsstjerner spredt over himmelen.
// ra i timer, dec i grader. Brukes til 1- eller 2-stjerners kalibrering.
var ALIGN_STARS = [
  {id:'polaris',   name:'Polaris (Nordstjernen)', ra:2.530,  dec:89.26, m:2.0, con:null,  hint:'Står nesten stille rett i nord — finn den via Karlsvognas to ytterste kar-stjerner.'},
  {id:'vega',      name:'Vega (Lyra)',            ra:18.615, dec:38.78, m:0.0, con:'lyr', hint:'Skinnende klar, høyt i øst/sørøst om sommeren.'},
  {id:'arcturus',  name:'Arcturus (Bootes)',      ra:14.261, dec:19.18, m:0.0, con:null,  hint:'Klar oransje stjerne; følg «buen» fra Karlsvognas håndtak.'},
  {id:'capella',   name:'Capella (Auriga)',       ra:5.278,  dec:46.00, m:0.1, con:'aur', hint:'Svært klar, sirkumpolar — lavt i nord/nordvest om sommeren.'},
  {id:'deneb',     name:'Deneb (Svanen)',         ra:20.690, dec:45.28, m:1.3, con:'cyg', hint:'Toppen av Det nordlige kors, høyt i øst om kvelden.'},
  {id:'altair',    name:'Altair (Ørnen)',         ra:19.846, dec:8.87,  m:0.8, con:'aql', hint:'Klar stjerne i sommertriangelet, lavere i sør.'},
  {id:'betelgeuse',name:'Betelgeuse (Orion)',     ra:5.919,  dec:7.41,  m:0.5, con:'ori', hint:'Oransje skulderstjerne i Orion (vinter).'},
  {id:'rigel',     name:'Rigel (Orion)',          ra:5.242,  dec:-8.20, m:0.1, con:'ori', hint:'Blå-hvit fotstjerne i Orion (vinter).'},
  {id:'sirius',    name:'Sirius (Store hund)',    ra:6.752,  dec:-16.72,m:-1.5,con:'cma', hint:'Himmelens klareste stjerne, lavt i sør (vinter).'},
  {id:'pollux',    name:'Pollux (Tvillingene)',   ra:7.755,  dec:28.03, m:1.1, con:'gem', hint:'Den lyseste av tvillingstjernene.'},
  {id:'dubhe',     name:'Dubhe (Karlsvogna)',     ra:11.062, dec:61.75, m:1.8, con:'uma', hint:'Fremre kar-stjerne i Karlsvogna (peker mot Polaris).'},
  {id:'schedar',   name:'Schedar (Cassiopeia)',   ra:0.675,  dec:56.54, m:2.2, con:'cas', hint:'Klar stjerne i Cassiopeias W.'},
  {id:'aldebaran', name:'Aldebaran (Tyren)',      ra:4.599,  dec:16.51, m:0.9, con:'tau', hint:'Oransje øye i Tyren, ved Hyadene.'},
  {id:'regulus',   name:'Regulus (Løven)',        ra:10.139, dec:11.97, m:1.4, con:'leo', hint:'Foten av «sigden» i Løven (vår).'}
];
function alignStarById(id){ for(var i=0;i<ALIGN_STARS.length;i++) if(ALIGN_STARS[i].id===id) return ALIGN_STARS[i]; return null; }

var ALIGN_MAX_AGE_MS = 6 * 3600 * 1000;  // 6 timer ≈ samme økt/natt
function loadAlign(){
  try {
    var a = JSON.parse(localStorage.getItem(ALIGN_KEY));
    if (!a) return null;
    // forkast kalibrering fra en tidligere økt (f.eks. i går)
    if (a.ts && (Date.now() - a.ts) > ALIGN_MAX_AGE_MS) { clearAlign(); return null; }
    return a;
  } catch(e){ return null; }
}
function alignAgeMin(a){ return (a && a.ts) ? Math.round((Date.now() - a.ts)/60000) : null; }
function saveAlign(a){ try { localStorage.setItem(ALIGN_KEY, JSON.stringify(a)); } catch(e){} }
function clearAlign(){ try { localStorage.removeItem(ALIGN_KEY); } catch(e){} }

// Et kalibreringspunkt: telefonens målte (azMeas, altMeas) mens den peker på en
// stjerne som i virkeligheten står på (azTrue, altTrue) på et gitt tidspunkt.
// calcAzimuthOffset håndterer at azimut er sirkulær (wrap rundt 360°).
function angDiffDeg(a, b){ var d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }

// Bygg kalibrering fra 1 eller 2 punkter.
// Punkt: {azMeas, altMeas, azTrue, altTrue}
// 1 stjerne: ren forskyvning (offset) i az og alt.
// 2 stjerner: forskyvning + lineær skala på az (korrigerer kompass-drift over himmelen).
function buildCalibration(points){
  if (!points || !points.length) return null;
  var cal;
  if (points.length === 1){
    var p = points[0];
    cal = { azOffset: angDiffDeg(p.azTrue, p.azMeas), altOffset: p.altTrue - p.altMeas, azScale: 1, type:'1-stjerne' };
  } else {
    // 2-stjerners: løs azTrue = azScale*azMeas + azOffset (på «utfoldede» az-verdier)
    var p1 = points[0], p2 = points[1];
    var m1 = p1.azMeas, m2 = p1.azMeas + angDiffDeg(p2.azMeas, p1.azMeas);
    var t1 = p1.azTrue, t2 = p1.azTrue + angDiffDeg(p2.azTrue, p1.azTrue);
    var dm = (m2 - m1);
    // For nær hverandre i azimut (<5°): skala blir ustabil — fall tilbake til ren
    // offset og merk det ærlig, så brukeren ikke tror de fikk skala-korreksjon.
    var hasScale = Math.abs(dm) > 5;
    var azScale = hasScale ? (t2 - t1) / dm : 1;
    var azOffset = t1 - azScale * m1;
    var altOffset = ((p1.altTrue - p1.altMeas) + (p2.altTrue - p2.altMeas)) / 2;
    cal = { azOffset: azOffset, altOffset: altOffset, azScale: azScale,
            type: hasScale ? '2-stjerner' : '2-stjerner (kun offset — velg stjerner lenger fra hverandre)' };
  }
  // behold punktene (med stjernenavn) + tidsstempel for oversikt/utløp
  cal.points = points.slice(0, 2);
  cal.ts = Date.now();
  return cal;
}

// Bruk kalibrering på en rå sensormåling → korrigert (sann) az/alt.
function applyCalibration(cal, azMeas, altMeas){
  if (!cal) return { az: ((azMeas%360)+360)%360, alt: altMeas };
  var az = cal.azScale * azMeas + cal.azOffset;
  az = ((az % 360) + 360) % 360;
  return { az: az, alt: altMeas + cal.altOffset };
}

// Hvor mye må du dreie/vippe fra der du peker nå til målet?
// Returnerer {dAz (-180..180, + = drei høyre/med klokka), dAlt (+ = vipp opp), dist}
function aimDelta(curAz, curAlt, tgtAz, tgtAlt){
  var dAz = angDiffDeg(tgtAz, curAz);
  var dAlt = tgtAlt - curAlt;
  var dist = Math.sqrt(dAz*dAz + dAlt*dAlt);
  return { dAz: dAz, dAlt: dAlt, dist: dist };
}

// ---- Nattmodus (ARCH-2) ----
function initNightMode() {
  var on = localStorage.getItem(NM_KEY) === '1';
  var btn = document.getElementById('night-btn');
  function apply(v) {
    document.body.classList.toggle('night-mode', v);
    if (btn) { btn.textContent = v ? '☀ Normal' : '🔴 Natt'; btn.classList.toggle('active', v); }
  }
  apply(on);
  if (btn) btn.addEventListener('click', function() {
    on = !on; localStorage.setItem(NM_KEY, on ? '1' : '0'); apply(on);
  });
}

// ---- Installer-knapp (PWA) ----
// Knappen (#install-btn) er skjult som standard. Den vises når nettleseren
// fyrer av beforeinstallprompt, og skjules når appen alt er installert.
var _deferredInstall = null;
function initInstall() {
  var btn = document.getElementById('install-btn');
  if (!btn) return;
  // Allerede installert / kjører som app? Skjul knappen.
  var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (standalone || window.navigator.standalone) { btn.style.display = 'none'; return; }

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    _deferredInstall = e;
    btn.style.display = '';
  });
  btn.addEventListener('click', function() {
    if (!_deferredInstall) {
      // Fallback (f.eks. iOS Safari, som ikke støtter prompt)
      alert('For å installere: åpne nettlesermenyen og velg «Legg til på Hjem-skjerm».');
      return;
    }
    _deferredInstall.prompt();
    _deferredInstall.userChoice.then(function() { _deferredInstall = null; btn.style.display = 'none'; });
  });
  window.addEventListener('appinstalled', function() { btn.style.display = 'none'; _deferredInstall = null; });
}
