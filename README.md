<div align="center">

# 🌐 LangJobs

### Job Language Filter for LinkedIn

**Filtrá las vacantes de LinkedIn por idioma (español / inglés) — 100% local, sin enviar un solo byte a ningún servidor.**

*Filter LinkedIn job posts by language (Spanish / English) — 100% local processing, zero data leaves your browser.*

![Estado](https://img.shields.io/badge/estado-en%20desarrollo-green)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Privacidad](https://img.shields.io/badge/privacidad-100%25%20local-success)
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

- **Todo el procesamiento ocurre en tu pestaña.** La detección de idioma usa listas de palabras funcionales (stopwords) evaluadas en memoria — no hay IA remota, no hay API externa, no hay servidor nuestro.
- **Cero recolección de datos.** No leemos, guardamos ni transmitimos descripciones de vacantes, empresas ni datos de tu cuenta. Lo único que se persiste es tu configuración (idioma, modo), localmente en tu navegador.
- **Cero automatización.** LangJobs no clickea, no aplica a vacantes, no simula actividad. Solo lee el texto ya visible en tu pantalla y aplica estilos CSS.
- **Permisos mínimos.** Solo `storage` y acceso a `linkedin.com/jobs/*`. Nada más.

## ⚙️ Cómo funciona (resumen técnico)

1. Al cargar `linkedin.com/jobs/search/`, LangJobs recorre las tarjetas visibles (`[data-job-id]`) y las clasifica. Un **`MutationObserver`** (T1.7) vigila el scroll infinito y los nodos reciclados de LinkedIn, con *debounce* para no reprocesar en cada mutación y un hash de contenido (`data-llf-hash`) para saltar tarjetas ya etiquetadas.
2. El texto de cada tarjeta se clasifica con un **detector de idioma por stopwords funcionales** (artículos, preposiciones, conjunciones) — inmune a la jerga técnica en inglés típica de las vacantes en español (*"buscamos developer con experiencia en testing y deployment"* → español ✅).
3. Ante la duda, **fail-open**: si el detector no está seguro, la vacante se muestra con badge `??` y **nunca** se oculta/atenua. Preferimos que veas una de más antes que perder una válida.
4. Según el `CONFIG` (T1.8), la acción se aplica solo con **estilos CSS propios** (`llf-hidden` / `llf-dim`) — nunca se eliminan nodos del DOM (preserva la virtualización de LinkedIn). Modos: `label` (solo badge), `dim` (atenuar no deseados), `hide` (ocultar no deseados). `targetLang` es el idioma que se **mantiene visible**.

## 📁 Estructura del repositorio

```
src/
  stopwords.js        # listas de stopwords funcionales ES/EN (módulo UMD)
  detector.js         # detectLanguage(texto) -> {lang, scoreEs, scoreEn} (UMD, puro)
  selectors.js        # extracción del DOM de LinkedIn por capas (UMD, inyectable)
  app.js              # orquestación: une los módulos y etiqueta tarjetas (UMD)
tools/
  build_userscript.js # bundler sin dependencias -> userscript/langjobs.user.js
userscript/
  langjobs.user.js    # script generado, listo para Tampermonkey (no editar a mano)
tests/
  corpus.js           # casos de prueba del detector (ES/EN/edge cases)
  run.js              # harness de consola (Node)
```

La fuente de verdad vive en `src/`. El mismo código se reutiliza en la extensión Chrome (Fase 2), por eso los módulos son UMD y no crean el DOM por su cuenta (reciben los nodos inyectados).

## 🚀 Estado del proyecto

> 🟢 **Fase 1 en desarrollo.** El prototipo Tampermonkey ya etiqueta y filtra vacantes por idioma (modos etiquetar / atenuar / ocultar, conmutables vía `CONFIG`). Aún no hay build instalable oficial; se prueba manualmente en navegador.

| Fase | Estado |
|---|---|
| Planificación y arquitectura | ✅ Completa |
| Repositorio y documentación | ✅ Completa |
| Prototipo Tampermonkey (validación de lógica) | 🔄 En curso — T1.1–T1.8 ✅, falta T1.9–T1.11 |
| Extensión Chrome (Manifest V3) | ⏳ Pendiente |
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

- **Fase 2:** extensión nativa para Chrome (modo desarrollador primero, luego Chrome Web Store)

## 🗺️ Roadmap resumido

- [x] Arquitectura, requisitos y estrategia de testing
- [x] Repositorio y documentación
- [x] **Fase 1 — Prototipo Tampermonkey** (en curso):
  - [x] T1.1 Stopwords ES/EN · [x] T1.2 Detector de idioma · [x] T1.3 Harness de tests
  - [x] T1.4 Inspección del DOM real · [x] T1.5 Selectores en capas · [x] T1.6 Userscript (solo etiquetar)
  - [x] T1.7 MutationObserver + debounce + hash idempotente · [x] T1.8 Modos ocultar/atenuar (CONFIG)
  - [ ] T1.9 Clasificación por panel de detalle · [ ] T1.10 Prueba en navegador real · [ ] T1.11 Ajuste de listas/umbral
- [ ] **Fase 2** — Extensión Chrome MV3: popup de configuración, storage local, publicación
- [ ] **Fase 3** — Modelo freemium (funciones avanzadas: más idiomas, whitelist de empresas)

## ⚖️ Aviso legal

LangJobs es un proyecto independiente, **no afiliado, asociado ni respaldado por LinkedIn Corporation ni Microsoft**. "LinkedIn" es marca registrada de LinkedIn Corporation; se menciona únicamente para describir compatibilidad. La extensión no hace scraping, no automatiza acciones y no interactúa con servidores de LinkedIn más allá de la navegación normal del usuario.

### Licencia

© 2026 Jonatan Agustín Córdoba. Distribuido bajo la licencia **[PolyForm Noncommercial 1.0.0](LICENSE.md)**: podés leer, estudiar y usar este código para **cualquier propósito no comercial**; todo uso comercial requiere autorización expresa del autor.

---

<div align="center">

Hecho con 🧉 desde Argentina

</div>
