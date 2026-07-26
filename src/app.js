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
    mode: 'label', // Versión V1 MVP: Etiquetado Visual Exclusivo (90-95%+ valor entregado)
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
  // Opción C (T1.10) + rollback de v0.2.8 (v0.2.9): en el DOM real de LinkedIn el
  // título a veces NO se lee del <a> (texto en otra capa), así que excluir la
  // ubicación dejaba base vacío -> ?? en todas. Restauramos título+empresa+ubicación
  // en la decisión (como v0.2.7, que funcionaba en campo). El sesgo ES por ubicación
  // es aceptable para el feed de Rosario (la mayoría ES); el caso Tech Lead EN se
  // resuelve por la capa de roles del título cuando este SÍ se lee. Pendiente:
  // diagnosticar titleFromCard con ?llfdebug=1 y fijar el selector real.
  // ── Opción B (v0.4.0): Caché en memoria + Fetcher Asíncrono Silencioso ─────
  const FETCH_CACHE = {}; // jobId -> lang
  const FETCH_PENDING = {};
  let activeFetches = 0;
  const MAX_CONCURRENT = 3;

  function fetchJobDetail(jobId, card, doc) {
    if (!jobId || FETCH_CACHE[jobId] || FETCH_PENDING[jobId]) return;
    if (activeFetches >= MAX_CONCURRENT) return;

    FETCH_PENDING[jobId] = true;
    activeFetches++;

    const url = '/jobs/view/' + jobId + '/';
    if (typeof fetch === 'function') {
      fetch(url, { headers: { 'Accept': 'text/html' }, credentials: 'same-origin' })
        .then(function (res) { return res.text(); })
        .then(function (html) {
          delete FETCH_PENDING[jobId];
          activeFetches = Math.max(0, activeFetches - 1);
          const desc = selectors.extractDescriptionFromHTML ? selectors.extractDescriptionFromHTML(html) : '';
          if (desc && desc.trim()) {
            const lang = detector.detectLanguage(desc).lang;
            if (lang === 'es' || lang === 'en') {
              FETCH_CACHE[jobId] = lang;
              tagCard(card, function () { return desc; }, doc, { force: true });
              const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
              applyAction(card, { lang: lang }, document);
            }
          }
        })
        .catch(function () {
          delete FETCH_PENDING[jobId];
          activeFetches = Math.max(0, activeFetches - 1);
        });
    } else {
      delete FETCH_PENDING[jobId];
      activeFetches = Math.max(0, activeFetches - 1);
    }
  }

  function classify(card, getDescription) {
    const data = selectors.extractFromCard(card);
    data.langSource = 'title';

    if (data.jobId && FETCH_CACHE[data.jobId]) {
      data.lang = FETCH_CACHE[data.jobId];
      data.langSource = 'async-fetch';
      return data;
    }

    const detRes = detector.detectLanguage((data.title || '') + ' ' + (data.company || ''), { modality: data.modality });
    data.lang = detRes.lang;

    if ((data.lang === 'unknown' || detRes.isAmbiguous) && data.jobId) {
      const document = (card && card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
      fetchJobDetail(data.jobId, card, document);
    }

    if (typeof getDescription === 'function') {
      const desc = getDescription(data.jobId, card) || '';
      if (desc && desc.trim()) {
        const descLang = detector.detectLanguage(desc).lang;
        if (descLang === 'es' || descLang === 'en') {
          data.description = selectors.cleanText(desc);
          data.lang = descLang;
          data.langSource = 'description';
          if (data.jobId) FETCH_CACHE[data.jobId] = descLang;
        }
      }
    }
    return data;
  }

  // ── ¿La tarjeta es "no deseada"? (se oculta/atenua) ────────────────────────
  // Fail-open: 'unknown' NUNCA se considera no deseada (se muestra siempre).
  function isUndesired(data, config) {
    config = config || CONFIG;
    return data.lang && data.lang !== 'unknown' && data.lang !== config.targetLang;
  }

  // Helper para verificar si un nodo es realmente el contenedor principal de una tarjeta
  // (excluye enlaces <a>, botones <button>, y elementos del panel de detalle).
  function isJobCardContainer(node) {
    if (!node || !node.tagName) return false;
    const tag = node.tagName.toUpperCase();
    // Jamás etiquetar enlaces <a> (el overflow:hidden los corta) ni botones <button>
    if (tag === 'A' || tag === 'BUTTON' || (node.classList && node.classList.contains('jobs-apply-button'))) return false;
    if (node.closest && (node.closest('.jobs-apply-button') || node.closest('.jobs-unified-top-card__content'))) return false;
    return true;
  }

  // ── Inyecta/actualiza los estilos de acción una sola vez ───────────────────
  function ensureStyles(doc) {
    if (!doc || !doc.createElement) return;
    if (doc.getElementById && doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.' + CLS.hidden + '{display:none !important;height:0 !important;margin:0 !important;padding:0 !important;overflow:hidden !important;}\n' +
      '.' + CLS.dim + '{opacity:0.28 !important;filter:grayscale(70%);}\n' +
      '[data-job-id]{position:relative !important;}\n' +
      '.llf-badge{position:absolute !important;top:8px !important;right:40px !important;z-index:2147483647;' +
      'display:inline-block;padding:1px 6px;border-radius:4px;' +
      'font-size:11px;font-weight:700;color:#fff;font-family:inherit;' +
      'line-height:1.4;pointer-events:none;}\n';
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ── Aplica la acción DOM según CONFIG (T1.8) ───────────────────────────────
  function applyAction(card, data, doc, config) {
    if (!isJobCardContainer(card)) return;
    config = config || CONFIG;
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    if (!card.classList) return;
    
    const parentLi = card.closest && card.closest('li');

    // 1. Limpieza de clases e inline styles previos
    card.classList.remove(CLS.hidden, CLS.dim);
    if (card.style && card.style.removeProperty) card.style.removeProperty('display');
    if (parentLi && parentLi.classList) {
      parentLi.classList.remove(CLS.hidden, CLS.dim);
      if (parentLi.style && parentLi.style.removeProperty) parentLi.style.removeProperty('display');
    }

    const undesired = isUndesired(data, config);

    // Diagnóstico en consola si ?llfdebug=1 está en la URL
    if (typeof window !== 'undefined' && window.location && window.location.search && window.location.search.indexOf('llfdebug=1') !== -1) {
      console.log('[LangJobs Debug]', {
        jobId: selectors.extractFromCard(card).jobId,
        title: selectors.extractFromCard(card).title,
        lang: data.lang,
        undesired: undesired,
        mode: config.mode,
        targetLang: config.targetLang
      });
    }

    if (config.mode === 'label') return;

    if (undesired) {
      const cls = (config.mode === 'hide') ? CLS.hidden : CLS.dim;
      card.classList.add(cls);
      
      if (config.mode === 'hide') {
        // Blindaje inline directo: anula inline styles de LinkedIn con !important
        if (card.style && card.style.setProperty) card.style.setProperty('display', 'none', 'important');
        if (parentLi && parentLi.classList) parentLi.classList.add(cls);
        if (parentLi && parentLi.style && parentLi.style.setProperty) parentLi.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // ── Etiquetado visual (inserta badge flotante; respeta idempotencia salvo force) ─
  function tagCard(card, getDescription, doc, opts) {
    if (!isJobCardContainer(card)) return { lang: 'unknown' };
    opts = opts || {};
    const data = classify(card, getDescription);
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);

    if (document && document.createElement && card.setAttribute) {
      const b = BADGE[data.lang] || BADGE.unknown;
      let badge = card.querySelector && card.querySelector('.llf-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'llf-badge';
        badge.setAttribute('data-llf-badge', '');
        if (card.insertBefore) {
          card.insertBefore(badge, card.firstChild);
        } else if (card.appendChild) {
          card.appendChild(badge);
        }
      }
      badge.textContent = b.label;
      badge.style.cssText = 'background:' + b.color + ';';
    }
    if (card.setAttribute) card.setAttribute('data-llf-lang', data.lang);
    return data;
  }

  function processCard(card, getDescription, doc, opts) {
    if (!isJobCardContainer(card)) return { skipped: true };
    opts = opts || {};
    const h = hashOf(card, doc);
    const prevHash = card.getAttribute && card.getAttribute('data-llf-hash');
    const prevLang = card.getAttribute && card.getAttribute('data-llf-lang');

    let data;
    if (!opts.force && prevHash === h && prevLang) {
      data = { lang: prevLang, jobId: (selectors.extractFromCard(card).jobId) };
    } else {
      if (opts.force || prevHash !== h) {
        if (card.setAttribute) card.setAttribute('data-llf-lang', '');
      }
      data = tagCard(card, getDescription, doc, opts);
      if (data.lang === 'unknown' && (prevLang === 'es' || prevLang === 'en')) {
        data.lang = prevLang;
      }
      if (card.setAttribute) card.setAttribute('data-llf-hash', h);
    }

    // SIEMPRE aplicar la acción (label/dim/hide), incluso si el hash no cambió
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    ensureStyles(document);
    applyAction(card, data, document, opts.config);
    return data;
  }

  const LAST_ERRORS = [];
  function processAll(root, opts) {
    opts = opts || {};
    if (!root || !root.querySelectorAll) return [];
    const cards = root.querySelectorAll('[data-job-id]');
    const list = Array.prototype.slice.call(cards).filter(isJobCardContainer);
    LAST_ERRORS.length = 0;
    return list.map(function (card, i) {
      // BLINDAJE (v0.3.0): una tarjeta con forma inesperada (LinkedIn redeploy)
      // NO debe matar el loop entero — eso producía "solo la primera tarjeta
      // tiene badge" cuando processCard lanzaba en la tarjeta 2.
      try {
        return processCard(card, opts.getDescription, root, opts);
      } catch (e) {
        LAST_ERRORS.push('card[' + i + '] ' + (e && e.message ? e.message : String(e)));
        return { error: true, lang: 'unknown', jobId: '', message: (e && e.message) || String(e) };
      }
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

  // ── Limpieza total: quita badges y marcas de todas las tarjetas (T2.3+ T2.4) ──
  // Al desactivar el etiquetado desde el popup, el MutationObserver se detiene
  // (no se agregan nuevos badges) pero los ya inyectados deben borrarse del DOM;
  // de lo contrario el switch "off" no produce efecto visible. clearAll se
  // encarga de eso y limpia data-llf-lang/hash para una reactivación limpia.
  function clearAll(root, opts) {
    opts = opts || {};
    const document = root || (typeof document !== 'undefined' ? document : null);
    if (!document || !document.querySelectorAll) return 0;

    const badges = document.querySelectorAll('.llf-badge');
    const list = Array.prototype.slice.call(badges);
    list.forEach(function (b) {
      if (b.remove) b.remove();
      else if (b.parentNode && b.parentNode.removeChild) b.parentNode.removeChild(b);
    });

    const cards = document.querySelectorAll('[data-job-id]');
    Array.prototype.slice.call(cards).forEach(function (card) {
      if (!isJobCardContainer(card)) return;
      if (card.removeAttribute) {
        card.removeAttribute('data-llf-lang');
        card.removeAttribute('data-llf-hash');
      }
      if (card.classList) card.classList.remove(CLS.hidden, CLS.dim);
      if (card.style && card.style.removeProperty) card.style.removeProperty('display');
    });
    return list.length;
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
      // Si el contexto de la extensión fue invalidado (ej: recargar la extensión en chrome://extensions),
      // desconectar el observer antiguo para no inundar la consola con errores de recurso inválido.
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.id === 'undefined') {
          if (observer && observer.disconnect) observer.disconnect();
          return;
        }
      } catch (e) {}
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
    clearAll: clearAll,
    classify: classify,
    extract: selectors.extractFromCard,
    hashOf: hashOf,
    makeGetDescription: makeGetDescription,
    LAST_ERRORS: LAST_ERRORS,
    CONFIG: CONFIG,
    BADGE: BADGE,
    CLS: CLS,
  };
});
