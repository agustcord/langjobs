/*
 * LangJobs — Harness de regresión del DOM de LinkedIn 2026 (hotfix v0.5.4)
 * ---------------------------------------------------------------------------
 * Reproduce con jsdom la estructura REAL de una tarjeta de la lista izquierda
 * tras el rediseño de LinkedIn de agosto 2026 (mapa L0→L16 en la nota interna
 * "linkedin_ui_2026_migration"):
 *
 *   - Las tarjetas NO tienen <a>, NO tienen data-job-id.
 *   - El único ancla estable es el botón ✕ (aria-label="Descartar empleo «…»").
 *   - Entre la tarjeta visual y el contenedor de la lista hay wrappers
 *     `display:contents` (0x0, sin caja de layout) que rompen `position:absolute`
 *     del badge y hacen que el badge se inyecte en un nodo sin caja.
 *
 * Comprueba:
 *   1) getDomCards() devuelve UNA tarjeta por vacante (no el mega-contenedor).
 *   2) La tarjeta elegida NO es un wrapper display:contents.
 *   3) processAll() inyecta exactamente un badge por tarjeta.
 *   4) La tarjeta recibe la clase host (position:relative) para anclar el badge.
 *   5) Si LinkedIn re-renderiza y borra el badge, el siguiente pase lo repone
 *      (idempotencia basada en hash + presencia del badge).
 *   6) La UI legacy ([data-job-id]) sigue funcionando.
 *
 * Uso: node tests/dom_2026_cards.js
 */
const path = require('path');

// jsdom es la ÚNICA dependencia de desarrollo del proyecto y no viaja en el
// build (los bundles siguen sin dependencias). Si no está instalada, este
// harness se saltea en vez de fallar: `node tests/run.js` (corpus del detector)
// sigue corriendo con cero dependencias.  Instalar con:  npm i -D jsdom
let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.log('\nSKIP tests/dom_2026_cards.js — falta jsdom (npm i -D jsdom).');
  console.log('     El harness del DOM 2026 necesita getComputedStyle para detectar');
  console.log('     los wrappers display:contents de LinkedIn.\n');
  process.exit(0);
}

const APP = require(path.join(__dirname, '..', 'src', 'app.js'));
const SEL = require(path.join(__dirname, '..', 'src', 'selectors.js'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

// ── Constructor del DOM 2026 ───────────────────────────────────────────────
// Réplica de los niveles L0..L16 documentados en la investigación forense.
const JOBS = [
  { title: 'Especialista en MKT Digital', company: 'Agencia Rosario', meta: 'Rosario, Santa Fe (Híbrido)' },
  { title: 'Senior Backend Engineer', company: 'Globant', meta: 'Buenos Aires (Remote)' },
  { title: 'Analista de Sistemas', company: 'Banco Macro', meta: 'CABA (Presencial)' },
];

function buildDom2026() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const doc = dom.window.document;

  const outer = doc.createElement('div');           // L16
  const pane = doc.createElement('div');            // L15
  const list = doc.createElement('div');            // L13 — contenedor de la lista
  list.id = 'list-container';
  outer.appendChild(pane);
  pane.appendChild(list);
  doc.body.appendChild(outer);

  JOBS.forEach(function (job, idx) {
    // L12 — wrapper display:contents (SIN caja de layout)
    const w12 = doc.createElement('div');
    w12.setAttribute('style', 'display:contents');
    w12.setAttribute('data-test-level', 'L12');

    // L11 — tarjeta visual real (367x126 en el navegador)
    const card = doc.createElement('div');
    card.setAttribute('data-test-level', 'L11');
    card.setAttribute('data-test-card', String(idx));
    w12.appendChild(card);

    // L10 — otro wrapper display:contents
    const w10 = doc.createElement('div');
    w10.setAttribute('style', 'display:contents');
    w10.setAttribute('data-test-level', 'L10');
    card.appendChild(w10);

    // L9 → L6: cadena de divs intermedios
    let cursor = w10;
    ['L9', 'L8', 'L7', 'L6'].forEach(function (lvl) {
      const d = doc.createElement('div');
      d.setAttribute('data-test-level', lvl);
      cursor.appendChild(d);
      cursor = d;
    });

    // L5 — contiene el bloque de texto Y el botón de descartar (hermanos)
    const l5 = doc.createElement('div');
    l5.setAttribute('data-test-level', 'L5');
    cursor.appendChild(l5);

    // L4/L3 — título + empresa + metadatos (4 hijos → dispara el heurístico
    // `children.length > 3` de la implementación vieja)
    const l4 = doc.createElement('div');
    l4.setAttribute('data-test-level', 'L4');
    l5.appendChild(l4);
    const l3 = doc.createElement('div');
    l3.setAttribute('data-test-level', 'L3');
    l4.appendChild(l3);

    const w2 = doc.createElement('div');            // L2 display:contents
    w2.setAttribute('style', 'display:contents');
    l3.appendChild(w2);

    const pTitle = doc.createElement('p');          // L1
    const sTitle = doc.createElement('span');       // L0
    sTitle.textContent = job.title;
    pTitle.appendChild(sTitle);
    w2.appendChild(pTitle);

    const pCompany = doc.createElement('p');
    pCompany.appendChild(doc.createTextNode(job.company));
    l3.appendChild(pCompany);

    const pMeta = doc.createElement('p');
    pMeta.appendChild(doc.createTextNode(job.meta));
    l3.appendChild(pMeta);

    const pFooter = doc.createElement('p');
    pFooter.appendChild(doc.createTextNode('Postulación sencilla'));
    l3.appendChild(pFooter);

    // Botón ✕ — único ancla estable, hermano del bloque de texto dentro de L5
    const btnWrap = doc.createElement('div');
    const btn = doc.createElement('button');
    btn.setAttribute('aria-label', 'Descartar empleo «' + job.title + '»');
    btnWrap.appendChild(btn);
    l5.appendChild(btnWrap);

    list.appendChild(w12);
    // LinkedIn intercala separadores: la lista real tiene ~56 hijos para 25 tarjetas
    const divider = doc.createElement('div');
    divider.setAttribute('role', 'separator');
    list.appendChild(divider);
  });

  return { dom: dom, doc: doc, list: list };
}

function buildDomLegacy() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const doc = dom.window.document;
  const ul = doc.createElement('ul');
  doc.body.appendChild(ul);
  JOBS.forEach(function (job, i) {
    const li = doc.createElement('li');
    const div = doc.createElement('div');
    div.setAttribute('data-job-id', '400000000' + i);
    const a = doc.createElement('a');
    a.setAttribute('href', '/jobs/view/400000000' + i + '/');
    a.className = 'job-card-list__title';
    a.textContent = job.title;
    div.appendChild(a);
    const sub = doc.createElement('div');
    sub.className = 'artdeco-entity-lockup__subtitle';
    sub.textContent = job.company;
    div.appendChild(sub);
    li.appendChild(div);
    ul.appendChild(li);
  });
  return { dom: dom, doc: doc };
}

