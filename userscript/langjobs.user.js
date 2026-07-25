// ==UserScript==
// @name         LangJobs — Filtro de vacantes LinkedIn por idioma
// @namespace    https://github.com/agustcord/langjobs
// @version      0.1.0
// @description  Etiqueta y filtra vacantes de LinkedIn por idioma (ES/EN) 100% local, sin enviar datos.
// @author       agustcord
// @match        https://www.linkedin.com/jobs/search/*
// @match        https://www.linkedin.com/jobs/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* LangJobs — build autogenerado por tools/build_userscript.js. No editar a mano. */
(function () {
  'use strict';
  var root = this;

/* ── src/stopwords.js ── */
/*
 * LangJobs — Listas de stopwords funcionales para detección de idioma ES/EN
 * ---------------------------------------------------------------------------
 * Módulo de DATOS puro, sin DOM. Compartido por:
 *   - el userscript de Tampermonkey (Fase 1)
 *   - la extensión Chrome MV3 (Fase 2)
 *   - el harness de pruebas (T1.3)
 * Formato UMD: se puede `require()` en Node y también exponerse como
 * `window.LJF_STOPWORDS` en el navegador, sin paso de build.
 *
 * Diseño según 01_Arquitectura_y_Requisitos#2.3:
 *   1. SOLO palabras funcionales (artículos, preposiciones, conjunciones,
 *      pronombres, determinantes, adverbios de enlace y auxiliares/cópulas de
 *      alta frecuencia). La jerga técnica (sustantivos/verbos de contenido) se
 *      excluye a propósito: una vacante ES llena de "developer, testing,
 *      deployment" debe seguir clasificando como ES por sus funcionales.
 *   2. AMBIGUOUS: palabras que existen en ambos idiomas o son ruido -> se
 *      dejan FUERA de las dos listas para no sesgar (documentadas una a una).
 *   3. Léxico corporativo globalizado (senior, junior, manager, remote,
 *      office, team, full, time, part...) NO se incluye en STOPWORDS_EN:
 *      aparece en vacantes ES constantemente.
 *   4. EXCLUSIVE_ES / EXCLUSIVE_EN: tokens prácticamente imposibles en el otro
 *      idioma. T1.2 les aplica peso doble como desempate (no decisión primaria).
 *   5. Los lookup usan Set para O(1) (arquitectura 2.2).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LJF_STOPWORDS = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /*
   * AMBIGUOUS — excluidas de AMBAS listas (arquitectura 2.3, regla 2).
   * Cada entrada está justificada para que el criterio sea auditable.
   */
  const AMBIGUOUS = new Set([
    'a',     // ES preposición "a"  /  EN artículo indefinido "a"
    'no',    // ES adverbio "no"    /  EN "no"
    'me',    // ES pronombre obj.   /  EN "me"
    'un',    // ES artículo "un"    /  EN "un-" (prefijo) o "un" (= one)
    'si',    // ES conj. "si" (if)  /  EN "si" (yes)
    'he',    // ES "he" (haber)     /  EN "he"
    'la',    // ES artículo "la"    /  EN "LA" (Los Ángeles, etc.)
    'sea',   // ES subjuntivo de ser / EN "sea" (sustantivo)
    'mas',   // ES "mas" (= pero, sin tilde) / EN "mas" / PT "mas"
    'tu',    // ES det. "tu" (your) /  EN "tu" (you, registro informal)
  ]);

  /*
   * STOPWORDS_ES — palabras funcionales en español.
   * Nota: se incluyen las formas conjugadas de los auxiliares/cópulas de alta
   * frecuencia (ser, estar, haber, ir, tener, poder, deber, hacer-como-marcador
   * temporal "hace") porque funcionan como "PEGAMENTO" de la oración y son
   * señal ES segura (no colisionan con ninguna palabra EN).
   */
  const STOPWORDS_ES = new Set([
    // artículos / determinantes
    'el', 'los', 'las', 'lo', 'una', 'unas',
    'este', 'esta', 'esto', 'estos', 'estas',
    'ese', 'esa', 'eso', 'esos', 'esas',
    'aquel', 'aquella', 'aquello', 'aquellos', 'aquellas',
    'mi', 'mis', 'tus', 'su', 'sus',
    'nuestro', 'nuestra', 'nuestros', 'nuestras',
    'vuestro', 'vuestra', 'vuestros', 'vuestras',
    'otro', 'otra', 'otros', 'otras',
    'mismo', 'misma', 'mismos', 'mismas',
    'tal', 'tales', 'cual', 'cuales',
    // preposiciones
    'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'tras', 'durante',
    'mediante', 'hacia', 'hasta', 'desde', 'contra', 'ante', 'bajo', 'entre',
    'según', 'salvo', 'excepto', 'menos',
    // conjunciones
    'y', 'e', 'o', 'u', 'pero', 'sino', 'porque', 'aunque', 'que', 'como',
    'cuando', 'donde', 'mientras', 'pues', 'pese', 'luego', 'conque',
    // pronombres
    'te', 'se', 'nos', 'os', 'le', 'les', 'lo', 'los', 'las',
    'yo', 'tú', 'él', 'ella', 'ellos', 'ellas',
    'nosotros', 'nosotras', 'vosotros', 'vosotras', 'usted', 'ustedes',
    'quien', 'quienes', 'qué', 'cual', 'alguien', 'nadie', 'algo', 'nada', 'todo',
    // auxiliares / cópulas / verbos de enlace (formas conjugadas frecuentes)
    'soy', 'es', 'eres', 'somos', 'son', 'era', 'eras', 'eran', 'sido', 'ser',
    'fue', 'fueron', 'fui', 'fuimos',
    'estoy', 'está', 'estás', 'estamos', 'están',
    'estaba', 'estabas', 'estaban', 'estado', 'estar', 'estuvo', 'estuvieron',
    'ha', 'han', 'hemos', 'habéis', 'había', 'habían', 'haber', 'haya', 'hay', 'hubo',
    'tengo', 'tiene', 'tienes', 'tenemos', 'tienen',
    'tenía', 'tenían', 'tener', 'tuvo', 'tuvieron',
    'hago', 'hace', 'haces', 'hacemos', 'hacen', 'hizo', 'hicieron', 'hacer', 'hecho',
    'voy', 'va', 'vas', 'vamos', 'van', 'iba', 'iban', 'ir', 'ido',
    'puedo', 'puede', 'puedes', 'podemos', 'pueden', 'pudo', 'pudieron', 'poder',
    'digo', 'dice', 'dices', 'decimos', 'dicen', 'dijo', 'dijeron', 'decir', 'dicho',
    'doy', 'da', 'das', 'damos', 'dan', 'dio', 'dieron', 'dar',
    'veo', 've', 'ves', 'vemos', 'ven', 'vio', 'vieron', 'ver', 'visto',
    'sé', 'sabe', 'sabes', 'sabemos', 'saben', 'supo', 'supieron', 'saber',
    'quiero', 'quiere', 'quieres', 'queremos', 'quieren',
    'quiso', 'quisieron', 'querer',
    'debo', 'debe', 'debes', 'debemos', 'deben', 'debió', 'debieron', 'deber',
    // adverbios de enlace / frecuentes
    'muy', 'más', 'menos', 'ya', 'aún', 'aun', 'todavía', 'así', 'aquí',
    'allí', 'allá', 'ahora', 'después', 'antes', 'bien', 'mal', 'casi',
    'cerca', 'lejos', 'siempre', 'nunca', 'jamás', 'quizás', 'quizá', 'acá',
    'apenas', 'solo', 'sólo', 'inclusive', 'incluso',
    'probablemente', 'generalmente', 'especialmente', 'principalmente',
  ]);

  /*
   * STOPWORDS_EN — palabras funcionales en inglés.
   * Se excluye el léxico corporativo globalizado (senior, junior, manager,
   * remote, office, team, full, time, part...) porque no es funcional y aparece
   * en vacantes ES. No se incluye 'a' (ambigua, ver AMBIGUOUS).
   */
  const STOPWORDS_EN = new Set([
    // articles
    'the', 'an',
    // prepositions
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into',
    'about', 'over', 'after', 'before', 'between', 'through', 'during',
    'without', 'within', 'against', 'under', 'upon', 'toward', 'towards',
    'off', 'up', 'down', 'out', 'per', 'via', 'versus', 'until', 'till',
    'onto', 'atop', 'amid', 'amidst',
    // conjunctions
    'and', 'or', 'but', 'if', 'because', 'although', 'while', 'since',
    'unless', 'yet', 'so', 'that', 'whether', 'whereas', 'albeit',
    // pronouns
    'we', 'you', 'they', 'she', 'it', 'i', 'my', 'your', 'our', 'their',
    'this', 'that', 'these', 'those', 'who', 'which', 'what', 'us', 'them',
    'his', 'her', 'its', 'whom', 'whose',
    'oneself', 'myself', 'yourself', 'yourselves', 'ourselves', 'themselves',
    'someone', 'anyone', 'everyone', 'nobody',
    'something', 'anything', 'everything', 'nothing',
    // auxiliaries / modal verbs
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
    'do', 'does', 'did', 'have', 'has', 'had',
    'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    // adverbs
    'not', 'also', 'very', 'more', 'most', 'just', 'only', 'now', 'then',
    'here', 'there', 'when', 'where', 'how', 'why', 'already', 'always',
    'never', 'often', 'usually', 'well', 'too', 'much', 'many', 'such',
    'quite', 'rather', 'even', 'still', 'again', 'once', 'twice',
    'nearly', 'almost', 'perhaps', 'maybe',
    'however', 'therefore', 'furthermore', 'moreover',
    'thus', 'hence', 'otherwise', 'instead',
  ]);

  /*
   * EXCLUSIVE_* — tokens casi imposibles en el otro idioma.
   * T1.2 les aplica peso doble como desempate (arquitectura 2.3, regla 4).
   * No son la decisión primaria: un párrafo ES con pocas funcionales pero
   * muchas de estas sigue ganando; un párrafo EN con una que otra no se sesga.
   */
  const EXCLUSIVE_ES = new Set([
    'según', 'través', 'además', 'será', 'años',
    'también', 'tampoco', 'ningún', 'ninguna', 'nadie', 'sino',
    'hacia', 'jamás', 'cuál', 'dónde', 'cuándo', 'quién', 'cómo', 'acá', 'allá',
  ]);
  const EXCLUSIVE_EN = new Set([
    'through', 'should', 'would', 'which', 'while', 'whether', 'whom', 'whose',
    'yourself', 'yourselves', 'ourselves', 'themselves',
    'furthermore', 'however', 'therefore', 'among', 'amongst', 'upon',
    'whereas', 'albeit', 'unto', 'whence', 'wherein', 'whereby',
  ]);

  return { AMBIGUOUS, STOPWORDS_ES, STOPWORDS_EN, EXCLUSIVE_ES, EXCLUSIVE_EN };
}));


