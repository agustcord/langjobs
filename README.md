<div align="center">

# 🌐 LangJobs

### Job Language Filter for LinkedIn

**Filtrá las vacantes de LinkedIn por idioma (español / inglés) — detección de idioma 100% local en tu navegador; solo para las vacantes dudosas consulta el endpoint público de LinkedIn.**

*Filter LinkedIn job posts by language (Spanish / English) — language detection runs 100% locally in your browser; only ambiguous jobs trigger a read-only request to LinkedIn's public job endpoint.*

![Versión](https://img.shields.io/badge/versión-v0.5.3--mvp-blue)
![Precisión Beta](https://img.shields.io/badge/precisión%20beta-95.76%25-brightgreen)
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
| 🏷️ **Etiquetar** | Agrega un badge de idioma (ES / EN / ??) a cada tarjeta, sin ocultar nada |
| 🌫️ **Atenuar** | Baja la opacidad de las vacantes en el idioma que no querés *(en desarrollo V2)* |
| 🙈 **Ocultar** | Las saca de tu vista de forma reversible *(en desarrollo V2)* |

Funciona automáticamente con el scroll infinito: las vacantes nuevas se clasifican a medida que aparecen, sin botones manuales ni recargas.

## 🔒 Privacidad primero (en serio)

- **El detector de idioma corre 100% en tu navegador.** Usa listas de palabras funcionales (stopwords) evaluadas en memoria — no hay IA remota ni servidor nuestro.
- **Resolución de vacantes dudosas:** para las tarjetas que el detector no puede clasificar por el título (badge `??`), LangJobs hace una petición de **solo lectura** al endpoint público de LinkedIn `jobs-guest/jobs/api/jobPosting/<id>` para leer la descripción completa y resolver el idioma. Esa petición va a los servidores de LinkedIn (no a un servidor nuestro) y solo envía el ID de la vacante; no manda datos de tu cuenta ni de navegación.
- **Cero recolección de datos.** No leemos, guardamos ni transmitimos descripciones, empresas ni datos de tu cuenta a ningún servidor nuestro. Lo único que se persiste es tu configuración (idioma, modo), localmente en tu navegador.
- **Cero automatización de actividad.** LangJobs no clickea, no aplica a vacantes ni simula actividad. No envía datos personales a ningún lado.
- **Permisos mínimos.** Solo `storage` y acceso a `linkedin.com/jobs/*`. Nada más.

## ⚙️ Cómo funciona (resumen técnico)

1. Al cargar `linkedin.com/jobs/search/`, LangJobs recorre las tarjetas visibles (`[data-job-id]`) y las clasifica. Un **`MutationObserver`** vigila el scroll infinito y los nodos reciclados de LinkedIn, con *debounce* para no reprocesar en cada mutación y un hash de contenido (`data-llf-hash`) para saltar tarjetas ya etiquetadas.
2. El texto de cada tarjeta se clasifica con un **detector de idioma por stopwords funcionales** (artículos, preposiciones, conjunciones) — inmune a la jerga técnica en inglés típica de las vacantes en español (*"buscamos developer con experiencia en testing y deployment"* → español ✅).
3. Ante la duda, **fail-open**: si el detector no está seguro, la vacante se muestra con badge `??` y **nunca** se oculta/atenúa. Preferimos que veas una de más antes que perder una válida.
4. Según la configuración, la acción se aplica solo con **estilos CSS propios** (`llf-hidden` / `llf-dim`) — nunca se eliminan nodos del DOM (preserva la virtualización de LinkedIn).
5. **Retro-etiquetado:** al abrir una vacante, LangJobs lee su **panel de detalle** (descripción completa, columna derecha) y re-clasifica esa tarjeta con el texto íntegro — mucho más fiable que el solo título. Una vez resuelto el idioma (`es`/`en`) por su descripción, no se degrada al volver a la lista.

## 🧱 Estrategia de detección (pipeline de 5 capas)

LangJobs clasifica cada vacante con un **pipeline de 5 capas** que combina detección local instantánea, heurísticas de mercado y resolución asíncrona de los casos dudosos:

1. **Capa 1 — Detector Local Instantáneo (0 ms):** Evalúa `título + empresa` mediante *stopwords funcionales* y un diccionario de roles (`ROLE_ES` / `ROLE_EN`). Clasifica al instante la mayoría de las vacantes de la lista.
2. **Capa 2 — Heurística de Modalidad de Mercado:** Analiza el tipo de lugar de trabajo (`Presencial` / `Híbrido` vs `En remoto`). Los puestos locales presenciales/híbridos con títulos en español se confirman inmediatamente como `ES`.
3. **Capa 3 — Marcado de Ambigüedad Fail-Open (Gris `??`):** Si una vacante tiene título en inglés pero modalidad presencial/híbrida local, se asigna temporalmente `??` (Gris). **NUNCA se oculta ni atenúa en modo `hide`** (garantía anti-pérdida de vacantes).
4. **Capa 4 — Fetch Silencioso Asíncrono en Segundo Plano:** Para las dudosas (`??`), una cola asíncrona throttled (máx. 3 peticiones simultáneas) dispara un `fetch('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<jobId>')` silencioso al endpoint público de LinkedIn. Lee la descripción completa en **~300 ms** y resuelve la tarjeta en la lista de `??` ➔ `ES` o `EN`.
5. **Capa 5 — Retro-etiquetado por Panel de Detalle Activo:** Al seleccionar cualquier tarjeta en la lista, el lector del panel derecho confirma el idioma en tiempo real.

> 📊 **Precisión validada en campo:** En el estudio de prueba de campo sobre un conjunto real de **779 vacantes de LinkedIn Jobs**, LangJobs alcanzó un **95.76% de precisión** (746 clasificaciones correctas / 33 errores). El principio de *fail-open* (`??`) garantiza que nunca se oculta por error una vacante dudosa.

---

## 📁 Estructura del repositorio

```
src/
  stopwords.js              # Listas de stopwords funcionales ES/EN (módulo UMD)
  detector.js               # detectLanguage(texto, opts) -> {lang, isAmbiguous} (UMD, puro)
  selectors.js              # Extracción del DOM de LinkedIn + parseador HTML (UMD)
  app.js                    # Orquestador: cola fetch silenciosa, caché y tagging (UMD)
tools/
  build_userscript.js       # Bundler sin dependencias -> userscript/langjobs.user.js
  build_extension.js        # Bundler sin dependencias -> extension/content.js
  reporter_server.js        # Servidor local de auditoría para pruebas de campo (beta)
  summarize_beta_reports.js # Generador de métricas y consolidación de precisión
userscript/
  langjobs.user.js          # Script listo para Tampermonkey (generado desde src/)
extension/
  manifest.json             # Manifest V3 de la extensión Chrome
  content.js                # Content script (generado desde src/)
  popup/                    # UI de configuración e interruptor global
  icons/                    # Íconos de la extensión
tests/
  corpus.js                 # Casos de prueba del detector sintético (26 casos)
  run.js                    # Harness de consola en Node.js
```

La fuente de verdad vive en `src/`. El mismo código se reutiliza en el userscript de Tampermonkey y en la extensión Chrome.

---

## 🚀 Estado del proyecto

> 🏗️ **Versión v0.5.3 (V1 MVP Estable + Infraestructura Beta Testing).** El prototipo Tampermonkey y la Extensión Nativa Chrome (MV3) cuentan con etiquetado visual e interruptor on/off global totalmente funcionales.

| Componente / Hito | Estado |
|---|---|
| Planificación y arquitectura | ✅ Completa |
| Repositorio y documentación | ✅ Completa |
| Prototipo Tampermonkey (Fase 1) | ✅ **Completa (v0.5.2)** |
| Extensión Chrome MV3 (Fase 2 V1 MVP) | ✅ **Completa (v0.5.3 - Etiquetado + On/Off)** |
| Prueba de Campo Beta (779 vacantes) | ✅ **Completa (95.76% precisión)** |
| Roadmap V2 (Ajustes visuales, precisión ~99%, filtro) | 🔄 En curso |

### Instalación (Extensión Chrome — Modo Desarrollador)

1. Generá el bundle de la extensión desde la fuente:
   ```bash
   node tools/build_extension.js
   ```
2. En tu navegador Chromium (Brave, Chrome, Edge) ingresá a `chrome://extensions` (o `brave://extensions`).
3. Activá el **Modo desarrollador** (switch superior derecho).
4. Hacé click en **Cargar sin empaquetar** (*Load unpacked*) y seleccioná la carpeta `extension/` de este repositorio.
5. Ingresá a `linkedin.com/jobs/search/`: verás los badges **ES**, **EN** o **??** inyectados automáticamente en cada tarjeta.

### Prototipo Tampermonkey (Userscript)

1. Generá el userscript:
   ```bash
   node tools/build_userscript.js
   ```
2. En Tampermonkey → *Agregar nuevo script* → pegá el contenido de `userscript/langjobs.user.js` → *Guardar*.

---

## 🗺️ Roadmap V2 (Evolución Técnica)

- [x] **Ruta 0 — Limpieza y Consolidación (v0.5.3):**
  - [x] Blindaje de repositorios e infraestructura local de auditoría.
  - [x] Publicación de V1 MVP (etiquetado visual + control global on/off).
- [ ] **Ruta 2 — Ajustes Visuales de Badges (`v0.6.0`):**
  - [ ] Aislamiento CSS estricto y conversión de `isJobCardContainer()` a lista blanca.
  - [ ] Prevención de desplazamientos en contenedores nativos flex/grid.
- [ ] **Ruta 1 — Precisión hacia ~99% (`v0.7.0`):**
  - [ ] Red de seguridad de tests offline con suite sintética + 300+ muestras de campo.
  - [ ] Corrección de sesgos en el detector de idioma y UI de LinkedIn.
- [ ] **Ruta 3 — Filtro por Idioma (`v1.0.0`):**
  - [ ] Ocultamiento (`hide`) y atenuación (`dim`) mediante inyección de hojas de estilo dinámicas indexadas por `jobId`.
  - [ ] Botón de restauración instantánea y guardarraíles de fail-open.
- [ ] **Mejoras futuras:**
  - Expansion a más idiomas y personalización avanzada de reglas.

---

## ⚖️ Aviso legal

LangJobs es un proyecto independiente, **no afiliado, asociado ni respaldado por LinkedIn Corporation ni Microsoft**. "LinkedIn" es marca registrada de LinkedIn Corporation; se menciona únicamente para describir compatibilidad. La extensión no hace scraping, no automatiza acciones y no interactúa con servidores de LinkedIn más allá de la navegación normal del usuario.

### Licencia

© 2026 Jonatan Agustín Córdoba. Distribuido bajo la licencia **[PolyForm Noncommercial 1.0.0](LICENSE.md)**: podés leer, estudiar y usar este código para **cualquier propósito no comercial**; todo uso comercial requiere autorización expresa del autor.

---

<div align="center">

Hecho con 🧉 desde Argentina

</div>