// ── Escenario 1: UI 2026 ───────────────────────────────────────────────────
console.log('\n═══ UI 2026 (tarjetas sin <a> ni data-job-id) ═══');
const s1 = buildDom2026();
const win1 = s1.dom.window;
global.window = win1;           // app.js usa window.location / getComputedStyle
global.document = win1.document;

const cards = APP.getDomCards ? APP.getDomCards(s1.doc) : [];
console.log('  getDomCards → ' + cards.length + ' nodo(s): ' +
  cards.map(function (c) { return c.getAttribute('data-test-level') || c.tagName; }).join(', '));

check('getDomCards devuelve 1 nodo por vacante (' + JOBS.length + ')', cards.length === JOBS.length,
  'devolvió ' + cards.length);
check('ningún nodo devuelto es el contenedor de la lista',
  cards.every(function (c) { return c !== s1.list; }));
check('ningún nodo devuelto es un wrapper display:contents',
  cards.every(function (c) { return win1.getComputedStyle(c).display !== 'contents'; }),
  cards.map(function (c) { return c.getAttribute('data-test-level') + ':' + win1.getComputedStyle(c).display; }).join(' '));
check('los nodos devueltos son las tarjetas visuales (L11)',
  cards.every(function (c) { return c.getAttribute('data-test-level') === 'L11'; }),
  cards.map(function (c) { return c.getAttribute('data-test-level'); }).join(','));
check('ningún nodo devuelto contiene a otro (no hay mega-tarjeta)',
  cards.every(function (c) { return !cards.some(function (o) { return o !== c && c.contains(o); }); }));

const results = APP.processAll(s1.doc, { getDescription: APP.makeGetDescription(s1.doc) });
const badges = s1.doc.querySelectorAll('.llf-badge');
console.log('  processAll → ' + results.length + ' resultado(s), ' + badges.length + ' badge(s)');
check('processAll procesa todas las tarjetas', results.length === JOBS.length);
check('se inyecta exactamente 1 badge por tarjeta', badges.length === JOBS.length,
  'badges=' + badges.length);
check('cada badge vive dentro de su tarjeta L11',
  Array.prototype.every.call(badges, function (b) {
    const host = b.closest('[data-test-card]');
    return host && win1.getComputedStyle(host).display !== 'contents';
  }));
check('la tarjeta recibe la clase host para anclar el badge (position:relative)',
  cards.every(function (c) { return c.classList.contains('llf-badge-host'); }));
check('el título se extrae del aria-label del botón ✕',
  cards.every(function (c, i) { return SEL.extractFromCard(c).title === JOBS[i].title; }),
  cards.map(function (c) { return JSON.stringify(SEL.extractFromCard(c).title); }).join(' '));
check('la empresa se extrae por estructura (fallback 2026)',
  cards.every(function (c, i) { return SEL.extractFromCard(c).company === JOBS[i].company; }),
  cards.map(function (c) { return JSON.stringify(SEL.extractFromCard(c).company); }).join(' '));
check('data-llf-lang se marca en cada tarjeta',
  cards.every(function (c) { return !!c.getAttribute('data-llf-lang'); }));
check('sin errores silenciosos en processAll', APP.LAST_ERRORS.length === 0,
  APP.LAST_ERRORS.join(' | '));

// Re-render de LinkedIn: borra el badge pero conserva los atributos del nodo
Array.prototype.forEach.call(s1.doc.querySelectorAll('.llf-badge'), function (b) { b.remove(); });
check('tras un re-render que borra los badges, quedan 0', s1.doc.querySelectorAll('.llf-badge').length === 0);
APP.processAll(s1.doc, { getDescription: APP.makeGetDescription(s1.doc) });
check('el siguiente pase REPONE el badge borrado (hash igual, badge ausente)',
  s1.doc.querySelectorAll('.llf-badge').length === JOBS.length,
  'badges=' + s1.doc.querySelectorAll('.llf-badge').length);

// Idempotencia: un segundo pase no duplica badges
APP.processAll(s1.doc, { getDescription: APP.makeGetDescription(s1.doc) });
check('pases repetidos no duplican badges',
  s1.doc.querySelectorAll('.llf-badge').length === JOBS.length,
  'badges=' + s1.doc.querySelectorAll('.llf-badge').length);

