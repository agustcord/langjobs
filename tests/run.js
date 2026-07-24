/*
 * LangJobs — Harness de pruebas del detector (T1.3)
 * ---------------------------------------------------------------------------
 * Corre el corpus (tests/corpus.js) contra el detector puro (src/detector.js)
 * y reporta:
 *   - % de acierto global
 *   - lista de fallos
 *   - FALSOS-OCULTAR CRÍTICOS (casos críticos que el detector clasifica como
 *     'en' cuando esperaban 'es'/'unknown') -> deben ser 0 por diseño
 *   - tiempo de ejecución (< 1 s requerido por la estrategia de testing)
 *
 * Uso: node tests/run.js
 */
const path = require('path');
const CORPUS = require('./corpus.js');
// detector relativo a la raíz del repo (UMD: require() en Node)
const { detectLanguage } = require(path.join(__dirname, '..', 'src', 'detector.js'));

// Un caso es "acierto" si el idioma devuelto está entre los aceptados.
function isHit(caso, lang) {
  return caso.acepta.includes(lang);
}

// Falso-ocultar crítico: caso crítico cuyo conjunto acepta NO incluye 'en'
// pero el detector dijo 'en' -> le ocultaría una vacante válida al usuario.
function esFalsoOcultar(caso, lang) {
  return caso.crítico && !caso.acepta.includes('en') && lang === 'en';
}

const t0 = Date.now();
let hits = 0;
const fallos = [];
const falsosOcultar = [];

for (const caso of CORPUS) {
  const { lang } = detectLanguage(caso.texto);
  caso.resultado = lang;
  if (isHit(caso, lang)) {
    hits++;
  } else {
    fallos.push({ id: caso.id, esperado: caso.esperado, obtuvo: lang, crítico: caso.crítico, nota: caso.nota });
  }
  if (esFalsoOcultar(caso, lang)) {
    falsosOcultar.push(caso.id);
  }
}
const ms = Date.now() - t0;

const total = CORPUS.length;
const pct = (hits / total) * 100;

// ── Reporte ──
console.log('════════════════════════════════════════════════════════');
console.log('  LangJobs — Corpus de detección de idioma (T1.3)');
console.log('════════════════════════════════════════════════════════');
console.log(`  Casos:        ${total}`);
console.log(`  Aciertos:     ${hits}/${total}`);
console.log(`  Acierto:      ${pct.toFixed(1)}%   (meta ≥ 95%)`);
console.log(`  Tiempo:       ${ms} ms            (límite < 1000 ms)`);
console.log('');

if (fallos.length === 0) {
  console.log('  ✅ Sin fallos.');
} else {
  console.log(`  ❌ Fallos (${fallos.length}):`);
  for (const f of fallos) {
    console.log(`     • ${f.id}: acepta=[${f.acepta.join(',')}]  obtuvo=${f.obtuvo}  ${f.crítico ? '[CRÍTICO]' : ''}`);
    console.log(`       ${f.nota}`);
  }
}

console.log('');
if (falsosOcultar.length === 0) {
  console.log('  ✅ Falsos-ocultar críticos: 0  (ninguna vacante válida ocultada por error)');
} else {
  console.log(`  ❌ FALSOS-OCULTAR CRÍTICOS (${falsosOcultar.length}): ${falsosOcultar.join(', ')}`);
}

console.log('════════════════════════════════════════════════════════');

// Falla el proceso solo si no cumple la meta o hay falsos-ocultar críticos
const cumple = pct >= 95 && falsosOcultar.length === 0;
process.exit(cumple ? 0 : 1);
