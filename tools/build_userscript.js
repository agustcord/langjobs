/*
 * LangJobs — Bundler de userscript Tampermonkey (sin dependencias)
 * ---------------------------------------------------------------------------
 * Toma los 4 módulos UMD de src/ y produce userscript/langjobs.user.js, un
 * script autocontenido (sin @require frágiles) listo para pegar en
 * Tampermonkey. El mismo src/ es la fuente única para la extensión MV3 (F2).
 *
 * Uso: node tools/build_userscript.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'userscript', 'langjobs.user.js');

const modules = ['stopwords.js', 'detector.js', 'selectors.js', 'app.js'];

// Versión ÚNICA del userscript: se emite en el header de Tampermonkey y en el
// panel de debug (?llfdebug=1) para saber QUÉ versión corre realmente en el
// navegador del usuario (las regresiones "fantasma" eran versiones viejas
// cacheadas por raw.githubusercontent/Tampermonkey).
const VERSION = '0.6.1';

const HEADER = `// ==UserScript==
// @name         LangJobs — Filtro de vacantes LinkedIn por idioma
// @namespace    https://github.com/agustcord/langjobs
// @version      ${VERSION}
// @description  Etiqueta y filtra vacantes de LinkedIn por idioma (ES/EN) 100% local, sin enviar datos.
// @author       agustcord
// @match        https://www.linkedin.com/jobs/*
// @match        https://linkedin.com/jobs/*
// @updateURL    https://raw.githubusercontent.com/agustcord/langjobs/main/userscript/langjobs.user.js
// @downloadURL  https://raw.githubusercontent.com/agustcord/langjobs/main/userscript/langjobs.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* LangJobs — build autogenerado por tools/build_userscript.js. No editar a mano. */
(function () {
  'use strict';
  var root = this;
`;

const FOOTER = `

  // ── Bootstrap del userscript (solo en navegador) ─────────────────────────
  function boot() {
    if (typeof LangJobsApp === 'undefined') return;
    // ── Configuración editable (T1.8) ──────────────────────────────────────
    // targetLang: idioma que se MANTIENE visible ('es' | 'en').
    // mode: 'label' (solo badge) | 'dim' (atenuar no deseados) | 'hide' (ocultar).
    // Fail-open: las vacantes 'unknown' NUNCA se ocultan/atenuan.
    var CONFIG = { targetLang: 'es', mode: 'label' };
    if (LangJobsApp.setConfig) LangJobsApp.setConfig(CONFIG);
    // Sella la versión en el DOM (ver la nota del bundler de la extensión).
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute('data-llf-version', '${VERSION}');
      }
    } catch (e) {}
    // T1.7: observar mutaciones (scroll infinito / nodos reciclados) con debounce.
    if (LangJobsApp.observe) {
      LangJobsApp.observe(document, { debounceMs: 150, config: CONFIG });
    } else {
      LangJobsApp.run(document, { config: CONFIG });
    }
    // ── Diagnóstico visible (T1.10-debug): activar con ?llfdebug=1 en la URL.
    // No usa consola (el usuario tiene la consola rota por otra extensión).
    try {
      var dbg = (location.search || '').indexOf('llfdebug=1') >= 0;
      if (dbg && LangJobsApp.extract) {
        setTimeout(function () {
          // v0.5.4: usar el MISMO descubrimiento que el runtime (UI 2026 sin
          // data-job-id); si no estuviera disponible, caer al selector legacy.
          var cards = LangJobsApp.getDomCards
            ? LangJobsApp.getDomCards(document)
            : Array.prototype.slice.call(document.querySelectorAll('[data-job-id]'));
          var lines = [];
          lines.push('LangJobs DEBUG v${VERSION} — tarjetas=' + cards.length);
          // Errores capturados por el blindaje de processAll (v0.3.0): si una
          // tarjeta lanzó, acá se ve CUÁL y POR QUÉ (sin consola).
          var errs = LangJobsApp.LAST_ERRORS || [];
          if (errs.length) {
            lines.push('ERRORES (' + errs.length + '):');
            for (var k = 0; k < Math.min(errs.length, 6); k++) lines.push('  ' + errs[k]);
          } else {
            lines.push('ERRORES: ninguno');
          }
          for (var i = 0; i < Math.min(cards.length, 12); i++) {
            var c = cards[i];
            // Blindado por tarjeta: una tarjeta rota NO debe matar el panel
            // (es justo el caso en que más se lo necesita).
            var line;
            try {
              var d = LangJobsApp.extract ? LangJobsApp.extract(c) : null;
              var title = d ? (d.title || '').slice(0, 30) : '(sin extract)';
              var jobId = (d && d.jobId) || c.getAttribute('data-job-id') || '(vacio)';
              var badge = c.querySelector ? (c.querySelector('.llf-badge') ? 'BADGE' : '-') : '?';
              var lang = '?';
              var src = '?';
              try {
                var r = LangJobsApp.classify(c, LangJobsApp.makeGetDescription(document));
                lang = r.lang; src = r.langSource;
              } catch (e2) { lang = 'ERR'; }
              line = (i + 1) + '. jobId=' + jobId + ' badge=' + badge + ' lang=' + lang + '(' + src + ') tit=' + JSON.stringify(title);
            } catch (e3) {
              line = (i + 1) + '. ERROR: ' + (e3 && e3.message ? e3.message : String(e3));
            }
            lines.push(line);
          }
          var box = document.createElement('div');
          box.setAttribute('data-llf-debug', '');
          box.style.cssText = 'position:fixed;left:0;bottom:0;max-width:100%;max-height:40%;overflow:auto;background:#000;color:#0f0;font:11px monospace;padding:6px;z-index:2147483647;white-space:pre-wrap;';
          box.textContent = lines.join('\\n');
          document.body.appendChild(box);
        }, 1500);
      }
    } catch (e) { /* no romper el script por el debug */ }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
}).call(window);
`;

// Concatenar módulos UMD. Cada uno define root.X; se invocan con `this`=window.
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
