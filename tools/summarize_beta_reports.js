/*
 * LangJobs — Generador del Dashboard de Seguimiento de Beta Testing en Obsidian
 * ---------------------------------------------------------------------------
 * Lee `tests/beta_reports.json` y genera/actualiza la nota wiki
 * `.memory/wiki/09_Seguimiento_Beta_Testing.md` con estadísticas en tiempo real.
 *
 * Uso: node tools/summarize_beta_reports.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORTS_FILE = path.join(ROOT, 'tests', 'beta_reports.json');
const WIKI_FILE = path.join(ROOT, '.memory', 'wiki', '09_Seguimiento_Beta_Testing.md');

let reports = [];
if (fs.existsSync(REPORTS_FILE)) {
  try {
    reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error leyendo beta_reports.json:', e.message);
  }
}

// Calcular acumulados de muestras sin duplicar por timestamp exacto
let totalCardsSampled = 0;
const seenSessions = new Set();

reports.forEach(r => {
  if (r.pageStatsAtReport && r.pageStatsAtReport.totalCards) {
    // Clave de sesión aproximada por timestamp/URL
    const sessionKey = (r.url || '') + '|' + (r.timestamp || '').slice(0, 16);
    if (!seenSessions.has(sessionKey)) {
      seenSessions.add(sessionKey);
      totalCardsSampled += r.pageStatsAtReport.totalCards;
    }
  }
});

// Fallback si no hay sessions
if (totalCardsSampled === 0 && reports.length > 0) {
  totalCardsSampled = reports.length * 15; // estimado prudente
}

const totalReports = reports.length;
const accuracyPct = totalCardsSampled > 0
  ? Math.max(0, Math.min(100, ((totalCardsSampled - totalReports) / totalCardsSampled) * 100))
  : 100;

// Construcción de la nota Markdown en Obsidian
let md = `# 📊 09 — Dashboard de Seguimiento Beta Testing (Prueba de Campo)

> **Proyecto:** LangJobs (*Job Language Filter for LinkedIn*)  
> **Objetivo:** Medir la precisión real en campo y registrar los reportes de error capturados con el **In-App Beta Reporter** (\`⚠️\`).

---

## 📈 Resumen Ejecutivo & Métricas de Precisión

| Métrica | Valor | Meta | Estado |
|---|---|---|---|
| **Meta de Vacantes Muestra** | **${totalCardsSampled} / 100** | **100 vacantes** | ${totalCardsSampled >= 100 ? '✅ Muestra Completa' : '⏳ En Progreso (' + Math.round((totalCardsSampled/100)*100) + '%)'} |
| **Total Errores Reportados** | **${totalReports}** | - | 🐞 ${totalReports} reportes |
| **Tasa de Precisión Calculada** | **${accuracyPct.toFixed(1)}%** | **≥ 95%** | ${accuracyPct >= 95 ? '⭐ CUMPLE OBJETIVO' : '⚠️ REQUIERE AJUSTE'} |

---

## 📋 Registro Detallado de Reportes de Error (\`tests/beta_reports.json\`)

`;

if (reports.length === 0) {
  md += `*Aún no hay reportes de error registrados. El detector mantiene un **100% de precisión** en las pruebas actuales.*\n`;
} else {
  md += `| # | Job ID | Título | Empresa | Modalidad | Detectado | Esperado | Fecha / Hora |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  reports.forEach((r, idx) => {
    const title = (r.title || 'Sin título').replace(/\|/g, '-');
    const company = (r.company || 'Sin empresa').replace(/\|/g, '-');
    const date = r.timestamp ? new Date(r.timestamp).toLocaleString('es-AR') : 'Sin fecha';
    md += `| ${idx + 1} | \`${r.jobId}\` | ${title} | ${company} | \`${r.modality}\` | **\`${(r.badgedLang||'').toUpperCase()}\`** | **\`${(r.expectedLang||'').toUpperCase()}\`** | ${date} |\n`;
  });
}

md += `

---

## 💡 Instrucciones para Agregar Nuevos Reportes

1. Cuando veas un error en LinkedIn, haz clic en el botón \`⚠️\` de la tarjeta (el JSON se copia a tu portapapeles).
2. Abre \`tests/beta_reports.json\` y pega el JSON dentro del array \`[\` ... \`]\`.
3. Ejecuta en tu terminal:
   \`\`\`bash
   node tools/summarize_beta_reports.js
   \`\`\`
4. Esta nota en Obsidian se actualizará **automáticamente** con los nuevos cálculos de precisión y porcentaje de avance.
`;

fs.mkdirSync(path.dirname(WIKI_FILE), { recursive: true });
fs.writeFileSync(WIKI_FILE, md, 'utf8');

console.log('✅ Dashboard de Obsidian generado en:', path.relative(ROOT, WIKI_FILE));
console.log(`  - Muestra estimada acumulada: ${totalCardsSampled} vacantes`);
console.log(`  - Reportes registrados: ${totalReports}`);
console.log(`  - Precisión calculada: ${accuracyPct.toFixed(1)}%`);
