# Migración al rediseño de LinkedIn Jobs (agosto 2026)

> Documento de campo del hotfix **v0.5.4** (rama `hotfix/v0.5.4`).
> Objetivo: que cualquier persona —o cualquier modelo— pueda re-adaptar los
> selectores la próxima vez que LinkedIn rompa la UI **sin repetir la
> investigación forense**.

---

## 1. Resumen del cambio de LinkedIn

**Cuándo:** detectado ~agosto 2026, despliegue global de la UI de búsqueda de empleo.
**Síntoma reportado:** los badges de idioma solo aparecían en el panel derecho
(detalle de la vacante). Las tarjetas de la lista izquierda quedaban sin etiquetar.

**Qué cambió:**

| Antes (UI legacy) | Ahora (UI 2026) |
|---|---|
| Cada tarjeta era `li > div[data-job-id]` | Tarjeta = `div` con clases ofuscadas, **sin `data-job-id`** |
| El título era un `<a href="/jobs/view/ID">` | **No hay `<a>` dentro de la tarjeta**; el click lo maneja JS |
| Clases semánticas (`.job-card-container`, `.artdeco-entity-lockup__subtitle`) | Clases hash autogeneradas (`_983b42c3`, `d950d847`, …) que cambian en cada deploy |
| Filtros en barra lateral | Filtros en fila horizontal arriba (son `<a href="…currentJobId=…">`) |
| Un nivel de anidamiento por tarjeta | Wrappers intermedios con **`display:contents`** (0×0, sin caja de layout) |

**Selectores que murieron (evidencia empírica, consola del navegador):**

```
document.querySelectorAll('[data-job-id]').length              → 0
document.querySelectorAll('a[href*="/jobs/view/"]').length     → 1   (solo panel derecho)
document.querySelectorAll('a[href*="currentJobId="]').length   → 9   (botones de FILTRO + panel derecho, NINGUNA tarjeta)
document.querySelectorAll('button[aria-label^="Descartar empleo"]').length → 1 por vacante ✅
```

Los `a[href*="currentJobId="]` son una **trampa**: `x=408 y=360` → botón "Híbrido";
`x=508 y=360` → "Jornada completa"; `x=863` → panel derecho. Ninguno es una tarjeta.

### Causa raíz real del fallo de v0.5.3 (dos bugs sumados)

v0.5.3 ya usaba el botón ✕ como ancla, pero subía por el DOM hasta que
`parentElement.children.length > 3`. Reproducido con jsdom en
`tests/dom_2026_cards.js` (antes del fix):

```
getDomCards → 3 nodo(s): L12, L12, L12
FAIL ningún nodo devuelto es un wrapper display:contents → L12:contents …
```

1. **Ancla en un nodo sin caja de layout.** El heurístico `children.length > 3`
   se detenía en el wrapper `display:contents` que es hijo directo del
   contenedor de la lista (nivel **L12**). Un elemento `display:contents` **no
   genera caja**: `position:relative` no aplica y `getBoundingClientRect()` da
   0×0. El badge (`position:absolute`) sí se insertaba en el DOM, pero se
   anclaba al primer ancestro posicionado que encontrara (o al viewport) y los
   25 badges se amontonaban en un mismo punto fuera de las tarjetas. Además la
   regla CSS `[data-job-id]{position:relative}` nunca aplicaba, porque las
   tarjetas 2026 no tienen `data-job-id`.
2. **La idempotencia por hash congelaba el bug.** `processCard()` reusaba el
   resultado previo cuando `data-llf-hash` no cambiaba. Cuando LinkedIn
   re-renderiza el interior de la tarjeta (React/Ember) se lleva el badge pero
   **deja intactos los atributos `data-llf-*`** del nodo → la tarjeta quedaba
   marcada como "ya procesada" y sin badge para siempre. Reproducido:
   `el siguiente pase REPONE el badge borrado → badges=0`.

---

## 2. Mapa del DOM 2026 de una tarjeta

Cadena de ancestros medida desde el nodo hoja con el texto del título
("Especialista en MKT Digital"). `w×h` en px, medidos con la lista cargada:

