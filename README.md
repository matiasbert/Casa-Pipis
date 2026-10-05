# Casa Pipi's

Seguimiento mensual de los gastos de la casa (Mati y Pina). App de una sola página, sin build:
`index.html` + `data/history.json` (el historial), publicada con GitHub Pages.

**v1.6** — instalable en el celular (PWA), se ve bien en pantallas chicas, se sincroniza sola.

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
| `index.html` | toda la app (HTML + CSS + JS) |
| `data/history.json` | historial de meses |
| `sw.js`, `manifest.webmanifest`, `icons/` | instalación en el celular y uso sin conexión |
