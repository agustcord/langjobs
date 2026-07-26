/*
 * LangJobs — lógica del popup (T2.4)
 * ---------------------------------------------------------------------------
 * V1 MVP: el popup tiene UN solo interruptor on/off que activa/desactiva el
 * etiquetado. Escribe `enabled` en chrome.storage.local. El content script
 * (T2.3) ya escucha chrome.storage.onChanged y arranca/detiene el observer
 * según ese valor, sin recargar la página.
 *
 * Modo V1: siempre etiquetado (mode 'label'); no hay selector de modo ni de
 * idioma en esta versión. Ver decisión de alcance V1 en el vault.
 */
(function () {
  'use strict';

  var KEY = 'enabled';
  var DEFAULT_ENABLED = true;
  var checkbox = document.getElementById('enabled');

  function readConfig() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      // Fallback: sin storage, dejamos el checkbox en el default.
      checkbox.checked = DEFAULT_ENABLED;
      return;
    }
    chrome.storage.local.get([KEY], function (cfg) {
      var enabled = (typeof cfg[KEY] === 'boolean') ? cfg[KEY] : DEFAULT_ENABLED;
      checkbox.checked = enabled;
    });
  }

  function onToggle() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    var value = !!checkbox.checked;
    chrome.storage.local.set({ enabled: value }, function () {
      // El content script reacciona vía onChanged. Nada más que hacer aquí.
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    readConfig();
    checkbox.addEventListener('change', onToggle);
  });
})();
