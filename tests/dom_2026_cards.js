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

// ── Escenario 12: textos REALES capturados en campo (2026-08-06) ───────────
// Medidos con __LJF_DIAG.fetchTest() y .panelText() sobre dos vacantes reales.
// Fijan la decisión de v0.5.8: el endpoint público es confiable, el panel no.
console.log('\n═══ Textos reales de campo: fetch confiable, panel inservible ═══');
(function escenario12() {
  // Vacante ES — descripción del endpoint público (514 palabras, prosa limpia).
  const ES_FETCH = 'America Digital busca profesionales con formación académica en comunicación y ' +
    'periodismo. Con más de 2 años de experiencia en procesos B2B y social selling en plataformas ' +
    'como Facebook, LinkedIn, Twitter y YouTube. El candidato ideal estará enfocado en generación ' +
    'de leads calificados, análisis de datos y en el cumplimiento de los objetivos comerciales de ' +
    'venta de delegaciones empresas al congreso America Digital y a la venta de nuestro medio.';
  // Vacante EN — descripción del endpoint público (296 palabras).
  const EN_FETCH = 'Company Description Louis Dreyfus Company is a leading merchant and processor ' +
    'of agricultural goods. Our activities span the entire value chain, from field to table. ' +
    'Through a diverse portfolio of business lines, we leverage our global reach and extensive ' +
    'asset network to serve customers and consumers around the world. Strong stakeholder ' +
    'management skills. Experience in industrial or operational environments is a plus.';
  // Lo que devolvía el PANEL de la vacante EN: chrome en español sobre un aviso
  // en inglés. El detector lo llama 'es' — de ahí las etiquetas equivocadas.
  const PANEL_EN = 'Ssr. Learning & Development Analyst Louis Dreyfus Company • Rosario, Santa Fe, ' +
    'Argentina Guardar Solicitar Louis Dreyfus Company Ssr. Learning & Development Analyst ' +
    'Rosario, Santa Fe, Argentina · Compartido hace 3 semanas · Más de 100 personas han hecho ' +
    'clic en «Solicitar» Respuestas gestionadas fuera de LinkedIn Estado de la solicitud';

  check('la descripción real ES del endpoint se detecta como es',
    SEL.detect(ES_FETCH).lang === 'es', SEL.detect(ES_FETCH).lang);
  check('la descripción real EN del endpoint se detecta como en',
    SEL.detect(EN_FETCH).lang === 'en', SEL.detect(EN_FETCH).lang);
  check('el texto del panel de una vacante EN se detectaría como es (por eso se descartó)',
    SEL.detect(PANEL_EN).lang === 'es', SEL.detect(PANEL_EN).lang);

  // Panel de la UI 2026 (sin contenedor explícito) → no se usa como descripción.
  const panelDom = new JSDOM('<!doctype html><html><body>' +
    '<div id="pane"><a href="/jobs/view/4434650098/">Ssr. Learning &amp; Development Analyst</a>' +
    '<div>' + PANEL_EN + '</div></div></body></html>', { pretendToBeVisual: true });
  check('sin #job-details ni .jobs-description, el panel NO aporta descripción',
    SEL.getDetailDescription(panelDom.window.document) === '',
    JSON.stringify(String(SEL.getDetailDescription(panelDom.window.document)).slice(0, 70)));

  // Con contenedor explícito (UI legacy) sí se usa.
  const legacyDom = new JSDOM('<!doctype html><html><body>' +
    '<div id="job-details">' + EN_FETCH + '</div></body></html>', { pretendToBeVisual: true });
  check('con #job-details (UI legacy) el panel sí aporta la descripción',
    SEL.getDetailDescription(legacyDom.window.document).indexOf('Louis Dreyfus') !== -1);
})();