```
L0   SPAN   _983b42c3 _12fe6c88     texto del título
L1   P      b6439155 ab5f2a3b       249x20
L2   DIV    _13225c48 _12fe6c88     0x0    ← display:contents (wrapper fantasma)
L3   DIV    _51373152 …             249x59  contenedor del título
L4   DIV    _51373152 c0ab9de8 …    249x59  título + empresa
L5   DIV    _6c1ad861 …             293x59  contiene el BOTÓN ✕ (hermano del texto), siblings=2
L6   DIV    _51373152 c0ab9de8 …    293x110
L7   DIV    _6c1ad861 …             353x110
L8   DIV    _51373152 c0ab9de8 b14f8610  365x118
L9   DIV    d950d847 ed0b5221 …     365x118, siblings=1
L10  DIV    _13225c48 _12fe6c88     0x0    ← display:contents
L11  DIV    _8682226b a7523b7e …    367x126  ★ TARJETA VISUAL (aquí va el badge)
L12  DIV    _13225c48 _12fe6c88     0x0    ← display:contents, hijo directo de la lista
L13  DIV    _51373152 b7db0e4c …    383x788, children=56  ★ CONTENEDOR DE LA LISTA
L14  DIV    _13225c48 _12fe6c88     0x0
L15  DIV    _1d30fce3 cecd037b …    383x788
L16  DIV    _97c194ec c0481a21 …    960x790  dos paneles (lista + detalle)
```

Detalles que importan:

- **L11 es la tarjeta.** Es el ancestro más externo del botón ✕ que todavía
  contiene **un solo** botón ✕ **y** tiene caja propia.
- **L12 no sirve como ancla** aunque sea el "item de la lista": es
  `display:contents`.
- **L13 tiene 56 hijos para ~25 vacantes** (wrappers + separadores). Cualquier
  heurística basada en "contar hijos" es ruido.
- El botón ✕ **no** es hermano del título: cuelga de L5, ~7–8 niveles por debajo
  de L13. No se puede llegar a la tarjeta con un número fijo de `parentElement`.
- `aria-label` del botón: `Descartar empleo «Especialista en MKT Digital»`
  (UI en inglés: `Dismiss job «…»`). Clase: `_4c6efdeb._1a0414cd._3573fbc7._6f42f60b`
  (ofuscada, inservible).
- Zona de pantalla: lista izquierda `x < 400`; panel derecho `x ≈ 863`.

---

## 3. Selectores estables vs. frágiles

### Estables (usar estos)

| Selector / regla | Para qué | Dónde vive |
|---|---|---|
| `button[aria-label^="Descartar empleo"]`, `…^="Dismiss job"` | ancla de tarjeta **y** fuente del título | `DISMISS_SEL` en `src/app.js`; capa M4 de `titleFromCard()` en `src/selectors.js` |
| **Invariante de recuento de anclas**: la tarjeta es el ancestro más externo que contiene exactamente 1 ✕ | delimitar la tarjeta sin depender de clases | `cardFromAnchor()` en `src/app.js` |
| **Caja de layout** (`offsetWidth>0 && offsetHeight>0`) y `getComputedStyle(el).display !== 'contents'` | descartar wrappers fantasma | `hasLayoutBox()` / `isDisplayContents()` en `src/app.js` |
| `#job-details`, `.jobs-description*` | tope al subir desde el ✕ del panel derecho (si no, la "tarjeta" sería el panel entero) | `DETAIL_BODY_SEL` en `src/app.js` |
| Marcas propias `data-llf-lang`, `data-llf-hash`, `.llf-badge-host` | contar, limpiar y anclar sin depender de LinkedIn | `src/app.js`, popup counter en `tools/build_extension.js` |
| Texto de elementos hoja en orden DOM | leer empresa/metadatos cuando no hay clases semánticas | `textLinesFromCard()` en `src/selectors.js` |

### Frágiles (nunca apoyarse solo en esto)

- **Clases CSS**: todas son hashes (`_983b42c3`, `d950d847`, `b6439155`). Cambian por deploy.
- **`a[href*="currentJobId="]`**: son botones de filtro y links del panel derecho.
- **`[data-job-id]` / `a[href*="/jobs/view/"]`**: solo UI legacy y panel derecho.
  Se conservan como capas 2 y 3 de `getDomCards()` (A/B testing), nunca como capa única.
- **Conteo de hijos / número fijo de `parentElement`**: fue exactamente el fallo de v0.5.3.
- **Profundidad del ✕ respecto de la tarjeta**: varía según el tipo de tarjeta (promocionada, con logo, etc.).

### Consecuencia funcional: no hay `jobId` en la lista

Las tarjetas 2026 no exponen el id de la vacante. Impacto:

- El hash de idempotencia usa `título` (ver `hashOf()`); sigue funcionando.
- `FETCH_CACHE` y el fetch silencioso (`fetchJobDetail`) quedan inactivos para
  las tarjetas de la lista: **sin `jobId` no hay URL que consultar**. Los títulos
  ambiguos se quedan en `??` hasta que el usuario abre la vacante (el panel
  derecho sí resuelve por descripción).
