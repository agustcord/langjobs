/*
 * LangJobs — Content script (stub T2.1)
 * ---------------------------------------------------------------------------
 * T2.1 solo crea la estructura de la extensión + manifest.json. La lógica
 * validada de Fase 1 (detector + selectores + orquestación de src/) se porta
 * aquí en T2.2 (módulos compartidos) y T2.3 (content script completo).
 *
 * Este stub NO hace ningún procesamiento todavía: solo registra en consola que
 * el content script cargó en linkedin.com/jobs/*. Sirve para verificar que el
 * manifest y el match pattern funcionan antes de portar la lógica.
 *
 * Cuando T2.3 llegue, este archivo se reemplaza por el bootstrap que importa
 * los módulos compartidos y llama a LangJobsApp.observe(document, config).
 */
(function () {
  'use strict';
  // Solo corre en la página de búsqueda de empleos de LinkedIn.
  if (!/linkedin\.com\/jobs\//.test(location.href)) return;
  console.log('[LangJobs] content script cargado (stub T2.1) en', location.href);
})();
