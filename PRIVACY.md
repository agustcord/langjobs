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

La versión actual de LangJobs **no realiza ninguna conexión de red**: no hay servidores propios, no hay APIs externas, no hay servicios de terceros.

Si en el futuro se incorpora una versión de pago con clave de licencia, la única conexión de red será la validación voluntaria de esa clave contra el proveedor de licencias — iniciada explícitamente por el usuario, transmitiendo únicamente la clave de licencia y nunca datos de navegación. Esta política se actualizará antes de ese cambio.

## Permisos solicitados

| Permiso | Por qué |
|---|---|
| `storage` | Guardar tu configuración localmente |
| Acceso a `linkedin.com/jobs/*` | Leer el texto visible de las vacantes y aplicar estilos CSS. Solo en la sección de empleos |

## Contacto

Para consultas sobre esta política: abrí un issue en este repositorio o contactá al autor vía GitHub ([@agustcord](https://github.com/agustcord)).
