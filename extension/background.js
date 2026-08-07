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
 *   texto  = cantidad de vacantes en INGLÉS. Si además quedan dudosas, se
 *            muestra «EN·??» (p. ej. "2·3").
 *   color  = VERDE  → no queda ninguna dudosa: el conteo está cerrado.
 *            ÁMBAR  → todavía hay «??» resolviéndose en segundo plano, así que
 *                     el número de EN puede subir.
 *   tooltip = el desglose completo (ES / EN / ?? y total). Aparece con solo
 *            pasar el mouse, sin clic.
 *
 * El texto del badge del icono admite ~4 caracteres legibles. Cuando «EN·??» no
 * entra (dos números de 2 cifras) se muestra solo EN y el color ámbar sigue
 * avisando que hay dudosas: el detalle exacto está en el tooltip y en el popup.
 */
'use strict';

var COLOR_DONE = '#057642';    // verde: nada pendiente
var COLOR_PENDING = '#b45309'; // ámbar: quedan «??» en resolución
var TITLE_BASE = 'LangJobs — Filtro de vacantes por idioma';

function fmt(n) {
  n = (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : 0;
  return n > 99 ? '99+' : String(n);
}

// Traduce el conteo a { text, color, title } del icono.
// Exportada en globalThis para poder probarla sin navegador.
function badgeFromCounts(counts) {
  var c = counts || {};
  var es = (typeof c.es === 'number') ? c.es : 0;
  var en = (typeof c.en === 'number') ? c.en : 0;
  var unk = (typeof c.unknown === 'number') ? c.unknown : 0;
  var total = (typeof c.total === 'number') ? c.total : (es + en + unk);

  if (total <= 0) {
    return { text: '', color: COLOR_DONE, title: TITLE_BASE };
  }

  var text;
  var color;
  if (unk > 0) {
    var combo = fmt(en) + '·' + fmt(unk);
    // El badge del icono solo muestra ~4 caracteres legibles.
    text = (combo.length <= 4) ? combo : fmt(en);
    color = COLOR_PENDING;
  } else {
    text = fmt(en);
    color = COLOR_DONE;
  }

  var title = TITLE_BASE + '\n' +
    total + ' vacantes etiquetadas en esta página\n' +
    es + ' en español (ES)\n' +
    en + ' en inglés (EN)\n' +
    unk + ' ambiguas (??)' +
    (unk > 0 ? ' — resolviéndose en segundo plano' : '');

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
  paint(tabId, { text: '', color: COLOR_DONE, title: TITLE_BASE });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg || msg.type !== 'LJF_BADGE') return;
    var tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) return;
    // Etiquetado apagado desde el popup: el icono no debe seguir mostrando el
    // último conteo, o parecería que la extensión sigue trabajando.
    if (msg.enabled === false) { clear(tabId); return; }
    paint(tabId, badgeFromCounts(msg.counts));
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
    COLOR_DONE: COLOR_DONE,
    COLOR_PENDING: COLOR_PENDING,
    TITLE_BASE: TITLE_BASE,
  };
}
