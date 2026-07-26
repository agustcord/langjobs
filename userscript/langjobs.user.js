// ==UserScript==
// @name         LangJobs — Filtro de vacantes LinkedIn por idioma
// @namespace    https://github.com/agustcord/langjobs
// @version      0.5.2
// @description  Etiqueta y filtra vacantes de LinkedIn por idioma (ES/EN) 100% local, sin enviar datos.
// @author       agustcord
// @match        https://www.linkedin.com/jobs/*
// @match        https://linkedin.com/jobs/*
// @updateURL    https://raw.githubusercontent.com/agustcord/langjobs/main/userscript/langjobs.user.js
// @downloadURL  https://raw.githubusercontent.com/agustcord/langjobs/main/userscript/langjobs.user.js
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
    root.LangJobsStopwords = factory();
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
 */

(function (root, factory) {
  const sw = (typeof module === 'object' && module.exports)
    ? require('./stopwords.js')
    : root.LangJobsStopwords;
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(sw);
  } else {
    root.LangJobsDetector = factory(sw);
  }
}(typeof self !== 'undefined' ? self : this, function (SW) {
  'use strict';

  const MIN_HITS = 2;
  const MARGEN = 1.4;

  const ES_ACCENT_CLASS_RE = /[áéíóúñ¿¡ü]/g;

  const ROLE_ES = new Set([
    'analista', 'lider', 'líder', 'ejecutivo', 'comercial', 'contable', 'procesos',
    'desarrollador', 'programador', 'ingeniero', 'diseñador', 'ventas', 'marketing',
    'recepcionista', 'operario', 'operador', 'administrativo', 'contador', 'abogado', 'médico',
    'enfermero', 'docente', 'profesor', 'auxiliar', 'tecnico', 'técnico', 'gestor',
    'coordinador', 'supervisor', 'encargado', 'responsable', 'asesor', 'consultor',
    'especialista', 'representante', 'cajero', 'mozo', 'cadete', 'chofer', 'conductor',
    'redactor', 'periodista', 'vendedor', 'cobrador', 'secretario', 'jefe', 'empleado',
    'gestion', 'gestión', 'direccion', 'dirección', 'seleccion', 'selección', 'operacion', 'operación', 'atencion', 'atención',
    'soporte', 'mantenimiento',
  ]);
  const ROLE_EN = new Set([
    'analyst', 'leader', 'executive', 'commercial', 'accountant', 'process',
    'developer', 'engineer', 'sales', 'marketing', 'receptionist',
    'operator', 'administrative', 'accountant', 'lawyer', 'doctor', 'nurse',
    'teacher', 'professor', 'assistant', 'technician', 'manager', 'coordinator',
    'supervisor', 'officer', 'advisor', 'consultant', 'specialist', 'representative',
    'cashier', 'waiter', 'driver', 'recruiter',
    'lead', 'tech', 'writer', 'copywriter', 'pricing', 'researcher', 'founder', 'strategist', 'support', 'success', 'growth',
    'editor', 'designer', 'motion', 'video', 'product',
    'software', 'architect', 'contractor', 'system', 'systems', 'data', 'cloud', 'devops', 'fullstack', 'backend', 'frontend', 'ai',
  ]);

  function roleHint(tokens) {
    let es = 0, en = 0;
    for (const t of tokens) {
      if (ROLE_ES.has(t)) es++;
      if (ROLE_EN.has(t)) en++;
    }
    if (es > en) return 'es';
    if (en > es) return 'en';
    return null;
  }

  function weightedHit(token, functionalSet, exclusiveSet) {
    if (exclusiveSet.has(token)) return 2;
    if (functionalSet.has(token)) return 1;
    return 0;
  }

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

  function detectLanguage(text, opts) {
    opts = opts || {};
    const normalized = normalize(text);
    const tokens = tokenize(normalized);
    const totalTokens = tokens.length;

    let hitsEs = 0;
    let hitsEn = 0;
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

    const accentMatches = normalized.match(ES_ACCENT_CLASS_RE);
    if (accentMatches) {
      accentHits = Math.min(new Set(accentMatches).size, 3);
      weightedEs += accentHits;
    }

    const scoreEs = weightedEs / totalTokens;
    const scoreEn = weightedEn / totalTokens;

    const hint = roleHint(tokens);

    // Regla de Oro de Diacríticos y Roles en Español (v0.4.3):
    // Si el texto contiene roles en español (ej: "Lider", "Jefe", "Soporte") o tildes (y NO es un rol de inglés),
    // y la señal de stopwords de inglés es débil (hitsEn <= 1, ej. la sigla "IT"), es 100% ESPAÑOL.
    if ((hint === 'es' || (accentHits >= 1 && hint !== 'en')) && hitsEn <= 1) {
      return { lang: 'es', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    // Heurística de modalidad (v0.4.4 - Opción B):
    // Si el puesto tiene modalidad Híbrido o Presencial pero el título es un rol en inglés (hint === 'en'),
    // marcar como ambiguo (isAmbiguous: true, lang: 'unknown') para que la Capa 4 haga el fetch silencioso
    // o el retro-etiquetado y resuelva con la descripción completa a 100% (ej: "Senior Software Engineer").
    const isAmbiguous = (opts.modality === 'hibrido' || opts.modality === 'presencial') &&
                        hint === 'en' && hitsEs <= 2;

    if (isAmbiguous) {
      return { lang: 'unknown', isAmbiguous: true, scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    if ((opts.modality === 'hibrido' || opts.modality === 'presencial') && hitsEn <= 1) {
      return { lang: 'es', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    // Decisión (arquitectura 2.2 paso 5: por proporción con margen)
    // 1) Si la capa de roles indica ES claramente y la señal EN es débil (hitsEn <= 1, ej. "IT"), preferir ES
    if (hint === 'es' && (hitsEn <= 1 || weightedEs >= weightedEn)) {
      return { lang: 'es', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    // 2) Un idioma supera al otro por el MARGEN en proporción -> se decide
    if (scoreEs > scoreEn * MARGEN) {
      return { lang: 'es', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    if (scoreEn > scoreEs * MARGEN) {
      return { lang: 'en', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    // 3) Stopwords no deciden o hay empate en textos cortos (títulos <= 20 tokens) -> consultar capa 3 de roles
    if (totalTokens <= 20 && (hint === 'es' || hint === 'en')) {
      return { lang: hint, scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    // 4) Sin señal suficiente o texto largo bilingüe 50/50 -> fail-open (preferimos mostrar de más a ocultar mal)
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
    return (card.getAttribute && card.getAttribute('data-job-id')) || '';
  }

  // Descripción: capa estructural (p[dir="ltr"], #job-details, .jobs-description__content, etc.)
  function descriptionFromDetail(detailRoot) {
    if (!detailRoot || !detailRoot.querySelector) return '';
    const exact = detailRoot.querySelector('p[dir="ltr"]') ||
                  detailRoot.querySelector('[dir="ltr"]') ||
                  detailRoot.querySelector('#job-details') ||
                  detailRoot.querySelector('.jobs-description__content') ||
                  detailRoot.querySelector('.jobs-description-content__text') ||
                  detailRoot.querySelector('.jobs-box__html-content') ||
                  detailRoot.querySelector('.mt4');
    if (exact && exact.textContent && exact.textContent.trim()) return exact.textContent;
    // Heurística: máxima densidad de texto entre elementos contenedores.
    let best = '';
    let bestLen = 0;
    const children = detailRoot.querySelectorAll ? detailRoot.querySelectorAll('div, section, article') : [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
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
                 root.querySelector('.jobs-search-results-list__list-item--active [data-job-id]') ||
                 root.querySelector('.job-card-container--active [data-job-id]') ||
                 root.querySelector('.job-card-list--active [data-job-id]') ||
                 root.querySelector('.jobs-search-results-list__list-item--active') ||
                 root.querySelector('.job-card-container--active') ||
                 root.querySelector('.job-card-list--active');
    if (!active) return null;
    if (active.getAttribute && active.getAttribute('data-job-id')) {
      return active.getAttribute('data-job-id');
    }
    const child = active.querySelector && active.querySelector('[data-job-id]');
    return child && child.getAttribute ? child.getAttribute('data-job-id') : null;
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
    let match = htmlString.match(/<div[^>]*class="[^"]*mt4[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                htmlString.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                htmlString.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                htmlString.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    let rawText = match ? match[1] : htmlString;
    let cleaned = rawText.replace(/<[^>]+>/g, ' ');
    return cleanText(cleaned);
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


/* ── src/app.js ── */
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



  // ── Bootstrap del userscript (solo en navegador) ─────────────────────────
  function boot() {
    if (typeof LangJobsApp === 'undefined') return;
    // ── Configuración editable (T1.8) ──────────────────────────────────────
    // targetLang: idioma que se MANTIENE visible ('es' | 'en').
    // mode: 'label' (solo badge) | 'dim' (atenuar no deseados) | 'hide' (ocultar).
    // Fail-open: las vacantes 'unknown' NUNCA se ocultan/atenuan.
    var CONFIG = { targetLang: 'es', mode: 'label' };
    if (LangJobsApp.setConfig) LangJobsApp.setConfig(CONFIG);
    // T1.7: observar mutaciones (scroll infinito / nodos reciclados) con debounce.
    if (LangJobsApp.observe) {
      LangJobsApp.observe(document, { debounceMs: 150, config: CONFIG });
    } else {
      LangJobsApp.run(document, { config: CONFIG });
    }
    // ── Diagnóstico visible (T1.10-debug): activar con ?llfdebug=1 en la URL.
    // No usa consola (el usuario tiene la consola rota por otra extensión).
    try {
      var dbg = (location.search || '').indexOf('llfdebug=1') >= 0;
      if (dbg && LangJobsApp.extract) {
        setTimeout(function () {
          var cards = document.querySelectorAll('[data-job-id]');
          var lines = [];
          lines.push('LangJobs DEBUG v0.5.2 — tarjetas=' + cards.length);
          // Errores capturados por el blindaje de processAll (v0.3.0): si una
          // tarjeta lanzó, acá se ve CUÁL y POR QUÉ (sin consola).
          var errs = LangJobsApp.LAST_ERRORS || [];
          if (errs.length) {
            lines.push('ERRORES (' + errs.length + '):');
            for (var k = 0; k < Math.min(errs.length, 6); k++) lines.push('  ' + errs[k]);
          } else {
            lines.push('ERRORES: ninguno');
          }
          for (var i = 0; i < Math.min(cards.length, 12); i++) {
            var c = cards[i];
            // Blindado por tarjeta: una tarjeta rota NO debe matar el panel
            // (es justo el caso en que más se lo necesita).
            var line;
            try {
              var d = LangJobsApp.extract ? LangJobsApp.extract(c) : null;
              var title = d ? (d.title || '').slice(0, 30) : '(sin extract)';
              var jobId = c.getAttribute('data-job-id') || '(vacio)';
              var badge = c.querySelector ? (c.querySelector('.llf-badge') ? 'BADGE' : '-') : '?';
              var lang = '?';
              var src = '?';
              try {
                var r = LangJobsApp.classify(c, LangJobsApp.makeGetDescription(document));
                lang = r.lang; src = r.langSource;
              } catch (e2) { lang = 'ERR'; }
              line = (i + 1) + '. jobId=' + jobId + ' badge=' + badge + ' lang=' + lang + '(' + src + ') tit=' + JSON.stringify(title);
            } catch (e3) {
              line = (i + 1) + '. ERROR: ' + (e3 && e3.message ? e3.message : String(e3));
            }
            lines.push(line);
          }
          var box = document.createElement('div');
          box.setAttribute('data-llf-debug', '');
          box.style.cssText = 'position:fixed;left:0;bottom:0;max-width:100%;max-height:40%;overflow:auto;background:#000;color:#0f0;font:11px monospace;padding:6px;z-index:2147483647;white-space:pre-wrap;';
          box.textContent = lines.join('\n');
          document.body.appendChild(box);
        }, 1500);
      }
    } catch (e) { /* no romper el script por el debug */ }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
}).call(window);
