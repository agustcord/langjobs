# LangJobs — Investigación: ¿Hay riesgo real de baneo en LinkedIn por el fetch de descripciones?

**Fecha:** 26 de julio de 2026
**Autor:** Neko-chan (asistente de Corbata)
**Alcance:** evaluar, con fuentes primarias, si el mecanismo actual de LangJobs (leer todas las tarjetas + `fetch` en segundo plano de la descripción de las dudosas) expone la cuenta del usuario a un baneo de LinkedIn, y qué mitigaciones aplicar.

> 📌 **Este archivo es DOCUMENTACIÓN INTERNA.** No va al repositorio de GitHub ni a la store. Vive en el Desktop de Corbata.

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Viola el User Agreement de LinkedIn? | **SÍ**, explícitamente (prohíbe extensiones que *scrapeen* o *modifiquen la apariencia*). |
| ¿Hay riesgo real de baneo? | **SÍ, pero BAJO** para la implementación actual (pasiva, solo-lectura, bajo volumen). |
| ¿Qué es lo más probable que pase? | Que pase **desapercibido**. El baneo documentado es casi siempre por automatización *activa* en la nube, no por un enriquecedor de DOM en el navegador. |
| ¿El riesgo de ban es cero? | **NO.** LinkedIn detecta extensiones y una sesión marcada "pone en riesgo toda la cuenta". |
| ¿La documentación actual era honesta? | **NO.** Decía "cero red / 100% local / zero data leaves your browser", contradiciendo el `fetch` al endpoint de LinkedIn. Ya se corrigió (ver §6). |

**Veredicto:** el baneo es poco probable en el uso normal de la extensión, pero no es cero y el incumplimiento del ToS es real. La acción de mayor impacto y mínimo esfuerzo es `credentials: 'omit'` para des-atribuir el fetch a la cuenta del usuario.

---

## 2. Cómo funciona hoy (lo que implementa LangJobs)

En `src/app.js`, la función `fetchJobDetail` (línea ~92) dispara, para cada tarjeta ambigua (`??`), una petición:

```js
const url = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + jobId;
fetch(url)   // sin credentials → default del navegador
```

Controles ya presentes (buenos para el riesgo):
- `MAX_CONCURRENT = 3` (línea 90).
- `FETCH_CACHE` + `FETCH_PENDING` → no repite el mismo jobId (dedup).
- Solo se dispara para tarjetas ambiguas (~2-3 por página), no para todas.

**Detalle técnico crítico:** un content script inyectado en `linkedin.com` es **mismo-origen** que `www.linkedin.com/jobs-guest/...`. Por defecto, `fetch` en mismo-origen **adjunta las cookies de sesión** (`li_at`, `JSESSIONID`) del usuario. O sea: el request va **autenticado con la cuenta de LinkedIn del usuario**, aunque use el endpoint "guest".

→ LinkedIn *puede atribuir esas llamadas a la cuenta*. Ese es el dato central para la pregunta del baneo.

---

## 3. Fuentes primarias consultadas

- **LinkedIn User Agreement** (`linkedin.com/legal/user-agreement`): *"Develop, support or use software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons or any other technology) to scrape or copy the Services, including profiles and other data from the Services."*
- **LinkedIn Help — Prohibited software and extensions** (`linkedin.com/help/linkedin/answer/a1341387`): *"we don't permit the use of any third party software, including 'crawlers', bots, browser plug-ins, or browser extensions that scrape, modify the appearance of, or automate activity on LinkedIn's website."*
- **Microsoft Learn — LinkedIn API Rate Limiting**: confirma `429` ante exceso de llamadas; límites no publicados.
- **hiQ Labs v. LinkedIn (9º Circuito, 2019 / reafirmado 2025-2026)**: scrapear datos *públicos* no viola CFAA, pero sí puede ser *breach of contract* → LinkedIn aplica restricción de cuenta. "Legal" ≠ "permitido por ToS" ≠ "sin riesgo de ban".
- **Estudios de detección** (LinkedHelper LH2, Cleverly, connectsafely.ai, 2026): LinkedIn detecta extensiones por "DOM manipulation patterns", "API call sequences" y firmas de navegador faltantes; *"one flagged session puts the whole account at risk"*.
- **Reportes de volumen** (linkedapi.io): el endpoint `jobs-guest` tira **429 tras ~10 páginas por IP** sin proxies. LangJobs está muy por debajo.

---

## 4. Por qué el riesgo de BAN es BAJO en este caso

1. **Uso pasivo / solo-lectura.** No se automatizan acciones (no conecta, no postula, no manda mensajes). La detección de LinkedIn apunta a *high-velocity mass retrieval* y *unnatural activity patterns* — típico de automatización activa en la nube, no de un enriquecedor de DOM local.
2. **Volumen acotado.** Máx. 3 concurrentes, solo dudosas (~2-3/página), con caché y dedup. Muy por debajo del umbral de 429 del endpoint guest.
3. **Endpoint semi-público.** `/jobs-guest/` está pensado para verse sin login; no extrae datos privados.
4. **Precedente empírico.** Extensiones de "mejora de DOM de solo lectura" llevan años operando sin bans reportados. Los bans documentados son casi siempre automatización *activa* (estilo PhantomBuster) o scraping en la nube.