// ── Escenario 2: UI legacy ─────────────────────────────────────────────────
console.log('\n═══ UI legacy ([data-job-id] + a[href*="/jobs/view/"]) ═══');
const s2 = buildDomLegacy();
global.window = s2.dom.window;
global.document = s2.dom.window.document;
const legacyCards = APP.getDomCards(s2.doc);
console.log('  getDomCards → ' + legacyCards.length + ' nodo(s): ' +
  legacyCards.map(function (c) { return c.tagName; }).join(', '));
check('la UI legacy sigue detectando ' + JOBS.length + ' tarjetas', legacyCards.length === JOBS.length,
  'devolvió ' + legacyCards.length);
check('la UI legacy resuelve el jobId',
  legacyCards.every(function (c) { return /^\d+$/.test(SEL.extractFromCard(c).jobId); }),
  legacyCards.map(function (c) { return SEL.extractFromCard(c).jobId; }).join(','));
APP.processAll(s2.doc, {});
check('la UI legacy inyecta 1 badge por tarjeta',
  s2.doc.querySelectorAll('.llf-badge').length === JOBS.length,
  'badges=' + s2.doc.querySelectorAll('.llf-badge').length);

// ── Escenario 3: dos paneles (lista 2026 + panel de detalle) ───────────────
// El panel derecho SÍ tiene su propio botón ✕ y su enlace /jobs/view/: debe
// recibir su badge sin fusionarse con la lista ni tragarse las tarjetas.
console.log('\n═══ UI 2026 + panel de detalle a la derecha ═══');
const s3 = buildDom2026();
const win3 = s3.dom.window;
global.window = win3;
global.document = win3.document;

const pane = s3.doc.createElement('div');            // panel derecho
pane.id = 'detail-pane';
const topCard = s3.doc.createElement('div');
topCard.id = 'detail-topcard';
const detailLink = s3.doc.createElement('a');
detailLink.setAttribute('href', '/jobs/view/4299999999/');
detailLink.textContent = JOBS[0].title;
topCard.appendChild(detailLink);
const detailDismiss = s3.doc.createElement('button');
detailDismiss.setAttribute('aria-label', 'Descartar empleo «' + JOBS[0].title + '»');
topCard.appendChild(detailDismiss);
const detailBody = s3.doc.createElement('div');
detailBody.id = 'job-details';
detailBody.textContent = 'Buscamos una persona con experiencia en marketing digital para gestionar campañas y redes sociales de la empresa en la ciudad.';
pane.appendChild(topCard);
pane.appendChild(detailBody);
s3.doc.body.firstChild.appendChild(pane);

const cards3 = APP.getDomCards(s3.doc);
console.log('  getDomCards → ' + cards3.length + ' nodo(s): ' +
  cards3.map(function (c) { return c.id || c.getAttribute('data-test-level') || c.tagName; }).join(', '));
check('detecta las 3 tarjetas de la lista + 1 del panel de detalle', cards3.length === JOBS.length + 1,
  'devolvió ' + cards3.length);
check('ninguna tarjeta de la lista queda dentro de la tarjeta del panel',
  cards3.every(function (c) { return !cards3.some(function (o) { return o !== c && c.contains(o); }); }));
check('la tarjeta del panel derecho es la top-card, no el panel entero',
  cards3.some(function (c) { return c === topCard; }) && cards3.indexOf(pane) === -1,
  cards3.map(function (c) { return c.id || c.getAttribute('data-test-level'); }).join(','));
check('la tarjeta del panel no absorbe el cuerpo de la descripción',
  cards3.every(function (c) { return !(c.contains(detailBody) && c !== detailBody); }));
APP.processAll(s3.doc, { getDescription: APP.makeGetDescription(s3.doc) });
check('1 badge por tarjeta (lista + panel)',
  s3.doc.querySelectorAll('.llf-badge').length === JOBS.length + 1,
  'badges=' + s3.doc.querySelectorAll('.llf-badge').length);
check('el badge del panel derecho no está dentro de una tarjeta de la lista',
  pane.querySelectorAll('.llf-badge').length === 1,
  'badges en panel=' + pane.querySelectorAll('.llf-badge').length);

// ── Escenario 4: resolver un '??' al abrir la vacante (v0.5.5) ─────────────
// Sin jobId en la tarjeta, el idioma leído del panel derecho se perdía: el
// panel decía ES/EN y la tarjeta de la lista se quedaba en '??' para siempre.
// Ahora la caché cae a título+empresa y el emparejamiento tarjeta ↔ panel se
// hace por título.
console.log('\n═══ UI 2026: tarjeta «??» resuelta al abrir la vacante ═══');
const AMB = { title: 'Tech Lead', company: 'Kunan', meta: 'Rosario, Santa Fe (Híbrido)' };
const s4 = buildDom2026();
const win4 = s4.dom.window;
global.window = win4;
global.document = win4.document;

// Tarjeta ambigua: título con rol EN + modalidad híbrida → el detector la marca
// isAmbiguous → '??' (y sin jobId no puede dispararse el fetch de la Capa 4).
(function addAmbiguousCard() {
  const doc = s4.doc;
  const w = doc.createElement('div');
  w.setAttribute('style', 'display:contents');
  const card = doc.createElement('div');
  card.setAttribute('data-test-card', 'amb');
  w.appendChild(card);
  const inner = doc.createElement('div');
  card.appendChild(inner);
  const pT = doc.createElement('p'); pT.textContent = AMB.title; inner.appendChild(pT);
  const pC = doc.createElement('p'); pC.textContent = AMB.company; inner.appendChild(pC);
  const pM = doc.createElement('p'); pM.textContent = AMB.meta; inner.appendChild(pM);
  const btn = doc.createElement('button');
  btn.setAttribute('aria-label', 'Descartar empleo «' + AMB.title + '»');
  inner.appendChild(btn);
  s4.list.appendChild(w);
})();

