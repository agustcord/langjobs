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

const HEADER = `// ==UserScript==
// @name         LangJobs — Filtro de vacantes LinkedIn por idioma
// @namespace    https://github.com/agustcord/langjobs
// @version      0.2.2
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
    // T1.7: observar mutaciones (scroll infinito / nodos reciclados) con debounce.
    if (LangJobsApp.observe) {
      LangJobsApp.observe(document, { debounceMs: 150, config: CONFIG });
    } else {
      LangJobsApp.run(document, { config: CONFIG });
    }
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