---

## 5. Por qué el riesgo NO es cero

- **Incumplimiento de ToS claro:** la extensión hace las dos cosas que el Help prohibe → *scrapea* (fetch de descripción) y *modifica la apariencia* (badges). Ban o no, el contrato se viola.
- **Atribución a la cuenta:** por el manejo de cookies del content script (§2), el request va autenticado. Si LinkedIn decide actuar sobre ese endpoint con sesión, puede vincularlo al usuario.
- **Detección de extensiones:** LinkedIn identifica "API call sequences" y manipulación de DOM que no matchean el comportamiento nativo. Una sesión marcada *"puts the whole account at risk"* (connectsafely.ai).

---

## 6. Hallazgo de inconsistencia (ya corregido en el repo)

La documentación previa del proyecto afirmaba "cero red / 100% local / zero data leaves your browser", pero el último commit (`56ec09c`) agregó el `fetch` en segundo plano. Contradicción real:

| Archivo | Texto anterior (engañoso) | Estado |
|---|---|---|
| `index.md` | "procesamiento 100% local en el DOM" / "cero red, cero scraping" | ✅ corregido |
| `PRIVACY.md` | "no realiza ninguna conexión de red" | ✅ corregido |
| `manifest.json` | "100% local en el DOM, sin enviar datos a ningún servidor" | ✅ corregido |
| `README.md` | "100% local, sin enviar un solo byte" / "zero data leaves your browser" | ✅ corregido |
| `.memory/wiki/01_Arquitectura_y_Requisitos.md` | "Cero red, cero servidores" / "Cero riesgo de ban" | ✅ corregido |
| `.memory/wiki/06_Competencia_y_Naming.md` | "100% local" | ✅ corregido |

Verificación ad-hoc: `manifest.json` parsea como JSON válido y un barrido de honestidad sobre todo el repo confirma **cero frases engañosas restantes**. Estos cambios están **sin commitear** (pendientes de tu OK para push).

---

## 7. Recomendaciones de implementación

### 🔴 R1 — Des-atribuir el fetch (prioridad alta, esfuerzo mínimo) — *PENDIENTE DE TU OK*
Cambiar en `src/app.js:101`:
```js
fetch(url, { credentials: 'omit' })
```
- El endpoint `jobs-guest` funciona **sin login**. Omitir cookies lo deja como visitante anónimo.
- El request deja de estar atribuido a la cuenta del usuario → baja drásticamente el riesgo de ban (pasa a ser "cualquiera viendo una vacante pública").
- No afecta la precisión: el HTML de la descripción se entrega igual.
- *Requiere verificar empíricamente que el endpoint responde sin cookies (probar con `curl` contra un jobId real).*

### 🟡 R2 — Mantener límites actuales (ya hecho, no tocar)
- `MAX_CONCURRENT = 3`, `FETCH_CACHE`, `FETCH_PENDING`. Son adecuados. Si algún día se escala el volumen, subir el throttle y considerar backoff ante `429`.

### 🟡 R3 — Manejo explícito de 429
Hoy el `.catch` solo descuenta el contador y silencia. Recomendado: si la respuesta es `429`, pausar ese jobId un rato (backoff) en vez de reintentar en el mismo tick. Evita espiral de reintentos si LinkedIn ajusta límites.

### 🟢 R4 — Documentar el riesgo de ToS abierta y honestamente
Ya se corrigió la privacidad. Recomendación adicional: en el README/PRIVACY dejar una nota corta y honesta tipo *"LangJobs usa el endpoint público de LinkedIn para resolver vacantes dudosas; esto viola el User Agreement de LinkedIn (que prohíbe extensiones que modifiquen la apariencia o scrapeen). El riesgo de baneo en uso pasivo es bajo, pero existe."* — transparencia total para el usuario que se la juega.

### 🟢 R5 — No prometer "cero riesgo"
Evitar claims de "sin riesgo de ban" en cualquier documento público. El usuario debe poder decidir con información completa.

---

## 8. Conclusión

El miedo de Corbata era razonable, pero la evidencia dice: **para el uso normal de LangJobs el baneo es improbable** (extensión pasiva, bajo volumen, endpoint público). El riesgo real es el *incumplimiento de ToS*, que no desaparece con `credentials:'omit'` pero sí des-atribuye la llamada a la cuenta.

**Plan de acción sugerido:**
1. (Hecho) Corregir la documentación engañosa del repo.
2. (Pendiente, tu decisión) Aplicar `credentials: 'omit'` + regenerar bundle.
3. (Pendiente, tu decisión) Verificar empíricamente que `jobs-guest` responde sin cookies.
4. (Opcional) Backoff ante `429` y nota honesta de ToS en el README.

—
*Investigación basada en User Agreement, LinkedIn Help, Microsoft Learn, caso hiQ v. LinkedIn y reportes de detección de 2026. No es asesoramiento legal.*