/* ── src/detector.js ── */
/*
 * LangJobs — Detector de idioma por stopwords funcionales (función PURA)
 * ---------------------------------------------------------------------------
 * Módulo de lógica puro, SIN DOM. Compartido por:
 *   - el userscript de Tampermonkey (Fase 1)
 *   - la extensión Chrome MV3 (Fase 2)
 *   - el harness de pruebas (T1.3)
 * Formato UMD: require() en Node, o window.LJF_DETECTOR en el navegador.
 *
 * Depende de src/stopwords.js (mismas reglas de la sección 2.3):
 *   - Solo palabras funcionales (artículos, preposiciones, conjunciones,
 *     pronombres, auxiliares/cópulas).
 *   - Tokens "exclusivos" (casi imposibles en el otro idioma) valen doble
 *     como desempate (arquitectura 2.3, regla 4).
 *   - Señal de refuerzo: presencia de acentos/ñ/¿/¡ (arquitectura 2.2, paso 6).
 *
 * Algoritmo según arquitectura 2.2:
 *   1. Normalizar (minúsculas, conservar tildes y ñ, quitar puntuación/dígitos)
 *   2. Tokenizar por espacios
 *   3. Contar hits en STOPWORDS_ES / STOPWORDS_EN (Set, O(1))
 *   4. Puntajes relativos = hitsPonderados / totalTokens
 *   5. Decidir con MIN_HITS (fail-open) + MARGEN (decisión por proporción)
 *   6. Refuerzo por acentos como desempate (no decisión primaria)
 */