const getDesc4 = APP.makeGetDescription(s4.doc);
APP.processAll(s4.doc, { getDescription: getDesc4 });
const ambCard = s4.doc.querySelector('[data-test-card="amb"]');
check('la tarjeta ambigua arranca en «??» (sin jobId no hay Capa 4)',
  ambCard && ambCard.getAttribute('data-llf-lang') === 'unknown',
  'lang=' + (ambCard && ambCard.getAttribute('data-llf-lang')));

// El usuario abre esa vacante: el panel derecho muestra la descripción en ES.
const pane4 = s4.doc.createElement('div');
const top4 = s4.doc.createElement('div');
const dis4 = s4.doc.createElement('button');
dis4.setAttribute('aria-label', 'Descartar empleo «' + AMB.title + '»');
top4.appendChild(dis4);
const comp4 = s4.doc.createElement('a');
comp4.setAttribute('href', '/company/kunan/');
comp4.textContent = AMB.company;
top4.appendChild(comp4);
const body4 = s4.doc.createElement('div');
body4.id = 'job-details';
body4.textContent = 'Buscamos un referente técnico para liderar el equipo de desarrollo. ' +
  'Vas a trabajar con el equipo de producto en la definición de la arquitectura y en ' +
  'el acompañamiento de las personas del equipo. Se ofrece contratación en relación de dependencia.';
pane4.appendChild(top4);
pane4.appendChild(body4);
s4.doc.body.firstChild.appendChild(pane4);

check('getDetailTitle() lee el título del panel sin clases semánticas',
  SEL.getDetailTitle(s4.doc) === AMB.title,
  JSON.stringify(SEL.getDetailTitle(s4.doc)));
check('getDetailCompany() lee la empresa del panel',
  SEL.getDetailCompany(s4.doc) === AMB.company,
  JSON.stringify(SEL.getDetailCompany(s4.doc)));

APP.processAll(s4.doc, { getDescription: APP.makeGetDescription(s4.doc) });
check('al abrir la vacante, la tarjeta de la lista pasa de «??» a «es»',
  ambCard.getAttribute('data-llf-lang') === 'es',
  'lang=' + ambCard.getAttribute('data-llf-lang'));
check('el badge de la tarjeta muestra ES',
  ambCard.querySelector('.llf-badge .llf-badge-label') &&
  ambCard.querySelector('.llf-badge .llf-badge-label').textContent === 'ES',
  ambCard.querySelector('.llf-badge') && ambCard.querySelector('.llf-badge').textContent);

// La resolución debe PERSISTIR aunque el usuario cierre el panel (caché por título).
if (pane4.parentNode) pane4.parentNode.removeChild(pane4);
APP.processAll(s4.doc, { getDescription: APP.makeGetDescription(s4.doc) });
check('la resolución persiste tras cerrar el panel (caché por título+empresa)',
  ambCard.getAttribute('data-llf-lang') === 'es',
  'lang=' + ambCard.getAttribute('data-llf-lang'));

// Una vacante distinta con el MISMO título pero otra empresa no debe heredarla.
const other = SEL.extractFromCard(ambCard);
check('la clave de caché incluye la empresa (no colisiona por título suelto)',
  other.company === AMB.company, JSON.stringify(other.company));

// ── Escenario 5: ruido de UI REAL medido en campo (2026-08-06) ─────────────
// __LJF_DIAG.lines() midió 61 líneas de texto extra en 25 tarjetas y todas eran
// chrome de interfaz. Está en el idioma de la INTERFAZ, así que si se cuela al
// detector sesga todo hacia ES (el error que oculta vacantes válidas en modo
// hide). Estas son las cadenas exactas observadas.
// ── Escenario 6: jobId desde componentkey (medido en campo 2026-08-06) ─────
// __LJF_DIAG.hunt() encontró el id en un atributo plano de un div interno:
//     componentkey="job-card-component-ref-4376922531"
// Con eso vuelve a haber jobId en la lista → revive la Capa 4 (fetch de la
// descripción) y las claves de caché/hash dejan de depender del título.
console.log('\n═══ jobId recuperado del atributo componentkey ═══');
const s6 = buildDom2026();
global.window = s6.dom.window;
global.document = s6.dom.window.document;

const CK_IDS = ['4376922531', '4442412166', '4439204501'];
Array.prototype.forEach.call(s6.list.querySelectorAll('[data-test-level="L9"]'), function (l9, i) {
  if (CK_IDS[i]) l9.setAttribute('componentkey', 'job-card-component-ref-' + CK_IDS[i]);
});

const cards6 = APP.getDomCards(s6.doc);
const ids6 = cards6.map(function (c) { return SEL.extractFromCard(c).jobId; });
console.log('  jobIds extraídos: ' + JSON.stringify(ids6));
check('extrae el jobId de componentkey en todas las tarjetas',
  ids6.length === CK_IDS.length && ids6.every(function (id, i) { return id === CK_IDS[i]; }),
  JSON.stringify(ids6));
check('el hash de idempotencia ahora usa el jobId real',
  APP.hashOf(cards6[0], s6.doc).indexOf(CK_IDS[0]) === 0,
  APP.hashOf(cards6[0], s6.doc).slice(0, 40));

