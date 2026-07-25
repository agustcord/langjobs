/*
 * LangJobs — Corpus de pruebas del detector de idioma (T1.3)
 * ---------------------------------------------------------------------------
 * Extraído de 03_Estrategia_de_Testing.md ("Corpus"). Formato documentado en
 * la arquitectura 2.3: { id, texto, esperado, crítico, resultado, nota }.
 *
 *   id       : identificador del caso (C=base, X=extremo)
 *   texto    : texto de la vacante (sintético/manual, NO scraping)
 *   acepta   : array de resultados válidos ('es' | 'en' | 'unknown')
 *              La arquitectura 2.3 permite respuestas múltiples en casos cortos
 *              (C03/C04) y documenta tolerancia en PT (X07). Acierto = lang ∈ acepta.
 *   crítico  : true/false — los críticos NO deben ocultarse por error
 *   resultado: se completa en runtime por tests/run.js (no editar a mano)
 *   nota     : por qué es difícil / qué valida
 *
 * Mantener este corpus alineado con el vault. Cada ajuste de listas/umbrales
 * (T1.11) se valida re-corriendo tests/run.js (< 1 s).
 */

const CORPUS = [
  // ── Casos base (C) ──
  {
    id: 'C01',
    texto: 'Buscamos analista contable con experiencia en empresas del sector financiero para sumarse a un equipo que valora el trabajo en conjunto y la formación continua de sus colaboradores en un ambiente de respeto.',
    acepta: ['es'],
    crítico: false,
    resultado: null,
    nota: 'Descripción 100% español formal.',
  },
  {
    id: 'C02',
    texto: 'We are looking for a software engineer to join our team and build scalable systems with great people who care about quality and want to grow with the company across the region.',
    acepta: ['en'],
    crítico: false,
    resultado: null,
    nota: 'Descripción 100% inglés.',
  },
  {
    id: 'C03',
    texto: 'Desarrollador Backend',
    acepta: ['es', 'unknown'],
    crítico: true,
    resultado: null,
    nota: 'Título corto solo. Válido es/unknown, NUNCA en (no ocultar una vacante ES por error).',
  },
  {
    id: 'C04',
    texto: 'Backend Developer',
    acepta: ['en', 'unknown'],
    crítico: false,
    resultado: null,
    nota: 'Título corto solo. Válido en/unknown.',
  },
  {
    id: 'C05',
    texto: '🚀 100% 💰💡',
    acepta: ['unknown'],
    crítico: true,
    resultado: null,
    nota: 'Texto vacío / solo emojis / solo números. Fail-open.',
  },

  // ── Casos extremos (X) ──
  {
    id: 'X01',
    texto: 'Buscamos Developer Semi Senior para trabajar con React, Node, Docker, CI/CD, testing, code review, deployment en AWS. El candidato debe tener experiencia en microservices, REST APIs, unit testing y conocimientos de backend.',
    acepta: ['es'],
    crítico: true,
    resultado: null,
    nota: 'Vacante ES con ~80% de jerga técnica EN. Lo funcional (buscamos, para, con, el, debe, tener, en) es ES → la estrategia de solo-funcionales debe ganar.',
  },
  {
    id: 'X02',
    texto: 'Join our team as a Software Engineer. We are hiring across the US. The ideal candidate will design and build scalable systems with modern tools. We are an equal opportunity employer committed to diversity. Trabajamos con igualdad de oportunidades para todas las personas.',
    acepta: ['en'],
    crítico: false,
    resultado: null,
    nota: 'Descripción EN larga + 2 líneas legales en ES al final. La proporción manda: el bloque ES es minoritario.',
  },
  {
    id: 'X03',
    texto: 'Estamos buscando un dev para sumarse al team, trabajamos remoto full time con stack moderno y buena onda. Buscamos gente proactiva.',
    acepta: ['es'],
    crítico: false,
    resultado: null,
    nota: 'Spanglish rioplatense. Funcionales ES dominan pese a dev/team/full time/stack.',
  },
  {
    id: 'X04',
    texto: 'El equipo trabaja con buena gente. La oferta es justa y el sueldo correcto. El puesto permite crecer. The team works with good people. The offer is fair and the salary right. The role allows growth.',
    acepta: ['unknown'],
    crítico: true,
    resultado: null,
    nota: 'Vacante bilingüe 50/50 (misma idea en ambos idiomas, conteos de funcionales equilibrados) → fail-open, no ocultar.',
  },
  {
    id: 'X05',
    texto: 'Join our team in Buenos Aires, Argentina. María García, our manager, leads the group with Santiago López and Sofía Fernández across the Latin America region.',
    acepta: ['en'],
    crítico: false,
    resultado: null,
    nota: 'EN con nombres propios hispanos. Los nombres NO son stopwords.',
  },
  {
    id: 'X06',
    texto: 'Buscamos desarrollador con experiencia, se ofrece salario competitivo y buen ambiente de trabajo en equipo con otras personas.',
    acepta: ['es'],
    crítico: false,
    resultado: null,
    nota: 'ES sin tildes (muy común). No depender de tildes como señal primaria.',
  },
  {
    id: 'X07',
    texto: 'Estamos contratando desenvolvedor para trabalhar com a gente em um time remoto e colaborativo no Brasil com boa cultura.',
    acepta: ['unknown', 'es'],
    crítico: false,
    resultado: null,
    nota: 'Portugués (aparece en búsquedas LATAM). PT comparte muchas funcionales con ES. Idealmente unknown; tolerable es en MVP — comportamiento documentado.',
  },
  {
    id: 'X08',
    texto: 'WE ARE HIRING A SENIOR ENGINEER TO JOIN OUR TEAM AND BUILD GREAT PRODUCTS WITH THE BEST PEOPLE IN THE COMPANY',
    acepta: ['en'],
    crítico: false,
    resultado: null,
    nota: 'EN en MAYÚSCULAS. La normalización debe bajar a minúsculas.',
  },
  {
    id: 'X09',
    texto: 'Buscamos&nbsp;desarrollador&nbsp;• Experiencia\n\nRequisitos: • Backend • Testing • Deploy • Arquitectura',
    acepta: ['es', 'unknown'],
    crítico: false,
    resultado: null,
    nota: 'HTML entities, bullets y saltos de línea. La limpieza no debe romper tokens ni sesgar.',
  },
  {
    id: 'X10',
    texto: 'Líder IT Rosario NeuralSoft',
    acepta: ['es'],
    crítico: true,
    resultado: null,
    nota: 'Título con sigla IT y rol en español (con tilde). No debe confundir IT con el pronombre en inglés.',
  },
  {
    id: 'X11',
    texto: 'Lider IT Rosario NeuralSoft',
    acepta: ['es'],
    crítico: true,
    resultado: null,
    nota: 'Título con sigla IT y rol en español sin tilde (Lider IT). No debe confundir IT con pronombre EN.',
  },
  {
    id: 'X12',
    texto: 'Soporte IT Rosario',
    acepta: ['es'],
    crítico: true,
    resultado: null,
    nota: 'Título corto de soporte técnico IT en español.',
  },
  {
    id: 'X13',
    texto: 'DevOps Engineer Wiener lab.',
    opts: { modality: 'hibrido' },
    acepta: ['es', 'unknown'],
    crítico: true,
    resultado: null,
    nota: 'Puesto Híbrido en Rosario con título IT en inglés. Estado inicial fail-open (unknown/??) hasta que resuelva el fetch silencioso.',
  },
  {
    id: 'X14',
    texto: 'DevOps Engineer',
    opts: { modality: 'remoto' },
    acepta: ['en'],
    crítico: false,
    resultado: null,
    nota: 'Puesto Remoto con título en inglés -> detector estándar da EN.',
  },
  {
    id: 'X15',
    texto: 'QA Automation Engineer',
    opts: { modality: 'presencial' },
    acepta: ['es', 'unknown'],
    crítico: true,
    resultado: null,
    nota: 'Puesto Presencial local con título en inglés -> estado inicial fail-open (unknown/??) hasta resolución de fetch silencioso.',
  },
  {
    id: 'X16',
    texto: 'Senior Video Editor - Motion Designer Fever',
    opts: { modality: 'hibrido' },
    acepta: ['en', 'unknown'],
    crítico: true,
    resultado: null,
    nota: 'Caso Fever: Puesto híbrido con título creativo en inglés. Inicia ?? y el fetch silencioso lo resuelve a EN.',
  },
];

if (typeof module === 'object' && module.exports) {
  module.exports = CORPUS;
}
