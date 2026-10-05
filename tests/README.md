# Tests

Pruebas de navegador (Chromium real, con Playwright). No forman parte de la app publicada.

```
cd tests
npm install        # playwright, html2canvas y jspdf (para probar PDF y JPG de verdad)
npm test
```

Si Chromium ya está instalado en otro lugar: `CHROMIUM_PATH=/ruta/a/chrome npm test`.

| Archivo | Qué prueba |
| --- | --- |
| `unit.test.js` | lectura de montos, dólares con centavos, unión de copias de un mes, meses automáticos y borrados |
| `github.test.js` | modo GitHub Pages: historial, token por link, subida automática, conflicto 409, otro dispositivo |
| `artifact.test.js` | modo claude.ai (con un simulador de la plataforma): base, descargas, Claude, invitada de solo lectura |
| `features.test.js` | dispositivo lento, dos dispositivos a la vez, mes borrado, copias de seguridad, resumen anual, foto con Claude |

`fixtures/history.json` es una copia fija de los datos para que las pruebas no dependan de lo que se cargue después.
La versión de claude.ai se arma con `tools/build_artifact.py` antes de cada corrida.