// Variantes de forma del atributo que conviene tolerar.
(function variantes() {
  const doc = s6.doc;
  const casos = [
    ['componentkey', 'job-card-component-ref-4111111111', '4111111111'],
    ['componentkey', 'jobCardRef:4222222222', '4222222222'],
    ['data-component-key', 'job-card-component-ref-4333333333', '4333333333'],
    ['componentkey', 'search-filter-component-ref-99', ''],   // no es una vacante
    ['componentkey', 'job-card-footer', ''],                   // sin dígitos
  ];
  let okAll = true;
  const got = [];
  casos.forEach(function (c) {
    const w = doc.createElement('div');
    const card = doc.createElement('div');
    const inner = doc.createElement('div');
    inner.setAttribute(c[0], c[1]);
    const b = doc.createElement('button');
    b.setAttribute('aria-label', 'Descartar empleo «X»');
    inner.appendChild(b);
    card.appendChild(inner);
    w.appendChild(card);
    const res = SEL.extractFromCard(card).jobId;
    got.push(c[1] + ' → ' + JSON.stringify(res));
    if (res !== c[2]) okAll = false;
  });
  check('tolera variantes del atributo y rechaza los que no son vacantes', okAll, got.join(' | '));
})();

console.log('\n═══ Ruido de UI real: no debe contaminar título ni empresa ═══');
const NOISE_LINES = ['·', 'Publicado hace 5 meses', 'Evaluando solicitudes de forma activa', 'Solicitados'];
const s5 = buildDom2026();
global.window = s5.dom.window;
global.document = s5.dom.window.document;

function buildNoisyCard(doc, list, title, company, noiseFirst) {
  const w = doc.createElement('div');
  w.setAttribute('style', 'display:contents');
  const card = doc.createElement('div');
  card.setAttribute('data-test-card', 'noisy');
  w.appendChild(card);
  const inner = doc.createElement('div');
  card.appendChild(inner);
  const push = function (t) { const p = doc.createElement('p'); p.textContent = t; inner.appendChild(p); };
  push(title);
  // El caso peligroso: un separador ANTES de la línea de la empresa.
  if (noiseFirst) push('·');
  push(company);
  push('Rosario, Santa Fe (Híbrido)');
  NOISE_LINES.forEach(push);
  const btn = doc.createElement('button');
  btn.setAttribute('aria-label', 'Descartar empleo «' + title + '»');
  inner.appendChild(btn);
  list.appendChild(w);
  return card;
}

const noisy = buildNoisyCard(s5.doc, s5.list, 'Business Analyst - Semi senior', 'Grupo Rosario', true);
const noisyData = SEL.extractFromCard(noisy);
check('el título sobrevive al ruido de UI',
  noisyData.title === 'Business Analyst - Semi senior', JSON.stringify(noisyData.title));
check('la empresa NO es un separador ni una frase de interfaz',
  noisyData.company === 'Grupo Rosario', JSON.stringify(noisyData.company));
check('ninguna cadena de ruido termina en título o empresa',
  NOISE_LINES.indexOf(noisyData.title) === -1 && NOISE_LINES.indexOf(noisyData.company) === -1);

// Regresión del filtro: "es"/"en" solo deben filtrarse como línea EXACTA.
// Como prefijo harían match con "Especialista" / "Encargado" y se perdería el título.
const esCard = buildNoisyCard(s5.doc, s5.list, 'Especialista en MKT Digital', 'Encargados SA', false);
const esData = SEL.extractFromCard(esCard);
check('un título que EMPIEZA con "es" no se filtra como ruido',
  esData.title === 'Especialista en MKT Digital', JSON.stringify(esData.title));
check('una empresa que EMPIEZA con "en" no se filtra como ruido',
  esData.company === 'Encargados SA', JSON.stringify(esData.company));

// ── Escenario 10: abrir la vacante SIEMPRE corrige la etiqueta ─────────────
// Reporte de campo: "3 vacantes en inglés etiquetadas ES, y no cambiaba su
// etiqueta incluso después de haber abierto la tarjeta".
// Causa: el hash miraba el panel de detalle sólo en el `else` de la caché. Una
// vez que la caché tenía un valor (aunque fuera equivocado), el hash dejaba de
// cambiar al abrir la vacante → processCard reusaba la etiqueta vieja → tagCard
// nunca corría. La descripción del panel es el texto que el usuario está VIENDO:
// tiene que poder corregir cualquier valor cacheado.
console.log('\n═══ Abrir la vacante corrige una etiqueta cacheada mal ═══');
(function escenario10() {
  const s10 = buildDom2026();
  global.window = s10.dom.window;
  global.document = s10.dom.window.document;

  const ID = '4488001122';
  const TITULO = 'Account Manager';
  const card = (function () {
    const doc = s10.doc;
    const w = doc.createElement('div');
    w.setAttribute('style', 'display:contents');
    const c = doc.createElement('div');
    c.setAttribute('data-test-card', 'poisoned');
    const inner = doc.createElement('div');
    inner.setAttribute('componentkey', 'job-card-component-ref-' + ID);
    [TITULO, 'Telefónica', 'Rosario (Híbrido)'].forEach(function (t) {
      const p = doc.createElement('p'); p.textContent = t; inner.appendChild(p);
    });
    const b = doc.createElement('button');
    b.setAttribute('aria-label', 'Descartar empleo «' + TITULO + '»');
    inner.appendChild(b);
    c.appendChild(inner);
    w.appendChild(c);
    s10.list.appendChild(w);
    return c;
  })();

  // Simular el estado que reportó el usuario: la caché quedó envenenada con 'es'
  // (por ejemplo, un fetch que capturó chrome de la página pública en español).
  APP.FETCH_CACHE[ID] = 'es';
  APP.processAll(s10.doc, { getDescription: APP.makeGetDescription(s10.doc), health: false });
  check('la tarjeta arranca con la etiqueta ES envenenada de la caché',
    card.getAttribute('data-llf-lang') === 'es', card.getAttribute('data-llf-lang'));

  // El usuario abre la vacante: el panel muestra el aviso, que está en INGLÉS.
  const pane = s10.doc.createElement('div');
  const top = s10.doc.createElement('div');
  const dis = s10.doc.createElement('button');
  dis.setAttribute('aria-label', 'Descartar empleo «' + TITULO + '»');
  top.appendChild(dis);
  const body = s10.doc.createElement('div');
  body.id = 'job-details';
  body.textContent = 'We are looking for an experienced account manager to join our sales team. ' +
    'You will be responsible for managing a portfolio of key clients and for building long term ' +
    'relationships with them. The ideal candidate has strong communication skills.';
  pane.appendChild(top); pane.appendChild(body);
  s10.doc.body.firstChild.appendChild(pane);
  // La URL apunta a esa vacante (es como se identifica la vacante abierta).
  s10.dom.reconfigure({ url: 'https://www.linkedin.com/jobs/search-results/?currentJobId=' + ID });

  APP.processAll(s10.doc, { getDescription: APP.makeGetDescription(s10.doc), health: false });
  check('al abrir la vacante, la etiqueta se corrige a EN',
    card.getAttribute('data-llf-lang') === 'en',
    card.getAttribute('data-llf-lang') + ' (src=' + card.getAttribute('data-llf-src') + ')');
  check('la corrección sobrescribe la caché envenenada',
    APP.FETCH_CACHE[ID] === 'en', JSON.stringify(APP.FETCH_CACHE[ID]));

  // Y persiste cuando el panel se cierra.
  if (pane.parentNode) pane.parentNode.removeChild(pane);
  APP.processAll(s10.doc, { getDescription: APP.makeGetDescription(s10.doc), health: false });
  check('la corrección persiste tras cerrar el panel',
    card.getAttribute('data-llf-lang') === 'en', card.getAttribute('data-llf-lang'));
})();

