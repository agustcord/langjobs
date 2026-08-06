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

console.log('\n────────────────────────────────────────');
console.log('  ' + pass + ' ok, ' + fail + ' fallo(s)');
console.log('────────────────────────────────────────\n');
process.exit(fail === 0 ? 0 : 1);