(function (root, factory) {
  const sw = (typeof module === 'object' && module.exports)
    ? require('./stopwords.js')
    : root.LJF_STOPWORDS;
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(sw);
  } else {
    root.LJF_DETECTOR = factory(sw);
  }
}(typeof self !== 'undefined' ? self : this, function (SW) {
  'use strict';

  // --- Constantes de decisión (tunables en T1.11) ---
  // MIN_HITS: con < este nº de palabras funcionales, no hay señal suficiente
  //           -> fail-open (no filtrar). Protege títulos cortos (C03/C04).
  const MIN_HITS = 3;
  // MARGEN: un idioma debe superar al otro por este factor (en proporción de
  // hits) para decidir. > 1 => estricto: empates/cercanos caen en 'unknown'
  // (fail-open, arquitectura 2.2). 1.4 porque el inglés densifica más palabras
  // funcionales por token; con menos margen un bilingüe 50/50 sesgaría a EN.
  const MARGEN = 1.4;

  // Caracteres de refuerzo ES (arquitectura 2.2, paso 6). El EN no los usa.
  const ES_ACCENT_RE = /[áéíóúñ¿¡]/;
  const ES_ACCENT_CLASS_RE = /[áéíóúñ¿¡ü]/g;

  /**
   * Peso de un token:
   *   - exclusivo del idioma -> 2 (vale doble, arquitectura 2.3 regla 4)
   *   - funcional normal     -> 1
   *   - otro                 -> 0
   * Un token que es a la vez funcional y exclusivo se cuenta como 2 (es señal
   * fuerte: p.ej. "según", "través" están en ambas listas).
   */
  function weightedHit(token, functionalSet, exclusiveSet) {
    if (exclusiveSet.has(token)) return 2;
    if (functionalSet.has(token)) return 1;
    return 0;
  }

  /**
   * normalizar: minúsculas, NFC (decomposición canónica estable), quita
   * cualquier cosa que no sea letra ni espacio, colapsa espacios.
   * Conserva tildes y ñ (son señal fuerte de español, arquitectura 2.2 paso 1).
   */
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFC')
      .replace(/[^\p{L}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(normalized) {
    return normalized.length ? normalized.split(' ') : [];
  }

  /**
   * detectLanguage(texto) -> { lang, scoreEs, scoreEn, hitsEs, hitsEn,
   *                            totalTokens, accentHits }
   *
   * lang: 'es' | 'en' | 'unknown'  (unknown = no filtrar, fail-open)
   * scoreEs / scoreEn: proporción de hits ponderados sobre el total de tokens.
   * Los campos extra (hitsEs, hitsEn, totalTokens, accentHits) son diagnósticos
   * para el harness de T1.3; el contrato mínimo del roadmap es {lang, scoreEs, scoreEn}.
   */
  function detectLanguage(text) {
    const normalized = normalize(text);
    const tokens = tokenize(normalized);
    const totalTokens = tokens.length;

    let hitsEs = 0;   // funcionales ES (sin exclusivo)
    let hitsEn = 0;   // funcionales EN (sin exclusivo)
    let weightedEs = 0;
    let weightedEn = 0;
    let accentHits = 0;

    if (totalTokens === 0) {
      return { lang: 'unknown', scoreEs: 0, scoreEn: 0,
               hitsEs: 0, hitsEn: 0, totalTokens: 0, accentHits: 0 };
    }

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (SW.STOPWORDS_ES.has(t)) hitsEs++;
      if (SW.STOPWORDS_EN.has(t)) hitsEn++;
      weightedEs += weightedHit(t, SW.STOPWORDS_ES, SW.EXCLUSIVE_ES);
      weightedEn += weightedHit(t, SW.STOPWORDS_EN, SW.EXCLUSIVE_EN);
    }

    // Refuerzo ES por acentos/ñ/¿/¡ (desempate, no primario).
    // Cuenta clases distintas presentes (no repeticiones) para no sesgar por
    // longitud; tope 3. Se suma al scoreEs para que un texto ES corto con
    // tildes gane empates cerrados frente a EN (arquitectura 2.2 paso 6).
    const accentMatches = normalized.match(ES_ACCENT_CLASS_RE);
    if (accentMatches) {
      accentHits = Math.min(new Set(accentMatches).size, 3);
      weightedEs += accentHits;
    }

    // Puntajes relativos (proporción de hits sobre el total de tokens).
    // Usamos proporción (no conteo bruto) porque el inglés densifica más
    // palabras funcionales por token; comparar pesos absolutos sesgaría a EN
    // en textos 50/50 (ver caso X04 del corpus -> fail-open por diseño).
    const scoreEs = weightedEs / totalTokens;
    const scoreEn = weightedEn / totalTokens;

    // Decisión (arquitectura 2.2 paso 5: por proporción con margen)
    // 1) Sin suficiente señal funcional -> fail-open (no filtrar)
    if (hitsEs + hitsEn < MIN_HITS) {
      return { lang: 'unknown', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    // 2) Un idioma supera al otro por el MARGEN en proporción -> se decide
    if (scoreEs > scoreEn * MARGEN) {
      return { lang: 'es', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    if (scoreEn > scoreEs * MARGEN) {
      return { lang: 'en', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    // 3) Empate/cercano -> fail-open (preferimos mostrar de más a ocultar mal)
    return { lang: 'unknown', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
  }

  return { detectLanguage, normalize, tokenize, MIN_HITS, MARGEN };
}));


/* ── src/selectors.js ── */
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
  function titleFromCard(card) {
    const link = card.querySelector && card.querySelector('a.job-card-list__title--link');
    if (link) {
      const aria = link.getAttribute && link.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      // fallback al texto fuerte
      const strong = link.querySelector && link.querySelector('strong');
      if (strong && strong.textContent) return strong.textContent.trim();
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
    return (card.getAttribute && card.getAttribute('data-job-id')) || '';
  }

  // Descripción: capa estructural (.mt4 > p[dir="ltr"]), luego .mt4, luego
  // heurística (nodo con más texto en el root de detalle).
  function descriptionFromDetail(detailRoot) {
    if (!detailRoot || !detailRoot.querySelector) return '';
    const exact = detailRoot.querySelector('.mt4 > p[dir="ltr"]');
    if (exact && exact.textContent && exact.textContent.trim()) return exact.textContent;
    const mt4 = detailRoot.querySelector('.mt4');
    if (mt4 && mt4.textContent && mt4.textContent.trim()) return mt4.textContent;
    // Heurística: máxima densidad de texto entre hijos directos.
    let best = '';
    let bestLen = 0;
    const children = detailRoot.children || [];
    for (const child of children) {
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

  // ── API pública ────────────────────────────────────────────────────────────

  // Extrae título/empresa/ubicación de UNA tarjeta (capa semántica + estructural).
  function extractFromCard(card) {
    return {
      jobId: jobIdFromCard(card),
      title: cleanText(titleFromCard(card)),
      company: cleanText(companyFromCard(card)),
      location: cleanText(locationFromCard(card)),
    };
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

  return {
    extractFromCard: extractFromCard,
    descriptionFromDetail: descriptionFromDetail,
    scanJobs: scanJobs,
    detect: detect,
    cleanText: cleanText,
  };
});


/* ── src/app.js ── */
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



  // ── Bootstrap del userscript (solo en navegador) ─────────────────────────
  function boot() {
    if (typeof LangJobsApp === 'undefined') return;
    // T1.6: modo "solo etiquetar" (sin ocultar). El filtrado llega en T1.8.
    LangJobsApp.run(document, {});
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
}).call(window);
