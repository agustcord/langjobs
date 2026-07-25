/*
 * LangJobs — Orquestación: une detector + selectores y etiqueta tarjetas (T1.6 + T1.7)
 * ---------------------------------------------------------------------------
 * Módulo UMD compartido (userscript / extensión / tests). NO crea el DOM;
 * recibe `document` (inyección) para poder testear en Node con mocks.
 *
 * T1.6: clasificar tarjetas visibles y agregar BADGE de idioma (modo "solo
 *       etiquetar", sin ocultar).
 * T1.7: MutationObserver con debounce + marcado idempotente (data-llf-lang y
 *       data-llf-hash) para scroll infinito y nodos reciclados de LinkedIn.
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

  // ── Hash de contenido de una tarjeta (para detectar nodos reciclados) ──────
  // LinkedIn recicla los mismos nodos del DOM al hacer scroll: el jobId cambia
  // pero el nodo persiste. El hash (jobId|título|empresa) permite re-procesar
  // solo cuando el contenido REAL cambió.
  function hashOf(card) {
    const d = selectors.extractFromCard(card);
    return (d.jobId || '') + '|' + (d.title || '').slice(0, 60) + '|' + (d.company || '').slice(0, 60);
  }

  // ── Clasificación pura (sin tocar el DOM) ──────────────────────────────────
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

  // ── Etiquetado visual (inserta badge; respeta idempotencia salvo force) ─────
  function tagCard(card, getDescription, doc, opts) {
    opts = opts || {};
    const data = classify(card, getDescription);
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);

    if (document && document.createElement) {
      // Si ya etiquetamos (data-llf-lang) y no es forzado, no reinsertar.
      const ya = card.getAttribute && card.getAttribute('data-llf-lang');
      if (!ya || opts.force) {
        // Quitar badge previo si se fuerza.
        if (opts.force && card.querySelector) {
          const prev = card.querySelector('[data-llf-badge]');
          if (prev) { if (prev.remove) prev.remove(); else if (card.removeChild) card.removeChild(prev); }
        }
        if (!card.querySelector || !card.querySelector('[data-llf-badge]')) {
          const badge = document.createElement('span');
          badge.setAttribute('data-llf-badge', '');
          const b = BADGE[data.lang] || BADGE.unknown;
          badge.textContent = b.label;
          badge.style.cssText =
            'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;' +
            'font-size:11px;font-weight:700;color:#fff;background:' + b.color + ';' +
            'vertical-align:middle;font-family:inherit;';
          const titleEl = card.querySelector &&
            (card.querySelector('a.job-card-list__title--link') || card.querySelector('.artdeco-entity-lockup__title'));
          if (titleEl && titleEl.parentNode && titleEl.parentNode.insertBefore) {
            titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
          } else if (card.appendChild) {
            card.appendChild(badge);
          }
        }
      }
    }
    if (card.setAttribute) card.setAttribute('data-llf-lang', data.lang);
    return data;
  }

  // ── Procesar una tarjeta con guarda de hash (idempotencia + reciclaje) ──────
  function processCard(card, getDescription, doc, opts) {
    opts = opts || {};
    const h = hashOf(card);
    const prevHash = card.getAttribute && card.getAttribute('data-llf-hash');
    const prevLang = card.getAttribute && card.getAttribute('data-llf-lang');
    // Mismo contenido ya procesado -> saltar (nodos reciclados del scroll).
    if (!opts.force && prevHash === h && prevLang) {
      return { skipped: true, lang: prevLang, jobId: (selectors.extractFromCard(card).jobId) };
    }
    // Contenido nuevo (o forzado): limpiar marca para que tagCard re-etiquete.
    if (opts.force || prevHash !== h) {
      if (card.setAttribute) card.setAttribute('data-llf-lang', '');
    }
    const data = tagCard(card, getDescription, doc, opts);
    if (card.setAttribute) card.setAttribute('data-llf-hash', h);
    return data;
  }

  // ── Recorrer todas las tarjetas visibles ───────────────────────────────────
  function processAll(root, opts) {
    opts = opts || {};
    if (!root || !root.querySelectorAll) return [];
    const cards = root.querySelectorAll('[data-job-id]');
    const list = (typeof cards.forEach === 'function') ? cards : Array.prototype.slice.call(cards);
    return list.map(function (card) {
      return processCard(card, opts.getDescription, root, opts);
    });
  }

  // ── Punto de entrada inicial (retrocompatible con T1.6) ─────────────────────
  function run(doc, opts) {
    return processAll(doc || (typeof document !== 'undefined' ? document : null), opts);
  }

  // ── MutationObserver con debounce (T1.7) ────────────────────────────────────
  // Observa el árbol y, ante cualquier mutación de nodos, reprograma un flush
  // diferido que re-procesa SOLO las tarjetas cuyo hash cambió (barato y robusto
  // frente a scroll infinito y reciclaje de nodos).
  function observe(doc, opts) {
    opts = opts || {};
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return null;
    const MO = opts.MutationObserver ||
      (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (typeof MO !== 'function') return null;

    const debounceMs = (opts.debounceMs != null) ? opts.debounceMs : 150;
    let timer = null;

    function flush() {
      timer = null;
      processAll(root, opts);
    }
    function schedule() {
      if (timer != null && typeof clearTimeout === 'function') clearTimeout(timer);
      if (typeof setTimeout === 'function') {
        timer = setTimeout(flush, debounceMs);
      } else {
        flush();
      }
    }
    const onMutations = function () { schedule(); };

    const target = opts.target || root;
    const observer = new MO(onMutations);
    observer.observe(target, { childList: true, subtree: true });

    // Pasada inicial inmediata para las tarjetas ya presentes.
    processAll(root, opts);

    return {
      observer: observer,
      flush: flush,
      disconnect: function () {
        if (observer.disconnect) observer.disconnect();
        if (timer != null && typeof clearTimeout === 'function') clearTimeout(timer);
      },
    };
  }

  return {
    run: run,
    observe: observe,
    processAll: processAll,
    processCard: processCard,
    tagCard: tagCard,
    classify: classify,
    hashOf: hashOf,
    BADGE: BADGE,
  };
});