// ── Escenario 13: nodo reciclado durante un fetch en vuelo ─────────────────
// Explica la paradoja de campo: la descripción de "Especialista en Marketing -
// Prospección B2B" es 100% española (26 hits ES, 0 EN) y la tarjeta salió EN.
// `card` se captura al lanzar la petición; si LinkedIn recicla ese nodo antes de
// que llegue la respuesta, se le estampa el idioma de OTRA vacante.
(async function escenario13() {
  console.log('\n═══ Nodo reciclado mientras el fetch está en vuelo ═══');
  const s13 = buildDom2026();
  global.window = s13.dom.window;
  global.document = s13.dom.window.document;

  const ID_VIEJO = '4400000001';
  const ID_NUEVO = '4400000002';
  const inner = (function () {
    const doc = s13.doc;
    const w = doc.createElement('div');
    const c = doc.createElement('div');
    const i = doc.createElement('div');
    i.setAttribute('componentkey', 'job-card-component-ref-' + ID_VIEJO);
    const p = doc.createElement('p'); p.textContent = 'Tech Lead'; i.appendChild(p);
    const p2 = doc.createElement('p'); p2.textContent = 'Kunan'; i.appendChild(p2);
    const p3 = doc.createElement('p'); p3.textContent = 'Rosario (Híbrido)'; i.appendChild(p3);
    const b = doc.createElement('button');
    b.setAttribute('aria-label', 'Descartar empleo «Tech Lead»');
    i.appendChild(b);
    c.appendChild(i);
    w.appendChild(c);
    s13.list.appendChild(w);
    return i;
  })();
  const card13 = inner.parentElement;

  const realFetch = global.fetch;
  global.fetch = function () {
    return Promise.resolve({
      ok: true,
      text: function () {
        return Promise.resolve('<div class="show-more-less-html__markup">' +
          'We are hiring a technical leader to drive the architecture of our platform and to ' +
          'mentor the engineering team. You will work closely with product managers and with ' +
          'other senior engineers on the design of new services and on the quality of the code.' +
          '</div>');
      },
    });
  };

  try {
    APP.processAll(s13.doc, { health: false }); // dispara el fetch para ID_VIEJO
    // LinkedIn recicla el nodo ANTES de que llegue la respuesta.
    inner.setAttribute('componentkey', 'job-card-component-ref-' + ID_NUEVO);
    await new Promise(function (r) { setTimeout(r, 20); });

    check('la caché guarda el idioma bajo el jobId correcto',
      APP.FETCH_CACHE[ID_VIEJO] === 'en', JSON.stringify(APP.FETCH_CACHE[ID_VIEJO]));
    check('el nodo reciclado NO recibe el idioma de la vacante vieja',
      card13.getAttribute('data-llf-lang') !== 'en',
      'lang=' + card13.getAttribute('data-llf-lang'));
    check('y la vacante vieja no quedó sin cachear (se resuelve al reaparecer)',
      typeof APP.FETCH_CACHE[ID_VIEJO] === 'string');
  } finally {
    global.fetch = realFetch;
  }
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

// ── Escenario 14: el badge va DEBAJO del ✕, no al lado (v0.5.10) ───────────
// Bug de campo: con `top:8px; right:40px` el badge compartía renglón con el
// título y, cuando el título envuelve a dos líneas ("Especialista en Marketing
// - Prospección B2B"), lo tapaba. jsdom no hace layout, así que acá se
// INYECTAN rectángulos reales (los medidos en campo: tarjeta 367x126, botón ✕
// de 32x32 en la esquina superior derecha) para poder verificar la geometría
// sin navegador.
console.log('\n═══ Posición del badge: debajo del ✕ ═══');
(function escenario14() {
  const RECT_CARD = { left: 0, top: 0, right: 367, bottom: 126, width: 367, height: 126 };
  const RECT_BTN  = { left: 327, top: 8, right: 359, bottom: 40, width: 32, height: 32 };

  function stubBox(el, rect) {
    el.getBoundingClientRect = function () { return rect; };
    Object.defineProperty(el, 'offsetWidth',  { get: function () { return rect.width; }, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { get: function () { return rect.height; }, configurable: true });
  }

  const s14 = buildDom2026();
  global.window = s14.dom.window;
  global.document = s14.dom.window.document;

  const card = s14.doc.querySelector('[data-test-card="0"]');
  const btn = card.querySelector('button[aria-label^="Descartar empleo"]');
  stubBox(card, RECT_CARD);
  stubBox(btn, RECT_BTN);

  APP.processAll(s14.doc, { getDescription: APP.makeGetDescription(s14.doc), health: false });
  const badge = card.querySelector('.llf-badge');

  check('la tarjeta con layout medible recibe badge', !!badge);
  const top = badge ? parseInt(badge.style.top, 10) : NaN;
  const right = badge ? parseInt(badge.style.right, 10) : NaN;
  console.log('  badge medido → top=' + badge.style.top + ' right=' + badge.style.right);

  check('el badge arranca DEBAJO del borde inferior del ✕',
    top >= (RECT_BTN.bottom - RECT_CARD.top), 'top=' + top + ' vs ✕ bottom=' + RECT_BTN.bottom);
  check('deja un espacio libre respecto del ✕ (no pega con su área de click)',
    top === (RECT_BTN.bottom - RECT_CARD.top) + 6, 'top=' + top);
  check('se alinea con el borde derecho del ✕ (misma columna, sin pisar el título)',
    right === (RECT_CARD.right - RECT_BTN.right), 'right=' + right);
  check('el badge no se sale de la tarjeta por abajo',
    top <= RECT_CARD.height - 18, 'top=' + top + ' altura tarjeta=' + RECT_CARD.height);
  check('el badge sigue sin capturar clicks (pointer-events:none en el CSS)',
    (s14.doc.getElementById('llf-styles').textContent || '').indexOf('pointer-events:none') !== -1);
  check('el color de fondo sobrevive al reposicionamiento',
    !!badge && /background/.test(badge.getAttribute('style') || ''),
    badge && badge.getAttribute('style'));

  // Un segundo pase no debe perder la posición (cssText la borraba).
  APP.processAll(s14.doc, { getDescription: APP.makeGetDescription(s14.doc), health: false });
  const badge2 = card.querySelector('.llf-badge');
  check('un pase posterior conserva la posición medida',
    parseInt(badge2.style.top, 10) === top && parseInt(badge2.style.right, 10) === right,
    'top=' + badge2.style.top + ' right=' + badge2.style.right);

  // ✕ muy abajo: el badge se recorta contra el borde inferior, no se escapa.
  const cardB = s14.doc.querySelector('[data-test-card="1"]');
  const btnB = cardB.querySelector('button[aria-label^="Descartar empleo"]');
  stubBox(cardB, { left: 0, top: 0, right: 367, bottom: 126, width: 367, height: 126 });
  stubBox(btnB, { left: 327, top: 90, right: 359, bottom: 122, width: 32, height: 32 });
  APP.processAll(s14.doc, { getDescription: APP.makeGetDescription(s14.doc), health: false });
  const badgeB = cardB.querySelector('.llf-badge');
  check('si el ✕ está al pie de la tarjeta, el badge se mantiene dentro',
    parseInt(badgeB.style.top, 10) <= 126 - 18, 'top=' + badgeB.style.top);

  // Sin layout medible (tarjeta virtualizada fuera de vista): manda el CSS.
  const cardC = s14.doc.querySelector('[data-test-card="2"]');
  const badgeC = cardC.querySelector('.llf-badge');
  check('sin layout medible no se inventa una posición inline',
    !badgeC.style.top && !badgeC.style.right,
    'top=' + JSON.stringify(badgeC.style.top) + ' right=' + JSON.stringify(badgeC.style.right));
  const css = s14.doc.getElementById('llf-styles').textContent || '';
  check('el CSS por defecto ya coloca el badge debajo del ✕ (no a su izquierda)',
    css.indexOf('top:44px') !== -1 && css.indexOf('right:8px') !== -1 &&
    css.indexOf('right:40px') === -1);
})();

// ── Escenario 15: formularios y diálogos modales (v0.5.11) ─────────────────
// Bug de campo: al abrir "Solicitud sencilla" los badges de las tarjetas de
// atrás se dibujaban ENCIMA del formulario. Causa: la tarjeta tenía
// position:relative pero z-index:auto → no creaba contexto de apilado, y el
// z-index máximo del badge le ganaba al modal en el contexto raíz.
//
// LÍMITE HONESTO DE ESTE HARNESS: jsdom no implementa contextos de apilado ni
// pintado, así que el arreglo de fondo (isolation:isolate) NO se puede verificar
// acá — solo se comprueba que la regla se emita. Lo que sí se verifica de verdad
// es la segunda defensa: el sello data-llf-modal y, sobre todo, que un modal
// CERRADO no apague los badges (ese sería un fallo peor que el original).
console.log('\n═══ Formularios modales: el badge no puede taparlos ═══');
(function escenario15() {
  const s15 = buildDom2026();
  global.window = s15.dom.window;
  global.document = s15.dom.window.document;
  APP.processAll(s15.doc, { getDescription: APP.makeGetDescription(s15.doc), health: false });

  const css = s15.doc.getElementById('llf-styles').textContent || '';
  check('la tarjeta crea contexto de apilado propio (isolation:isolate)',
    css.indexOf('isolation:isolate') !== -1);
  check('el badge ya no usa el z-index máximo (perdería contra cualquier modal)',
    css.indexOf('2147483647') === -1 || css.indexOf('.llf-badge{position:absolute !important;top:44px !important;right:8px !important;z-index:100') !== -1);
  check('existe la regla que apaga los badges con un modal abierto',
    css.indexOf('[data-llf-modal="1"] .llf-badge') !== -1);

  // (a) Sin modal → sin sello.
  check('sin diálogos, <html> no queda sellado',
    !s15.doc.documentElement.getAttribute('data-llf-modal'),
    JSON.stringify(s15.doc.documentElement.getAttribute('data-llf-modal')));

  // (b) Modal de postulación abierto (contrato ARIA de diálogo modal activo).
  const modal = s15.doc.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.textContent = 'Solicitar empleo en STIB Ingeniería de Aplicación';
  s15.doc.body.appendChild(modal);
  APP.processAll(s15.doc, { getDescription: APP.makeGetDescription(s15.doc), health: false });
  check('con el formulario abierto se sella <html data-llf-modal="1">',
    s15.doc.documentElement.getAttribute('data-llf-modal') === '1');
  check('los badges siguen en el DOM (se apagan por CSS, no se destruyen)',
    s15.doc.querySelectorAll('.llf-badge').length === JOBS.length,
    'badges=' + s15.doc.querySelectorAll('.llf-badge').length);

  // (c) Al cerrarlo, los badges vuelven.
  modal.remove();
  APP.processAll(s15.doc, { getDescription: APP.makeGetDescription(s15.doc), health: false });
  check('al cerrar el formulario se quita el sello y los badges vuelven',
    !s15.doc.documentElement.getAttribute('data-llf-modal'));

  // (d) EL CASO PELIGROSO: en una SPA queda el cascarón de un modal cerrado.
  // Si lo contáramos, los badges quedarían apagados para siempre.
  const cerrado = s15.doc.createElement('div');
  cerrado.setAttribute('role', 'dialog');
  cerrado.setAttribute('aria-modal', 'true');
  cerrado.setAttribute('style', 'display:none');
  s15.doc.body.appendChild(cerrado);
  check('un diálogo con display:none NO cuenta como modal abierto',
    APP.isModalOpen(s15.doc) === false);

  const ariaOculto = s15.doc.createElement('div');
  ariaOculto.setAttribute('role', 'dialog');
  ariaOculto.setAttribute('aria-modal', 'true');
  ariaOculto.setAttribute('aria-hidden', 'true');
  s15.doc.body.appendChild(ariaOculto);
  check('un diálogo con aria-hidden="true" tampoco cuenta',
    APP.isModalOpen(s15.doc) === false);

  const conHidden = s15.doc.createElement('div');
  conHidden.setAttribute('role', 'dialog');
  conHidden.setAttribute('aria-modal', 'true');
  conHidden.setAttribute('hidden', '');
  s15.doc.body.appendChild(conHidden);
  check('un diálogo con el atributo hidden tampoco cuenta',
    APP.isModalOpen(s15.doc) === false);

  APP.processAll(s15.doc, { getDescription: APP.makeGetDescription(s15.doc), health: false });
  check('con solo cascarones cerrados, <html> sigue sin sello (badges visibles)',
    !s15.doc.documentElement.getAttribute('data-llf-modal'));

  // (e) Un <dialog> sin aria-modal (no modal) no debe apagar nada.
  const noModal = s15.doc.createElement('div');
  noModal.setAttribute('role', 'dialog');
  s15.doc.body.appendChild(noModal);
  check('un diálogo NO modal (sin aria-modal) no apaga los badges',
    APP.isModalOpen(s15.doc) === false);

  // (f) clearAll debe llevarse el sello, o al reactivar quedarían ocultos.
  s15.doc.documentElement.setAttribute('data-llf-modal', '1');
  APP.clearAll(s15.doc);
  check('clearAll borra el sello del modal (si no, al reactivar no se verían)',
    !s15.doc.documentElement.getAttribute('data-llf-modal'));
})();

// ── Escenario 16: conteo de la página y gancho de fin de pase (v0.6.0) ─────
// Sostiene el contador del icono de la barra: el content script no puede llamar
// a chrome.action, así que cuenta con countLangs() y empuja el resultado al
// service worker en cada pase (opts.onPass). El popup y el icono leen la MISMA
// función, así que no pueden discrepar.
console.log('\n═══ Conteo de la página y gancho onPass ═══');
(function escenario16() {
  const s16 = buildDom2026();
  global.window = s16.dom.window;
  global.document = s16.dom.window.document;

  const pases = [];
  APP.processAll(s16.doc, {
    getDescription: APP.makeGetDescription(s16.doc),
    health: false,
    onPass: function (counts) { pases.push(counts); },
  });

  const c = APP.countLangs(s16.doc);
  check('countLangs cuenta una entrada por tarjeta etiquetada',
    c.total === JOBS.length, JSON.stringify(c));
  check('el total es la suma de es + en + ??',
    c.total === c.es + c.en + c.unknown, JSON.stringify(c));
  check('onPass se llama una vez por pase', pases.length === 1, 'pases=' + pases.length);
  check('onPass recibe el mismo conteo que countLangs',
    JSON.stringify(pases[0]) === JSON.stringify(c),
    JSON.stringify(pases[0]) + ' vs ' + JSON.stringify(c));

  // Un consumidor que lanza NO puede romper el etiquetado (el badge del icono
  // es un adorno; el etiquetado es el producto).
  const antes = s16.doc.querySelectorAll('.llf-badge').length;
  let huboError = false;
  try {
    APP.processAll(s16.doc, {
      getDescription: APP.makeGetDescription(s16.doc),
      health: false,
      onPass: function () { throw new Error('service worker caído'); },
    });
  } catch (e) { huboError = true; }
  check('un onPass que lanza no propaga la excepción', !huboError);
  check('y el etiquetado sigue intacto',
    s16.doc.querySelectorAll('.llf-badge').length === antes,
    'badges=' + s16.doc.querySelectorAll('.llf-badge').length);

  // Con el etiquetado limpiado, el conteo vuelve a cero (el icono se apaga).
  APP.clearAll(s16.doc);
  const cero = APP.countLangs(s16.doc);
  check('tras clearAll el conteo queda en cero', cero.total === 0, JSON.stringify(cero));
})();

// ── Escenario 17: traducción del conteo al badge del icono (v0.6.1) ────────
// Regla que se está fijando: el icono muestra UN SOLO número, el del IDIOMA DE
// PREFERENCIA del usuario (targetLang) — con targetLang='es', cuántas vacantes
// en español hay en la página. El color es el del idioma contado cuando el
// conteo está cerrado, y ámbar mientras queden «??», porque en ese caso el
// número todavía puede subir.
console.log('\n═══ Badge del icono de la barra ═══');
(function escenario17() {
  // background.js es un service worker: no exporta con module.exports, publica
  // en globalThis. Se evalúa el archivo sin `chrome` definido (los listeners
  // quedan sin registrar) para poder probar la lógica pura.
  const fs = require('fs');
  const swPath = path.join(__dirname, '..', 'extension', 'background.js');
  const code = fs.readFileSync(swPath, 'utf8');
  const prevChrome = global.chrome;
  global.chrome = undefined;
  try {
    // eslint-disable-next-line no-new-func
    (new Function(code))();
  } finally {
    global.chrome = prevChrome;
  }
  const ICON = globalThis.LangJobsIconBadge;
  check('background.js expone su lógica para poder testearla', !!ICON);

  const b = function (es, en, unk, lang) {
    return ICON.badgeFromCounts({ es: es, en: en, unknown: unk, total: es + en + unk }, lang);
  };

  check('página sin etiquetar → icono sin número',
    b(0, 0, 0, 'es').text === '', JSON.stringify(b(0, 0, 0, 'es').text));

  // El caso de la captura de campo: 20 ES / 2 EN / 3 ?? con preferencia ES.
  check('con preferencia ES el número son las vacantes en ESPAÑOL',
    b(20, 2, 3, 'es').text === '20', JSON.stringify(b(20, 2, 3, 'es')));
  check('el mismo conteo con preferencia EN muestra las vacantes en INGLÉS',
    b(20, 2, 3, 'en').text === '2', JSON.stringify(b(20, 2, 3, 'en')));
  check('nunca se muestran dos números: es un solo contador',
    b(20, 2, 3, 'es').text.indexOf('·') === -1 && b(5, 12, 10, 'en').text.indexOf('·') === -1,
    JSON.stringify(b(20, 2, 3, 'es').text) + ' / ' + JSON.stringify(b(5, 12, 10, 'en').text));

  check('conteo cerrado con preferencia ES → azul de LinkedIn',
    b(20, 5, 0, 'es').color === ICON.COLOR_BY_LANG.es, JSON.stringify(b(20, 5, 0, 'es')));
  check('conteo cerrado con preferencia EN → verde',
    b(20, 5, 0, 'en').color === ICON.COLOR_BY_LANG.en, JSON.stringify(b(20, 5, 0, 'en')));
  check('mientras queden «??» el color es ámbar (el número puede subir)',
    b(20, 2, 3, 'es').color === ICON.COLOR_PENDING, JSON.stringify(b(20, 2, 3, 'es')));
  check('ninguna vacante en el idioma buscado → "0", no vacío',
    b(0, 25, 0, 'es').text === '0', JSON.stringify(b(0, 25, 0, 'es')));
  check('números de 3 cifras se recortan a 99+',
    b(120, 0, 0, 'es').text === '99+', JSON.stringify(b(120, 0, 0, 'es').text));

  check('el tooltip dice cuántas de cuántas y en qué idioma',
    b(20, 2, 3, 'es').title.indexOf('20 de 25 vacantes en español') !== -1,
    JSON.stringify(b(20, 2, 3, 'es').title));
  check('el tooltip mantiene el desglose completo sin necesidad de clic',
    b(20, 2, 3, 'es').title.indexOf('20 en español') !== -1 &&
    b(20, 2, 3, 'es').title.indexOf('2 en inglés') !== -1 &&
    b(20, 2, 3, 'es').title.indexOf('3 ambiguas') !== -1,
    JSON.stringify(b(20, 2, 3, 'es').title));
  check('el tooltip avisa que las dudosas se están resolviendo',
    b(20, 2, 3, 'es').title.indexOf('segundo plano') !== -1);
  check('sin dudosas el tooltip no habla de resolución pendiente',
    b(20, 5, 0, 'es').title.indexOf('segundo plano') === -1);

  // Sin targetLang (mensaje viejo o config incompleta) se asume el default del
  // producto, 'es': el icono nunca debe quedar en blanco por eso.
  check('sin targetLang se usa el default del producto (es)',
    ICON.badgeFromCounts({ es: 7, en: 1, unknown: 0, total: 8 }).text === '7',
    JSON.stringify(ICON.badgeFromCounts({ es: 7, en: 1, unknown: 0, total: 8 })));
  check('un targetLang desconocido no rompe el icono',
    b(7, 1, 0, 'pt').text === '7', JSON.stringify(b(7, 1, 0, 'pt')));

  // Entrada corrupta: se degrada a 0 en vez de escribir "NaN" o "undefined".
  check('un conteo corrupto no rompe el icono',
    ICON.badgeFromCounts(null).text === '' &&
    ICON.badgeFromCounts({ es: 'x', unknown: null, total: 3 }, 'es').text === '0' &&
    ICON.badgeFromCounts({ es: NaN, en: 2, unknown: 1, total: 3 }, 'es').text === '0',
    JSON.stringify(ICON.badgeFromCounts({ es: NaN, en: 2, unknown: 1, total: 3 }, 'es')));
})();

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
