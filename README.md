# Metro Sin Barreras

Prototipo de aplicación web progresiva (PWA) que recomienda rutas accesibles en el Metro de la Ciudad de México según el **perfil de movilidad** de cada persona y la **hora del viaje**. Proyecto del Equipo 1, Licenciatura en Ciencia de Datos, ESCOM-IPN (Administración de Proyectos de TI).

> Los datos de equipos, saturación y reportes son **demostrativos**. El inicio de sesión con Llave CDMX y la verificación de la Tarjeta Incluyente están **simulados**. El prototipo no sustituye las indicaciones oficiales del STC.

## Qué incluye (trazabilidad con el Sprint Cero Avanzado)

| Función | Requisitos |
|---|---|
| Ruta accesible con Dijkstra dependiente del tiempo; etiquetas “Accesible”, “Accesible con apoyo” o “Sin ruta posible” | RF-10, RF-11, RN1, RN2 |
| Siete perfiles de movilidad combinables (silla de ruedas; bastón, muletas o andadera; persona adulta mayor; ceguera o baja visión; perro guía; sordera o hipoacusia; carriola, equipaje, embarazo o lesión temporal) | RF-22, RN7 |
| Planeación con “Salir ahora”, “Salir a las” y “Llegar a las”, en franjas de 30 minutos dentro del horario de servicio y hasta 30 días después | RF-18, RN4 |
| Saturación estimada por estación y franja, con sugerencia de una hora con menos aglomeración | RF-12, RF-17 |
| Perfil guardado solo en el dispositivo; la consulta envía solo restricciones codificadas (se puede ver la petición) | RF-13, RN3 |
| Inicio de sesión simulado (OIDC) para reportar; se guarda solo un seudónimo HMAC-SHA-256 | RF-19, RN3 |
| Verificación opcional de Tarjeta Incluyente con consentimiento expreso y revocable; baja de cuenta | RF-19, RL-02, RL-08 |
| Reportes con opciones predefinidas (sin texto libre), límite de 5 al día y 1 por equipo cada 2 h, validación comunitaria (3 personas en 6 h, o 2 si una está verificada) | RF-16, RF-20, RN5 |
| Fotos JPEG/WebP verificadas por firma de bytes, reducidas a 1280 px y 1 MB, sin EXIF/GPS, borrado a 90 días y detección de fotos repetidas | RF-21, RN6 |
| Panel de moderación y bitácora (demostración) | RNF-06, RNF-07 |
| Botón de emergencia disponible sin conexión (service worker) | RF-15 |
| Tamaño de texto, alto contraste, lectura en voz alta, lector de pantalla; 0 violaciones de axe (WCAG 2.2 AA) | RF-14, RNF-13, RNF-14 |
| Aviso de privacidad simplificado | RL-03 |

En el prototipo la “API” y la “base de datos” se simulan dentro del navegador (`src/lib/router.ts` y `src/lib/reports.ts`), con la misma lógica que tendría el servicio en Cloud Run y Firestore.

## Publicarlo en GitHub Pages (para tener un enlace público)

1. Crea un repositorio nuevo en GitHub (por ejemplo, `metro-sin-barreras`) y sube **todo el contenido de esta carpeta**, incluida la carpeta oculta `.github`.
   - Desde la web: “Add file” → “Upload files” y arrastra los archivos. Si tu sistema oculta `.github`, súbela con Git:
     ```bash
     git init
     git add .
     git commit -m "Prototipo Metro Sin Barreras"
     git branch -M main
     git remote add origin https://github.com/<tu-usuario>/metro-sin-barreras.git
     git push -u origin main
     ```
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Ve a la pestaña **Actions**: el flujo “Publicar en GitHub Pages” corre las pruebas, construye el sitio y lo publica (tarda 1 o 2 minutos). Si se ejecutó antes de activar Pages, vuelve a correrlo con “Run workflow”.
4. El enlace queda en `https://<tu-usuario>.github.io/metro-sin-barreras/` y también aparece en Settings → Pages.

Cada vez que hagas `push` a `main` se vuelve a publicar.

## Desarrollo local

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas de las reglas de negocio (Vitest)
npm run build    # compila en dist/
npm run preview  # sirve dist/ localmente
```

## Estructura

```
src/
  data/metroData.ts       Red del Metro del prototipo (12 líneas, estaciones principales)
  data/accessibility.ts   Inventario demostrativo: medios de desnivel y equipos por acceso y transbordo
  data/saturation.ts      Perfil horario ilustrativo, horario de servicio y saturación por franja
  lib/profiles.ts         Perfiles de movilidad y restricciones codificadas (RN7)
  lib/router.ts           Grafo de andenes y Dijkstra dependiente del tiempo (RN1, RN2, RN4)
  lib/reports.ts          Reportes, seudónimos, validación comunitaria, moderación y retención (RN5)
  lib/evidence.ts         Validación, compresión y almacenamiento de fotos (RN6)
  lib/reglas.test.ts      Pruebas automáticas de las reglas
  components/             Interfaz (planificador, resultado, reportes, moderación, emergencia, privacidad)
public/                   Manifiesto PWA, íconos y service worker
.github/workflows/        Publicación automática en GitHub Pages
```

## Limitaciones conocidas

- El inventario de accesos y equipos y la afluencia son ilustrativos; en la versión final provienen del STC, de ADIP y de la EOD 2017 del INEGI.
- La autenticación es simulada: no se conecta con Llave CDMX ni pide contraseñas.
- Los reportes, sesiones y fotos se guardan solo en el navegador de cada persona; no se comparten entre dispositivos.
- El contenido del botón de emergencia es de ejemplo y debe sustituirse por las indicaciones oficiales del STC.
