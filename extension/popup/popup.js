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

  function readConfig() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      checkbox.checked = DEFAULT_ENABLED;
      return;
    }
    chrome.storage.local.get([KEY], function (cfg) {
      checkbox.checked = (typeof cfg[KEY] === 'boolean') ? cfg[KEY] : DEFAULT_ENABLED;
      if (!checkbox.checked) showDisabledNote();
    });
  }

  function onToggle() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    var value = !!checkbox.checked;
    chrome.storage.local.set({ enabled: value }, function () {});
    if (!value) showDisabledNote();
  }

  function showDisabledNote() {
    if (elNote) elNote.textContent = 'Etiquetado apagado: sin conteo disponible.';
    if (elEs) elEs.textContent = '–';
    if (elEn) elEn.textContent = '–';
    if (elUnk) elUnk.textContent = '–';
  }

  function setCounts(c) {
    if (elEs) elEs.textContent = (c && c.es != null) ? c.es : '–';
    if (elEn) elEn.textContent = (c && c.en != null) ? c.en : '–';
    if (elUnk) elUnk.textContent = (c && c.unknown != null) ? c.unknown : '–';
    if (elNote) elNote.textContent = 'Conteo en vivo de la página de LinkedIn.';
  }

  // Pide el conteo al content script de la pestaña activa.
  function requestCount() {
    if (!checkbox.checked) { showDisabledNote(); return; }
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) { showDisabledNote(); return; }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id == null) { showDisabledNote(); return; }
      // Si no estamos en linkedin.com/jobs, el content script no está inyectado.
      if (typeof chrome.runtime === 'undefined' || !chrome.runtime.sendMessage) { showDisabledNote(); return; }
      try {
        chrome.runtime.sendMessage(tab.id, { type: 'LJF_COUNT' }, function (resp) {
          if (chrome.runtime.lastError || !resp) {
            // El content script no respondió (pestaña fuera de LinkedIn, etc.)
            if (elNote) elNote.textContent = 'Abre linkedin.com/jobs para ver el conteo.';
            if (elEs) elEs.textContent = '–';
            if (elEn) elEn.textContent = '–';
            if (elUnk) elUnk.textContent = '–';
            return;
          }
          setCounts(resp);
        });
      } catch (e) {
        showDisabledNote();
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
    readConfig();
    checkbox.addEventListener('change', onToggle);
    requestCount();
    startCounting();
    // El popup se destruye al cerrarse; limpiamos el intervalo por si acaso.
    window.addEventListener('pagehide', stopCounting);
  });
})();
