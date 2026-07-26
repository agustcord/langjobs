/**
 * Diagnóstico profundo del caso Fever:
 * "Senior Video Editor - Motion Designer" — Fever — Híbrido
 * Traza CADA paso para encontrar por qué se clasifica como ES.
 */
const detector = require('../src/detector.js');
const stopwords = require('../src/stopwords.js');

const title = 'Senior Video Editor - Motion Designer';
const company = 'Fever';

// ── 1. ¿Qué ve el detector con título+empresa? ────────────────────────
console.log('═══════ PASO 1: detectLanguage solo título+empresa ═══════');
const input1 = title + ' ' + company;
const res1 = detector.detectLanguage(input1, { modality: 'hibrido' });
console.log('Input:', JSON.stringify(input1));
console.log('Resultado:', JSON.stringify(res1, null, 2));

// ── 2. Sin modalidad ───────────────────────────────────────────────────
console.log('\n═══════ PASO 2: detectLanguage SIN modalidad ═══════');
const res2 = detector.detectLanguage(input1);
console.log('Resultado:', JSON.stringify(res2, null, 2));

// ── 3. Con modalidad desconocido ───────────────────────────────────────
console.log('\n═══════ PASO 3: detectLanguage con modality=desconocido ═══════');
const res3 = detector.detectLanguage(input1, { modality: 'desconocido' });
console.log('Resultado:', JSON.stringify(res3, null, 2));

// ── 4. ¿Qué tokens genera el normalize? ───────────────────────────────
console.log('\n═══════ PASO 4: Tokenización ═══════');
const normalized = detector.normalize(input1);
const tokens = detector.tokenize(normalized);
console.log('Normalized:', JSON.stringify(normalized));
console.log('Tokens:', tokens);
console.log('Token count:', tokens.length);

// ── 5. Chequear cada token contra stopwords ────────────────────────────
console.log('\n═══════ PASO 5: Stopwords por token ═══════');
for (const t of tokens) {
  const inES = stopwords.STOPWORDS_ES.has(t);
  const inEN = stopwords.STOPWORDS_EN.has(t);
  const exES = stopwords.EXCLUSIVE_ES.has(t);
  const exEN = stopwords.EXCLUSIVE_EN.has(t);
  if (inES || inEN || exES || exEN) {
    console.log(`  "${t}" → ES:${inES} EN:${inEN} exES:${exES} exEN:${exEN}`);
  }
}

// ── 6. Simular con texto de tarjeta CONTAMINADO (incluyendo ubicación) ──
console.log('\n═══════ PASO 6: Contaminación por texto de tarjeta completo ═══════');
const fullCardText = title + ' ' + company + ' Rosario, Santa Fe, Argentina (Híbrido) Visto Promocionado Solicitud sencilla';
const res6 = detector.detectLanguage(fullCardText, { modality: 'hibrido' });
console.log('Input:', JSON.stringify(fullCardText));
console.log('Resultado:', JSON.stringify(res6, null, 2));

// ── 7. Simular con conector "en" de LinkedIn UI ────────────────────────
console.log('\n═══════ PASO 7: Con conector "en" de LinkedIn ═══════');
const withConnector = 'Senior Video Editor - Motion Designer en Fever';
const res7 = detector.detectLanguage(withConnector, { modality: 'hibrido' });
console.log('Input:', JSON.stringify(withConnector));
console.log('Resultado:', JSON.stringify(res7, null, 2));

// ── 8. Simular con "Promocionado por técnico de selección" ─────────────
console.log('\n═══════ PASO 8: Con metadatos UI "Promocionado por técnico de selección" ═══════');
const withPromo = title + ' ' + company + ' Promocionado por técnico de selección';
const res8 = detector.detectLanguage(withPromo, { modality: 'hibrido' });
console.log('Input:', JSON.stringify(withPromo));
console.log('Resultado:', JSON.stringify(res8, null, 2));
const norm8 = detector.normalize(withPromo);
const tok8 = detector.tokenize(norm8);
console.log('Tokens:', tok8);
console.log('Tokens en STOPWORDS_ES:', tok8.filter(t => stopwords.STOPWORDS_ES.has(t)));
console.log('accentHits check:', norm8.match(/[áéíóúñ¿¡ü]/g));

// ── 9. Simular SOLO "Promocionado por técnico de selección" ────────────
console.log('\n═══════ PASO 9: Solo metadatos UI ═══════');
const onlyPromo = 'Promocionado por técnico de selección Respuestas gestionadas fuera de LinkedIn';
const res9 = detector.detectLanguage(onlyPromo);
console.log('Input:', JSON.stringify(onlyPromo));
console.log('Resultado:', JSON.stringify(res9, null, 2));

// ── 10. Descripción real (inglés) ──────────────────────────────────────
console.log('\n═══════ PASO 10: Descripción EN real de Fever ═══════');
const descEN = "Hey there We re Fever the world s leading tech platform for culture and live entertainment Our mission To democratize access to culture and entertainment With our proprietary cutting edge technology and data driven approach we re revolutionizing the way people engage with live entertainment Every month our platform inspires over 300 million people in 55 countries to discover unforgettable experiences while also empowering event creators with our data and technology helping them scale innovate and enhance their events to reach new audiences";
const res10 = detector.detectLanguage(descEN);
console.log('Resultado:', JSON.stringify(res10, null, 2));

// ── 11. Simular getDetailDescription contaminada ───────────────────────
console.log('\n═══════ PASO 11: Descripción contaminada (UI ES + body EN) ═══════');
const contaminatedDesc = 'Rosario Santa Fe Argentina Publicado de nuevo hace 1 semana 61 personas han hecho clic en Solicitar Promocionado por técnico de selección Respuestas gestionadas fuera de LinkedIn Híbrido Jornada completa Solicitar Guardar Acerca del empleo ' + descEN;
const res11 = detector.detectLanguage(contaminatedDesc);
console.log('Resultado:', JSON.stringify(res11, null, 2));
const norm11 = detector.normalize(contaminatedDesc);
const tok11 = detector.tokenize(norm11);
console.log('Tokens ES:', tok11.filter(t => stopwords.STOPWORDS_ES.has(t)));
console.log('Tokens EN:', tok11.filter(t => stopwords.STOPWORDS_EN.has(t)));

console.log('\n═══════ DIAGNÓSTICO COMPLETO ═══════');
