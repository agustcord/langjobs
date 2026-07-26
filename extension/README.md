# LangJobs — Extensión Chrome (Manifest V3)

Esta carpeta contiene la **extensión nativa Chrome** de LangJobs, empaquetada
a partir de la lógica validada en Fase 1 (prototipo Tampermonkey) sin divergencia
de código fuente.

## Estructura

```
extension/
├── manifest.json        # Manifest V3 (permisos mínimos: storage + content script en /jobs/*)
├── content.js           # Content script (stub T2.1 → lógica completa en T2.3)
├── popup/
│   ├── popup.html       # UI de configuración (T2.4)
│   ├── popup.css        # Estilos del popup (T2.4)
│   └── popup.js         # Lógica del popup / chrome.storage (T2.5)
└── icons/
    └── icon{16,48,128}.png  # Íconos (placeholder T2.1 → arte final en T2.7)
```

## Cargar en modo desarrollador (prueba local)

1. `chrome://extensions` → activar "Modo desarrollador".
2. "Cargar sin empaquetar" → seleccionar esta carpeta `extension/`.
3. Ir a `linkedin.com/jobs/` y comprobar que el content script carga
   (consola: `[LangJobs] content script cargado (stub T2.1)`).

## Estado del roadmap

- **T2.1** ✅ Estructura de carpetas + `manifest.json` V3.
- **T2.2** ⏳ Portar detector + selectores como módulos compartidos.
- **T2.3** ⏳ Content script con la lógica validada de Fase 1.
- **T2.4** ⏳ Popup de configuración.
- **T2.5** ⏳ Persistencia `chrome.storage.local` + reacción en vivo.

La fuente única de la lógica de detección sigue siendo `src/` (mismos módulos
UMD que el userscript). Ver `wiki/02_Roadmap_y_Tareas.md` para el plan completo.
