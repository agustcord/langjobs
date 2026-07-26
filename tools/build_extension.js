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
const VERSION = '0.5.2';

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
  // T2.3 leerá window.LangJobsApp para arrancar el observer con la config.
  if (typeof window !== 'undefined') {
    window.LangJobsApp = root.LangJobsApp;
    window.LangJobsStopwords = root.LangJobsStopwords;
    window.LangJobsDetector = root.LangJobsDetector;
    window.LangJobsSelectors = root.LangJobsSelectors;
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[LangJobs] content script (build v${VERSION}) — módulos cargados. T2.3=pendiente.');
  }
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
