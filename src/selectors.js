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
    const anyA = card.querySelector('a');
    if (anyA) {
      const t = (anyA.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    return '';
  }

  function companyFromCard(card) {
    const sub = card.querySelector && card.querySelector('.artdeco-entity-lockup__subtitle');
    if (sub && sub.textContent) return sub.textContent.trim();
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
    let active = root.querySelector('[aria-current="page"]') ||
                 root.querySelector('[aria-current="true"]') ||
                 root.querySelector('.jobs-search-results-list__list-item--active') ||
                 root.querySelector('.job-card-container--active') ||
                 root.querySelector('.job-card-list--active') ||
                 root.querySelector('.jobs-search-results-list__list-item[class*="active"]') ||
                 root.querySelector('.job-card-container[class*="active"]') ||
                 root.querySelector('.job-card-list[class*="active"]');
    if (!active) return null;
    return jobIdFromCard(active);
  }

  // Texto del panel de detalle (columna derecha) para la vacante activa.
  // Busca primero el contenedor de detalle; si no, heuristica sobre <main>.
  function getDetailDescription(root) {
    if (!root || !root.querySelector) return '';
    let detailRoot = root.querySelector('#job-details') ||
                     root.querySelector('.jobs-description') ||
                     root.querySelector('.jobs-description__content') ||
                     root.querySelector('.jobs-details__main-content') ||
                     root.querySelector('.jobs-details') ||
                     root.querySelector('.jobs-search-two-pane__job-details') ||
                     root.querySelector('main');
    return descriptionFromDetail(detailRoot || root);
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
    const cards = root.querySelectorAll('[data-job-id]');
    const out = [];
    const list = (typeof cards.forEach === 'function') ? cards : Array.prototype.slice.call(cards);
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

  function extractDescriptionFromHTML(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return '';
    let match = htmlString.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/div>/i) ||
                htmlString.match(/<div[^>]*class="[^"]*jobs-description[^\"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                htmlString.match(/<div[^>]*class="[^"]*jobs-box__html-content[^\"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                htmlString.match(/<div[^>]*class="[^"]*description[^\"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                htmlString.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                htmlString.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    let rawText = match ? match[1] : htmlString;
    let cleaned = cleanText(rawText.replace(/<[^>]+>/g, ' '));
    if (cleaned.length < 50 && match) {
      cleaned = cleanText(htmlString.replace(/<[^>]+>/g, ' '));
    }
    return cleaned;
  }

  return {
    extractFromCard: extractFromCard,
    descriptionFromDetail: descriptionFromDetail,
    extractDescriptionFromHTML: extractDescriptionFromHTML,
    getActiveJobId: getActiveJobId,
    getDetailDescription: getDetailDescription,
    scanJobs: scanJobs,
    detect: detect,
    cleanText: cleanText,
  };
});
