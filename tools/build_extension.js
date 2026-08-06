/*
 * LangJobs — Bundler de la extensión Chrome MV3 (sin dependencias)
 * ---------------------------------------------------------------------------
 * Toma los 4 módulos UMD de src/ y produce extension/content.js, un único
 * archivo autocontenido que corre como content script. Lee de src/ (la MISMA
 * fuente única que tools/build_userscript.js) para garantizar CERO
 * divergencia entre el userscript y la extensión.
 *
 * A diferencia del bundler de userscript, AQUÍ NO hay header Tampermonkey ni
 * bootstrap: el manifest.json declara content.js y T2.3 agregará el arranque
 * (observar el DOM con la config de chrome.storage). Este build solo deja los
 * módulos expuestos en window (LangJobsStopwords/Detector/Selectors/App) para
 * que el bootstrap de T2.3 los consuma sin re-declararlos.
 *
 * Uso: node tools/build_extension.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'extension', 'content.js');

const modules = ['stopwords.js', 'detector.js', 'selectors.js', 'app.js'];

// Versión compartida con el userscript (trazabilidad).
const VERSION = '0.5.5';

const HEADER = `/* LangJobs — content script (build autogenerado por tools/build_extension.js).
 * Fuente unica: src/ (mismos modulos UMD que el userscript, sin divergencia).
 * No editar a mano. T2.3 agrega el bootstrap que llama a LangJobsApp.observe.
 */
(function () {
  'use strict';
  var root = this;
`;

const FOOTER = `
  // ── Exposición de módulos compartidos en window (T2.2) ──────────────────
  // En un content script MV3 (world aislado) los archivos no comparten globals
  // entre si a menos que los fijemos en window; este bundle los concentra en
  // un solo script, así que los globals ya viven en window dentro de este IIFE.
  // El bootstrap de abajo lee window.LangJobsApp para arrancar el observer.
  if (typeof window !== 'undefined') {
    window.LangJobsApp = root.LangJobsApp;
    window.LangJobsStopwords = root.LangJobsStopwords;
    window.LangJobsDetector = root.LangJobsDetector;
    window.LangJobsSelectors = root.LangJobsSelectors;
  }

  // ── Bootstrap de la extensión (T2.3) ────────────────────────────────────
  // Arranca el observer con la config de chrome.storage.local (o defaults).
  // Prepara T2.5: reacciona en vivo a cambios de config sin recargar la página.
  (function bootstrap() {
    var DEFAULTS = { enabled: true, targetLang: 'es', mode: 'label', betaReportingEnabled: false };
    var state = {
      enabled: DEFAULTS.enabled,
      targetLang: DEFAULTS.targetLang,
      mode: DEFAULTS.mode,
      betaReportingEnabled: DEFAULTS.betaReportingEnabled,
    };
    var handle = null;

    function startObserving() {
      if (!root.LangJobsApp || !root.LangJobsApp.observe) return;
      if (handle && handle.disconnect) handle.disconnect();
      if (typeof document === 'undefined') return;
      handle = root.LangJobsApp.observe(document, { debounceMs: 150 });
      if (typeof console !== 'undefined' && console.log) {
        console.log('[LangJobs] observer activo (build v${VERSION}).');
      }
    }
    function stopObserving() {
      if (handle && handle.disconnect) handle.disconnect();
      handle = null;
      // T2.4 FIX: al desactivar, el observer se detiene pero los badges ya
      // inyectados deben borrarse del DOM para que el switch 'off' tenga
      // efecto visible de inmediato.
      if (root.LangJobsApp && root.LangJobsApp.clearAll && typeof document !== 'undefined') {
        try { root.LangJobsApp.clearAll(document); } catch (e) {}
      }
      if (typeof console !== 'undefined' && console.log) {
        console.log('[LangJobs] observer detenido y badges limpiados (deshabilitado).');
      }
    }

    // Aplica un partial de config y arranca/detiene según 'enabled'.
    function apply(partial) {
      partial = partial || {};
      if (typeof partial.enabled !== 'undefined') state.enabled = !!partial.enabled;
      if (partial.targetLang) state.targetLang = partial.targetLang;
      if (partial.mode) state.mode = partial.mode;
      if (typeof partial.betaReportingEnabled !== 'undefined') state.betaReportingEnabled = !!partial.betaReportingEnabled;
      if (root.LangJobsApp && root.LangJobsApp.setConfig) {
        root.LangJobsApp.setConfig({ targetLang: state.targetLang, mode: state.mode, betaReportingEnabled: state.betaReportingEnabled });
      }
      if (state.enabled) startObserving(); else stopObserving();
    }

    // Leer config de storage (async). Sin chrome.storage, usar defaults.
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['enabled', 'targetLang', 'mode', 'betaReportingEnabled'], function (cfg) {
        apply(cfg || {});
      });
    } else {
      apply({});
    }

    // T2.5 (preparado): reaccionar en vivo a cambios de config sin recargar.
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        var partial = {};
        if (changes.enabled) partial.enabled = changes.enabled.newValue;
        if (changes.targetLang) partial.targetLang = changes.targetLang.newValue;
        if (changes.mode) partial.mode = changes.mode.newValue;
        if (typeof changes.betaReportingEnabled !== 'undefined') partial.betaReportingEnabled = changes.betaReportingEnabled.newValue;
        if (partial.enabled !== undefined || partial.targetLang || partial.mode || partial.betaReportingEnabled !== undefined) apply(partial);
      });
    }

    // T2.6: responder el conteo de etiquetas al popup bajo demanda (sin compartir memoria).
    // El popup envía { type: 'LJF_COUNT' } y recibe { es, en, unknown }.
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg || msg.type !== 'LJF_COUNT') return;
        var counts = { es: 0, en: 0, unknown: 0 };
        if (state.enabled && typeof document !== 'undefined' && document.querySelectorAll) {
          // v0.5.4: la UI 2026 de LinkedIn no tiene data-job-id en las tarjetas.
          // Se cuenta por la marca propia data-llf-lang (válida en ambas UIs).
          var nodes = document.querySelectorAll('[data-llf-lang]');
          for (var i = 0; i < nodes.length; i++) {
            var lang = nodes[i].getAttribute && nodes[i].getAttribute('data-llf-lang');
            if (lang === 'es') counts.es++;
            else if (lang === 'en') counts.en++;
            else if (lang === 'unknown') counts.unknown++;
          }
        }
        sendResponse(counts);
      });
    }
  })();
}).call(window);
`;

let body = '';
for (const m of modules) {
  const p = path.join(SRC, m);
  if (!fs.existsSync(p)) { console.error('FALTA módulo:', p); process.exit(1); }
  body += '\n/* ── src/' + m + ' ── */\n' + fs.readFileSync(p, 'utf8') + '\n';
}

const out = HEADER + body + FOOTER;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');
console.log('Generado', path.relative(ROOT, OUT), '(' + out.length + ' bytes)');
console.log('Módulos incluidos:', modules.join(', '));
console.log('Fuente:', path.relative(ROOT, SRC) + '/ (sin divergencia con el userscript)');
