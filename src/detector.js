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
    : root.LangJobsStopwords;
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(sw);
  } else {
    root.LangJobsDetector = factory(sw);
  }
}(typeof self !== 'undefined' ? self : this, function (SW) {
  'use strict';

  // --- Constantes de decisión (tunables en T1.11) ---
  // MIN_HITS: con < este nº de palabras funcionales, no hay señal suficiente
  //           -> fail-open (no filtrar). Protege títulos cortos. Bajado de 3 a 2
  //           en T1.10 para que títulos con 1-2 palabras funcionales (ej. "de",
  //           "las", "la") clasifiquen ES/EN sin necesitar la descripción.
  const MIN_HITS = 2;
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

    // --- Capa 3 (heurística de roles): léxico de palabras típicas de TÍTULOS de
  // vacante. Los títulos son sustantivos/roles, no oraciones, así que las
  // stopwords funcionales no alcanzan (MIN_HITS no se cumple). Como respaldo,
  // listas cortas y exclusivas de roles/acciones ES vs EN. Solo se usan cuando
  // las stopwords no deciden (fall-open), y solo para inclinar unknown->es/en.
  // Mantener acotado; se amplía en T1.11 con el corpus de campo.
  const ROLE_ES = new Set([
    'analista', 'lider', 'líder', 'ejecutivo', 'comercial', 'contable', 'procesos',
    'desarrollador', 'programador', 'ingeniero', 'diseñador', 'ventas', 'marketing',
    'recepcionista', 'operario', 'administrativo', 'contador', 'abogado', 'médico',
    'enfermero', 'docente', 'profesor', 'auxiliar', 'tecnico', 'técnico', 'gestor',
    'coordinador', 'supervisor', 'encargado', 'responsable', 'asesor', 'consultor',
    'especialista', 'representante', 'cajero', 'mozo', 'cadete', 'chofer', 'conduct',
  ]);
  const ROLE_EN = new Set([
    'analyst', 'leader', 'executive', 'commercial', 'accountant', 'process',
    'developer', 'engineer', 'designer', 'sales', 'marketing', 'receptionist',
    'operator', 'administrative', 'accountant', 'lawyer', 'doctor', 'nurse',
    'teacher', 'professor', 'assistant', 'technician', 'manager', 'coordinator',
    'supervisor', 'officer', 'advisor', 'consultant', 'specialist', 'representative',
    'cashier', 'waiter', 'driver', 'recruiter',
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
    // 1) Un idioma supera al otro por el MARGEN en proporción -> se decide
    if (scoreEs > scoreEn * MARGEN) {
      return { lang: 'es', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    if (scoreEn > scoreEs * MARGEN) {
      return { lang: 'en', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    // 2) Stopwords no deciden (pocas/<MIN_HITS o empate) -> capa 3 (roles).
    //    Los títulos son roles/sustantivos, no oraciones, así que esta capa
    //    es la que resuelve la mayoría de los títulos cortos.
    const hint = roleHint(tokens);
    if (hint === 'es' || hint === 'en') {
      return { lang: hint, scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
    }
    // 3) Sin señal suficiente -> fail-open (preferimos mostrar de más a ocultar mal)
    return { lang: 'unknown', scoreEs, scoreEn, weightedEs, weightedEn, hitsEs, hitsEn, totalTokens, accentHits };
  }

  return { detectLanguage, normalize, tokenize, MIN_HITS, MARGEN };
}));
