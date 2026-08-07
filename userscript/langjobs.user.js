// ==UserScript==
// @name         LangJobs — Filtro de vacantes LinkedIn por idioma
// @namespace    https://github.com/agustcord/langjobs
// @version      0.5.11
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
    'customer', 'service', 'account', 'creative', 'media', 'buyer', 'content',
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

    // Heurística de ambigüedad (v0.5.3):
    // 1) Si el puesto tiene modalidad Híbrido o Presencial y título con rol EN o palabras EN.
    // 2) O si NO es explícitamente remoto y el texto es corto (<= 15 tokens) sin stopwords funcionales (hitsEs === 0 && hitsEn === 0) ni tildes.
    // En estos casos no se puede saber el idioma del cuerpo del aviso solo por el título; marcar como ambiguo
    // (isAmbiguous: true, lang: 'unknown') para que la Capa 4 haga el fetch silencioso o retro-etiquetado.
    const isAmbiguous = ((opts.modality === 'hibrido' || opts.modality === 'presencial') && (hint === 'en' || (hitsEn > 0 && hint !== 'es'))) ||
                        (opts.modality !== 'remoto' && totalTokens <= 15 && hitsEs === 0 && hitsEn === 0 && accentHits === 0 && (hint === 'en' || (hitsEn > 0 && hint !== 'es')));

    if (isAmbiguous) {
      return { lang: 'unknown', isAmbiguous: true, scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }

    if ((opts.modality === 'hibrido' || opts.modality === 'presencial') && (hint === 'es' || hitsEs > hitsEn)) {
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

  // Texto del aviso en el panel de detalle (columna derecha).
  //
  // v0.5.8 — MEDIDO EN CAMPO, no supuesto. El panel de la UI 2026 no tiene
  // `#job-details` ni `.jobs-description` (verificado: `chars_contenedor: 0`), y
  // el texto que se puede sacar de él es INSERVIBLE para detectar idioma:
  //
  //   panel de una vacante EN inglés → "Ssr. Learning & Development Analyst
  //   Louis Dreyfus Company • Rosario, Santa Fe, Argentina Guardar Solicitar …
  //   Compartido hace 3 semanas · Más de 100 personas han hecho clic en
  //   «Solicitar» Respuestas gestionadas fuera de…"
  //
  // Es chrome en ESPAÑOL describiendo un aviso en INGLÉS: el detector lo llama
  // 'es' (7 hits ES, 0 EN). El panel mezcla los dos idiomas por construcción, así
  // que cualquier heurística sobre él es una moneda al aire sesgada al idioma de
  // la interfaz. Y el nodo que se obtenía variaba entre páginas
  // (`DIV._12fe6c88` vs `DIV._54e8c074…`), o sea que además era inestable.
  //
  // En cambio el endpoint público SÍ devuelve el cuerpo limpio y correcto —
  // medido en las dos vacantes: 514 palabras de prosa española → 'es' (26 hits
  // ES, 0 EN); 296 palabras de prosa inglesa → 'en' (18 hits EN, 0 ES). Y ahora
  // hay `jobId` para las 25 tarjetas, así que esa vía cubre toda la lista.
  //
  // Decisión: sin contenedor explícito, se devuelve ''. La resolución por
  // descripción queda a cargo del fetch (Capa 4), que es la fuente confiable.
  // La heurística sobre el panel se elimina en vez de seguir parcheándola.
  function getDetailDescription(root) {
    if (!root || !root.querySelector) return '';
    const explicito = root.querySelector('#job-details') ||
                      root.querySelector('.jobs-description__content') ||
                      root.querySelector('.jobs-description') ||
                      root.querySelector('.jobs-box__html-content') ||
                      root.querySelector('.jobs-details__main-content');
    if (!explicito) return '';
    const texto = descriptionFromDetail(explicito);
    // Mismo criterio de confianza que para el endpoint público: si no parece el
    // cuerpo de un aviso, mejor '' y que la vacante quede en '??'.
    if (!isTrustworthyDescription(texto)) return '';
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

  // Bloque de metadatos del aviso ("Seniority level / Employment type / Job
  // function / Industries"). En la página pública viene en INGLÉS aunque el
  // aviso esté en español, así que si se captura ese bloque en vez del cuerpo,
  // un aviso en español se clasifica 'en'. Es el error más grave posible: en
  // modo ocultar, esconde vacantes válidas.
  const CRITERIA_MARKERS = [
    'seniority level', 'employment type', 'job function', 'industries',
    'referrals increase', 'get notified about new', 'similar jobs',
    'nivel de antigüedad', 'tipo de empleo', 'función laboral', 'sectores',
  ];
  function looksLikeCriteriaBlock(text) {
    const low = (text || '').toLowerCase();
    let hits = 0;
    for (let i = 0; i < CRITERIA_MARKERS.length; i++) {
      if (low.indexOf(CRITERIA_MARKERS[i]) !== -1) hits++;
      if (hits >= 2) return true;
    }
    return false;
  }

  // ¿Este texto es realmente el cuerpo de un aviso, y por lo tanto evidencia
  // confiable de su idioma? (v0.5.7)
  // El detector es bueno con prosa y malo con etiquetas de interfaz: 20 palabras
  // de metadatos alcanzan para decidir un idioma equivocado, y ese resultado
  // queda cacheado. Un aviso real tiene cientos de palabras. Ante la duda se
  // devuelve '' y la vacante queda en '??' (fail-open).
  function isTrustworthyDescription(text) {
    const t = cleanText(text || '');
    if (t.length < 180) return false;
    const tokens = t.split(/\s+/).length;
    if (tokens < 30) return false;
    if (t.length > 30000) return false;      // se capturó media página
    if (looksLikeGuestChrome(t)) return false;
    if (looksLikeJobList(t)) return false;
    // Bloque de metadatos suelto: corto y lleno de etiquetas. Si además es
    // largo, probablemente traiga el cuerpo del aviso y sí sirve.
    if (looksLikeCriteriaBlock(t) && tokens < 150) return false;
    return true;
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
    if (!isTrustworthyDescription(cleaned)) return '';
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
    looksLikeCriteriaBlock: looksLikeCriteriaBlock,
    isTrustworthyDescription: isTrustworthyDescription,
    getActiveJobId: getActiveJobId,
    getDetailTitle: getDetailTitle,
    getDetailCompany: getDetailCompany,
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
  // ── Interruptor de DESARROLLO del Modo Beta / Reporter (v0.5.9) ────────────
  // El botón ⚠️ de cada tarjeta y la barra flotante "Validar Página OK" son
  // infraestructura de desarrollo, NO una función de usuario: sin
  // `node tools/reporter_server.js` corriendo en la máquina del desarrollador
  // no hacen nada útil (caen al portapapeles). Por eso dejaron de estar en el
  // popup: quien quiera medir precisión en campo tiene que poner esta constante
  // en true y RECONSTRUIR los dos bundles:
  //
  //     BETA_REPORTING = true
  //     node tools/build_extension.js
  //     node tools/build_userscript.js
  //
  // Mantenerla en false es lo que garantiza que el build publicable no muestre
  // botones de desarrollo ni intente hablar con localhost. El bootstrap de la
  // extensión ya NO lee `betaReportingEnabled` de chrome.storage, así que este
  // archivo es el único lugar donde se decide.
  const BETA_REPORTING = false;

  const CONFIG = {
    targetLang: 'es',
    mode: 'label', // Versión V1 MVP: Etiquetado Visual Exclusivo (90-95%+ valor entregado)
    betaReportingEnabled: BETA_REPORTING,
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
    }
    // v0.5.7 — BUG CORREGIDO: esto estaba en un `else` del bloque anterior, así
    // que una vez que la caché tenía un valor (por ejemplo uno EQUIVOCADO puesto
    // por el fetch en segundo plano), el hash ya no miraba el panel de detalle.
    // Consecuencia reportada en campo: abrías la vacante, el panel mostraba el
    // aviso en inglés, y la tarjeta seguía marcada ES para siempre. El hash no
    // cambiaba, así que processCard reusaba la etiqueta anterior y tagCard nunca
    // corría. Ahora se suman las dos señales: la descripción del panel es la
    // evidencia más fuerte (es el texto que el usuario está viendo) y siempre
    // debe poder corregir a la caché.
    const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
    const desc = panelDescriptionFor(card, d, document);
    if (desc && desc.trim()) h += '|D:' + desc.replace(/\s+/g, ' ').slice(0, 120);
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
  const FETCH_CACHE = {}; // clave -> lang
  const FETCH_PENDING = {};
  const FETCH_TRIED = {}; // jobId -> intentos (tope duro, ver abajo)
  let activeFetches = 0;
  const MAX_CONCURRENT = 3;
  // v0.5.6: tope de intentos por vacante. Sin esto, si el endpoint público está
  // caído o devuelve 429, cada pase del MutationObserver (uno por lote de
  // scroll) volvía a pedir la misma vacante: una tormenta de peticiones desde
  // la cuenta del usuario. Con el jobId de vuelta en la UI 2026 este camino se
  // ejecuta de verdad, así que el tope deja de ser teórico.
  const MAX_TRIES = 2;

  function fetchJobDetail(jobId, card, doc) {
    if (!jobId || FETCH_CACHE[jobId] || FETCH_PENDING[jobId]) return;
    if ((FETCH_TRIED[jobId] || 0) >= MAX_TRIES) return;
    if (activeFetches >= MAX_CONCURRENT) return;

    FETCH_PENDING[jobId] = true;
    FETCH_TRIED[jobId] = (FETCH_TRIED[jobId] || 0) + 1;
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
              // La caché se escribe SIEMPRE: está indexada por jobId, así que es
              // correcta pase lo que pase con el nodo.
              FETCH_CACHE[jobId] = lang;

              // v0.5.8 — GUARDA CONTRA NODOS RECICLADOS. `card` se capturó
              // cuando se lanzó la petición. LinkedIn reutiliza los nodos del
              // DOM al re-renderizar y scrollear, así que cuando la respuesta
              // llega ese nodo puede estar mostrando OTRA vacante. Etiquetarlo
              // le pega el idioma de una vacante al aviso de otra.
              // Explica la paradoja medida en campo: la descripción de
              // "Especialista en Marketing - Prospección B2B" es 100% español
              // (26 hits ES, 0 EN) y sin embargo la tarjeta salió EN.
              // Si el nodo ya no corresponde, no se toca: la tarjeta correcta
              // toma el valor de la caché en el próximo pase del observer.
              const idAhora = selectors.extractFromCard(card).jobId;
              if (idAhora && idAhora !== jobId) {
                _dbg('  → fetch de', jobId, 'descartado: el nodo ahora muestra', idAhora);
              } else {
                tagCard(card, function () { return desc; }, doc, { force: true });
                const document = doc || (card.ownerDocument) || (typeof window !== 'undefined' ? window.document : null);
                applyAction(card, { lang: lang }, document);
              }
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

    // 3. Capa de detección por TÍTULO + modalidad
    // v0.5.6: el nombre de la empresa NO es evidencia del idioma del aviso.
    // "Telefónica" no lo vuelve español ni "Globant" inglés. Peor: inyecta
    // tildes y stopwords ES que activan la Regla de Oro de Diacríticos del
    // detector (accentHits suma a weightedEs y gana por proporción ANTES de que
    // se consulte la capa de roles). Medido con tests/_tmp_bias: 130 de 288
    // combinaciones "título en inglés + empresa" volteaban a 'es' solo por eso,
    // y en campo dejó 19 de 19 tarjetas del camino por título etiquetadas ES.
    // La empresa se sigue extrayendo: sirve para la clave de caché, el hash y
    // los fixtures del reporter, pero no para decidir el idioma.
    // Único caso en que se agrega: cuando el título no se pudo leer (UI legacy,
    // donde a veces el texto del título no era accesible y la empresa era la
    // única señal disponible).
    const titleText = (data.title || '').trim();
    const detInput = (titleText.length >= 3) ? titleText : (titleText + ' ' + (data.company || ''));
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
      //
      // v0.5.11 — `isolation:isolate` es el arreglo del badge que se dibujaba
      // ENCIMA del formulario de "Solicitud sencilla". Causa medida: la tarjeta
      // tenía `position:relative` pero `z-index:auto`, así que NO creaba contexto
      // de apilado propio; el `z-index` altísimo del badge competía en el
      // contexto raíz y le ganaba al modal de LinkedIn (que ronda 9999). Con
      // isolation la tarjeta crea su propio contexto y el badge queda encerrado
      // ahí: sigue por encima del contenido de SU tarjeta y por debajo de
      // cualquier overlay de LinkedIn.
      //
      // Se usa `isolation` y NO `z-index:0` a propósito: las dos crean contexto
      // de apilado, pero z-index:0 además cambiaría el orden de pintado de la
      // tarjeta respecto de sus hermanas (hoy es `auto`), y eso podría recortar
      // un desplegable de LinkedIn que sobresalga de una tarjeta a la de al lado.
      '.' + CLS.host + '{position:relative !important;isolation:isolate !important;}\n' +
      // v0.5.10: posición por DEFECTO = debajo del ✕, alineado al borde derecho
      // de la tarjeta. Hasta v0.5.9 era `top:8px;right:40px` (al lado del ✕, a
      // la misma altura), y el título largo de la vacante se lo comía. Cuando la
      // tarjeta tiene layout medible, positionBadge() refina estos valores
      // midiendo el botón real; estos números son el fallback (jsdom, tarjetas
      // sin ✕ de la UI legacy, tarjetas fuera de vista en la lista virtualizada).
      // z-index 100 (v0.5.11): antes era 2147483647, el máximo. Con la tarjeta
      // aislada alcanza y sobra para quedar sobre el contenido de la tarjeta, y
      // es la segunda línea de defensa contra el bug del formulario: si por
      // cualquier motivo el badge volviera a escapar de su contexto de apilado,
      // 100 pierde contra cualquier modal de LinkedIn en vez de taparlo.
      '.llf-badge{position:absolute !important;top:44px !important;right:8px !important;z-index:100;' +
      'display:inline-flex !important;align-items:center !important;gap:3px !important;padding:1px 6px;border-radius:4px;' +
      'font-size:11px;font-weight:700;color:#fff;font-family:inherit;' +
      'line-height:1.4;pointer-events:none;}\n' +
      // Con un diálogo modal abierto (p. ej. "Solicitud sencilla") los badges se
      // apagan: no aportan nada sobre un formulario y así no pueden solaparlo.
      // El sello vive en <html> (syncModalState), no en cada tarjeta, para que
      // sea una sola escritura por pase.
      '[data-llf-modal="1"] .llf-badge{display:none !important;}\n' +
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

  // ── Posición del badge: DEBAJO del ✕, nunca al lado (v0.5.10) ──────────────
  // Problema medido en campo: con `top:8px; right:40px` el badge compartía
  // renglón con el título de la vacante. Cuando el título es largo y envuelve a
  // dos líneas (p. ej. "Especialista en Marketing - Prospección B2B"), el texto
  // pasa por debajo del badge y queda ilegible. Y `right:40px` era un número
  // mágico: daba por sentado un ✕ de 40px, sin validar en tarjetas promocionadas,
  // con logo o guardadas.
  //
  // Regla nueva: se MIDE el rectángulo del botón ✕ y el badge se coloca alineado
  // a su borde derecho, arrancando BADGE_GAP px por debajo de su borde inferior.
  // Así queda en la columna del ✕ (zona sin texto) y fuera de su área de
  // interacción, en cualquier variante de tarjeta. Además el badge conserva
  // `pointer-events:none`, así que ni con solapamiento parcial podría robarle el
  // click al botón.
  //
  // Devuelve true si pudo medir. Si la tarjeta no tiene layout (jsdom, tarjeta
  // virtualizada fuera de vista) no toca nada y manda el CSS por defecto.
  var BADGE_GAP = 6;
  var BADGE_MIN_H = 18; // alto aproximado del badge, para no sacarlo de la tarjeta

  function positionBadge(card, badge) {
    if (!card || !badge || !badge.style || !badge.style.setProperty) return false;
    try {
      var anchor = card.querySelector ? card.querySelector(DISMISS_SEL) : null;
      if (!anchor || !anchor.getBoundingClientRect || !card.getBoundingClientRect) return false;
      if (!hasLayoutBox(card) || !hasLayoutBox(anchor)) return false;
      var cr = card.getBoundingClientRect();
      var ar = anchor.getBoundingClientRect();
      if (!cr || !ar || !cr.height || !ar.height) return false;

      var top = (ar.bottom - cr.top) + BADGE_GAP;
      var right = cr.right - ar.right;

      // Clamps: el badge nunca debe salirse de la tarjeta ni de su borde derecho.
      if (right < 0) right = 0;
      if (top < 0) top = 0;
      var maxTop = cr.height - BADGE_MIN_H;
      if (maxTop > 0 && top > maxTop) top = maxTop;

      badge.style.setProperty('top', Math.round(top) + 'px', 'important');
      badge.style.setProperty('right', Math.round(right) + 'px', 'important');
      return true;
    } catch (e) {
      return false; // la posición nunca puede romper el etiquetado
    }
  }

  // ── Guarda contra formularios y diálogos de LinkedIn (v0.5.11) ─────────────
  // Segunda línea de defensa del bug reportado en campo: al abrir "Solicitud
  // sencilla" los badges de las tarjetas de atrás aparecían SOBRE el formulario.
  // El arreglo de fondo es `isolation:isolate` en la tarjeta (ver ensureStyles),
  // pero mientras haya un diálogo modal abierto los badges tampoco tienen nada
  // que aportar: se apagan por CSS y se vuelven a mostrar al cerrarlo.
  //
  // Deliberadamente CONSERVADOR para no apagar los badges de por vida:
  //   • solo cuenta `[role="dialog"][aria-modal="true"]` (el contrato ARIA de un
  //     diálogo modal ACTIVO) y el modal de postulación de LinkedIn;
  //   • descarta los que están ocultos (hidden / aria-hidden / display:none),
  //     porque en una SPA es normal que quede el cascarón de un modal cerrado.
  // El estado queda sellado en <html data-llf-modal="1"> para que se pueda ver
  // de un vistazo POR QUÉ desaparecieron los badges (misma lógica que
  // data-llf-version y data-llf-src: si no se ve el motivo, no se depura).
  var MODAL_SEL = '[role="dialog"][aria-modal="true"], .jobs-easy-apply-modal, .artdeco-modal-overlay';

  function isHiddenNode(el) {
    if (!el) return true;
    if (el.hasAttribute && el.hasAttribute('hidden')) return true;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    try {
      var doc = el.ownerDocument;
      var win = doc && (doc.defaultView || doc.parentWindow);
      if (win && win.getComputedStyle) {
        var st = win.getComputedStyle(el);
        if (st && (st.display === 'none' || st.visibility === 'hidden')) return true;
      }
    } catch (e) {}
    return false;
  }

  function isModalOpen(doc) {
    if (!doc || !doc.querySelectorAll) return false;
    var nodes = doc.querySelectorAll(MODAL_SEL);
    for (var i = 0; i < nodes.length; i++) {
      if (!isHiddenNode(nodes[i])) return true;
    }
    return false;
  }

  // Sella el estado en <html> y devuelve si hay un modal abierto.
  function syncModalState(doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    var html = d && d.documentElement;
    if (!html) return false;
    var open = isModalOpen(d);
    try {
      if (open) html.setAttribute('data-llf-modal', '1');
      else if (html.removeAttribute) html.removeAttribute('data-llf-modal');
    } catch (e) {}
    return open;
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
      // v0.5.10: setProperty en vez de `style.cssText = …`. cssText REEMPLAZA el
      // atributo style completo, así que borraba el top/right inline calculado
      // por positionBadge() en el pase anterior.
      if (badge.style && badge.style.setProperty) badge.style.setProperty('background', b.color);
      else badge.style.cssText = 'background:' + b.color + ';';
      // Se reposiciona en CADA pase: LinkedIn re-renderiza la tarjeta y el ✕
      // puede cambiar de tamaño o de sitio (tarjeta promocionada, con logo…).
      positionBadge(card, badge);

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
    if (card.setAttribute) {
      card.setAttribute('data-llf-lang', data.lang);
      // v0.5.6: exponer DE DÓNDE salió el idioma. Sin esto no hay forma de
      // saber en campo si una tarjeta se clasificó por el título (señal débil)
      // o por la descripción real del aviso (señal fuerte), y por lo tanto no
      // se puede validar una mejora de precisión: solo se ve el resultado.
      card.setAttribute('data-llf-src', data.langSource || 'title');
    }
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
    // v0.5.10: reposicionar SIEMPRE, también en el atajo por hash. La geometría
    // de una tarjeta cambia sin que cambie su texto: al abrir el panel de
    // detalle la lista se angosta, y una tarjeta re-renderizada puede quedar
    // más alta o más baja. Como en ese camino tagCard() no se ejecuta, el badge
    // se quedaría anclado a la medida vieja del ✕.
    if (card.querySelector) positionBadge(card, card.querySelector('.llf-badge'));
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

  // ── Canario de salud (v0.5.6) ──────────────────────────────────────────────
  // Motivación empírica: en un mismo día hubo DOS fallas silenciosas seguidas.
  //   1. v0.5.3 dejó de etiquetar la lista (badges anclados en un wrapper 0x0).
  //   2. v0.5.4 etiquetó 19 de 19 tarjetas como ES por contaminar el input del
  //      detector con el nombre de la empresa.
  // Ninguna avisó nada: se detectaron porque el usuario las vio. Este canario
  // convierte esas fallas en un warning en consola, una sola vez por sesión y
  // por problema (nunca en bucle), y queda disponible como API para el popup.
  const HEALTH_WARNED = {};
  let FIRST_RUN_AT = 0;

  function health(root) {
    const doc = root || (typeof window !== 'undefined' ? window.document : null);
    const out = { issues: [], cards: 0, badges: 0, withJobId: 0, byDescription: 0, unknowns: 0 };
    if (!doc || !doc.querySelectorAll) return out;

    const cards = getDomCards(doc);
    out.cards = cards.length;
    out.badges = doc.querySelectorAll('.llf-badge').length;

    let misplaced = 0;
    let measurable = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (selectors.extractFromCard(c).jobId) out.withJobId++;
      const src = c.getAttribute && c.getAttribute('data-llf-src');
      if (src === 'description' || src === 'async-fetch' || src === 'panel-cache') out.byDescription++;
      if (c.getAttribute && c.getAttribute('data-llf-lang') === 'unknown') out.unknowns++;

      // Geometría: solo se evalúa si hay layout real (en jsdom todo es 0 y en
      // una lista virtualizada las tarjetas fuera de vista también).
      if (i < 4 && hasLayoutBox(c) && c.getBoundingClientRect) {
        const badge = c.querySelector && c.querySelector('.llf-badge');
        if (badge && badge.getBoundingClientRect) {
          const cr = c.getBoundingClientRect();
          const br = badge.getBoundingClientRect();
          if (br.width > 0 || br.height > 0) {
            measurable++;
            const dentro = br.left >= cr.left - 4 && br.left <= cr.right + 4 &&
                           br.top >= cr.top - 4 && br.top <= cr.bottom + 4;
            if (!dentro) misplaced++;
          }
        }
      }
    }

    const onJobs = (typeof window !== 'undefined' && window.location &&
                    String(window.location.pathname || '').indexOf('/jobs/') !== -1);
    const elapsed = FIRST_RUN_AT ? (Date.now() - FIRST_RUN_AT) : 0;

    if (onJobs && cards.length === 0) {
      out.issues.push({
        code: 'no-cards',
        msg: 'CERO tarjetas detectadas en una página de empleos. LinkedIn probablemente cambió el DOM. ' +
             'Diagnóstico: pegar tools/diagnose_linkedin_dom.js y correr __LJF_DIAG.ariaLabels().',
      });
    } else if (cards.length > 0) {
      if (out.badges === 0) {
        out.issues.push({ code: 'no-badges', msg: cards.length + ' tarjetas detectadas pero NINGÚN badge inyectado.' });
      }
      if (measurable > 0 && misplaced === measurable) {
        out.issues.push({
          code: 'badges-misplaced',
          msg: 'los badges se están dibujando FUERA de su tarjeta (falta ancla con caja de layout). ' +
               'Fue el bug de v0.5.3: revisar getDomCards/.llf-badge-host.',
        });
      }
      if (cards.length >= 5 && out.withJobId === 0) {
        out.issues.push({
          code: 'no-jobids',
          msg: 'ninguna tarjeta expone jobId: la Capa 4 (descripción) queda inactiva y van a sobrar «??». ' +
               'Revisar el atributo componentkey en jobIdFromCard(); verificar con __LJF_DIAG.hunt().',
        });
      }
      // Capa 4 en silencio: hay ids y dudosas, pero nada se resolvió por
      // descripción pasados 15 s. Puede ser el endpoint público caído.
      if (out.withJobId > 0 && out.unknowns >= 4 && out.byDescription === 0 && elapsed > 15000) {
        out.issues.push({
          code: 'layer4-idle',
          msg: out.unknowns + ' tarjetas en «??» y ninguna resuelta por descripción tras 15 s. ' +
               'Puede estar bloqueado el endpoint público (ver FETCH_TRIED).',
        });
      }
    }

    for (let k = 0; k < out.issues.length; k++) {
      const it = out.issues[k];
      if (HEALTH_WARNED[it.code]) continue;
      HEALTH_WARNED[it.code] = true;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[LangJobs] ⚠️ ' + it.code + ': ' + it.msg);
      }
    }
    return out;
  }

  const LAST_ERRORS = [];
  function processAll(root, opts) {
    opts = opts || {};
    if (!root || !root.querySelectorAll) return [];
    const list = getDomCards(root).filter(isJobCardContainer);
    LAST_ERRORS.length = 0;
    // v0.5.11: un querySelectorAll por pase para saber si hay un formulario o
    // diálogo modal abierto. Nunca puede romper el etiquetado.
    try { syncModalState(root.ownerDocument || root); } catch (e) {}
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
    if (!FIRST_RUN_AT) FIRST_RUN_AT = Date.now();
    if (opts.health !== false) {
      try { health(root); } catch (e) { /* el canario nunca debe romper el etiquetado */ }
    }
    return res;
  }

  // ── Cambiar config en caliente y reprocesar (T1.8: conmutable) ──────────────
  function setConfig(partial, doc, opts) {
    opts = opts || {};
    if (partial && typeof partial === 'object') {
      if (partial.targetLang) CONFIG.targetLang = partial.targetLang;
      if (partial.mode) CONFIG.mode = partial.mode;
      // betaReportingEnabled sigue siendo escribible por API para los tests y
      // para la consola del desarrollador, pero NINGÚN bootstrap se lo pasa:
      // el interruptor real es la constante BETA_REPORTING de este archivo.
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

    // v0.5.11: al apagar el etiquetado no debe quedar el sello del modal, o el
    // CSS seguiría ocultando badges cuando se vuelva a encender.
    if (document.documentElement && document.documentElement.removeAttribute) {
      document.documentElement.removeAttribute('data-llf-modal');
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
      '[data-llf-lang],[data-llf-hash],[data-llf-src],.' + CLS.host + ',[data-job-id]'
    );
    Array.prototype.slice.call(cards).forEach(function (card) {
      if (!isJobCardContainer(card)) return;
      if (card.removeAttribute) {
        card.removeAttribute('data-llf-lang');
        card.removeAttribute('data-llf-hash');
        card.removeAttribute('data-llf-src');
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
    FETCH_TRIED: FETCH_TRIED,
    FETCH_CACHE: FETCH_CACHE,
    processAll: processAll,
    processCard: processCard,
    tagCard: tagCard,
    applyAction: applyAction,
    isUndesired: isUndesired,
    setConfig: setConfig,
    clearAll: clearAll,
    classify: classify,
    health: health,
    getDomCards: getDomCards,
    positionBadge: positionBadge,
    isModalOpen: isModalOpen,
    syncModalState: syncModalState,
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



  // ── Bootstrap del userscript (solo en navegador) ─────────────────────────
  function boot() {
    if (typeof LangJobsApp === 'undefined') return;
    // ── Configuración editable (T1.8) ──────────────────────────────────────
    // targetLang: idioma que se MANTIENE visible ('es' | 'en').
    // mode: 'label' (solo badge) | 'dim' (atenuar no deseados) | 'hide' (ocultar).
    // Fail-open: las vacantes 'unknown' NUNCA se ocultan/atenuan.
    var CONFIG = { targetLang: 'es', mode: 'label' };
    if (LangJobsApp.setConfig) LangJobsApp.setConfig(CONFIG);
    // Sella la versión en el DOM (ver la nota del bundler de la extensión).
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute('data-llf-version', '0.5.11');
      }
    } catch (e) {}
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
          // v0.5.4: usar el MISMO descubrimiento que el runtime (UI 2026 sin
          // data-job-id); si no estuviera disponible, caer al selector legacy.
          var cards = LangJobsApp.getDomCards
            ? LangJobsApp.getDomCards(document)
            : Array.prototype.slice.call(document.querySelectorAll('[data-job-id]'));
          var lines = [];
          lines.push('LangJobs DEBUG v0.5.11 — tarjetas=' + cards.length);
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
              var jobId = (d && d.jobId) || c.getAttribute('data-job-id') || '(vacio)';
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
