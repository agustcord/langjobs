/*
 * LangJobs — Orquestación: une detector + selectores, etiqueta y aplica acción (T1.6–T1.8)
 * ---------------------------------------------------------------------------
 * Módulo UMD compartido (userscript / extensión / tests). NO crea el DOM;
 * recibe `document` (inyección) para poder testear en Node con mocks.
 *
 * T1.6: clasificar tarjetas visibles y agregar BADGE de idioma (modo etiquetar).
 * T1.7: MutationObserver con debounce + marcado idempotente (data-llf-lang y
 *       data-llf-hash) para scroll infinito y nodos reciclados de LinkedIn.
 * T1.8: modos OCULTAR / ATENUAR / ETIQUETAR conmutables vía CONFIG (constante
 *       en el script). Fail-open: 'unknown' nunca se oculta/atenua.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./stopwords.js'), require('./detector.js'), require('./selectors.js'));
  } else {
    root.LangJobsApp = factory(root.LangJobsStopwords, root.LangJobsDetector, root.LangJobsSelectors);
  }
})(typeof self !== 'undefined' ? self : this, function (stopwords, detector, selectors) {
  'use strict';

  // ── Configuración (T1.8) ───────────────────────────────────────────────────
  // Editable en el script generado (userscript/langjobs.user.js). En F2 pasa a
  // chrome.storage.local + popup. targetLang = idioma que se MANTIENE visible.
  // mode: 'label' (solo badge) | 'dim' (atenuar no deseados) | 'hide' (ocultar).
  const CONFIG = {
    targetLang: 'es',
    mode: 'label', // arranca en solo-etiquetar para validar precisión sin riesgo
  };

  const BADGE = {
    es:      { label: 'ES', color: '#0a66c2' }, // azul LinkedIn
    en:      { label: 'EN', color: '#57a37e' }, // verde
    unknown: { label: '??', color: '#8c8c8c' }, // gris (fail-open)
  };

  const CLS = {
    hidden: 'llf-hidden', // display:none (no se elimina el nodo)
    dim:    'llf-dim',    // opacidad reducida
  };
  const STYLE_ID = 'llf-styles';

  // ── Hash de contenido de una tarjeta (para detectar nodos reciclados) ──────
  // LinkedIn recicla los mismos nodos del DOM al hacer scroll: el jobId cambia
  // pero el nodo persiste. El hash (jobId|título|empresa) permite re-procesar
  // solo cuando el contenido REAL cambió. En T1.9: si la tarjeta es la ACTIVA
  // y el panel de detalle tiene texto, se incluye una marca del panel para que
  // el retro-etiquetado (re-clasificar por descripción) cambie el hash y se
  // re-procese al abrir la vacante.
  function hashOf(card, doc) {
    const d = selectors.extractFromCard(card);
    let h = (d.jobId || '') + '|' + (d.title || '').slice(0, 60) + '|' + (d.company || '').slice(0, 60);
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    if (document && selectors.getActiveJobId && selectors.getActiveJobId(document) === d.jobId) {
      const desc = selectors.getDetailDescription ? selectors.getDetailDescription(document) : '';
      if (desc && desc.trim()) h += '|D:' + desc.replace(/\s+/g, ' ').slice(0, 120);
    }
    return h;
  }

  // ── getDescription para el panel de detalle (T1.9) ─────────────────────────
  // Devuelve la descripción del panel SOLO si la tarjeta es la activa; si no,
  // string vacío (el classify cae a título+empresa). Así el retro-etiquetado
  // usa el texto completo y confiable de la vacante abierta.
  function makeGetDescription(doc) {
    return function (jobId, card) {
      const document = doc || (card && card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
      if (!document || !selectors.getActiveJobId) return '';
      if (selectors.getActiveJobId(document) !== jobId) return '';
      return selectors.getDetailDescription ? selectors.getDetailDescription(document) : '';
    };
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

  // ── ¿La tarjeta es "no deseada"? (se oculta/atenua) ────────────────────────
  // Fail-open: 'unknown' NUNCA se considera no deseada (se muestra siempre).
  function isUndesired(data, config) {
    config = config || CONFIG;
    return data.lang && data.lang !== 'unknown' && data.lang !== config.targetLang;
  }

  // ── Inyecta/actualiza los estilos de acción una sola vez ───────────────────
  function ensureStyles(doc) {
    if (!doc || !doc.createElement) return;
    if (doc.getElementById && doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.' + CLS.hidden + '{display:none !important;}\n' +
      '.' + CLS.dim + '{opacity:0.28 !important;filter:grayscale(70%);}\n' +
      // Badge flotante en la esquina superior derecha de cada tarjeta de
      // vacante. La tarjeta debe ser posicionable (relative) para que el
      // absolute se ancle a ella, no al viewport.
      '[data-job-id]{position:relative !important;}\n' +
      '.llf-badge{position:absolute !important;top:8px;right:8px;z-index:2147483647;' +
      'display:inline-block;padding:1px 6px;border-radius:4px;' +
      'font-size:11px;font-weight:700;color:#fff;font-family:inherit;' +
      'line-height:1.4;pointer-events:none;}\n';
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ── Aplica la acción DOM según CONFIG (T1.8) ───────────────────────────────
  function applyAction(card, data, doc, config) {
    config = config || CONFIG;
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    if (!card.classList) return; // sin classList no podemos aplicar acción
    // Limpiar acciones previas.
    card.classList.remove(CLS.hidden, CLS.dim);
    if (config.mode === 'label') return; // solo badge, ya hecho en tagCard
    if (isUndesired(data, config)) {
      card.classList.add(config.mode === 'hide' ? CLS.hidden : CLS.dim);
    }
  }

  // ── Etiquetado visual (inserta badge flotante; respeta idempotencia salvo force) ─
  function tagCard(card, getDescription, doc, opts) {
    opts = opts || {};
    const data = classify(card, getDescription);
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);

    if (document && document.createElement && card.setAttribute) {
      const ya = card.getAttribute('data-llf-lang');
      if (!ya || opts.force) {
        if (opts.force) {
          const prev = card.querySelector && card.querySelector('.llf-badge');
          if (prev) { if (prev.remove) prev.remove(); else if (card.removeChild) card.removeChild(prev); }
        }
        if (!card.querySelector || !card.querySelector('.llf-badge')) {
          const b = BADGE[data.lang] || BADGE.unknown;
          const badge = document.createElement('span');
          badge.className = 'llf-badge';
          badge.setAttribute('data-llf-badge', '');
          badge.textContent = b.label;
          badge.style.cssText = 'background:' + b.color + ';';
          // Insertar al PRINCIPIO de la tarjeta: así queda flotando en la
          // esquina superior derecha (CSS .llf-badge absolute) sin depender de
          // dónde esté el título dentro del DOM de LinkedIn.
          if (card.insertBefore) {
            card.insertBefore(badge, card.firstChild);
          } else if (card.appendChild) {
            card.appendChild(badge);
          }
        }
      }
    }
    if (card.setAttribute) card.setAttribute('data-llf-lang', data.lang);
    return data;
  }

  // ── Procesar una tarjeta con guarda de hash + acción (T1.7 + T1.8 + T1.9) ───
  function processCard(card, getDescription, doc, opts) {
    opts = opts || {};
    const h = hashOf(card, doc);
    const prevHash = card.getAttribute && card.getAttribute('data-llf-hash');
    const prevLang = card.getAttribute && card.getAttribute('data-llf-lang');
    if (!opts.force && prevHash === h && prevLang) {
      return { skipped: true, lang: prevLang, jobId: (selectors.extractFromCard(card).jobId) };
    }
    if (opts.force || prevHash !== h) {
      if (card.setAttribute) card.setAttribute('data-llf-lang', '');
    }
    const data = tagCard(card, getDescription, doc, opts);
    // T1.9: no degradar. Si la descripción del panel ya nos dio un idioma
    // confiable (es/en) y ahora la tarjeta se re-procesa sin panel (ej. al
    // clickear otra vacante) dando 'unknown', mantenemos el lenguaje conocido.
    if (data.lang === 'unknown' && (prevLang === 'es' || prevLang === 'en')) {
      data.lang = prevLang;
    }
    if (card.setAttribute) card.setAttribute('data-llf-hash', h);
    // Acción según modo (T1.8): label/dim/hide.
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    ensureStyles(document);
    applyAction(card, data, document, opts.config);
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

  // ── Cambiar config en caliente y reprocesar (T1.8: conmutable) ──────────────
  function setConfig(partial, doc, opts) {
    opts = opts || {};
    if (partial && typeof partial === 'object') {
      if (partial.targetLang) CONFIG.targetLang = partial.targetLang;
      if (partial.mode) CONFIG.mode = partial.mode;
    }
    // Reprocesar forzado para aplicar el nuevo modo (T1.9: con getDescription
    // del panel de detalle activo, si lo hay).
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (root) {
      const fullOpts = Object.assign({}, opts, {
        force: true,
        config: CONFIG,
        getDescription: opts.getDescription || makeGetDescription(root),
      });
      processAll(root, fullOpts);
    }
    return Object.assign({}, CONFIG);
  }

  // ── Punto de entrada inicial (retrocompatible con T1.6) ─────────────────────
  function run(doc, opts) {
    return processAll(doc || (typeof document !== 'undefined' ? document : null), opts);
  }

  // ── MutationObserver con debounce (T1.7) + retro-etiquetado (T1.9) ──────────
  function observe(doc, opts) {
    opts = opts || {};
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return null;
    const MO = opts.MutationObserver ||
      (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (typeof MO !== 'function') return null;

    opts.config = opts.config || CONFIG;
    // T1.9: al cambiar el panel de detalle (clickear otra vacante), el
    // getDescription lee la descripción de la tarjeta activa para re-clasificar.
    opts.getDescription = opts.getDescription || makeGetDescription(root);
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

    processAll(root, opts); // pasada inicial

    return {
      observer: observer,
      flush: flush,
      setConfig: function (p) { return setConfig(p, root, opts); },
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
    applyAction: applyAction,
    isUndesired: isUndesired,
    setConfig: setConfig,
    classify: classify,
    hashOf: hashOf,
    makeGetDescription: makeGetDescription,
    CONFIG: CONFIG,
    BADGE: BADGE,
    CLS: CLS,
  };
});
