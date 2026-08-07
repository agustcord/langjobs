/*
 * LangJobs — service worker MV3 (v0.6.0)
 * ---------------------------------------------------------------------------
 * ÚNICA responsabilidad: pintar el conteo de idiomas SOBRE el icono de la barra,
 * para poder leer de un vistazo cuántas vacantes en inglés y cuántas dudosas hay
 * en la página, sin abrir el popup.
 *
 * ¿Por qué un service worker y no el content script? `chrome.action` no existe
 * en el mundo del content script. El content script cuenta (LangJobsApp.countLangs)
 * y manda el resultado por mensaje; acá se traduce a texto + color del badge del
 * icono. El `tabId` sale de `sender.tab.id`, así que el conteo es POR PESTAÑA y
 * no hace falta el permiso "tabs".
 *
 * PERMISOS: este archivo no agrega ninguno. `chrome.action` no requiere permiso
 * en MV3 (basta la clave "action" del manifest) y `sender.tab.id` llega solo en
 * los mensajes del content script. El manifest sigue pidiendo únicamente
 * "storage" + linkedin.com/jobs/*, que es la base de la promesa de privacidad.
 *
 * NO hay red, ni telemetría, ni almacenamiento acá: solo lee un mensaje local y
 * escribe dos strings en el icono.
 *
 * ── Cómo se lee el icono ───────────────────────────────────────────────────
 *   texto  = cuántas vacantes de la página están en EL IDIOMA DE PREFERENCIA
 *            del usuario (`targetLang`, el que se mantiene visible). Con
 *            targetLang='es' el número son las vacantes en español.
 *   color  = el del idioma contado (azul ES / verde EN) cuando el conteo está
 *            cerrado, y ÁMBAR mientras queden «??» resolviéndose en segundo
 *            plano, porque en ese caso el número todavía puede subir.
 *   tooltip = el desglose completo (ES / EN / ?? y total). Aparece con solo
 *            pasar el mouse, sin clic.
 *
 * UN SOLO NÚMERO a propósito: el badge del icono admite ~4 caracteres legibles,
 * así que los tres conteos no caben. Se eligió el del idioma de preferencia
 * porque es el que responde "¿cuánto de esta página me sirve?". El desglose fino
 * vive en el tooltip y en el popup.
 */
'use strict';

// Color por idioma contado. El ES es el azul de LinkedIn (mismo que el badge de
// la tarjeta). El EN del badge en página es #57a37e, pero sobre el icono se usa
// un verde más oscuro porque #57a37e con texto blanco encima queda ilegible.
var COLOR_BY_LANG = { es: '#0a66c2', en: '#057642' };
var COLOR_PENDING = '#b45309'; // ámbar: quedan «??», el número puede subir
var COLOR_NEUTRAL = '#57606a';
var LANG_NAME = { es: 'español', en: 'inglés' };
var TITLE_BASE = 'LangJobs — Filtro de vacantes por idioma';

function fmt(n) {
  n = (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : 0;
  return n > 99 ? '99+' : String(n);
}

function num(v) {
  return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
}

// Traduce el conteo a { text, color, title } del icono.
// `targetLang` es el idioma de preferencia del usuario: es EL número que se
// muestra. Exportada en globalThis para poder probarla sin navegador.
function badgeFromCounts(counts, targetLang) {
  var c = counts || {};
  var lang = (targetLang === 'en') ? 'en' : 'es'; // default del producto: es
  var es = num(c.es);
  var en = num(c.en);
  var unk = num(c.unknown);
  var total = (typeof c.total === 'number' && isFinite(c.total)) ? num(c.total) : (es + en + unk);

  if (total <= 0) {
    return { text: '', color: COLOR_NEUTRAL, title: TITLE_BASE };
  }

  // UN número: las vacantes en el idioma que el usuario quiere ver.
  var wanted = (lang === 'en') ? en : es;
  var text = fmt(wanted);
  // Ámbar mientras haya dudosas: algunas pueden terminar siendo del idioma
  // buscado, así que el número todavía no es definitivo.
  var color = (unk > 0) ? COLOR_PENDING : (COLOR_BY_LANG[lang] || COLOR_NEUTRAL);

  var title = TITLE_BASE + '\n' +
    wanted + ' de ' + total + ' vacantes en ' + LANG_NAME[lang] +
    ' (' + lang.toUpperCase() + ', tu idioma de preferencia)\n' +
    '───────────\n' +
    es + ' en español (ES)\n' +
    en + ' en inglés (EN)\n' +
    unk + ' ambiguas (??)' +
    (unk > 0 ? ' — resolviéndose en segundo plano, el número puede subir' : '');

  return { text: text, color: color, title: title };
}

function paint(tabId, badge) {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  // Cada llamada va blindada: si la pestaña se cerró entre el mensaje y el
  // pintado, la API tira y no debe quedar una excepción sin atrapar en el SW.
  try { chrome.action.setBadgeText({ tabId: tabId, text: badge.text }); } catch (e) {}
  try { chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: badge.color }); } catch (e) {}
  // setBadgeTextColor existe desde Chrome 110; si no está, el blanco es el default.
  if (chrome.action.setBadgeTextColor) {
    try { chrome.action.setBadgeTextColor({ tabId: tabId, color: '#ffffff' }); } catch (e) {}
  }
  try { chrome.action.setTitle({ tabId: tabId, title: badge.title }); } catch (e) {}
}

function clear(tabId) {
  paint(tabId, { text: '', color: COLOR_NEUTRAL, title: TITLE_BASE });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg || msg.type !== 'LJF_BADGE') return;
    var tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) return;
    // Etiquetado apagado desde el popup: el icono no debe seguir mostrando el
    // último conteo, o parecería que la extensión sigue trabajando.
    if (msg.enabled === false) { clear(tabId); return; }
    paint(tabId, badgeFromCounts(msg.counts, msg.targetLang));
  });
}

// Al navegar, el conteo de la página anterior queda viejo. Se limpia en cuanto
// la pestaña empieza a cargar; el content script vuelve a empujar el conteo real
// en el primer pase del observer (~150 ms). No se lee la URL, así que esto no
// necesita el permiso "tabs".
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (changeInfo && changeInfo.status === 'loading') clear(tabId);
  });
}

// Superficie de test sin navegador (tests/icon_badge.js la consume).
if (typeof globalThis !== 'undefined') {
  globalThis.LangJobsIconBadge = {
    badgeFromCounts: badgeFromCounts,
    COLOR_BY_LANG: COLOR_BY_LANG,
    COLOR_PENDING: COLOR_PENDING,
    COLOR_NEUTRAL: COLOR_NEUTRAL,
    TITLE_BASE: TITLE_BASE,
  };
}