// ── Escenario 11: la descripción del endpoint público debe ser confiable ───
// Si el fetch captura el chrome de la página pública (menú, footer, "Empleos
// similares"), está todo en español y cualquier aviso en inglés sale 'es'.
// Ante la duda hay que devolver '' y dejar la vacante en '??': un «??» honesto
// es mejor que una etiqueta equivocada que además queda cacheada.
console.log('\n═══ Extracción de la descripción del endpoint público ═══');
(function escenario11() {
  // Largo realista a propósito: v0.5.7 exige 180+ caracteres y 30+ palabras
  // para confiar en un texto como evidencia de idioma. Un bloque de metadatos
  // ("Seniority level / Employment type") no llega, y un aviso real sí.
  const DESC_EN = 'We are looking for a senior backend engineer with solid experience in ' +
    'distributed systems and cloud infrastructure. You will design and build services, ' +
    'review code from other members of the team and help us shape the technical roadmap ' +
    'of the platform. We expect strong communication skills and the ability to work ' +
    'autonomously in a remote first environment. Previous experience mentoring other ' +
    'developers is considered a plus for this position.';

  const okHtml = '<html><body><div class="show-more-less-html__markup relative">' +
    '<p>' + DESC_EN + '</p></div></body></html>';
  const extraida = SEL.extractDescriptionFromHTML(okHtml);
  check('extrae la descripción real del contenedor público',
    extraida.indexOf('senior backend engineer') !== -1, JSON.stringify(extraida.slice(0, 60)));
  check('y esa descripción se detecta como EN',
    SEL.detect(extraida).lang === 'en', SEL.detect(extraida).lang);

  // El caso peligroso: no hay contenedor de descripción, pero sí media página
  // pública en español. Antes esto se capturaba hasta el final del documento.
  const chromeHtml = '<html><body><div id="job-details">' +
    '<p>' + DESC_EN + '</p></div>' +
    '<footer><a>Iniciar sesión</a><a>Regístrate</a><h2>Empleos similares</h2>' +
    '<a>Aviso de privacidad</a><a>Política de cookies</a><a>Condiciones de uso</a>' +
    '<p>Explorá empleos en Argentina, Brasil y el resto del mundo con la comunidad de LinkedIn</p>' +
    '</footer></body></html>';
  const chromeOut = SEL.extractDescriptionFromHTML(chromeHtml);
  check('descarta la captura cuando arrastra chrome de la página pública',
    chromeOut === '', JSON.stringify(chromeOut.slice(0, 80)));
  check('el detector de chrome reconoce el patrón',
    SEL.looksLikeGuestChrome('Iniciar sesión Regístrate Empleos similares') === true);
  check('y no marca como chrome una descripción normal',
    SEL.looksLikeGuestChrome(DESC_EN) === false);
  check('un HTML sin descripción devuelve vacío (no adivina)',
    SEL.extractDescriptionFromHTML('<html><body><p>nada útil</p></body></html>') === '');

  // El caso que causaba las etiquetas ES equivocadas: sin panel abierto, la
  // "descripción" no debe salir del listado de vacantes (todo en español).
  const soloLista = buildDom2026();
  const textoSinPanel = SEL.getDetailDescription(soloLista.doc);
  check('sin panel de detalle NO se devuelve el texto de la lista como descripción',
    textoSinPanel === '', JSON.stringify(String(textoSinPanel).slice(0, 80)));
  check('looksLikeJobList reconoce el listado por sus cadenas repetidas',
    SEL.looksLikeJobList('Publicado hace 5 meses Evaluando solicitudes de forma activa ' +
      'Publicado hace 1 semana Solicitados') === true);
  check('y no confunde una descripción real con el listado',
    SEL.looksLikeJobList(DESC_EN) === false);

  // ── El error MÁS GRAVE: un aviso en español clasificado EN ────────────────
  // Reporte de campo: "Analista de Transformación Digital" salió EN. En la
  // página pública, el bloque de metadatos del aviso viene en INGLÉS aunque el
  // aviso esté en español. Si se captura ese bloque en vez del cuerpo, un aviso
  // español se marca EN — y en modo ocultar, se esconde una vacante válida.
  const CRITERIA_EN = 'Seniority level Mid-Senior level Employment type Full-time ' +
    'Job function Information Technology Industries Software Development ' +
    'Referrals increase your chances of interviewing at this company by 2x ' +
    'Get notified about new Analyst jobs in Rosario, Santa Fe, Argentina.';
  check('el bloque de metadatos en inglés se reconoce como tal',
    SEL.looksLikeCriteriaBlock(CRITERIA_EN) === true);
  check('y NO se acepta como evidencia de idioma (evita marcar EN un aviso ES)',
    SEL.isTrustworthyDescription(CRITERIA_EN) === false,
    'palabras=' + CRITERIA_EN.split(/\s+/).length);
  check('un texto de 20 palabras nunca alcanza para decidir un idioma',
    SEL.isTrustworthyDescription('Buscamos analista para el área comercial de la empresa en Rosario zona sur') === false);
  check('una descripción larga y real sí se acepta',
    SEL.isTrustworthyDescription(DESC_EN) === true,
    'chars=' + DESC_EN.length + ' palabras=' + DESC_EN.split(/\s+/).length);

  // Y el caso end-to-end: HTML público cuyo único texto es el bloque de
  // metadatos en inglés → no se extrae nada → la vacante queda en «??».
  const soloCriteria = '<html><body><div class="show-more-less-html__markup">' +
    CRITERIA_EN + '</div></body></html>';
  check('un HTML con solo metadatos en inglés no produce descripción',
    SEL.extractDescriptionFromHTML(soloCriteria) === '',
    JSON.stringify(SEL.extractDescriptionFromHTML(soloCriteria).slice(0, 60)));
})();

