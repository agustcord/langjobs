<div align="center">

# 🌐 LangJobs

### Job Language Filter for LinkedIn

**Filtrá las vacantes de LinkedIn por idioma (español / inglés) — 100% local, sin enviar un solo byte a ningún servidor.**

*Filter LinkedIn job posts by language (Spanish / English) — 100% local processing, zero data leaves your browser.*

![Estado](https://img.shields.io/badge/estado-en%20planificaci%C3%B3n-yellow)
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
| 🏷️ **Etiquetar** | Agrega un badge de idioma (🇪🇸/🇬🇧) a cada tarjeta, sin ocultar nada |
| 🌫️ **Atenuar** | Baja la opacidad de las vacantes en el idioma que no querés |
| 🙈 **Ocultar** | Las saca de tu vista (reversible con un click) |

Funciona automáticamente con el scroll infinito: las vacantes nuevas se clasifican a medida que aparecen, sin botones manuales ni recargas.

## 🔒 Privacidad primero (en serio)

- **Todo el procesamiento ocurre en tu pestaña.** La detección de idioma usa listas de palabras funcionales (stopwords) evaluadas en memoria — no hay IA remota, no hay API externa, no hay servidor nuestro.
- **Cero recolección de datos.** No leemos, guardamos ni transmitimos descripciones de vacantes, empresas ni datos de tu cuenta. Lo único que se persiste es tu configuración (idioma, modo), localmente en tu navegador.
- **Cero automatización.** LangJobs no clickea, no aplica a vacantes, no simula actividad. Solo lee el texto ya visible en tu pantalla y aplica estilos CSS.
- **Permisos mínimos.** Solo `storage` y acceso a `linkedin.com/jobs/*`. Nada más.

## ⚙️ Cómo funciona (resumen técnico)

1. Un `MutationObserver` detecta las tarjetas de vacantes que LinkedIn agrega dinámicamente al hacer scroll.
2. El texto visible de cada tarjeta se clasifica con un **detector de idioma por stopwords funcionales** (artículos, preposiciones, conjunciones) — inmune a la jerga técnica en inglés típica de las vacantes en español (*"buscamos developer con experiencia en testing y deployment"* → español ✅).
3. Ante la duda, **fail-open**: si el detector no está seguro, la vacante se muestra. Preferimos que veas una de más antes que perder una válida.
4. La acción elegida (etiquetar/atenuar/ocultar) se aplica solo con clases CSS propias — nunca se eliminan nodos del DOM.

## 🚀 Estado del proyecto

> 🟡 **En planificación / desarrollo temprano.** Todavía no hay versión instalable.

| Fase | Estado |
|---|---|
| Planificación y arquitectura | ✅ Completa |
| Repositorio y documentación | 🔄 En curso |
| Prototipo Tampermonkey (validación de lógica) | ⏳ Próximamente |
| Extensión Chrome (Manifest V3) | ⏳ Pendiente |
| Publicación en Chrome Web Store | ⏳ Pendiente |

### Instalación

- **Hoy:** nada que instalar todavía, nya 🐾
- **Fase 1:** userscript para [Tampermonkey](https://www.tampermonkey.net/) (se publicará acá con instrucciones)
- **Fase 2:** extensión nativa para Chrome (modo desarrollador primero, luego Chrome Web Store)

## 🗺️ Roadmap resumido

- [x] Arquitectura, requisitos y estrategia de testing
- [x] Repositorio y documentación
- [ ] **Fase 1** — Prototipo Tampermonkey: detector de stopwords + manejo del DOM dinámico
- [ ] **Fase 2** — Extensión Chrome MV3: popup de configuración, storage local, publicación
- [ ] **Fase 3** — Modelo freemium (funciones avanzadas: más idiomas, whitelist de empresas)

## ⚖️ Aviso legal

LangJobs es un proyecto independiente, **no afiliado, asociado ni respaldado por LinkedIn Corporation ni Microsoft**. "LinkedIn" es marca registrada de LinkedIn Corporation; se menciona únicamente para describir compatibilidad. La extensión no hace scraping, no automatiza acciones y no interactúa con servidores de LinkedIn más allá de la navegación normal del usuario.

---

<div align="center">

Hecho con 🧉 desde Argentina

</div>
