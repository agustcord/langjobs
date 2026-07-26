/*
 * LangJobs — lógica del popup (T2.4 + T2.6)
 * ---------------------------------------------------------------------------
 * V1 MVP: el popup tiene UN solo interruptor on/off que activa/desactiva el
 * etiquetado, y un contador de vacantes etiquetadas (ES / EN / ??) en la
 * página actual.
 *
 * - El on/off escribe `enabled` en chrome.storage.local (T2.4).
 * - El contador se consulta al content script vía chrome.runtime.sendMessage
 *   (en MV3 el popup y el content script no comparten memoria). El content
 *   script responde { es, en, unknown } contando los atributos data-llf-lang
 *   de las tarjetas visibles (T2.6). Se refresca cada 1.5 s mientras el popup
 *   está abierto (LinkedIn carga tarjetas con scroll infinito).
 *
 * CORRECCIÓN (post-captura de campo): el conteo se pide SIEMPRE al content
 * script, independientemente del estado local del checkbox. `checkbox.checked`
 * se asigna en readConfig() de forma ASÍNCRONA (chrome.storage.local.get), por
 * lo que leerlo en el primer requestCount() daba false y mostraba "apagado"
 * aunque el etiquetado estuviera activado. Ahora el estado real (`isEnabled`)
 * se sincroniza en el callback de readConfig y el conteo se solicita dentro de
 * ese mismo callback; el interval usa isEnabled ya actualizado.
 */
(function () {
  'use strict';

  var KEY = 'enabled';
  var DEFAULT_ENABLED = true;
  var REFRESH_MS = 1500;

  var checkbox = document.getElementById('enabled');
  var elEs = document.getElementById('count-es');
  var elEn = document.getElementById('count-en');
  var elUnk = document.getElementById('count-unknown');
  var elNote = document.getElementById('stats-note');
  var timer = null;

  // Estado real de habilitado, sincronizado desde chrome.storage (async).
  var isEnabled = DEFAULT_ENABLED;

  function readConfig() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      isEnabled = DEFAULT_ENABLED;
      if (checkbox) checkbox.checked = DEFAULT_ENABLED;
      requestCount(); // no hay storage: usamos default y pedimos conteo igual
      return;
    }
    chrome.storage.local.get([KEY], function (cfg) {
      isEnabled = (typeof cfg[KEY] === 'boolean') ? cfg[KEY] : DEFAULT_ENABLED;
      if (checkbox) checkbox.checked = isEnabled;
      requestCount(); // pedir conteo YA con isEnabled sincronizado
    });
  }

  function onToggle() {
    isEnabled = !!checkbox.checked;
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.set({ enabled: isEnabled }, function () {});
    if (!isEnabled) showDisabledNote();
    else requestCount(); // al prender, refrescar de inmediato
  }

  function showDisabledNote() {
    if (elNote) elNote.textContent = 'Etiquetado apagado: sin conteo disponible.';
    if (elEs) elEs.textContent = '–';
    if (elEn) elEn.textContent = '–';
    if (elUnk) elUnk.textContent = '–';
  }

  function showNoPageNote() {
    if (elNote) elNote.textContent = 'Abre linkedin.com/jobs para ver el conteo.';
    if (elEs) elEs.textContent = '–';
    if (elEn) elEn.textContent = '–';
    if (elUnk) elUnk.textContent = '–';
  }

  function setCounts(c) {
    if (elEs) elEs.textContent = (c && c.es != null) ? c.es : '–';
    if (elEn) elEn.textContent = (c && c.en != null) ? c.en : '–';
    if (elUnk) elUnk.textContent = (c && c.unknown != null) ? c.unknown : '–';
    if (elNote) elNote.textContent = isEnabled
      ? 'Conteo en vivo de la página de LinkedIn.'
      : 'Etiquetado apagado: sin conteo disponible.';
  }

  // Pide el conteo al content script de la pestaña activa. SIEMPRE lo pedimos;
  // el content script responde 0/0/0 si está apagado. La nota "apagado" la
  // decide isEnabled (ya sincronizado), no el timing del DOM.
  function requestCount() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) { showNoPageNote(); return; }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id == null) { if (isEnabled) showNoPageNote(); else showDisabledNote(); return; }
      if (typeof chrome.runtime === 'undefined' || !chrome.runtime.sendMessage) { if (isEnabled) showNoPageNote(); else showDisabledNote(); return; }
      try {
        chrome.runtime.sendMessage(tab.id, { type: 'LJF_COUNT' }, function (resp) {
          if (chrome.runtime.lastError || !resp) {
            if (isEnabled) showNoPageNote(); else showDisabledNote();
            return;
          }
          setCounts(resp);
        });
      } catch (e) {
        if (isEnabled) showNoPageNote(); else showDisabledNote();
      }
    });
  }

  function startCounting() {
    stopCounting();
    if (typeof setInterval === 'function') timer = setInterval(requestCount, REFRESH_MS);
  }
  function stopCounting() {
    if (timer != null && typeof clearInterval === 'function') clearInterval(timer);
    timer = null;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // readConfig() dispara requestCount() dentro de su callback (isEnabled ya real).
    readConfig();
    if (checkbox) checkbox.addEventListener('change', onToggle);
    startCounting();
    window.addEventListener('pagehide', stopCounting);
  });
})();