// ── Escenario 9: canario de salud ──────────────────────────────────────────
// En un mismo día hubo dos fallas silenciosas: badges invisibles (v0.5.3) y
// 19/19 tarjetas mal etiquetadas ES (v0.5.4). Ninguna avisó. Este canario las
// convierte en un warning, una vez por sesión y por problema.
console.log('\n═══ Canario de salud ═══');
(function escenario9() {
  const codes = function (h) { return h.issues.map(function (i) { return i.code; }); };

  // (a) Página de empleos sin ninguna tarjeta → selectores rotos.
  const vacio = new JSDOM('<!doctype html><html><body><div id="x"></div></body></html>',
    { pretendToBeVisual: true, url: 'https://www.linkedin.com/jobs/search-results/' });
  global.window = vacio.window;
  global.document = vacio.window.document;
  const hVacio = APP.health(vacio.window.document);
  check('detecta 0 tarjetas en una página de empleos', codes(hVacio).indexOf('no-cards') !== -1,
    JSON.stringify(codes(hVacio)));

  // (b) Tarjetas presentes y etiquetadas → sin alarmas.
  const sano = buildDom2026();
  global.window = sano.dom.window;
  global.document = sano.dom.window.document;
  APP.processAll(sano.doc, { getDescription: APP.makeGetDescription(sano.doc), health: false });
  const hSano = APP.health(sano.doc);
  check('no alarma cuando hay tarjetas con badge', codes(hSano).indexOf('no-badges') === -1,
    JSON.stringify(codes(hSano)));
  check('cuenta las tarjetas y los badges', hSano.cards === JOBS.length && hSano.badges === JOBS.length,
    'cards=' + hSano.cards + ' badges=' + hSano.badges);

  // (c) Badges borrados por un re-render → alarma.
  Array.prototype.forEach.call(sano.doc.querySelectorAll('.llf-badge'), function (b) { b.remove(); });
  check('detecta tarjetas sin ningún badge', codes(APP.health(sano.doc)).indexOf('no-badges') !== -1);

  // (d) Sin jobId en ninguna tarjeta → la Capa 4 quedaría muerta.
  const sinId = buildDom2026();
  global.window = sinId.dom.window;
  global.document = sinId.dom.window.document;
  for (let i = 0; i < 4; i++) {
    const w = sinId.doc.createElement('div');
    const card = sinId.doc.createElement('div');
    const b = sinId.doc.createElement('button');
    b.setAttribute('aria-label', 'Descartar empleo «Puesto ' + i + '»');
    card.appendChild(b);
    w.appendChild(card);
    sinId.list.appendChild(w);
  }
  APP.processAll(sinId.doc, { health: false });
  check('avisa cuando ninguna tarjeta expone jobId',
    codes(APP.health(sinId.doc)).indexOf('no-jobids') !== -1,
    JSON.stringify(codes(APP.health(sinId.doc))));

  // (e) El canario no debe avisar dos veces por el mismo problema.
  const antes = [];
  const warnReal = console.warn;
  console.warn = function (m) { antes.push(m); };
  APP.health(sinId.doc);
  APP.health(sinId.doc);
  console.warn = warnReal;
  check('no repite el warning del mismo problema', antes.length === 0,
    'warnings repetidos=' + antes.length);
})();

