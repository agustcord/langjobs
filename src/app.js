/*
 * LangJobs — Orquestación: une detector + selectores y etiqueta tarjetas (T1.6)
 * ---------------------------------------------------------------------------
 * Módulo UMD compartido (userscript / extensión / tests). NO crea el DOM;
 * recibe `document` (inyección) para poder testear en Node con mocks.
 *
 * Responsabilidad de T1.6: clasificar las tarjetas visibles y agregar un
 * BADGE de idioma (modo "solo etiquetar", sin ocultar). El filtrado/ocultado
 * llega en T1.8; el uso del panel de detalle, en T1.9.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./stopwords.js'), require('./detector.js'), require('./selectors.js'));
  } else {
    root.LangJobsApp = factory(root.LangJobsStopwords, root.LangJobsDetector, root.LangJobsSelectors);
  }
})(typeof self !== 'undefined' ? self : this, function (stopwords, detector, selectors) {
  'use strict';

  const BADGE = {
    es:      { label: 'ES', color: '#0a66c2' }, // azul LinkedIn
    en:      { label: 'EN', color: '#57a37e' }, // verde
    unknown: { label: '??', color: '#8c8c8c' }, // gris (fail-open)
  };

  // ── Clasificación pura (sin tocar el DOM) ──────────────────────────────────
  // Devuelve { jobId, title, company, location, description, lang, langSource }.
  // Si getDescription(jobId, card) se pasa, usa la DESCRIPCIÓN (más fiable);
  // si no, usa título+empresa (puede dar 'unknown' en títulos cortos a propósito).
  function classify(card, getDescription) {
    const data = selectors.extractFromCard(card);
    if (typeof getDescription === 'function') {
      const desc = getDescription(data.jobId, card) || '';
      data.description = selectors.cleanText(desc);
      data.lang = detector.detectLanguage(data.description).lang;
      data.langSource = 'description';
    } else {
      data.lang = detector.detectLanguage(data.title + ' ' + data.company).lang;
      data.langSource = 'title';
    }
    return data;
  }

  // ── Etiquetado visual (inserta badge, idempotente) ─────────────────────────
  function tagCard(card, getDescription, doc) {
    const data = classify(card, getDescription);
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);

    if (document && document.createElement) {
      // Idempotencia: si ya etiquetamos esta tarjeta (data-llf-lang), no reinsertar.
      const ya = card.getAttribute && card.getAttribute('data-llf-lang');
      if (!ya && card.querySelector && !card.querySelector('[data-llf-badge]')) {
        const badge = document.createElement('span');
        badge.setAttribute('data-llf-badge', '');
        const b = BADGE[data.lang] || BADGE.unknown;
        badge.textContent = b.label;
        badge.style.cssText =
          'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;' +
          'font-size:11px;font-weight:700;color:#fff;background:' + b.color + ';' +
          'vertical-align:middle;font-family:inherit;';
        // Insertar junto al título (capa semántica del selector de título).
        const titleEl = card.querySelector &&
          (card.querySelector('a.job-card-list__title--link') || card.querySelector('.artdeco-entity-lockup__title'));
        if (titleEl && titleEl.parentNode && titleEl.parentNode.insertBefore) {
          titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
        } else if (card.appendChild) {
          card.appendChild(badge);
        }
      }
    }
    // Marca la tarjeta para idempotencia y depuración.
    if (card.setAttribute) card.setAttribute('data-llf-lang', data.lang);
    return data;
  }

  // ── Punto de entrada ────────────────────────────────────────────────────────
  // Recorre todas las tarjetas [data-job-id] y las etiqueta.
  // getDescription es OPCIONAL (lo conecta T1.9 con el panel de detalle).
  function run(doc, opts) {
    opts = opts || {};
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelectorAll) return [];
    const cards = root.querySelectorAll('[data-job-id]');
    const list = (typeof cards.forEach === 'function') ? cards : Array.prototype.slice.call(cards);
    return list.map(function (card) {
      return tagCard(card, opts.getDescription, root);
    });
  }

  return { run: run, tagCard: tagCard, classify: classify, BADGE: BADGE };
});