- `jobIdFromCard()` incluye una capa que rescata el id de atributos de tracking
  (`urn:li:jobPosting:NNN`, `data-occludable-job-id`, …) si LinkedIn los repone.
  Verificar con `__LJF_DIAG.ids()`.

---

## 4. Guía de depuración

### 4.1 Script de consola (el más importante)

Archivo: **`tools/diagnose_linkedin_dom.js`**. Es autocontenido a propósito: la
consola de la página corre en el *main world* y **no ve** los globals del content
script (world aislado), así que el script reimplementa el descubrimiento de
tarjetas para comparar "lo que la extensión debería encontrar" con "lo que se ve".

1. Abrir `linkedin.com/jobs/search-results/…` con la lista cargada.
2. F12 → Console → pegar todo el archivo → Enter.
3. Lee el informe. Comandos disponibles después:

```js
__LJF_DIAG.run()                 // repetir informe (conteos + tabla por tarjeta + veredictos)
__LJF_DIAG.trace('MKT Digital')  // cadena de ancestros: reproduce el mapa de la sección 2
__LJF_DIAG.ids()                 // ¿hay jobId escondido en algún atributo?
__LJF_DIAG.ariaLabels()          // inventario de aria-labels: encontrar el nuevo ancla
__LJF_DIAG.mark()                // borde rojo + índice en cada tarjeta detectada
__LJF_DIAG.cards                 // array de nodos detectados
```

Qué mira el informe (lo que pidió la verificación empírica del hotfix):

- cuántas tarjetas encuentra el descubrimiento (`tarjetas detectadas`);
- cuántos badges `.llf-badge` y cuántos nodos `[data-llf-lang]` hay;
- **coordenadas** de cada tarjeta y de su badge, con la columna `zona`
  (`LISTA-IZQ` si `x < 400`, si no `panel/otro`);
- si el badge cae **dentro** del rectángulo de su tarjeta (`badge dentro`);
- veredictos en verde/rojo: tarjetas con `display:contents`, tarjetas sin caja,
  tarjetas con badge y `position:static` (les falta `.llf-badge-host`).

Lecturas típicas:

| Síntoma en el informe | Diagnóstico |
|---|---|
| `botones ✕ = 0` | LinkedIn cambió el `aria-label` o el idioma de la UI → `__LJF_DIAG.ariaLabels()` |
| `tarjetas detectadas` ≪ vacantes visibles | el ancla no existe en todas las tarjetas (promocionadas, ya descartadas) |
| un borde rojo de `mark()` abarca varias vacantes | el descubrimiento devuelve un contenedor compartido (mega-tarjeta) |
| `display:contents > 0` | se está anclando en un wrapper fantasma (bug de v0.5.3) |
| `badge dentro = FUERA` | falta `position:relative` en el host (`.llf-badge-host`) |
| `[data-llf-lang] > 0` con `badges = 0` | LinkedIn re-renderizó y borró los badges; el runtime no los repone |

### 4.2 Panel de debug del propio script

Agregar `?llfdebug=1` a la URL de LinkedIn:

- el userscript pinta un panel negro abajo a la izquierda con tarjetas
  detectadas, errores capturados por el blindaje de `processAll()` y
  `jobId/badge/lang/título` de las primeras 12 tarjetas;
- `src/app.js` emite trazas `[LJF]` en consola desde `classify()` y
  `processCard()` (`_dbg`), mostrando por qué una tarjeta quedó en `??`.

### 4.3 Harness reproducible sin navegador

```powershell
node tests/dom_2026_cards.js   # 25 checks: UI 2026, UI legacy y dos paneles
node tests/run.js              # corpus del detector de idioma (26 casos)
```

`tests/dom_2026_cards.js` reconstruye con jsdom la jerarquía L0…L16 de la
sección 2, **incluidos los wrappers `display:contents`**, y verifica que
`getDomCards()` devuelva la tarjeta visual y no el wrapper. Ese harness es el que
capturó la causa raíz; **actualizar el fixture antes de tocar los selectores** es
la forma más rápida de iterar (jsdom no hace layout: `offsetWidth` siempre es 0,
así que el fixture ejercita la rama de fallback `display:contents`, no la de caja).

---

## 5. Checklist de adaptación (la próxima vez que LinkedIn rompa los selectores)

