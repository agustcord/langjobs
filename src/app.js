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
    betaReportingEnabled: false,
  };

  const BADGE = {
    es:      { label: 'ES', color: '#0a66c2' }, // azul LinkedIn
    en:      { label: 'EN', color: '#57a37e' }, // verde
    unknown: { label: '??', color: '#8c8c8c' }, // gris (fail-open)
  };

  const CLS = {
    hidden: 'llf-hidden', // display:none (no se elimina el nodo)
    dim:    'llf-dim',    // opacidad reducida
    host:   'llf-badge-host', // position:relative en la tarjeta (ancla del badge)
  };
  const STYLE_ID = 'llf-styles';

  // ── Clave de caché de idioma por tarjeta (v0.5.5) ──────────────────────────
  // La UI 2026 no expone el jobId en las tarjetas de la lista, así que la caché
  // no puede indexarse solo por él: sin clave, el idioma resuelto al abrir la
  // vacante (que sí se lee bien del panel derecho) se perdía y la tarjeta
  // quedaba en '??' para siempre. Fallback: título+empresa normalizados.
  function normKey(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function cacheKeyOf(data) {
    if (!data) return '';
    if (data.jobId) return String(data.jobId);
    const t = normKey(data.title);
    // Un título demasiado corto no es una clave fiable (colisiones entre
    // vacantes distintas). Mejor no cachear que cachear mal.
    if (t.length < 6) return '';
    return 't:' + t + '|' + normKey(data.company);
  }

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
    const ck = cacheKeyOf(d);
    if (ck && FETCH_CACHE[ck]) {
      // Incluir el idioma cacheado en el hash es lo que dispara el
      // re-etiquetado: al resolverse la vacante, el hash cambia y processCard
      // deja de reusar el '??' anterior.
      h += '|CACHE:' + FETCH_CACHE[ck];
    } else {
      const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
      const desc = panelDescriptionFor(card, d, document);
      if (desc && desc.trim()) h += '|D:' + desc.replace(/\s+/g, ' ').slice(0, 120);
    }
    return h;
  }

  // ── Emparejamiento tarjeta ↔ panel de detalle (v0.5.5) ─────────────────────
  // Devuelve la descripción del panel derecho SOLO si corresponde a ESTA
  // tarjeta. Lo usan hashOf() y makeGetDescription() a propósito: si los dos no
  // aplican exactamente el mismo criterio, el hash no cambia al abrir la
  // vacante, processCard reusa el '??' previo y tagCard nunca corre.
  function panelDescriptionFor(card, data, document) {
    if (!card || !data || !document || !selectors.getDetailDescription) return '';

    // Ruta A (UI legacy / panel): coincidencia por jobId.
    if (data.jobId) {
      if (!selectors.getActiveJobId) return '';
      return (selectors.getActiveJobId(document) === data.jobId)
        ? selectors.getDetailDescription(document)
        : '';
    }

    // Ruta B (UI 2026): la tarjeta de la lista no expone jobId → emparejar por
    // título, con la empresa como desempate cuando ambas se conocen.
    if (!selectors.getDetailTitle) return '';
    const panelTitle = normKey(selectors.getDetailTitle(document));
    if (!panelTitle || normKey(data.title) !== panelTitle) return '';
    const panelCompany = normKey(selectors.getDetailCompany ? selectors.getDetailCompany(document) : '');
    const cardCompany = normKey(data.company);
    if (panelCompany && cardCompany && panelCompany !== cardCompany) return '';
    return selectors.getDetailDescription(document);
  }

  // ── getDescription para el panel de detalle (T1.9) ─────────────────────────
  // Devuelve la descripción del panel SOLO si la tarjeta es la activa; si no,
  // string vacío (el classify cae a título+empresa). Así el retro-etiquetado
  // usa el texto completo y confiable de la vacante abierta.
  function makeGetDescription(doc) {
    return function (jobId, card) {
      const document = doc || (card && card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
      if (!document) return '';
      if (!card) return '';
      // Mismo criterio que hashOf() — ver panelDescriptionFor().
      const data = selectors.extractFromCard(card);
      if (jobId && !data.jobId) data.jobId = jobId;
      return panelDescriptionFor(card, data, document);
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

    const url = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + jobId;
    if (typeof fetch === 'function') {
      fetch(url)
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

  // Helper de debug: solo loguea si ?llfdebug=1 está en la URL
  function _dbg() {
    if (typeof window !== 'undefined' && window.location && window.location.search &&
        window.location.search.indexOf('llfdebug=1') !== -1) {
      console.log.apply(console, ['[LJF]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function classify(card, getDescription) {
    const data = selectors.extractFromCard(card);
    data.langSource = 'title';

    _dbg('classify', { jobId: data.jobId, title: data.title, company: data.company, modality: data.modality });

    // 1. Capa primordial: Si la tarjeta es la activa y el DOM tiene el panel de detalle abierto, usar esa descripción (máxima prioridad)
    if (typeof getDescription === 'function') {
      const desc = getDescription(data.jobId, card) || '';
      if (desc && desc.trim()) {
        _dbg('  → getDescription returned', desc.length, 'chars, first 120:', desc.slice(0, 120));
        const descRes = detector.detectLanguage(desc);
        _dbg('  → desc detectLanguage:', { lang: descRes.lang, hitsEs: descRes.hitsEs, hitsEn: descRes.hitsEn });
        if (descRes.lang === 'es' || descRes.lang === 'en') {
          data.description = selectors.cleanText(desc);
          data.lang = descRes.lang;
          data.isAmbiguous = false;
          data.langSource = 'description';
          // v0.5.5: la clave cae a título+empresa cuando no hay jobId (UI 2026),
          // así lo resuelto al abrir la vacante persiste en su tarjeta.
          const ck1 = cacheKeyOf(data);
          if (ck1) FETCH_CACHE[ck1] = descRes.lang;
          _dbg('  → FINAL from description:', data.lang, '(FETCH_CACHE key:', ck1 + ')');
          return data;
        }
      }
    }

    // 2. Capa de caché en memoria (fetch previo o panel ya leído)
    const ck2 = cacheKeyOf(data);
    if (ck2 && FETCH_CACHE[ck2]) {
      data.lang = FETCH_CACHE[ck2];
      data.langSource = (ck2.indexOf('t:') === 0) ? 'panel-cache' : 'async-fetch';
      _dbg('  → FETCH_CACHE hit:', data.lang, '(key:', ck2 + ')');
      return data;
    }

    // 3. Capa de detección por título + empresa + modalidad
    const detInput = (data.title || '') + ' ' + (data.company || '');
    const detRes = detector.detectLanguage(detInput, { modality: data.modality });
    data.lang = detRes.lang;
    data.isAmbiguous = detRes.isAmbiguous || false;

    _dbg('  → detectLanguage:', { input: detInput.slice(0, 80), lang: detRes.lang, isAmbiguous: !!detRes.isAmbiguous, hitsEs: detRes.hitsEs, hitsEn: detRes.hitsEn, accentHits: detRes.accentHits });

    if ((data.lang === 'unknown' || detRes.isAmbiguous) && data.jobId) {
      const document = (card && card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
      _dbg('  → fetchJobDetail dispatched for jobId:', data.jobId);
      fetchJobDetail(data.jobId, card, document);
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

  // ── Descubrimiento de tarjetas (v0.5.4: migración UI LinkedIn 2026) ────────
  // Contexto (investigación forense completa en la nota interna
  // "linkedin_ui_2026_migration"; el resumen operativo está acá abajo):
  //   • Las tarjetas de la lista izquierda YA NO tienen <a> ni data-job-id.
  //     Son DIVs con click handlers y clases CSS ofuscadas (_983b42c3, …).
  //   • El único ancla estable es el botón ✕ de descartar, identificado por su
  //     aria-label ("Descartar empleo «título»" / "Dismiss job «title»").
  //   • Entre la tarjeta visual y el contenedor de la lista hay wrappers con
  //     `display:contents` (0x0, SIN caja de layout). Etiquetar uno de esos
  //     wrappers inyecta el badge en el DOM pero NO lo hace visible sobre la
  //     tarjeta: sin caja, `position:relative` no aplica y el badge absoluto se
  //     ancla a un ancestro lejano (o al viewport), amontonándose fuera de la
  //     tarjeta. Ese era el bug de v0.5.3.
  //
  // Invariante usada para delimitar UNA tarjeta (no depende de clases CSS):
  //   la tarjeta es el ancestro MÁS EXTERNO del botón ✕ que sigue conteniendo
  //   UN SOLO botón ✕ y que además tiene caja de layout propia.
  var DISMISS_SEL =
    'button[aria-label^="Descartar empleo"], button[aria-label^="Dismiss job"], ' +
    'button[aria-label^="Descartar el empleo"], button[aria-label^="Ocultar empleo"]';
  var MAX_CLIMB = 25;

  // ¿El elemento genera caja de layout propia? (display:contents / detached => no)
  function hasLayoutBox(el) {
    if (!el) return false;
    if (typeof el.offsetWidth !== 'number' || typeof el.offsetHeight !== 'number') return false;
    return el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  // display:contents es el patrón que usa la UI 2026 para los wrappers 0x0.
  function isDisplayContents(el) {
    if (!el) return false;
    try {
      var doc = el.ownerDocument;
      var win = doc && (doc.defaultView || doc.parentWindow);
      if (!win || !win.getComputedStyle) return false;
      var st = win.getComputedStyle(el);
      return !!st && st.display === 'contents';
    } catch (e) {
      return false;
    }
  }

  // Cuerpo de la descripción del panel derecho: sirve de tope al subir desde el
  // botón ✕ del panel de detalle (que tiene UN solo ✕ en todo el panel y, sin
  // este tope, haría que la "tarjeta" fuese el panel entero).
  var DETAIL_BODY_SEL = '#job-details, .jobs-description, .jobs-description__content, .jobs-box__html-content';

  // Sube desde el ancla (botón ✕) hasta el borde de la tarjeta.
  function cardFromAnchor(anchor, anchorSel, detailBody) {
    if (!anchor || !anchor.parentElement) return null;
    var el = anchor;
    var boxed = null; // ancestro más externo CON caja de layout
    var solid = null; // ancestro más externo que NO es display:contents (fallback)
    for (var i = 0; i < MAX_CLIMB; i++) {
      var parent = el.parentElement;
      if (!parent || !parent.querySelectorAll) break;
      // Si el padre ya agrupa varias tarjetas (o ninguna), el borde está en `el`.
      if (parent.querySelectorAll(anchorSel).length !== 1) break;
      // Tope del panel de detalle: no absorber el cuerpo de la descripción.
      if (detailBody && parent.contains && parent.contains(detailBody) &&
          !(el.contains && el.contains(detailBody))) break;
      el = parent;
      if (hasLayoutBox(el)) boxed = el;
      if (!isDisplayContents(el)) solid = el;
    }
    // Preferencia: caja real > no-display:contents > último ancestro válido.
    // (En jsdom/tests no hay layout: offsetWidth es siempre 0 y gana `solid`.)
    return boxed || solid || (el !== anchor ? el : null);
  }

  // Resuelve solapamientos: si un candidato contiene a otro, se queda el más
  // interno (evita la "mega-tarjeta" con todos los badges fusionados).
  function dedupeCards(cands) {
    var uniq = [];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c || !c.tagName) continue;
      if (uniq.indexOf(c) === -1) uniq.push(c);
    }
    var out = [];
    for (var j = 0; j < uniq.length; j++) {
      var cand = uniq[j];
      var containsOther = false;
      for (var k = 0; k < uniq.length; k++) {
        if (k === j) continue;
        if (cand.contains && cand !== uniq[k] && cand.contains(uniq[k])) { containsOther = true; break; }
      }
      if (!containsOther) out.push(cand);
    }
    return out;
  }

  // Devuelve todas las tarjetas etiquetables del root (UI 2026 + legacy).
  // Las tres capas se UNEN (no se cortocircuitan) para no perder el panel de
  // detalle de la derecha ni la UI legacy si LinkedIn hace A/B testing.
  function getDomCards(root) {
    if (!root || !root.querySelectorAll) return [];
    var cands = [];

    // ── Capa 1 (UI 2026): ancla de accesibilidad (botón ✕ de descartar) ──
    // Se resuelve UNA vez el cuerpo de la descripción (tope del panel derecho)
    // para no pagar un querySelector por nivel y por ancla.
    var detailBody = root.querySelector ? root.querySelector(DETAIL_BODY_SEL) : null;
    var anchors = root.querySelectorAll(DISMISS_SEL);
    for (var i = 0; i < anchors.length; i++) {
      var card = cardFromAnchor(anchors[i], DISMISS_SEL, detailBody);
      if (card) cands.push(card);
    }

    // ── Capa 2 (legacy): data-job-id ──
    var dataCards = root.querySelectorAll('[data-job-id]');
    for (var j = 0; j < dataCards.length; j++) cands.push(dataCards[j]);

    // ── Capa 3 (legacy): enlaces a la vacante ──
    var links = root.querySelectorAll('a[href*="/jobs/view/"]');
    for (var k = 0; k < links.length; k++) {
      var c = (links[k].closest && (links[k].closest('[data-job-id]') || links[k].closest('li'))) || null;
      if (c) cands.push(c);
    }

    return dedupeCards(cands);
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
      // v0.5.4: las tarjetas de la UI 2026 NO tienen data-job-id, así que el
      // ancla del badge se marca explícitamente con esta clase. Sin ella el
      // badge (position:absolute) se ancla a un ancestro lejano y no se ve.
      '.' + CLS.host + '{position:relative !important;}\n' +
      '.llf-badge{position:absolute !important;top:8px !important;right:40px !important;z-index:2147483647;' +
      'display:inline-flex !important;align-items:center !important;gap:3px !important;padding:1px 6px;border-radius:4px;' +
      'font-size:11px;font-weight:700;color:#fff;font-family:inherit;' +
      'line-height:1.4;pointer-events:none;}\n' +
      '.llf-reporter-btn{pointer-events:auto !important;cursor:pointer !important;display:inline-block;' +
      'opacity:0.85;font-size:10px;margin-left:2px;user-select:none;}\n' +
      '.llf-reporter-btn:hover{opacity:1.0;transform:scale(1.2);}\n' +
      '.llf-beta-banner{position:fixed !important;bottom:18px !important;right:18px !important;z-index:2147483647 !important;' +
      'display:flex !important;align-items:center !important;gap:10px !important;padding:8px 14px !important;border-radius:20px !important;' +
      'background:rgba(15, 23, 42, 0.92) !important;backdrop-filter:blur(10px) !important;border:1px solid rgba(255, 255, 255, 0.15) !important;' +
      'box-shadow:0 8px 24px rgba(0, 0, 0, 0.35) !important;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;' +
      'font-size:12px !important;color:#f8fafc !important;line-height:1.2 !important;transition:all 0.3s ease !important;}\n' +
      '.llf-beta-banner-stats{display:flex !important;align-items:center !important;gap:6px !important;}\n' +
      '.llf-beta-chip{padding:2px 7px !important;border-radius:10px !important;font-weight:700 !important;font-size:11px !important;color:#fff !important;}\n' +
      '.llf-beta-chip-es{background:#0284c7 !important;}\n' +
      '.llf-beta-chip-en{background:#16a34a !important;}\n' +
      '.llf-beta-chip-unk{background:#64748b !important;}\n' +
      '.llf-beta-confirm-btn{display:inline-flex !important;align-items:center !important;gap:4px !important;padding:5px 12px !important;' +
      'border-radius:14px !important;background:linear-gradient(135deg, #10b981 0%, #059669 100%) !important;color:#ffffff !important;' +
      'font-weight:600 !important;font-size:12px !important;cursor:pointer !important;border:none !important;' +
      'box-shadow:0 2px 8px rgba(16, 185, 129, 0.3) !important;transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;user-select:none !important;}\n' +
      '.llf-beta-confirm-btn:hover{transform:translateY(-1px) scale(1.03) !important;box-shadow:0 4px 14px rgba(16, 185, 129, 0.5) !important;' +
      'background:linear-gradient(135deg, #34d399 0%, #059669 100%) !important;}\n' +
      '.llf-beta-confirm-btn:active{transform:translateY(0) scale(0.98) !important;}\n';
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ── La tarjeta debe ser el bloque contenedor del badge (position:relative) ──
  // v0.5.4: en la UI 2026 no hay data-job-id, así que la regla CSS
  // `[data-job-id]{position:relative}` no aplica y el badge absoluto se anclaba
  // a un ancestro lejano (invisible sobre la tarjeta). Se re-verifica en cada
  // pase porque LinkedIn puede reescribir className al re-renderizar.
  function ensureBadgeHost(card) {
    if (card && card.classList && !card.classList.contains(CLS.host)) {
      card.classList.add(CLS.host);
    }
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
      ensureStyles(document);
      ensureBadgeHost(card);
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
      
      const config = (opts && opts.config) || CONFIG;
      const isBeta = config.betaReportingEnabled;

      let badgeLabelNode = badge.querySelector('.llf-badge-label');
      if (!badgeLabelNode) {
        badgeLabelNode = document.createElement('span');
        badgeLabelNode.className = 'llf-badge-label';
        badge.appendChild(badgeLabelNode);
      }
      badgeLabelNode.textContent = b.label;
      badge.style.cssText = 'background:' + b.color + ';';

      let reporterBtn = badge.querySelector('.llf-reporter-btn');
      if (isBeta) {
        if (!reporterBtn) {
          reporterBtn = document.createElement('span');
          reporterBtn.className = 'llf-reporter-btn';
          reporterBtn.setAttribute('title', 'Reportar clasificación errónea (copiar JSON fixture)');
          reporterBtn.textContent = '⚠️';
          badge.appendChild(reporterBtn);

          reporterBtn.addEventListener('click', function (evt) {
            if (evt && evt.stopPropagation) evt.stopPropagation();
            if (evt && evt.preventDefault) evt.preventDefault();
            const currentLang = data.lang;
            const expectedLang = currentLang === 'es' ? 'en' : (currentLang === 'en' ? 'es' : 'es');
            const desc = data.description || (selectors.getDetailDescription ? selectors.getDetailDescription(document) : '');

            // Captura instantánea del conteo total y por idioma en el momento exacto del clic
            let pageStats = null;
            if (document && document.querySelectorAll) {
              const allCards = getDomCards(document);
              let esCount = 0, enCount = 0, unkCount = 0;
              for (let i = 0; i < allCards.length; i++) {
                const l = allCards[i].getAttribute ? allCards[i].getAttribute('data-llf-lang') : '';
                if (l === 'es') esCount++;
                else if (l === 'en') enCount++;
                else if (l === 'unknown') unkCount++;
              }
              pageStats = {
                totalCards: allCards.length,
                esCount: esCount,
                enCount: enCount,
                unknownCount: unkCount,
              };
            }

            const extraMeta = {
              timestamp: new Date().toISOString(),
              url: (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : '',
            };

            const fixture = selectors.extractJobFixture ? selectors.extractJobFixture(card, currentLang, expectedLang, desc, pageStats, extraMeta) : {};
            sendReportPayload(fixture, {}, function (err, source) {
              if (!err && source === 'http') {
                reporterBtn.textContent = '✅';
                setTimeout(function () { reporterBtn.textContent = '⚠️'; }, 1500);
              } else if (source === 'clipboard') {
                reporterBtn.textContent = '📋';
                setTimeout(function () { reporterBtn.textContent = '⚠️'; }, 1500);
              }
            });
          });
        }
      } else if (reporterBtn) {
        if (reporterBtn.remove) reporterBtn.remove();
        else if (reporterBtn.parentNode) reporterBtn.parentNode.removeChild(reporterBtn);
      }
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

    _dbg('processCard', { jobId: selectors.extractFromCard(card).jobId, prevHash: (prevHash || '').slice(0, 40), hash: h.slice(0, 40), prevLang: prevLang, force: !!opts.force });

    // v0.5.4: la idempotencia por hash NO alcanza. LinkedIn re-renderiza el
    // interior de la tarjeta (React/Ember) y se lleva el badge, pero deja
    // intactos los atributos data-llf-* del nodo: con solo mirar el hash la
    // tarjeta quedaba "procesada" y sin badge para siempre. Si el badge no
    // está en el DOM, hay que reponerlo.
    const hasBadge = (card.querySelector) ? !!card.querySelector('.llf-badge') : true;

    let data;
    if (!opts.force && prevHash === h && prevLang && hasBadge) {
      data = { lang: prevLang, jobId: (selectors.extractFromCard(card).jobId) };
      _dbg('  → HASH MATCH, reusing prevLang:', prevLang);
    } else {
      if (opts.force || prevHash !== h) {
        if (card.setAttribute) card.setAttribute('data-llf-lang', '');
      }
      data = tagCard(card, getDescription, doc, opts);
      // Solo congelar el idioma previo si el resultado actual es 'unknown' SIN ser
      // una tarjeta ambigua (isAmbiguous). Si es ambigua, hay un fetch en vuelo que
      // la resolverá — no pisar el '??' con el ES/EN anterior incorrecto.
      if (data.lang === 'unknown' && !data.isAmbiguous && (prevLang === 'es' || prevLang === 'en')) {
        _dbg('  → FREEZE prevLang:', prevLang, '(unknown + !isAmbiguous)');
        data.lang = prevLang;
      }
      if (data.lang === 'unknown' && data.isAmbiguous) {
        _dbg('  → AMBIGUOUS, NOT freezing (fetch in flight)');
      }
      if (card.setAttribute) card.setAttribute('data-llf-hash', h);
      _dbg('  → FINAL lang:', data.lang, 'source:', data.langSource || 'processCard');
    }

    // SIEMPRE aplicar la acción (label/dim/hide), incluso si el hash no cambió
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    ensureStyles(document);
    ensureBadgeHost(card); // idempotente: repone la clase si LinkedIn la borró
    applyAction(card, data, document, opts.config);
    return data;
  }

  // ── Renderizado del Banner Flotante de Validación de Página (B.5.1) ────────
  function renderBetaSuccessBanner(doc, opts) {
    opts = opts || {};
    const config = opts.config || CONFIG;
    const document = doc || (typeof window !== 'undefined' ? window.document : null);
    if (!document || !document.createElement) return;

    let banner = document.querySelector('.llf-beta-banner');
    if (!config.betaReportingEnabled) {
      if (banner) {
        if (banner.remove) banner.remove();
        else if (banner.parentNode) banner.parentNode.removeChild(banner);
      }
      return;
    }

    ensureStyles(document);

    const fixture = selectors.extractPageSuccessFixture ? selectors.extractPageSuccessFixture(document) : { pageStats: { totalCards: 0, esCount: 0, enCount: 0, unknownCount: 0 } };
    const stats = fixture.pageStats || { totalCards: 0, esCount: 0, enCount: 0, unknownCount: 0 };

    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'llf-beta-banner';
      banner.innerHTML =
        '<div class="llf-beta-banner-stats">' +
          '<span class="llf-beta-chip llf-beta-chip-es" title="Vacantes en Español">ES: <b class="llf-cnt-es">0</b></span>' +
          '<span class="llf-beta-chip llf-beta-chip-en" title="Vacantes en Inglés">EN: <b class="llf-cnt-en">0</b></span>' +
          '<span class="llf-beta-chip llf-beta-chip-unk" title="Vacantes Dudosas">??: <b class="llf-cnt-unk">0</b></span>' +
        '</div>' +
        '<button class="llf-beta-confirm-btn" type="button" title="Confirmar que todas las clasificaciones de esta página son 100% correctas">' +
          '✅ Validar Página OK' +
        '</button>';

      const btn = banner.querySelector('.llf-beta-confirm-btn');
      if (btn) {
        btn.addEventListener('click', function (evt) {
          if (evt && evt.stopPropagation) evt.stopPropagation();
          if (evt && evt.preventDefault) evt.preventDefault();
          reportPageSuccess(document, {}, function (err, source) {
            if (!err && source === 'http') {
              btn.textContent = '✨ ¡Página Confirmada!';
            } else if (source === 'clipboard' || source === 'prompt') {
              btn.textContent = '📋 ¡Fixture Copiado!';
            }
            setTimeout(function () {
              btn.textContent = '✅ Validar Página OK';
            }, 2000);
          });
        });
      }

      const parentNode = document.body || document.documentElement;
      if (parentNode && parentNode.appendChild) {
        parentNode.appendChild(banner);
      }
    }

    const esNode = banner.querySelector('.llf-cnt-es');
    const enNode = banner.querySelector('.llf-cnt-en');
    const unkNode = banner.querySelector('.llf-cnt-unk');
    if (esNode) esNode.textContent = stats.esCount;
    if (enNode) enNode.textContent = stats.enCount;
    if (unkNode) unkNode.textContent = stats.unknownCount;
  }

  const LAST_ERRORS = [];
  function processAll(root, opts) {
    opts = opts || {};
    if (!root || !root.querySelectorAll) return [];
    const list = getDomCards(root).filter(isJobCardContainer);
    LAST_ERRORS.length = 0;
    const res = list.map(function (card, i) {
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
    const document = root.ownerDocument || (typeof window !== 'undefined' ? window.document : root);
    renderBetaSuccessBanner(document, opts);
    return res;
  }

  // ── Cambiar config en caliente y reprocesar (T1.8: conmutable) ──────────────
  function setConfig(partial, doc, opts) {
    opts = opts || {};
    if (partial && typeof partial === 'object') {
      if (partial.targetLang) CONFIG.targetLang = partial.targetLang;
      if (partial.mode) CONFIG.mode = partial.mode;
      if (typeof partial.betaReportingEnabled !== 'undefined') CONFIG.betaReportingEnabled = !!partial.betaReportingEnabled;
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

    const banner = document.querySelector('.llf-beta-banner');
    if (banner) {
      if (banner.remove) banner.remove();
      else if (banner.parentNode && banner.parentNode.removeChild) banner.parentNode.removeChild(banner);
    }

    const badges = document.querySelectorAll('.llf-badge');
    const list = Array.prototype.slice.call(badges);
    list.forEach(function (b) {
      if (b.remove) b.remove();
      else if (b.parentNode && b.parentNode.removeChild) b.parentNode.removeChild(b);
    });

    // v0.5.4: en la UI 2026 las tarjetas no tienen data-job-id; se limpian por
    // las marcas propias (data-llf-*) y por la clase host del badge.
    const cards = document.querySelectorAll(
      '[data-llf-lang],[data-llf-hash],.' + CLS.host + ',[data-job-id]'
    );
    Array.prototype.slice.call(cards).forEach(function (card) {
      if (!isJobCardContainer(card)) return;
      if (card.removeAttribute) {
        card.removeAttribute('data-llf-lang');
        card.removeAttribute('data-llf-hash');
      }
      if (card.classList) card.classList.remove(CLS.hidden, CLS.dim, CLS.host);
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

  // ── Emisión y reporte de feedback / telemetría (B.5.2) ──────────────────
  function sendReportPayload(fixture, opts, callback) {
    opts = opts || {};
    const jsonStr = typeof fixture === 'string' ? fixture : JSON.stringify(fixture, null, 2);
    const endpoint = opts.endpoint || 'http://localhost:3100/report';

    function copyToClipboardFallback(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          if (typeof callback === 'function') callback(null, 'clipboard');
        }).catch(function (err) {
          if (typeof prompt !== 'undefined') prompt('Copia el JSON Fixture de feedback:', text);
          if (typeof callback === 'function') callback(err || new Error('Clipboard failed'), 'prompt');
        });
      } else if (typeof prompt !== 'undefined') {
        prompt('Copia el JSON Fixture de feedback:', text);
        if (typeof callback === 'function') callback(null, 'prompt');
      } else {
        if (typeof callback === 'function') callback(new Error('No clipboard/prompt available'), 'none');
      }
    }

    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
      })
      .then(function (res) {
        if (res.ok) {
          if (typeof callback === 'function') callback(null, 'http');
        } else {
          copyToClipboardFallback(jsonStr);
        }
      })
      .catch(function () {
        copyToClipboardFallback(jsonStr);
      });
    } else {
      copyToClipboardFallback(jsonStr);
    }
  }

  function reportPageSuccess(doc, extraMeta, callback) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    const fixture = selectors.extractPageSuccessFixture ? selectors.extractPageSuccessFixture(root, extraMeta) : { type: 'page_success' };
    sendReportPayload(fixture, {}, callback);
    return fixture;
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
    getDomCards: getDomCards,
    extract: selectors.extractFromCard,
    hashOf: hashOf,
    makeGetDescription: makeGetDescription,
    sendReportPayload: sendReportPayload,
    reportPageSuccess: reportPageSuccess,
    LAST_ERRORS: LAST_ERRORS,
    CONFIG: CONFIG,
    BADGE: BADGE,
    CLS: CLS,
  };
});
