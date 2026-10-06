# Casa Pipi's

Seguimiento mensual de los gastos de la casa (Mati y Pina). App de una sola página, sin build:
`index.html` + `data/history.json` (el historial), publicada con GitHub Pages.

**v2.0** — el mismo `index.html` funciona en GitHub Pages y como página de claude.ai; instalable en el celular, se sincroniza sola.

## Cómo funciona

- Los datos viven en el navegador (`localStorage`) y se sincronizan con `data/history.json` en este repo.
- **Leer** el historial no necesita token. **Guardar** sí.
- Cada edición se sube sola unos segundos después. Antes de subir, la app trae lo que hay en GitHub y
  junta los dos lados mes por mes (gana la edición más nueva), así un dispositivo desactualizado
  no pisa datos más nuevos.
- Al abrir la app crea los meses que falten (también los del medio) arrastrando el Alquiler y
  contando bien las cuotas.
- Los meses anteriores quedan en solo lectura; el botón **Editar este mes** los habilita.
- Borrar un gasto se puede deshacer (aviso abajo con "Deshacer").

## Token (solo para guardar)

1. https://github.com/settings/personal-access-tokens/new
2. Fine-grained, **Repository access: solo Casa-Pipis**, **Contents: Read and write**.
3. Pegarlo en la app (Sincronización con GitHub → Guardar token).
4. Para otro dispositivo: **Copiar link de acceso** y abrirlo ahí (el token queda configurado, el link se
   borra de la barra de direcciones). No compartir ese link con nadie más.

Si el token vence, la app lo avisa en la sección de sincronización; se genera uno nuevo y se pega.

## Archivos

| Archivo | Para qué |
| --- | --- |
| `index.html` | la estructura de la página |
| `css/app.css` | estilos |
| `js/core.js` | constantes, estado, formatos, lectura de montos, copias locales |
| `js/model.js` | meses, gastos, pares de Gastos Pina, arrastre de cuotas, unión de cambios |
| `js/reports.js` | gráfico de evolución, imagen/PDF/JPG, CSV/JSON, importar |
| `js/summary.js` | resumen del año |
| `js/claude.js` | funciones de Claude (mensaje, preguntas, leer una foto o un PDF) |
| `js/review.js` | diálogo para revisar un resumen de tarjeta línea por línea |
| `js/sync.js` | GitHub, base de claude.ai, copias de seguridad |
| `js/tables.js` | pantalla: tablas, edición, navegación |
| `js/app.js` | tema y arranque |
| `data/history.json` | historial de meses |
| `sw.js`, `manifest.webmanifest`, `icons/` | instalación en el celular y uso sin conexión |
| `tools/build_artifact.py` | arma la versión de claude.ai (un solo archivo) |
| `tests/` | pruebas de navegador (ver `tests/README.md`) |