1. **Confirmar el síntoma** con `tools/diagnose_linkedin_dom.js`. Anotar los
   conteos: ✕, `[data-job-id]`, `a[/jobs/view/]`, tarjetas, badges.
2. **Buscar el nuevo ancla** con `__LJF_DIAG.ariaLabels()`. Sirve el `aria-label`
   que aparece **~1 vez por vacante** (≈25 por página). Preferir siempre
   atributos de accesibilidad (`aria-label`, `role`, `aria-current`) sobre clases.
   Verificar el idioma de la UI: los `aria-label` están traducidos.
3. **Mapear la jerarquía** con `__LJF_DIAG.trace('<parte de un título>')`.
   Identificar: (a) la tarjeta visual (primer ancestro con `w×h` de tarjeta,
   ~367×126), (b) el contenedor de la lista (children ≫ vacantes), (c) todos los
   niveles `display:contents` intermedios.
4. **Actualizar `src/app.js`**: `DISMISS_SEL` (nuevo ancla) y, si la invariante
   "1 ancla por tarjeta" ya no vale, `cardFromAnchor()`. No introducir conteos de
   hijos ni saltos fijos de `parentElement`.
5. **Actualizar `src/selectors.js`** si cambia de dónde se leen título/empresa:
   capa M4 de `titleFromCard()`, `textLinesFromCard()`, `companyFromCard()`,
   capa 2026 de `jobIdFromCard()`.
6. **Actualizar el fixture** de `tests/dom_2026_cards.js` con la jerarquía nueva
   y dejarlo en rojo antes del fix (así se prueba que el test detecta el bug).
7. **Compilar y correr todo:**
   ```powershell
   node tools/build_extension.js
   node tools/build_userscript.js
   node tests/dom_2026_cards.js
   node tests/run.js
   ```
8. **Verificar en vivo:** recargar la extensión en `brave://extensions` (o
   reinstalar el userscript en Tampermonkey), F5 en LinkedIn, y volver a pasar
   el script de consola. Criterio de aceptación:
   `badges en la lista izquierda = N/N` con `zona = LISTA-IZQ` y
   `badge dentro = sí` en todas las filas.
9. **Nunca eliminar las capas legacy** (`[data-job-id]`, `a[href*="/jobs/view/"]`).
   LinkedIn hace A/B testing y conviven las dos UIs. `getDomCards()` **une** las
   tres capas y descarta candidatos que contienen a otro candidato (esa es la
   defensa contra la mega-tarjeta).
10. **Reglas de oro del badge:** el host debe tener caja propia y
    `position:relative` (clase `.llf-badge-host`), el badge debe reponerse si
    desaparece del DOM (chequeo `hasBadge` en `processCard()`), y `unknown`
    nunca oculta una vacante (fail-open).

---

## Anexo: qué cambió en el código en v0.5.4

| Archivo | Cambio |
|---|---|
| `src/app.js` | `getDomCards()` reescrito: 3 capas unidas + `dedupeCards()` (gana el candidato más interno). Nuevo `cardFromAnchor()` con invariante "1 ancla por tarjeta" + preferencia por caja de layout. `hasLayoutBox()`, `isDisplayContents()`, `DISMISS_SEL`, `DETAIL_BODY_SEL`. Nueva clase `CLS.host` (`.llf-badge-host{position:relative}`) aplicada por `ensureBadgeHost()` en cada pase. `processCard()` repone el badge si falta (`hasBadge`). `clearAll()` limpia por `data-llf-*`/`.llf-badge-host`. `getDomCards` exportado. |
| `src/selectors.js` | Capa M4 del título (aria-label del ✕) movida **antes** del fallback genérico de `<a>`. `textLinesFromCard()`, `UI_NOISE_RE`, `looksLikeLocation()` y `companyFromCard()` con fallback estructural 2026 (devuelve `''` si la línea parece ubicación/metadato, para no sesgar el detector). `jobIdFromCard()` con capa de atributos de tracking. |
| `tools/build_extension.js` | Versión 0.5.4. El contador del popup cuenta `[data-llf-lang]` en lugar de `[data-job-id]`. |
| `tools/build_userscript.js` | Versión 0.5.4. El panel `?llfdebug=1` usa `LangJobsApp.getDomCards(document)`. |
| `tools/diagnose_linkedin_dom.js` | **Nuevo.** Script de consola de diagnóstico. |
| `tests/dom_2026_cards.js` | **Nuevo.** Harness jsdom del DOM 2026 (25 checks). |
| `extension/manifest.json` | Versión 0.5.4. |
