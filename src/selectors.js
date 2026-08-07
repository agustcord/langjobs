/*
 * LangJobs — Selectores del DOM de LinkedIn en capas (T1.5)
 * ---------------------------------------------------------------------------
 * Módulo UMD compartido (userscript / extensión / tests). NO crea el DOM:
 * recibe nodos (inyección) para poder testearlo en Node sin jsdom.
 *
 * Capas (de 04_Selectores_DOM.md):
 *   1) Semántica (estable): [data-job-id], a[aria-label] (título),
 *      [aria-label^="Descartar"].
 *   2) Estructural (respaldo): .job-card-container, .artdeco-entity-lockup__subtitle
 *      (empresa), .job-card-container__metadata-wrapper li (ubicación),
 *      .mt4 > p[dir="ltr"] (descripción).
 *   3) Heurística (último recurso): mayor densidad de texto.
 *
 * En el navegador: scanJobs(document). En tests: scanJobs(mockRoot).
 * Los nodos mock solo necesitan querySelector/querySelectorAll/textContent.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./detector.js'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./detector.js'));
  } else {
    root.LangJobsSelectors = factory(root.LangJobsDetector);
  }
})(typeof self !== 'undefined' ? self : this, function (detector) {
  'use strict';

  const detectLanguage = detector.detectLanguage;

  // ── Helpers de capa ──────────────────────────────────────────────────────

  // Capa semántica: aria-label del <a> de título (más fiable que el texto).
  // En el DOM real de LinkedIn el título puede estar como textContent directo
  // del <a>, dentro de un <strong>, o como aria-label (solo la tarjeta activa).
  // Por eso leemos textContent como respaldo principal, no solo <strong>.
  function titleFromCard(card) {
    if (!card || !card.querySelector) return '';
    const link = card.querySelector('a.job-card-list__title--link') ||
                 card.querySelector('a.job-card-container__link') ||
                 card.querySelector('.job-card-list__title') ||
                 card.querySelector('.job-card-container__title') ||
                 card.querySelector('.artdeco-entity-lockup__title') ||
                 card.querySelector('a[aria-label]');
    if (link) {
      const t = (link.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t;
      const aria = link.getAttribute && link.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
    }
    const strong = card.querySelector('strong');
    if (strong && strong.textContent && strong.textContent.trim()) {
      return strong.textContent.replace(/\s+/g, ' ').trim();
    }
    // CAPA M4 (UI 2026): el título viaja en el aria-label del botón ✕
    // ("Descartar empleo «Título»"). Va ANTES del fallback genérico de <a>
    // porque en la UI 2026 el único <a> que puede haber dentro de la tarjeta es
    // el logo/CTA de la empresa.
    const dismissBtn = card.querySelector(DISMISS_SEL_S);
    if (dismissBtn) {
      const fromAria = titleFromDismissAria(dismissBtn);
      if (fromAria) return fromAria;
    }
    // NUEVA CAPA M3: buscar enlace directamente usando el anclaje
    const anyA = card.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId="]') || card.querySelector('a');
    if (anyA) {
      const t = (anyA.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    // CAPA M4 (2026): primer <p> con texto sustancial como último recurso,
    // saltando el ruido de UI ("Promocionado", "Postulación sencilla", …).
    var allP = card.querySelectorAll('p');
    for (var pi = 0; pi < allP.length; pi++) {
      var ptxt = (allP[pi].textContent || '').replace(/\s+/g, ' ').trim();
      if (ptxt.length <= 3 || ptxt.length >= 120) continue;
      if (isUiNoise(ptxt)) continue;
      return ptxt;
    }
    return '';
  }

  // Ruido de UI de LinkedIn (siempre en el idioma de la interfaz, NUNCA del
  // aviso): si se colara en el texto a clasificar sesgaría el detector.
  // Medido en campo (2026-08-06, 25 tarjetas): las tarjetas de la UI 2026
  // traen 61 líneas de texto extra y TODAS son chrome de interfaz
  // ("Publicado hace 5 meses", "Evaluando solicitudes de forma activa",
  // "Solicitados", "·"). Están en el idioma de la INTERFAZ, así que colarlas al
  // detector sesgaría todo hacia ES — justo el error que oculta vacantes
  // válidas en modo hide. De ahí que este filtro sea deliberadamente amplio.
  // Coincidencia EXACTA: separadores, el texto del propio badge y etiquetas de
  // una sola palabra. Van aparte a propósito: como prefijo, "es"/"en" harían
  // match con "Especialista" o "Encargado" y se perdería el título.
  const UI_NOISE_EXACT_RE = new RegExp(
    '^(·|•|-|—|\\||es|en|\\?\\?|nuevo|new|visto|viewed|guardar|guardado|save|saved|' +
    'solicitados?|solicitantes?|applicants?|promocionado|promoted|respuesta)$', 'i'
  );
  // Coincidencia por PREFIJO: frases de interfaz completas.
  const UI_NOISE_PREFIX_RE = new RegExp(
    '^(patrocinad|postulación sencilla|postulacion sencilla|solicitud sencilla|easy apply|' +
    'verificado|verified|ver empleo|ver oferta|contratación activa|contratacion activa|' +
    'actively (reviewing|hiring)|revisado por|se busca|publicad|posted|evaluando|reviewing|' +
    'postulad|candidat|hace \\d|\\d+ (día|dia|hora|semana|mes|day|hour|week|month))', 'i'
  );
  function isUiNoise(t) {
    const s = (t || '').trim();
    if (!s) return true;
    return UI_NOISE_EXACT_RE.test(s) || UI_NOISE_PREFIX_RE.test(s);
  }

  // Una "línea" = texto de un elemento hoja visible de la tarjeta, en orden DOM.
  // Es la única forma de leer título/empresa en la UI 2026: las clases CSS están
  // ofuscadas y no hay <a> ni atributos semánticos dentro de la tarjeta.
  function textLinesFromCard(card) {
    if (!card || !card.querySelectorAll) return [];
    const out = [];
    const nodes = card.querySelectorAll('p, span, div, strong, h1, h2, h3, li');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.children && n.children.length > 0) continue; // solo hojas
      if (n.closest && n.closest('button, .llf-badge')) continue;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 120) continue;
      if (out.indexOf(t) === -1) out.push(t);
    }
    return out;
  }

  // ¿La línea parece ubicación/metadato en lugar de nombre de empresa?
  function looksLikeLocation(t) {
    if (!t) return true;
    if (/[()]/.test(t)) return true;                       // "Rosario (Híbrido)"
    if (/(remoto|remote|híbrido|hibrido|hybrid|presencial|on-?site)/i.test(t)) return true;
    if (/^\d/.test(t)) return true;
    if (/(jornada|full[- ]time|part[- ]time|contrato|pasantía|pasantia|internship)/i.test(t)) return true;
    return false;
  }

  function companyFromCard(card) {
    const sub = card && card.querySelector && card.querySelector('.artdeco-entity-lockup__subtitle');
    if (sub && sub.textContent && sub.textContent.trim()) return sub.textContent.trim();

    // CAPA 2026: la empresa es la línea inmediatamente posterior al título.
    // Conservador a propósito: si la candidata parece ubicación o ruido de UI,
    // se devuelve '' (mejor clasificar solo por título que envenenar la señal).
    const lines = textLinesFromCard(card);
    if (!lines.length) return '';
    const title = (titleFromCard(card) || '').replace(/\s+/g, ' ').trim();
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (title && (lines[i] === title || lines[i].indexOf(title) === 0)) { idx = i; break; }
    }
    for (let j = idx + 1; j < lines.length; j++) {
      const t = lines[j];
      if (title && t === title) continue;
      if (isUiNoise(t)) continue;
      if (looksLikeLocation(t)) return '';
      return t;
    }
    return '';
  }

  function locationFromCard(card) {
    // Selectores simples encadenados (más robustos + testeables sin jsdom).
    const meta = card.querySelector && card.querySelector('.job-card-container__metadata-wrapper');
    if (!meta) return '';
    const li = meta.querySelector && meta.querySelector('li');
    if (!li) return '';
    const span = li.querySelector && li.querySelector('span');
    if (span && span.textContent) return span.textContent;
    // fallback: texto directo del <li>
    if (li.textContent) return li.textContent;
    return '';
  }

  function jobIdFromCard(card) {
    if (!card) return '';
    if (card.getAttribute && card.getAttribute('data-job-id')) {
      return card.getAttribute('data-job-id');
    }
    const child = card.querySelector && card.querySelector('[data-job-id]');
    if (child && child.getAttribute && child.getAttribute('data-job-id')) {
      return child.getAttribute('data-job-id');
    }
    const parent = card.closest && card.closest('[data-job-id]');
    if (parent && parent.getAttribute && parent.getAttribute('data-job-id')) {
      return parent.getAttribute('data-job-id');
    }
    
    // NUEVA CAPA M3: Extracción desde URL
    let link = null;
    if (card.tagName && card.tagName.toLowerCase() === 'a' && card.href && (card.href.indexOf('/jobs/view/') !== -1 || card.href.indexOf('currentJobId=') !== -1)) {
        link = card;
    } else if (card.querySelector) {
        link = card.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId="]');
    }
    
    if (link) {
        const href = link.getAttribute('href') || link.href || '';
        let match = href.match(/\/jobs\/view\/([0-9]+)/);
        if (match) return match[1];
        
        match = href.match(/currentJobId=([0-9]+)/);
        if (match) return match[1];
    }

    // ── CAPA 2026 PRINCIPAL (medida en campo el 2026-08-06) ──────────────────
    // El id SÍ sobrevive en la UI nueva, en un atributo plano de un div interno
    // de la tarjeta (nivel L9 del mapa del DOM):
    //     componentkey="job-card-component-ref-4376922531"
    // Es un atributo, no una propiedad de React: se lee desde un content script
    // en world AISLADO, sin tocar el manifest ni interceptar tráfico. Con esto
    // vuelve a funcionar la Capa 4 (fetch de la descripción) en la lista.
    const CK_ATTRS = '[componentkey],[componentKey],[data-component-key],[data-componentkey]';
    const ckNodes = [];
    if (card.matches && card.matches(CK_ATTRS)) ckNodes.push(card);
    if (card.querySelectorAll) {
      const found = card.querySelectorAll(CK_ATTRS);
      for (let ci = 0; ci < found.length; ci++) ckNodes.push(found[ci]);
    }
    for (let ci = 0; ci < ckNodes.length; ci++) {
      const n = ckNodes[ci];
      const raw = (n.getAttribute('componentkey') || n.getAttribute('componentKey') ||
                   n.getAttribute('data-component-key') || n.getAttribute('data-componentkey') || '');
      if (!raw) continue;
      // Forma exacta observada primero; después variantes ref/id; nunca un
      // número suelto sin la palabra "job" delante (evita capturar tracking ids).
      let m = raw.match(/^job-card-component-ref-(\d{5,14})$/i) ||
              raw.match(/job[a-z-]*(?:ref|id)[-_:](\d{5,14})/i) ||
              raw.match(/^job[a-z-]*?(\d{5,14})$/i);
      if (m) return m[1];
    }

    // CAPA 2026 (respaldo): el id puede aparecer en atributos de tracking
    // (urn:li:jobPosting:NNN, data-occludable-job-id, …). Se exige un contexto
    // explícito para no capturar cualquier número de la tarjeta.
    const holders = [card];
    const holder = card.querySelector && card.querySelector(
      '[data-occludable-job-id],[data-job-posting-id],[data-entity-urn],[data-tracking-urn]'
    );
    if (holder) holders.push(holder);
    for (let hi = 0; hi < holders.length; hi++) {
      const h = holders[hi];
      if (!h || !h.getAttributeNames || !h.getAttribute) continue;
      const names = h.getAttributeNames();
      for (let ni = 0; ni < names.length; ni++) {
        const name = names[ni];
        if (name === 'class' || name === 'style' || name.indexOf('aria-') === 0) continue;
        const val = h.getAttribute(name) || '';
        if (!val) continue;
        const ctx = val.match(/(?:jobPosting[:/]|jobs\/view\/|currentJobId=)(\d{5,14})/);
        if (ctx) return ctx[1];
        if (name.indexOf('job') !== -1 && /^\d{5,14}$/.test(val)) return val;
      }
    }

    return '';
  }

  // Descripción: capa estructural (#job-details, .jobs-description__content, etc.)
  function descriptionFromDetail(detailRoot) {
    if (!detailRoot || !detailRoot.querySelector) return '';

    // 1. Capa primordial: buscar específicamente el contenedor del cuerpo de la vacante.
    let container = null;
    const isDescNode = function (node) {
      if (!node) return false;
      if (node.id === 'job-details') return true;
      if (node.matches && node.matches('#job-details, .jobs-description__content, .jobs-description-content__text, .jobs-box__html-content, .jobs-description')) return true;
      const c = (typeof node.className === 'string') ? node.className : (node.getAttribute ? node.getAttribute('class') || '' : '');
      if (c.includes('jobs-description') || c.includes('jobs-box__html-content')) return true;
      return false;
    };

    if (isDescNode(detailRoot)) {
      container = detailRoot;
    } else {
      container = detailRoot.querySelector('#job-details') ||
                  detailRoot.querySelector('.jobs-description__content') ||
                  detailRoot.querySelector('.jobs-description-content__text') ||
                  detailRoot.querySelector('.jobs-box__html-content') ||
                  detailRoot.querySelector('.jobs-description');
    }

    if (container && container.textContent && container.textContent.trim()) {
      return container.textContent;
    }

    // 2. Si no hay contenedor explícito #job-details, buscar elementos dentro de detailRoot,
    // pero EXCLUYENDO cualquier sub-árbol que pertenezca a la cabecera top-card.
    const candidates = detailRoot.querySelectorAll ? detailRoot.querySelectorAll('p[dir="ltr"], [dir="ltr"], .mt4') : [];
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (cand.closest && cand.closest('.jobs-unified-top-card, .jobs-details__top-card, .jobs-unified-top-card__content')) {
        continue; // Ignorar metadatos de UI de la cabecera (ej: "Promocionado por técnico de selección")
      }
      const text = (cand.textContent || '').trim();
      if (text.length > 30) {
        return text;
      }
    }

    // 3. Heurística: máxima densidad de texto excluyendo top-card.
    let best = '';
    let bestLen = 0;
    const children = detailRoot.querySelectorAll ? detailRoot.querySelectorAll('div, section, article') : [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.closest && child.closest('.jobs-unified-top-card, .jobs-details__top-card, .jobs-unified-top-card__content')) continue;
      const t = (child.textContent || '').trim();
      if (t.length > bestLen) { bestLen = t.length; best = t; }
    }
    return best;
  }

  // Normaliza espacios/entidades básicas del textContent aplanado.
  function cleanText(t) {
    return (t || '')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function modalityFromCard(card) {
    if (!card) return 'desconocido';
    let text = (card.textContent || '') + ' ' + (card.innerHTML || '');
    if (card.parentElement && card.parentElement.textContent) {
      text += ' ' + card.parentElement.textContent;
    }
    const norm = text.toLowerCase().normalize('NFC');
    if (norm.includes('híbrido') || norm.includes('hibrido') || norm.includes('hybrid')) {
      return 'hibrido';
    }
    if (norm.includes('presencial') || norm.includes('on-site') || norm.includes('onsite')) {
      return 'presencial';
    }
    if (norm.includes('en remoto') || norm.includes('remoto') || norm.includes('remote')) {
      return 'remoto';
    }
    return 'desconocido';
  }

  // ── API pública ────────────────────────────────────────────────────────────

  // Extrae título/empresa/ubicación/modalidad de UNA tarjeta.
  function extractFromCard(card) {
    const loc = cleanText(locationFromCard(card));
    return {
      jobId: jobIdFromCard(card),
      title: cleanText(titleFromCard(card)),
      company: cleanText(companyFromCard(card)),
      location: loc,
      modality: modalityFromCard(card),
    };
  }

  // ID de la tarjeta activa en la lista (la que muestra el panel de detalle).
  // Busca por aria-current="page", aria-current="true", o clases activas de la tarjeta.
  function getActiveJobId(root) {
    if (!root || !root.querySelector) return null;

    // v0.5.7: la URL PRIMERO. Es la fuente más confiable de qué vacante está
    // abierta en el panel, y no depende del DOM. Antes se probaba
    // [aria-current="page"] primero, que en la UI 2026 puede ser un ítem de
    // navegación (no una tarjeta) y devolver un id equivocado o vacío.
    const hrefFirst = (root.location && root.location.href) ||
                      (root.defaultView && root.defaultView.location && root.defaultView.location.href) ||
                      (typeof window !== 'undefined' && window.location ? window.location.href : '');
    const mFirst = String(hrefFirst || '').match(/currentJobId=(\d+)/);
    if (mFirst) return mFirst[1];

    let active = root.querySelector('[aria-current="page"]') ||
                 root.querySelector('[aria-current="true"]') ||
                 root.querySelector('.jobs-search-results-list__list-item--active') ||
                 root.querySelector('.job-card-container--active') ||
                 root.querySelector('.job-card-list--active') ||
                 root.querySelector('.jobs-search-results-list__list-item[class*="active"]') ||
                 root.querySelector('.job-card-container[class*="active"]') ||
                 root.querySelector('.job-card-list[class*="active"]');
                 
    // NUEVA CAPA M3: Fallback para A/B testing minificado
    if (!active) {
        const activeLink = root.querySelector('a[href*="/jobs/view/"][aria-current="page"]') || 
                           root.querySelector('a[href*="/jobs/view/"][aria-current="true"]');
        if (activeLink) active = activeLink.closest('li') || activeLink.closest('div') || activeLink;
    }
    
    if (active) {
      const id = jobIdFromCard(active);
      if (id) return id;
    }

    // CAPA 2026: la UI nueva no marca la tarjeta activa con aria-current ni con
    // clases legibles, pero la URL SIEMPRE lleva la vacante abierta en el panel
    // derecho: /jobs/search-results/?currentJobId=NNN
    const href = (root.location && root.location.href) ||
                 (root.defaultView && root.defaultView.location && root.defaultView.location.href) ||
                 (typeof window !== 'undefined' && window.location ? window.location.href : '');
    const m = String(href || '').match(/currentJobId=(\d+)/);
    if (m) return m[1];

    return null;
  }

  // Selector compartido del botón ✕ (único ancla estable de la UI 2026).
  const DISMISS_SEL_S =
    'button[aria-label^="Descartar empleo"], button[aria-label^="Descartar el empleo"], ' +
    'button[aria-label^="Dismiss job"], button[aria-label^="Ocultar empleo"]';

  function titleFromDismissAria(btn) {
    if (!btn || !btn.getAttribute) return '';
    const aria = btn.getAttribute('aria-label') || '';
    const m = aria.match(/[«“"'‘](.+?)[»”"'’]/);
    if (m && m[1]) return m[1].trim();
    return aria
      .replace(/^Descartar (el )?empleo\s*/i, '')
      .replace(/^Ocultar empleo\s*/i, '')
      .replace(/^Dismiss job\s*/i, '')
      .trim();
  }

  // Título de la vacante ABIERTA en el panel derecho (v0.5.5).
  // Necesario porque en la UI 2026 las tarjetas de la lista no tienen jobId:
  // el emparejamiento tarjeta ↔ panel se hace por título.
  function getDetailTitle(root) {
    if (!root || !root.querySelector) return '';

    // Capa 1 (legacy): clases del top-card del panel de detalle.
    const legacy = root.querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobs-details-top-card__job-title'
    );
    if (legacy && legacy.textContent && legacy.textContent.trim()) return cleanText(legacy.textContent);

    // Capa 2 (2026 + legacy): el único <a> a /jobs/view/ vive en el panel.
    const link = root.querySelector('a[href*="/jobs/view/"]');
    if (link) {
      const t = cleanText(link.textContent);
      if (t) return t;
      const aria = link.getAttribute && link.getAttribute('aria-label');
      if (aria && aria.trim()) return cleanText(aria);
    }

    // Capa 3 (2026): el ✕ del panel es el que comparte ancestro con el cuerpo
    // de la descripción, y su ancestro contiene UN SOLO ✕ (los de la lista van
    // de a uno por tarjeta, en otra rama del DOM).
    const body = root.querySelector('#job-details, .jobs-description, .jobs-description__content');
    if (body) {
      let node = body.parentElement;
      for (let hops = 0; node && hops < 6; hops++) {
        if (node.querySelectorAll && node.querySelectorAll(DISMISS_SEL_S).length === 1) {
          const t = titleFromDismissAria(node.querySelector(DISMISS_SEL_S));
          if (t) return cleanText(t);
        }
        node = node.parentElement;
      }
    }
    return '';
  }

  // Empresa de la vacante abierta en el panel (desempate de títulos repetidos).
  function getDetailCompany(root) {
    if (!root || !root.querySelector) return '';
    const legacy = root.querySelector(
      '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name'
    );
    if (legacy && legacy.textContent && legacy.textContent.trim()) return cleanText(legacy.textContent);
    const link = root.querySelector('a[href*="/company/"]');
    if (link) {
      const t = cleanText(link.textContent);
      if (t && t.length < 80) return t;
    }
    return '';
  }

  // ¿El texto es en realidad la LISTA de vacantes y no una descripción?
  // Las tarjetas repiten cadenas de interfaz ("Publicado hace…", "Evaluando
  // solicitudes…", "Solicitados"). Si aparecen varias veces, lo que se capturó
  // es la lista entera, que está en el idioma de la interfaz y arruinaría la
  // detección de cualquier aviso en inglés.
  function looksLikeJobList(text) {
    const low = (text || '').toLowerCase();
    const marcas = ['publicado hace', 'evaluando solicitudes', 'postulación sencilla',
                    'postulacion sencilla', 'solicitud sencilla', 'promocionado'];
    let total = 0;
    for (let i = 0; i < marcas.length; i++) {
      let desde = 0;
      let pos = low.indexOf(marcas[i], desde);
      while (pos !== -1) {
        total++;
        if (total >= 3) return true;
        desde = pos + marcas[i].length;
        pos = low.indexOf(marcas[i], desde);
      }
    }
    return false;
  }

  // Delimita el panel de detalle en la UI 2026, donde no hay clases semánticas.
  // Discriminador medido en campo: el panel contiene el ÚNICO enlace
  // a[href*="/jobs/view/"] de la página y CERO botones de descartar (los 25 ✕
  // están en las tarjetas de la lista, en otra rama del DOM). Así se acota la
  // búsqueda al panel y nunca se cae en la lista.
  function detailPaneFromLink(root) {
    if (!root || !root.querySelector) return null;
    const link = root.querySelector('a[href*="/jobs/view/"]');
    if (!link) return null;
    let el = link;
    let mejor = null;
    for (let i = 0; i < 12; i++) {
      const parent = el.parentElement;
      if (!parent || !parent.querySelectorAll) break;
      if (parent.querySelectorAll(DISMISS_SEL_S).length > 0) break; // ya toca la lista
      el = parent;
      if ((el.textContent || '').length > 200) mejor = el;
    }
    return mejor;
  }

  // Texto del panel de detalle (columna derecha) para la vacante activa.
  // v0.5.7 — BUG CORREGIDO (causa probable de las etiquetas ES equivocadas):
  // antes, si no encontraba un contenedor de detalle, caía a `main` y de ahí a
  // una heurística de "mayor densidad de texto" sobre TODO el documento. En la
  // UI 2026 el bloque de texto más grande de la página es la LISTA de vacantes,
  // con toda su interfaz en español. Resultado: la "descripción" de la vacante
  // abierta era en realidad el listado, el detector decía 'es', y ese valor
  // quedaba cacheado — así que la tarjeta se marcaba ES y ya no había forma de
  // corregirla ni abriéndola.
  // Ahora: contenedores explícitos → panel acotado de la UI 2026 → '' (nada de
  // adivinar sobre el documento completo).
  function getDetailDescription(root) {
    if (!root || !root.querySelector) return '';
    const explicito = root.querySelector('#job-details') ||
                      root.querySelector('.jobs-description__content') ||
                      root.querySelector('.jobs-description') ||
                      root.querySelector('.jobs-box__html-content') ||
                      root.querySelector('.jobs-details__main-content');
    let texto = '';
    if (explicito) {
      texto = descriptionFromDetail(explicito);
    } else {
      const pane = detailPaneFromLink(root);
      if (pane) texto = descriptionFromDetail(pane);
    }
    if (!texto) return '';
    // Red de seguridad final: si lo capturado parece la lista, se descarta.
    if (looksLikeJobList(texto)) return '';
    return texto;
  }

  // Detecta idioma de un texto (usa el detector puro).
  function detect(text) {
    return detectLanguage(text);
  }

  // Recorre todas las tarjetas [data-job-id] en `root` y, si se pasa
  // `getDescription(jobId, card)` que devuelva el texto del detalle, detecta
  // el idioma de la descripción. Devuelve array de resultados.
  //    scanJobs(document)                              -> sin descripción
  //    scanJobs(document, (id, card) => detailText)    -> con idioma de descripción
  function scanJobs(root, getDescription) {
    if (!root || !root.querySelectorAll) return [];
    
    let list = [];
    
    // NUEVA CAPA M3: Usar el anclaje href para localizar las tarjetas PRIMERO
    const links = root.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]');
    const uniqueCards = [];
    const linkList = (typeof links.forEach === 'function') ? links : Array.prototype.slice.call(links);
    linkList.forEach(function(link) {
       let li = link.closest('li');
       if (!li) {
          li = link.parentElement;
          if (li && li.parentElement && li.parentElement.querySelectorAll('a[href*="currentJobId="], a[href*="/jobs/view/"]').length === 1) {
              li = li.parentElement;
          }
       }
       if (li && uniqueCards.indexOf(li) === -1) {
         uniqueCards.push(li);
       }
    });
    
    if (uniqueCards.length > 0) {
      list = uniqueCards;
    } else {
      let cards = root.querySelectorAll('[data-job-id]');
      if (cards.length > 0) {
        list = (typeof cards.forEach === 'function') ? cards : Array.prototype.slice.call(cards);
      }
    }
    
    const out = [];
    list.forEach(function (card) {
      const base = extractFromCard(card);
      const result = {
        jobId: base.jobId,
        title: base.title,
        company: base.company,
        location: base.location,
        description: '',
        lang: 'unknown',
        langSource: 'none',
      };
      let text = '';
      if (typeof getDescription === 'function') {
        const desc = getDescription(base.jobId, card) || '';
        result.description = cleanText(desc);
        text = result.description;
        result.langSource = 'description';
      } else {
        // Sin detalle: intenta con título+empresa (menos fiable; el detector
        // dará 'unknown' en títulos cortos a propósito).
        text = base.title + ' ' + base.company;
        result.langSource = 'title';
      }
      result.lang = detect(text).lang;
      out.push(result);
    });
    return out;
  }

  // Chrome de la página pública de LinkedIn. Está en el idioma de la INTERFAZ
  // del visitante (español, en este caso), así que si se cuela en el texto que
  // va al detector, cualquier aviso en inglés termina clasificado como español.
  const GUEST_CHROME = [
    'iniciar sesión', 'inicia sesión', 'regístrate', 'crear cuenta', 'crear una cuenta',
    'empleos similares', 'ver más empleos', 'aviso de privacidad', 'política de cookies',
    'condiciones de uso', 'accesibilidad', 'sign in', 'join now', 'similar jobs',
    'privacy policy', 'cookie policy', 'user agreement',
  ];
  function looksLikeGuestChrome(text) {
    const low = (text || '').toLowerCase();
    let hits = 0;
    for (let i = 0; i < GUEST_CHROME.length; i++) {
      if (low.indexOf(GUEST_CHROME[i]) !== -1) hits++;
      if (hits >= 2) return true;
    }
    return false;
  }

  // Extrae la descripción de la respuesta del endpoint público de la vacante.
  // v0.5.7: endurecido. Antes había patrones abiertos del tipo
  //   /<div[^>]*id="job-details"[^>]*>([\s\S]*?)$/
  // que capturaban desde ese punto hasta el FINAL del documento: menú, footer,
  // "Empleos similares", avisos legales… todo en español. Con eso, un aviso en
  // inglés se clasificaba 'es' y el resultado quedaba cacheado.
  // Criterio nuevo: ante la duda, devolver '' y dejar la vacante en '??'.
  // Un '??' honesto es mejor que una etiqueta equivocada y persistente.
  function extractDescriptionFromHTML(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return '';
    const match =
      // Contenedor real de la descripción en la página pública (el habitual).
      htmlString.match(/<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      htmlString.match(/<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i) ||
      // Variantes del DOM autenticado, todas ACOTADAS por su cierre.
      htmlString.match(/<div[^>]*class="[^"]*jobs-description-content__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      htmlString.match(/<div[^>]*class="[^"]*jobs-box__html-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      htmlString.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/section>/i);
    if (!match) return '';
    const cleaned = cleanText(match[1].replace(/<[^>]+>/g, ' '));
    if (cleaned.length < 50) return '';
    // Tope de tamaño: una descripción real no pasa de unos miles de caracteres.
    // Si es enorme, se capturó media página y el texto no es confiable.
    if (cleaned.length > 30000) return '';
    if (looksLikeGuestChrome(cleaned)) return '';
    return cleaned;
  }

  // Extrae el objeto JSON Fixture para el Modo Beta / Feedback Reporter
  function extractJobFixture(card, badgedLang, expectedLang, descSnippet, pageStats, extraMeta) {
    const base = extractFromCard(card);
    const fixture = {
      jobId: base.jobId || '',
      title: base.title || '',
      company: base.company || '',
      modality: base.modality || 'desconocido',
      badgedLang: badgedLang || 'unknown',
      expectedLang: expectedLang || (badgedLang === 'es' ? 'en' : 'es'),
      descriptionSnippet: cleanText(descSnippet || '').slice(0, 300),
      timestamp: (extraMeta && extraMeta.timestamp) || (new Date().toISOString()),
      url: (extraMeta && extraMeta.url) || (typeof window !== 'undefined' && window.location ? window.location.href : ''),
    };
    if (pageStats && typeof pageStats === 'object') {
      fixture.pageStatsAtReport = pageStats;
    }
    return fixture;
  }

  // Extrae el objeto JSON Fixture para la validación de página completa 100% OK (page_success)
  function extractPageSuccessFixture(doc, extraMeta) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    const jobIds = [];
    let totalCards = 0;
    let esCount = 0;
    let enCount = 0;
    let unknownCount = 0;

    if (root && root.querySelectorAll) {
      // CAPA 2026 (prioritaria): contar por la marca propia. Es la única que
      // funciona en las dos UIs, porque las tarjetas nuevas no tienen
      // data-job-id ni enlaces a la vacante.
      let cards = root.querySelectorAll('[data-llf-lang]');
      if (cards.length === 0) cards = root.querySelectorAll('[data-job-id]');
      let list = [];
      if (cards.length > 0) {
        list = (typeof cards.forEach === 'function') ? cards : Array.prototype.slice.call(cards);
      } else {
        const links = root.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]');
        const unique = [];
        for(let i=0; i<links.length; i++) {
          let c = links[i].closest('li');
          if (!c) {
            c = links[i].parentElement;
            if (c && c.parentElement && c.parentElement.querySelectorAll('a[href*="currentJobId="]').length === 1) {
                c = c.parentElement;
            }
          }
          if (c && unique.indexOf(c) === -1) unique.push(c);
        }
        list = unique;
      }
      
      totalCards = list.length;
      for (let i = 0; i < list.length; i++) {
        const card = list[i];
        const jId = jobIdFromCard(card);
        if (jId && jobIds.indexOf(jId) === -1) {
          jobIds.push(jId);
        }
        const lang = card.getAttribute ? card.getAttribute('data-llf-lang') : '';
        if (lang === 'es') esCount++;
        else if (lang === 'en') enCount++;
        else unknownCount++;
      }
    }

    return {
      type: 'page_success',
      timestamp: (extraMeta && extraMeta.timestamp) || (new Date().toISOString()),
      url: (extraMeta && extraMeta.url) || (typeof window !== 'undefined' && window.location ? window.location.href : ''),
      pageStats: {
        totalCards: totalCards,
        esCount: esCount,
        enCount: enCount,
        unknownCount: unknownCount,
      },
      jobIds: jobIds,
      verifiedBy: (extraMeta && extraMeta.verifiedBy) || 'user_confirm',
    };
  }

  return {
    extractFromCard: extractFromCard,
    extractJobFixture: extractJobFixture,
    extractPageSuccessFixture: extractPageSuccessFixture,
    descriptionFromDetail: descriptionFromDetail,
    extractDescriptionFromHTML: extractDescriptionFromHTML,
    looksLikeGuestChrome: looksLikeGuestChrome,
    looksLikeJobList: looksLikeJobList,
    getActiveJobId: getActiveJobId,
    getDetailTitle: getDetailTitle,
    getDetailCompany: getDetailCompany,
    getDetailDescription: getDetailDescription,
    scanJobs: scanJobs,
    detect: detect,
    cleanText: cleanText,
  };
});
