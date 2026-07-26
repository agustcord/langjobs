/*
 * LangJobs — lógica del popup (stub T2.1)
 * ---------------------------------------------------------------------------
 * T2.1 solo crea la estructura. T2.4/T2.5 implementan la UI de configuración
 * (on/off, idioma, modo) y la persistencia en chrome.storage.local con
 * reacción en vivo. Por ahora este stub deja sentada la intención de leer la
 * config guardada sin romper la carga del popup.
 */
(function () {
  'use strict';

  function readConfig() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(['enabled', 'targetLang', 'mode'], function (cfg) {
      // T2.5: aplicar cfg a los controles del popup. Por ahora solo registra.
      console.log('[LangJobs popup] config actual:', cfg);
    });
  }

  document.addEventListener('DOMContentLoaded', readConfig);
})();
