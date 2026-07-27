<div align="center">

# 🌐 LangJobs

### Job Language Filter for LinkedIn

**Filtrá las vacantes de LinkedIn por idioma (español / inglés) — detección de idioma 100% local en tu navegador; solo para las vacantes dudosas consulta el endpoint público de LinkedIn.**

*Filter LinkedIn job posts by language (Spanish / English) — language detection runs 100% locally in your browser; only ambiguous jobs trigger a read-only request to LinkedIn's public job endpoint.*

![Estado](https://img.shields.io/badge/estado-en%20desarrollo-green)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Privacidad](https://img.shields.io/badge/privacidad-sin%20servidor%20propio-success)
![Prototipo](https://img.shields.io/badge/prototipo-Tampermonkey-00485B?logo=tampermonkey)

</div>

---

## 😾 El problema

Buscás trabajo en LinkedIn desde Latinoamérica o España y los resultados mezclan vacantes en español e inglés sin ningún filtro nativo para separarlas. Scrolleás cientos de tarjetas leyendo títulos para descartar la mitad. LinkedIn no ofrece filtro por idioma del aviso. Las extensiones existentes que lo intentaron están rotas o abandonadas.

## ✨ La solución

**LangJobs** detecta el idioma de cada vacante directamente en tu navegador y te deja elegir qué hacer con las que no te interesan:

| Modo | Qué hace |
|---|---|
| 🏷️ **Etiquetar** | Agrega un badge de idioma (ES / EN) a cada tarjeta, sin ocultar nada |
| 🌫️ **Atenuar** | Baja la opacidad de las vacantes en el idioma que no querés |
| 🙈 **Ocultar** | Las saca de tu vista (reversible con un click) |

Funciona automáticamente con el scroll infinito: las vacantes nuevas se clasifican a medida que aparecen, sin botones manuales ni recargas.

## 🔒 Privacidad primero (en serio)

- **El detector de idioma corre 100% en tu navegador.** Usa listas de palabras funcionales (stopwords) evaluadas en memoria — no hay IA remota ni servidor nuestro.
- **Resolución de vacantes dudosas:** para las tarjetas que el detector no puede clasificar por el título (badge `??`), LangJobs hace una petición de **solo lectura** al endpoint público de LinkedIn `jobs-guest/jobs/api/jobPosting/<id>` para leer la descripción completa y resolver el idioma. Esa petición va a los servidores de LinkedIn (no a un servidor nuestro) y solo envía el ID de la vacante; no manda datos de tu cuenta ni de navegación.
- **Cero recolección de datos.** No leemos, guardamos ni transmitimos descripciones, empresas ni datos de tu cuenta a ningún servidor nuestro. Lo único que se persiste es tu configuración (idioma, modo), localmente en tu navegador.
- **Cero automatización de actividad.** LangJobs no clickea, no aplica a vacantes ni simula actividad. No envía datos personales a ningún lado.
- **Permisos mínimos.** Solo `storage` y acceso a `linkedin.com/jobs/*`. Nada más.

## ⚙️ Cómo funciona (resumen técnico)

1. Al cargar `linkedin.com/jobs/search/`, LangJobs recorre las tarjetas visibles (`[data-job-id]`) y las clasifica. Un **`MutationObserver`** (T1.7) vigila el scroll infinito y los nodos reciclados de LinkedIn, con *debounce* para no reprocesar en cada mutación y un hash de contenido (`data-llf-hash`) para saltar tarjetas ya etiquetadas.
2. El texto de cada tarjeta se clasifica con un **detector de idioma por stopwords funcionales** (artículos, preposiciones, conjunciones) — inmune a la jerga técnica en inglés típica de las vacantes en español (*"buscamos developer con experiencia en testing y deployment"* → español ✅).
3. Ante la duda, **fail-open**: si el detector no está seguro, la vacante se muestra con badge `??` y **nunca** se oculta/atenua. Preferimos que veas una de más antes que perder una válida.
4. Según el `CONFIG` (T1.8), la acción se aplica solo con **estilos CSS propios** (`llf-hidden` / `llf-dim`) — nunca se eliminan nodos del DOM (preserva la virtualización de LinkedIn). Modos: `label` (solo badge), `dim` (atenuar no deseados), `hide` (ocultar no deseados). `targetLang` es el idioma que se **mantiene visible**.
5. **Retro-etiquetado (T1.9):** al abrir una vacante, LangJobs lee su **panel de detalle** (descripción completa, columna derecha) y re-clasifica esa tarjeta con el texto íntegro — mucho más fiable que el solo título. Una vez resuelto el idioma (es/en) por su descripción, no se degrada al volver a la lista.

## 🧱 Estrategia de detección (pipeline de 5 capas)

LangJobs clasifica cada vacante con un **pipeline de 5 capas** que combina detección local instantánea, heurísticas de mercado y resolución asíncrona de los casos dudosos:

1. **Capa 1 — Detector Local Instantáneo (0 ms):** Evalúa `título + empresa` mediante *stopwords funcionales* y un diccionario de roles (`ROLE_ES` / `ROLE_EN`). Clasifica al instante la mayoría de las vacantes de la lista.
2. **Capa 2 — Heurística de Modalidad de Mercado (LATAM/Rosario):** Analiza el tipo de lugar de trabajo (`Presencial` / `Híbrido` vs `En remoto`). Los puestos locales presenciales/híbridos con títulos en español se confirman inmediatamente como `ES`.
3. **Capa 3 — Marcado de Ambigüedad Fail-Open (Gris `??`):** Si una vacante tiene título en inglés pero modalidad presencial/híbrida local (ej. *Varsity Tutors* vs *Wiener lab*), se asigna temporalmente `??` (Gris). **NUNCA se oculta ni atenúa en modo `hide`** (garantía anti-pérdida de vacantes).
4. **Capa 4 — Fetch Silencioso Asíncrono en Segundo Plano:** Para las dudosas (las `??`), una cola asíncrona throttled (máx. 3 peticiones simultáneas) dispara un `fetch('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<jobId>')` silencioso al endpoint público de LinkedIn. Lee la descripción completa en **~300 ms** y resuelve la tarjeta en la lista de `??` ➔ `ES` o `EN`. Los resultados se guardan en el caché en memoria `FETCH_CACHE`.
5. **Capa 5 — Retro-etiquetado por Panel de Detalle Activo:** Al seleccionar cualquier tarjeta en la lista, el lector del panel derecho confirma el idioma en tiempo real.

> ⚠️ **Sobre la precisión:** la detección es buena pero **no es perfecta**. En pruebas internas con un corpus de casos conocidos (títulos cortos, spanglish, bilingüe, jerga técnica) el acierto se ubica en un rango aproximado de **80%–90%**, y **todavía no hay una validación de precisión formal en búsquedas reales de LinkedIn**. El modo `label` (V1) entrega valor aunque haya algún error: siempre ves el badge y podés confirmar a ojo. El fail-open (`??`) evita ocultar por error una vacante válida.

---

## 📁 Estructura del repositorio

```
src/
  stopwords.js        # listas de stopwords funcionales ES/EN (módulo UMD)
  detector.js         # detectLanguage(texto, opts) -> {lang, isAmbiguous} (UMD, puro)
  selectors.js        # extracción del DOM de LinkedIn + parseador HTML (UMD)
  app.js              # orquestador: cola fetch silenciosa, caché y tagging (UMD)
tools/
  build_userscript.js # bundler sin dependencias -> userscript/langjobs.user.js
  build_extension.js  # bundler sin dependencias -> extension/content.js (Fase 2)
userscript/
  langjobs.user.js    # script listo para Tampermonkey (generado desde src/)
extension/
  manifest.json       # Manifest V3 de la extensión Chrome
  content.js          # content script (generado desde src/, Fase 2)
  popup/              # UI de configuración (en construcción, Fase 2)
  icons/              # íconos de la extensión
tests/
  corpus.js           # casos de prueba del detector
  run.js              # harness de consola (Node)
```

La fuente de verdad vive en `src/`. El mismo código se reutiliza en el userscript de Tampermonkey y en la extensión Chrome (Fase 2).

---

## 🚀 Estado del proyecto

> 🏗️ **Fase 1 completa (v0.5.2) y Fase 2 en desarrollo.** El prototipo Tampermonkey etiqueta y filtra vacantes por idioma; la extensión nativa Chrome (Manifest V3) está en construcción.

| Fase | Estado |
|---|---|
| Planificación y arquitectura | ✅ Completa |
| Repositorio y documentación | ✅ Completa |
| Prototipo Tampermonkey (Fase 1) | ✅ **Completa (v0.5.2)** |
| Extensión Chrome MV3 (Fase 2) | 🔄 En curso (T2.1–T2.3 hechos; popup y publicación pendientes) |
| Publicación en Chrome Web Store | ⏳ Pendiente |

### Instalación (Fase 1 — prototipo Tampermonkey)

1. Instalá la extensión [Tampermonkey](https://www.tampermonkey.net/) en tu navegador (Chromium: Brave, Chrome, Edge).
2. Generá el userscript desde la fuente (sin dependencias):
   ```bash
   node tools/build_userscript.js
   ```
   Esto crea `userscript/langjobs.user.js` autocontenido (los módulos de `src/` ya incrustados, sin `@require` frágiles).
3. En Tampermonkey → *Agregar nuevo script* → pegá el contenido de `userscript/langjobs.user.js` → *Guardar*.
4. Andá a `linkedin.com/jobs/search/`. Cada tarjeta muestra un badge **ES** / **EN** / **??** y, según el modo, se atenúa u oculta.

> 🔧 **Configuración (T1.8):** en el archivo `userscript/langjobs.user.js` hay un bloque `CONFIG` editable al inicio del script:
> ```js
> var CONFIG = { targetLang: 'es', mode: 'label' };
> ```
> - `targetLang`: idioma que se **mantiene visible** (`'es'` o `'en'`).
> - `mode`: `'label'` (solo badge, por defecto, para validar sin riesgo) · `'dim'` (atenuar las no deseadas) · `'hide'` (ocultar las no deseadas).
> Las vacantes `unknown` **nunca** se ocultan (fail-open). Para cambiar el comportamiento, editá `CONFIG`, guardá y recargá la página.

### Extensión Chrome (Fase 2 — modo desarrollador)

1. `node tools/build_extension.js` genera `extension/content.js` desde `src/`.
2. En `brave://extensions` (o `chrome://extensions`) activá *Modo desarrollador* y elegí *Cargar sin empaquetar* → seleccioná la carpeta `extension/`.
3. Andá a `linkedin.com/jobs/`; el content script etiqueta las tarjetas automáticamente (modo `label` por defecto). El popup de configuración y la persistencia llegarán en T2.4/T2.5.

## 🗺️ Roadmap resumido

- [x] Arquitectura, requisitos y estrategia de testing
- [x] Repositorio y documentación
- [x] **Fase 1 — Prototipo Tampermonkey** (completa, v0.5.2):
  - [x] T1.1 Stopwords ES/EN · [x] T1.2 Detector de idioma · [x] T1.3 Harness de tests
  - [x] T1.4 Inspección del DOM real · [x] T1.5 Selectores en capas · [x] T1.6 Userscript (solo etiquetar)
  - [x] T1.7 MutationObserver + debounce + hash idempotente · [x] T1.8 Modos ocultar/atenuar (CONFIG)
  - [x] T1.9 Clasificación por panel de detalle (retro-etiquetado) · [x] T1.10 Prueba en navegador real · [x] T1.11 Ajuste de listas/umbral
- [ ] **Fase 2** — Extensión Chrome MV3:
  - [x] T2.1 Estructura + manifest.json V3 · [x] T2.2 Módulos compartidos · [x] T2.3 Content script funcional
  - [ ] T2.4 Popup de configuración · [ ] T2.5 Persistencia chrome.storage + reacción en vivo
  - [ ] T2.6 Contador de vacantes filtradas · [ ] T2.7 Íconos y naming · [ ] T2.8 Beta personal (1 semana)
  - [ ] T2.9 Cuenta de desarrollador · [ ] T2.10 Ficha de la tienda · [ ] T2.11 Envío a revisión
- [ ] **Fase 3** — Modelo freemium (funciones avanzadas: más idiomas, whitelist de empresas)

## ⚖️ Aviso legal

LangJobs es un proyecto independiente, **no afiliado, asociado ni respaldado por LinkedIn Corporation ni Microsoft**. "LinkedIn" es marca registrada de LinkedIn Corporation; se menciona únicamente para describir compatibilidad. La extensión no hace scraping, no automatiza acciones y no interactúa con servidores de LinkedIn más allá de la navegación normal del usuario.

### Licencia

© 2026 Jonatan Agustín Córdoba. Distribuido bajo la licencia **[PolyForm Noncommercial 1.0.0](LICENSE.md)**: podés leer, estudiar y usar este código para **cualquier propósito no comercial**; todo uso comercial requiere autorización expresa del autor.

---

<div align="center">

Hecho con 🧉 desde Argentina

</div>
