/*
 * LangJobs — Micro-servidor Local de Captura de Reportes Beta (T2.8)
 * ---------------------------------------------------------------------------
 * Servidor HTTP ligero en Node.js (sin dependencias externas). Escucha en el
 * puerto 3100 y recibe los JSON fixtures del In-App Beta Reporter al presionar ⚠️.
 *
 * Escribe automáticamente en `tests/beta_reports.json` (manejando comas y
 * deduplicación por jobId) y actualiza el Dashboard de Obsidian.
 *
 * Uso: node tools/reporter_server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3100;
const ROOT = path.join(__dirname, '..');
const REPORTS_FILE = path.join(ROOT, 'tests', 'beta_reports.json');
const SUMMARIZE_SCRIPT = path.join(ROOT, 'tools', 'summarize_beta_reports.js');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const server = http.createServer((req, res) => {
  // Manejo de preflight CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'POST' && (req.url === '/report' || req.url === '/report-page-success')) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const fixture = JSON.parse(body);
        if (!fixture) {
          res.writeHead(400, CORS_HEADERS);
          res.end(JSON.stringify({ error: 'Fixture vacío o inválido' }));
          return;
        }

        // Leer o inicializar beta_reports.json
        let reports = [];
        if (fs.existsSync(REPORTS_FILE)) {
          try {
            reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
          } catch (e) {
            reports = [];
          }
        }

        const isPageSuccess = fixture.type === 'page_success';

        if (isPageSuccess) {
          if (!fixture.pageStats || !Array.isArray(fixture.jobIds)) {
            res.writeHead(400, CORS_HEADERS);
            res.end(JSON.stringify({ error: 'Evento page_success inválido: requiere pageStats y jobIds' }));
            return;
          }
          // Deduplicar evento page_success por URL y fecha
          const dateKey = (fixture.timestamp || '').slice(0, 10);
          const existingIdx = reports.findIndex(r => r.type === 'page_success' && r.url === fixture.url && (r.timestamp || '').slice(0, 10) === dateKey);
          if (existingIdx !== -1) {
            reports[existingIdx] = fixture;
          } else {
            reports.push(fixture);
          }
          console.log(`[Beta Reporter] ✨ Página confirmada OK registrada (${fixture.pageStats.totalCards} vacantes en ${fixture.url || 'URL activa'})`);
        } else {
          if (!fixture.jobId) {
            res.writeHead(400, CORS_HEADERS);
            res.end(JSON.stringify({ error: 'Fixture inválido o sin jobId' }));
            return;
          }
          // Deduplicar o actualizar por jobId
          const existingIdx = reports.findIndex(r => r.jobId === fixture.jobId);
          if (existingIdx !== -1) {
            reports[existingIdx] = fixture;
          } else {
            reports.push(fixture);
          }
          console.log(`[Beta Reporter] 🐞 Reporte de error registrado para jobId ${fixture.jobId} (${fixture.title} - ${fixture.company})`);
        }

        // Guardar JSON formateado impecablemente
        fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');

        // Ejecutar actualización del Dashboard de Obsidian
        exec(`node "${SUMMARIZE_SCRIPT}"`, (err, stdout) => {
          if (stdout) console.log('  → Dashboard Obsidian:', stdout.trim().split('\n')[0]);
        });

        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ success: true, count: reports.length, type: fixture.type || 'error_report', jobId: fixture.jobId || null }));
      } catch (err) {
        console.error('[Beta Reporter] Error procesando reporte:', err.message);
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`  🚀 LangJobs Beta Reporter Server escuchando en http://localhost:${PORT}`);
  console.log('  Al presionar ⚠️ en LinkedIn, los reportes se guardarán');
  console.log('  automáticamente en tests/beta_reports.json y Obsidian.');
  console.log('====================================================');
});
