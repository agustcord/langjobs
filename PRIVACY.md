# Política de Privacidad — LangJobs

**Última actualización:** 24 de julio de 2026

## Resumen ejecutivo

**LangJobs no recolecta, almacena ni transmite ningún dato personal ni de navegación. Punto.**

## Qué hace la extensión

LangJobs analiza, dentro de tu propio navegador, el texto visible de las tarjetas de vacantes en `linkedin.com/jobs/*` para detectar su idioma y aplicar el filtro visual que vos configures (etiquetar, atenuar u ocultar). Todo el procesamiento ocurre en memoria, en tu pestaña.

## Datos que NO recolectamos

- ❌ Descripciones, títulos, empresas o cualquier contenido de las vacantes
- ❌ Datos de tu cuenta o perfil de LinkedIn
- ❌ Historial de navegación o búsquedas
- ❌ Datos personales de ningún tipo
- ❌ Telemetría, analytics o estadísticas de uso

## Datos que se almacenan (solo localmente)

La única información persistida es **tu configuración de la extensión** (extensión activada/desactivada, idioma a filtrar, modo de filtrado), guardada mediante `chrome.storage.local` **en tu propio navegador**. Esta información nunca sale de tu dispositivo.

## Conexiones de red

El detector de idioma corre 100% en tu navegador (stopwords en memoria, sin IA remota ni servidor nuestro). **Sin embargo, para resolver las vacantes dudosas (badge `??`) LangJobs sí realiza una conexión de red de solo lectura** al endpoint público de LinkedIn:

`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<jobId>`

- Esa petición va a los servidores de **LinkedIn** (no a un servidor nuestro).
- Envía únicamente el **ID de la vacante** para leer su descripción y clasificar el idioma. **No transmite datos de tu cuenta, ni de navegación, ni contenido de otras vacantes.**
- Está throttled (máx. 3 simultáneas) y solo se dispara para las tarjetas que el detector no pueda clasificar por el título (~2-3 por página), con caché en memoria para no repetir.
- El comportamiento es equivalente a que cualquier visitante abra la vista de esa vacante en LinkedIn.

Fuera de eso, no hay servidores propios, ni APIs de terceros, ni telemetría.

Si en el futuro se incorpora una versión de pago con clave de licencia, la única conexión de red adicional será la validación voluntaria de esa clave contra el proveedor de licencias — iniciada explícitamente por el usuario, transmitiendo únicamente la clave de licencia y nunca datos de navegación. Esta política se actualizará antes de ese cambio.

## Permisos solicitados

| Permiso | Por qué |
|---|---|
| `storage` | Guardar tu configuración localmente |
| Acceso a `linkedin.com/jobs/*` | Leer el texto visible de las vacantes y aplicar estilos CSS. Solo en la sección de empleos |

## Contacto

Para consultas sobre esta política: abrí un issue en este repositorio o contactá al autor vía GitHub ([@agustcord](https://github.com/agustcord)).
