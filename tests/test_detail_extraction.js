/*
 * Test de regresión: extracción del cuerpo de la descripción en el panel de detalle
 * ---------------------------------------------------------------------------
 * Verifica que el extractor del panel de detalle ignore metadatos de UI en español
 * de la cabecera (top-card) ("Promocionado por técnico de selección", "Rosario y alrededores...")
 * y priorice el cuerpo real de la vacante (#job-details).
 */
const assert = require('assert');
const selectors = require('../src/selectors.js');
const detector = require('../src/detector.js');

// Mock simple de DOM para simular la vista de detalle de LinkedIn
function createMockDetailDOM() {
  const topCard = {
    tagName: 'DIV',
    classList: { contains: (c) => c === 'jobs-unified-top-card' },
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: 'Rosario y alrededores · Publicado de nuevo hace 3 semanas · Promocionado por técnico de selección',
  };

  const jobDetailsBody = {
    tagName: 'DIV',
    id: 'job-details',
    classList: { contains: (c) => c === 'jobs-description__content' },
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: 'Overview: We are looking for Senior Software Engineers in LATAM to join the engineering team. Feedback-Rich, Collaborative Culture: Tap into regular training, peer reviews, and a team that treats every team member as a vital collaborator and owner in our success.',
  };

  const mainContent = {
    tagName: 'MAIN',
    classList: { contains: (c) => c === 'jobs-details__main-content' },
    querySelector: (sel) => {
      if (sel === '#job-details' || sel.includes('jobs-description')) return jobDetailsBody;
      if (sel.includes('top-card')) return topCard;
      return null;
    },
    querySelectorAll: () => [topCard, jobDetailsBody],
    textContent: topCard.textContent + ' ' + jobDetailsBody.textContent,
  };

  const root = {
    querySelector: (sel) => {
      if (sel === '#job-details' || sel.includes('jobs-description')) return jobDetailsBody;
      if (sel.includes('main')) return mainContent;
      return null;
    },
    querySelectorAll: () => [],
  };

  return { root, mainContent, jobDetailsBody, topCard };
}

const mock = createMockDetailDOM();
const descText = selectors.getDetailDescription(mock.root);

console.log('--- Test de extracción del panel de detalle ---');
console.log('Texto extraído:', descText.slice(0, 100) + '...');

assert.ok(descText.includes('Senior Software Engineers'), 'Debe incluir el cuerpo de la vacante en inglés');
assert.ok(!descText.startsWith('Rosario y alrededores'), 'NO debe comenzar con los metadatos de UI');

const lang = detector.detectLanguage(descText).lang;
console.log('Idioma detectado:', lang);
assert.strictEqual(lang, 'en', 'El idioma de la descripción debe ser EN');

console.log('✅ PASS: Extracción del panel de detalle no se contamina con metadatos de UI en español.');

// Test de extracción desde HTML (fetchJobDetail) con clase mt4 previa en la cabecera
console.log('\n--- Test de extractDescriptionFromHTML ---');
const sampleHTML = `
  <div class="top-card mt4">Rosario, Santa Fe, Argentina (Híbrido) · Promocionado por técnico de selección</div>
  <div id="job-details" class="jobs-description__content">
    <p dir="ltr">Hey there! We’re Fever, the world’s leading tech platform for culture and live entertainment. High English proficiency (C1 or higher)...</p>
  </div>
`;
const htmlDesc = selectors.extractDescriptionFromHTML(sampleHTML);
const htmlLang = detector.detectLanguage(htmlDesc).lang;
console.log('Texto HTML extraído:', htmlDesc.slice(0, 100) + '...');
console.log('Idioma detectado de HTML:', htmlLang);
assert.strictEqual(htmlLang, 'en', 'La extracción de HTML debe resolver a EN ignorando mt4 de la cabecera');
console.log('✅ PASS: extractDescriptionFromHTML ignora divs mt4 de cabecera y extrae el cuerpo en inglés.');
