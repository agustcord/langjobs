/*
 * LangJobs — Generador del Dashboard de Seguimiento de Beta Testing en Obsidian
 * ---------------------------------------------------------------------------
 * Lee `tests/beta_reports.json` y genera/actualiza la nota wiki
 * `.extension_linkedin_obisidian/wiki/09_Seguimiento_Beta_Testing.md` con estadísticas en tiempo real.
 *
 * Uso: node tools/summarize_beta_reports.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORTS_FILE = path.join(ROOT, 'tests', 'beta_reports.json');

const VAULT_NAME = fs.existsSync(path.join(ROOT, '.extension_linkedin_obisidian'))
  ? '.extension_linkedin_obisidian'
  : (fs.existsSync(path.join(ROOT, '.extension_linkedin_obsidian'))
      ? '.extension_linkedin_obsidian'
      : '.memory');

const WIKI_FILE = path.join(ROOT, VAULT_NAME, 'wiki', '09_Seguimiento_Beta_Testing.md');

const TARGET_GOAL = 1000;

let rawReports = [];
if (fs.existsSync(REPORTS_FILE)) {
  try {
    rawReports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error leyendo beta_reports.json:', e.message);
  }
}

function getCanonicalUrl(rawUrl) {
  if (!rawUrl) return 'unknown_page';
  try {
    const urlObj = new URL(rawUrl);
    urlObj.searchParams.delete('currentJobId');
    return urlObj.origin + urlObj.pathname + '?' + urlObj.searchParams.toString();
  } catch (e) {
    return rawUrl.replace(/[?&]currentJobId=\d+/, '').replace(/\/\?$/, '');
  }
}

// Separar reportes por tipo
const pageSuccessList = rawReports.filter(r => r.type === 'page_success');
const errorReportList = rawReports.filter(r => r.jobId && r.type !== 'page_success');

// Mapa de acumulación de muestras por sesión única (fecha + URL canónica)
const sessionMap = new Map();

// 1. Agregar muestras desde eventos de confirmación de página (page_success)
pageSuccessList.forEach(p => {
  const dateKey = (p.timestamp || '').slice(0, 10);
  const canonicalUrl = getCanonicalUrl(p.url);
  const sessionKey = `${dateKey}|${canonicalUrl}`;
  const total = (p.pageStats && typeof p.pageStats.totalCards === 'number') ? p.pageStats.totalCards : (p.jobIds ? p.jobIds.length : 0);
  
  const currentMax = sessionMap.get(sessionKey) || 0;
  sessionMap.set(sessionKey, Math.max(currentMax, total));
});

// 2. Agregar muestras desde reportes de error donde haya pageStatsAtReport
errorReportList.forEach(r => {
  if (r.pageStatsAtReport && typeof r.pageStatsAtReport.totalCards === 'number') {
    const dateKey = (r.timestamp || '').slice(0, 10);
    const canonicalUrl = getCanonicalUrl(r.url);
    const sessionKey = `${dateKey}|${canonicalUrl}`;

    const currentMax = sessionMap.get(sessionKey) || 0;
    sessionMap.set(sessionKey, Math.max(currentMax, r.pageStatsAtReport.totalCards));
  }
});

let totalCardsSampled = 0;
sessionMap.forEach(cards => {
  totalCardsSampled += cards;
});

// Fallback si no hay sessions calculables
if (totalCardsSampled === 0 && rawReports.length > 0) {
  totalCardsSampled = rawReports.length * 15;
}

const totalReports = errorReportList.length;
const correctCards = Math.max(0, totalCardsSampled - totalReports);
const accuracyPct = totalCardsSampled > 0
  ? Math.max(0, Math.min(100, (correctCards / totalCardsSampled) * 100))
  : 100;

const pctProgress = ((totalCardsSampled / TARGET_GOAL) * 100).toFixed(1);

// Construcción de elementos visuales
const barFilled = Math.min(20, Math.round((totalCardsSampled / TARGET_GOAL) * 20));
const progressBarStr = '█'.repeat(barFilled) + '░'.repeat(20 - barFilled);

// Construcción de la nota Markdown en Obsidian
let md = `# 📊 09 — Dashboard de Seguimiento Beta Testing (Prueba de Campo)

> **Proyecto:** LangJobs (*Job Language Filter for LinkedIn*)  
> **Objetivo:** Medir la precisión real en campo y registrar los reportes de error capturados (\`⚠️\`) junto con las páginas confirmadas 100% OK (\`✅\`).

---

## 🚀 Progreso Global de la Muestra (Meta: ${TARGET_GOAL.toLocaleString('es-AR')} Vacantes)

> [!info] **Barra de Avance hacia las ${TARGET_GOAL.toLocaleString('es-AR')} Vacantes**
> \`${progressBarStr}\` **${pctProgress}%** (${totalCardsSampled.toLocaleString('es-AR')} / ${TARGET_GOAL.toLocaleString('es-AR')})
> <progress value="${totalCardsSampled}" max="${TARGET_GOAL}"></progress>

> [!success] **Tasa de Precisión Actual: ${accuracyPct.toFixed(2)}%**
> - **Vacantes Evaluadas en Campo:** ${totalCardsSampled.toLocaleString('es-AR')}
> - **Clasificaciones Correctas Confirmadas:** ${correctCards.toLocaleString('es-AR')}
> - **Errores Registrados:** ${totalReports}

---

## 📊 Gráfico de Distribución (Mermaid)

\`\`\`mermaid
pie title Clasificación en Campo
    "Correctas (${accuracyPct.toFixed(1)}%)" : ${correctCards}
    "Errores Reportados (${(100 - accuracyPct).toFixed(1)}%)" : ${totalReports}
\`\`\`

---

## 📈 Resumen Ejecutivo & Métricas de Precisión

| Métrica | Valor | Meta | Estado |
|---|---|---|---|
| **Meta de Vacantes Muestra** | **${totalCardsSampled.toLocaleString('es-AR')} / ${TARGET_GOAL.toLocaleString('es-AR')}** | **${TARGET_GOAL.toLocaleString('es-AR')} vacantes** | ${totalCardsSampled >= TARGET_GOAL ? '✅ Muestra Completa' : '⏳ En Progreso (' + pctProgress + '%)'} |
| **Páginas Confirmadas 100% OK** | **${pageSuccessList.length}** | - | ✨ ${pageSuccessList.length} lotes validados |
| **Total Errores Reportados** | **${totalReports}** | - | 🐞 ${totalReports} reportes |
| **Tasa de Precisión Calculada** | **${accuracyPct.toFixed(2)}%** | **≥ 95%** | ${accuracyPct >= 95 ? '⭐ CUMPLE OBJETIVO' : '⚠️ REQUIERE AJUSTE'} |

---

## 📋 Registro Detallado de Reportes de Error (\`tests/beta_reports.json\`)

`;

if (errorReportList.length === 0) {
  md += `*Aún no hay reportes de error registrados. El detector mantiene un **100% de precisión** en las pruebas actuales.*\n`;
} else {
  md += `| # | Job ID | Título | Empresa | Modalidad | Detectado | Esperado | Fecha / Hora |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  errorReportList.forEach((r, idx) => {
    const title = (r.title || 'Sin título').replace(/\|/g, '-');
    const company = (r.company || 'Sin empresa').replace(/\|/g, '-');
    const date = r.timestamp ? new Date(r.timestamp).toLocaleString('es-AR') : 'Sin fecha';
    md += `| ${idx + 1} | \`${r.jobId}\` | ${title} | ${company} | \`${r.modality}\` | **\`${(r.badgedLang||'').toUpperCase()}\`** | **\`${(r.expectedLang||'').toUpperCase()}\`** | ${date} |\n`;
  });
}

md += `

---

## 🌟 Registro de Páginas Confirmadas 100% OK (\`page_success\`)

`;

if (pageSuccessList.length === 0) {
  md += `*Aún no se han registrado lotes con confirmación manual de página completa 100% OK.*\n`;
} else {
  md += `| # | Fecha / Hora | Vacantes en Lote | ES | EN | ?? | URL |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  pageSuccessList.forEach((p, idx) => {
    const date = p.timestamp ? new Date(p.timestamp).toLocaleString('es-AR') : 'Sin fecha';
    const stats = p.pageStats || { totalCards: 0, esCount: 0, enCount: 0, unknownCount: 0 };
    const urlClean = (p.url || '').split('?')[0];
    md += `| ${idx + 1} | ${date} | **${stats.totalCards}** | ${stats.esCount} | ${stats.enCount} | ${stats.unknownCount} | \`${urlClean}\` |\n`;
  });
}

md += `

---

## 💡 Instrucciones para Agregar Nuevos Reportes

1. **Si encuentras una clasificación errónea**: haz clic en \`⚠️\` en la tarjeta para reportar la vacante.
2. **Si todas las vacantes de la página son correctas**: haz clic en \`✅ Validar Página OK\` en la barra flotante.
3. El servidor local (\`tools/reporter_server.js\`) actualizará **automáticamente** \`tests/beta_reports.json\` y este Dashboard de Obsidian.
`;

fs.mkdirSync(path.dirname(WIKI_FILE), { recursive: true });
fs.writeFileSync(WIKI_FILE, md, 'utf8');

console.log('✅ Dashboard de Obsidian generado en:', path.relative(ROOT, WIKI_FILE));
console.log(`  - Muestra estimada acumulada: ${totalCardsSampled} vacantes`);
console.log(`  - Páginas confirmadas 100% OK: ${pageSuccessList.length}`);
console.log(`  - Reportes de error registrados: ${totalReports}`);
console.log(`  - Precisión calculada: ${accuracyPct.toFixed(1)}%`);