// ── Escenario 8: la EMPRESA no debe decidir el idioma ─────────────────────
// Regresión introducida en v0.5.4 y detectada en campo: al agregar el fallback
// estructural de empresa, el nombre de la empresa entró al detector. Una sola
// tilde ("Telefónica", "Córdoba", "Compañía") suma a weightedEs y gana por
// proporción ANTES de que se consulte la capa de roles, así que títulos en
// inglés salían 'es'. Medido: 130 de 288 combinaciones volteaban, y en campo
// 19 de 19 tarjetas del camino por título quedaron etiquetadas ES.
console.log('\n═══ El nombre de la empresa no decide el idioma ═══');
const s8 = buildDom2026();
global.window = s8.dom.window;
global.document = s8.dom.window.document;

function buildCard8(doc, list, title, company, meta) {
  const w = doc.createElement('div');
  w.setAttribute('style', 'display:contents');
  const card = doc.createElement('div');
  const inner = doc.createElement('div');
  [title, company, meta].forEach(function (t) {
    const p = doc.createElement('p'); p.textContent = t; inner.appendChild(p);
  });
  const b = doc.createElement('button');
  b.setAttribute('aria-label', 'Descartar empleo «' + title + '»');
  inner.appendChild(b);
  card.appendChild(inner);
  w.appendChild(card);
  list.appendChild(w);
  return card;
}

// Título inglés + empresa con tilde + REMOTO (para no disparar el fetch).
const EMPRESAS_TILDE = ['Telefónica', 'Compañía de Servicios', 'Grupo Córdoba', 'Gestión y Logística'];
const resultados8 = [];
const cards8 = [];
let todasEn = true;
EMPRESAS_TILDE.forEach(function (emp, i) {
  const c = buildCard8(s8.doc, s8.list, ['Account Manager', 'Product Owner', 'Data Engineer', 'Frontend Developer'][i],
    emp, 'Buenos Aires (En remoto)');
  cards8.push(c);
  const r = APP.classify(c, null);
  resultados8.push(r.title + ' + ' + emp + ' → ' + r.lang);
  if (r.lang !== 'en') todasEn = false;
});
check('un título en inglés con empresa acentuada NO se etiqueta ES', todasEn,
  resultados8.join(' | '));
check('la empresa se sigue extrayendo (clave de caché, hash y fixtures)',
  cards8.every(function (c, i) { return SEL.extractFromCard(c).company === EMPRESAS_TILDE[i]; }),
  cards8.map(function (c) { return SEL.extractFromCard(c).company; }).join(' | '));

// Y el caso inverso: un título realmente español sigue dando ES por sí solo.
const cEs = buildCard8(s8.doc, s8.list, 'Analista de Gestión Contable', 'Globant', 'Rosario (En remoto)');
check('un título realmente español sigue dando ES sin ayuda de la empresa',
  APP.classify(cEs, null).lang === 'es', APP.classify(cEs, null).lang);

// ── Escenario 7: tope de reintentos del fetch (protección de la cuenta) ────
// Con el jobId de vuelta, la Capa 4 se ejecuta de verdad en campo. Si el
// endpoint público está caído o tira 429, cada pase del MutationObserver
// pediría otra vez la misma vacante. Este test fija el tope.
(async function escenario7() {
  console.log('\n═══ Tope de reintentos del fetch de descripción ═══');
  const s7 = buildDom2026();
  global.window = s7.dom.window;
  global.document = s7.dom.window.document;

  const JOB_ID = '4499990000';
  (function addAmbiguousWithId() {
    const doc = s7.doc;
    const w = doc.createElement('div');
    const card = doc.createElement('div');
    const inner = doc.createElement('div');
    inner.setAttribute('componentkey', 'job-card-component-ref-' + JOB_ID);
    const pT = doc.createElement('p'); pT.textContent = 'Tech Lead'; inner.appendChild(pT);
    const pC = doc.createElement('p'); pC.textContent = 'Kunan'; inner.appendChild(pC);
    const pM = doc.createElement('p'); pM.textContent = 'Rosario (Híbrido)'; inner.appendChild(pM);
    const b = doc.createElement('button');
    b.setAttribute('aria-label', 'Descartar empleo «Tech Lead»');
    inner.appendChild(b);
    card.appendChild(inner);
    w.appendChild(card);
    s7.list.appendChild(w);
  })();

  // Stub del fetch: cuenta llamadas y siempre falla (endpoint caído / 429).
  const realFetch = global.fetch;
  let calls = 0;
  const urls = [];
  global.fetch = function (url) {
    calls++;
    urls.push(String(url));
    return Promise.reject(new Error('429 simulado'));
  };

  try {
    for (let pass = 0; pass < 6; pass++) {
      APP.processAll(s7.doc, { getDescription: APP.makeGetDescription(s7.doc) });
      await new Promise(function (r) { setTimeout(r, 5); });
    }
    check('la tarjeta ambigua CON jobId dispara el fetch de la descripción', calls >= 1,
      'llamadas=' + calls);
    check('la URL pedida es el endpoint público de la vacante',
      urls.length > 0 && urls[0].indexOf('/jobs-guest/jobs/api/jobPosting/' + JOB_ID) !== -1,
      urls[0] || '(ninguna)');
    check('6 pases con el endpoint caído NO generan más de 2 peticiones', calls <= 2,
      'llamadas=' + calls + ' (tope MAX_TRIES=2)');
    check('el contador de intentos queda registrado por jobId',
      APP.FETCH_TRIED && APP.FETCH_TRIED[JOB_ID] <= 2,
      JSON.stringify(APP.FETCH_TRIED));
  } finally {
    global.fetch = realFetch;
  }

  console.log('\n────────────────────────────────────────');
  console.log('  ' + pass + ' ok, ' + fail + ' fallo(s)');
  console.log('────────────────────────────────────────\n');
  process.exit(fail === 0 ? 0 : 1);
})();
