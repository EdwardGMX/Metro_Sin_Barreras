# Metro Sin Barreras

Prototipo de aplicación web progresiva (PWA) que recomienda rutas accesibles en el Metro de la Ciudad de México según el **perfil de movilidad** de cada persona y la **hora del viaje**. Proyecto del Equipo 1, Licenciatura en Ciencia de Datos, ESCOM-IPN (Administración de Proyectos de TI).

> Los datos de equipos, saturación y reportes son **demostrativos**. El inicio de sesión con Llave CDMX y la verificación de la Tarjeta Incluyente están **simulados**. El prototipo no sustituye las indicaciones oficiales del STC.

## Qué incluye (trazabilidad con el Sprint Cero Avanzado)

| Función | Requisitos |
|---|---|
| Asistente en cuatro pasos (perfil, estaciones, hora y ruta) con pestañas Planear ruta, Reportar y Pedir apoyo; el foco pasa al título de cada paso y se puede volver a cualquier paso completado. Estilo del Trabajo Terminal 2: fondo gris claro, tarjetas blancas, caja de instrucciones y acento azul | RF-14, RF-22, RF-18, RF-11 |
| Mapa interactivo de la red completa (12 líneas, 163 estaciones): arrastrar, acercar con rueda, pellizco o botones; tocar una estación para elegirla como origen o destino; saturación por colores y estaciones de transbordo marcadas | RF-10, RF-12, RIE-01 |
| Ruta accesible con Dijkstra dependiente del tiempo; etiquetas “Accesible”, “Accesible con apoyo” o “Sin ruta posible” | RF-10, RF-11, RN1, RN2 |
| Siete perfiles de movilidad combinables (silla de ruedas; bastón, muletas o andadera; persona adulta mayor; ceguera o baja visión; perro guía; sordera o hipoacusia; carriola, equipaje, embarazo o lesión temporal) | RF-22, RN7 |
| Planeación con “Salir ahora”, “Salir a las” y “Llegar a las”, en franjas de 30 minutos dentro del horario de servicio y hasta 30 días después | RF-18, RN4 |
| Saturación estimada por estación y franja, con sugerencia de una hora con menos aglomeración | RF-12, RF-17 |
| Perfil guardado solo en el dispositivo; la consulta envía solo restricciones codificadas (se puede ver la petición) | RF-13, RN3 |
| Inicio de sesión simulado (OIDC) para reportar; se guarda solo un seudónimo HMAC-SHA-256 | RF-19, RN3 |
| Verificación opcional de Tarjeta Incluyente con consentimiento expreso y revocable; baja de cuenta | RF-19, RL-02, RL-08 |
| Reportes con opciones predefinidas (sin texto libre), límite de 5 al día y 1 por equipo cada 2 h, validación comunitaria (3 personas en 6 h, o 2 si una está verificada) | RF-16, RF-20, RN5 |
| Fotos JPEG/WebP verificadas por firma de bytes, reducidas a 1280 px y 1 MB, sin EXIF/GPS, borrado a 90 días y detección de fotos repetidas | RF-21, RN6 |
| **Consola del personal** (`#/consola`): inicio de sesión institucional con verificación en dos pasos (simulado), cinco roles del STC con mínimo privilegio, una vista de inicio por perfil, separación de funciones y bitácora de auditoría | HU-29, HU-30, RN8, RN9, RNF-06, RNF-24 |
| **Operación en las estaciones**: rondas de revisión a cinco horas del día con su responsable, verificación en sitio de reportes, órdenes de mantenimiento, incidentes y apoyos asignados a una persona; lo que confirma el personal cambia las rutas | HU-31 a HU-37, RN10 |
| **Pedir apoyo en la estación** (`#apoyo`): la persona usuaria, sin cuenta, pide acompañamiento y ve cuando se asigna, va en camino y se atiende; quien reportó una falla ve si se verificó y si ya se reparó | HU-36 |
| Botón de emergencia disponible sin conexión (service worker), con las indicaciones oficiales del STC | RF-15, CA-15.1 |
| Tamaño de texto, alto contraste, lectura en voz alta, lector de pantalla; 0 violaciones de axe (WCAG 2.2 AA) | RF-14, RNF-13, RNF-14 |
| Aviso de privacidad simplificado | RL-03 |
| **Mi cuenta** (`#mi-cuenta`): reportes en curso y solucionados dibujados como un trayecto del Metro, confirmación «¿se resolvió?», reportes de limpieza, seguridad, señalización accesible, atención del personal y aglomeración (solo opciones), Llave CDMX y Tarjeta Incluyente simuladas, quién ve qué de ti y tus estaciones | RF-16, RF-19, RN3, RN5, RN14 |
| **Vistas por perfil en la consola**: Mi estación hoy (jefe, con el turno del equipo como diagrama de Gantt y quién está dónde ahora), Mi jornada (policía auxiliar y personal de estación, con la jornada en una sola línea y el reloj del turno), Mesa de atención y Tickets | RN8, RN9, RN11 a RN14 |

En el prototipo la “API” y la “base de datos” se simulan dentro del navegador (`src/lib/router.ts` y `src/lib/reports.ts`), con la misma lógica que tendría el servicio en Cloud Run y Firestore.

## Consola del personal (`#/consola`)

Se diseñó como si el sistema ya se hubiera entregado: solo tienen cuenta las personas del STC que operan el servicio, y cada una ve únicamente lo que su función necesita. Las personas usuarias no tienen cuenta en la consola; entran a la app pública con Llave CDMX.

Los roles siguen las unidades del Estatuto Orgánico del STC (Gaceta Oficial de la CDMX, 17/09/2024). Las estaciones dependen de la Dirección de Transportación por gerencia de líneas, así que una estación como Pantitlán depende de tres gerencias.

| Rol | Quién | Módulos | Qué información tiene |
|---|---|---|---|
| Jefe(a) de estación | Cada estación | Mi estación hoy, Mi estación, Rondas, Tickets | El turno de su equipo como diagrama de Gantt y quién está dónde ahora; equipos de su estación, reportes por verificar, solicitudes de apoyo (las asigna; una persona atrapada aparece primero con su protocolo de cinco pasos), programa de rondas, órdenes de su estación; asigna tareas a su personal de seguridad, estación y limpieza, asigna los tickets de esas áreas y levanta tickets a otras |
| Personal de estación | Cada estación | Mi jornada, Mi estación, Rondas, Tickets | Su jornada en una línea con las tareas del jefe, sus rondas, tickets y apoyos asignados |
| Personal de seguridad | Policía auxiliar de cada estación | Mi jornada, Seguridad y apoyo, Tickets | Su jornada en una línea con las tareas del jefe, sus tickets y los apoyos que tiene asignados en su estación |
| Mesa de atención y reportes | Gerencia de Atención al Usuario (Dirección de Medios) | Mesa de atención, Tickets, Moderación | Reportes ciudadanos agrupados por turnar, tickets de todas las áreas con su plazo (también los de Sistemas), reportes en cuarentena y sus fotos |
| Mantenimiento electromecánico | Subdirección General de Mantenimiento (Instalaciones Fijas) | Tickets de mi área, Mantenimiento | Tickets de instalaciones que asigna a su personal técnico; órdenes por prioridad y plazo, que toma y cierra |

Cuentas de demostración (nombres ficticios): Arturo Lemus (jefe de Tacubaya), Mónica Ruiz (jefa de Pantitlán), Karla Jiménez (policía auxiliar de Tacubaya), Jorge Aranda (personal de estación de Tacubaya), Patricia Olvera (Mesa de atención) y Alejandra Torres (Mantenimiento).

Rondas de revisión (RN10): cinco al día por estación, 30 minutos antes de abrir y a las 9:00, 13:00, 17:00 y 21:00, cada una con una persona responsable; a tiempo si se registra dentro de 45 minutos. Una falla encontrada crea la orden de mantenimiento; quien repara no confirma su reparación (RN9). Reglas en `src/lib/operacion.ts`, pruebas en `src/lib/operacion.test.ts`. Las estaciones del piloto son Tacubaya, Pantitlán, Hidalgo, Balderas y Zapata; el personal de demostración es ficticio.

### Vistas por perfil

Cada perfil operativo entra a una vista pensada para leerse en segundos. El encabezado es una estación sobre la línea del Metro con el color del perfil (Línea 2 azul para la persona usuaria, Línea 7 naranja para el jefe de estación, Línea A morada para la policía auxiliar, Línea 4 para el personal de estación, Línea 8 verde para la Mesa de atención y café para Mantenimiento) y una frase que dice si todo está en orden o qué necesita atención. El avance de un reporte, un ticket, las rondas o un turno se dibuja como un trayecto con paradas. El color solo identifica al perfil: el estado siempre lleva ícono y texto.

| Vista | Quién | Qué responde | De un vistazo | Qué puede hacer |
|---|---|---|---|---|
| Mi cuenta (`#mi-cuenta`) | Persona usuaria con Llave CDMX | ¿Qué pasó con lo que reporté? | Tus reportes por etapa, tus estaciones ahora, problemas resueltos con tu ayuda | Seguir cada reporte (recibido, turnado, en atención, solucionado), confirmar si se resolvió, reportar otros problemas, verificar o revocar la Tarjeta Incluyente, guardar estaciones, darse de baja |
| Mi estación hoy | Jefe(a) de estación | ¿Mi estación está bien y mi equipo sabe qué hacer? | Equipos (íconos con estado), rondas de hoy como trayecto, quién está dónde ahora (en un apoyo, con algo atrasado, en una actividad o disponible) y el turno del equipo como diagrama de Gantt: una fila por persona, una barra por actividad a su hora y una línea vertical en «Ahora» | Asignar tareas desde la fila de cada persona, abrir cualquier barra, asignar los tickets de estación, limpieza y seguridad, levantar tickets a otras áreas |
| Mi jornada | Policía auxiliar y personal de estación | ¿Qué hago ahora y qué sigue? | La jornada en una sola línea de extremo a extremo (inicio a fin del turno) con cada actividad numerada en su hora y la marca «Ahora»; lo urgente en grande (un apoyo asignado va primero); el reloj del turno con sus actividades y las agujas en la hora actual | Ir en camino y atender apoyos, empezar y terminar tareas y tickets, registrar sus rondas, levantar tickets |
| Mesa de atención | Gerencia de Atención al Usuario | ¿Todo está turnado y en plazo? | Tickets en plazo, abiertos por área, resueltos en 7 días | Turnar reportes agrupados al área sugerida (o a otra), asignar, cambiar prioridad, cerrar o reabrir |
| Tickets (de mi área) | Todo el personal; es la vista de inicio de Mantenimiento | ¿Qué me toca y qué levanté? | Tablero por estado con el plazo de cada ticket | Levantar tickets; quien encarga un área ve y asigna los de su área |

En la jornada, cada actividad (tarea del jefe, ticket, apoyo a una persona usuaria o ronda de revisión) es una barra que va de su hora de inicio a su hora de fin dentro del turno: si ya terminó, hasta cuando se resolvió; si sigue en curso, hasta ahora; si está pendiente, 30 minutos (20 para un apoyo). El color dice el estado (hecha, en curso, pendiente o atrasada) y siempre va con su ícono. En pantallas angostas la línea y el diagrama se deslizan de lado y se abren centrados en «Ahora». Cálculo en `src/lib/jornada.ts` y sus pruebas en `src/lib/jornada.test.ts`.

Reglas de los tickets y las tareas (propuesta del equipo, por validar con el STC; en `src/lib/servicio.ts` y sus pruebas en `src/lib/servicio.test.ts`):

- **RN11.** Cualquier cuenta del personal levanta un ticket a cualquier área, solo en las estaciones a su cargo. Las personas usuarias no levantan tickets: reportan con opciones predefinidas, la Mesa agrupa los reportes iguales (3 personas o más suben la prioridad) y los turna al área. Un reporte igual a un ticket abierto se suma a él.
- **RN12.** Asigna la Mesa de atención o quien encarga el área (la jefatura de estación para estación, limpieza y la policía auxiliar de su estación; Mantenimiento para instalaciones; la Mesa para Sistemas), y solo a personal de esa área. Quien resolvió un ticket no lo cierra (RN9). Plazos: alta 4 h, media 24 h, baja 72 h.
- **RN13.** El jefe de estación asigna tareas solo a su personal (seguridad, estación y limpieza); a Mantenimiento u otras áreas les levanta un ticket.
- **RN14.** La persona que reportó confirma si se resolvió; si dice que sigue, el ticket se reabre y vuelve a quien lo atendía. El personal nunca ve su nombre ni su seudónimo, solo cuántas personas reportaron.

Para recorrerlas: en la app pública, «Mi cuenta» con la cuenta de prueba de Ana Lucía (con historial y Tarjeta Incluyente); en la consola, Arturo Lemus (jefe de Tacubaya), Karla Jiménez (policía auxiliar), Jorge Aranda (personal de estación), Patricia Olvera (Mesa de atención) y Alejandra Torres (Mantenimiento). El personal de demostración está en el turno en curso (matutino de 6:00 a 14:00 o vespertino de 14:00 a 22:00).

Reglas: no se combinan roles incompatibles (quien repara un equipo no confirma su reparación, RN9); la sesión se cierra tras 15 minutos sin actividad; cada acción, incluidos los intentos negados, queda en la bitácora de auditoría. En producción la consola es un servicio aparte en Cloud Run protegido por Identity-Aware Proxy y Cloud Identity (verificación en dos pasos). Las reglas están en `src/lib/admin.ts` y sus pruebas en `src/lib/admin.test.ts`.

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
  data/metroData.ts       Red del Metro (12 líneas, 163 estaciones, coordenadas aproximadas)
  data/accessibility.ts   Inventario demostrativo: medios de desnivel y equipos por acceso y transbordo
  data/saturation.ts      Perfil horario ilustrativo, horario de servicio y saturación por franja
  lib/profiles.ts         Perfiles de movilidad y restricciones codificadas (RN7)
  lib/router.ts           Grafo de andenes y Dijkstra dependiente del tiempo (RN1, RN2, RN4)
  lib/reports.ts          Reportes, seudónimos, validación comunitaria, moderación y retención (RN5)
  lib/evidence.ts         Validación, compresión y almacenamiento de fotos (RN6)
  lib/reglas.test.ts      Pruebas automáticas de las reglas
  lib/admin.ts            Consola del personal: roles, permisos, separación de funciones y auditoría (RN8, RN9)
  lib/admin.test.ts       Pruebas del control de acceso de la consola
  lib/operacion.ts        Rondas, verificación en sitio, órdenes de mantenimiento, incidentes y apoyos (RN10)
  lib/operacion.test.ts   Pruebas de la operación en las estaciones
  lib/servicio.ts         Reportes de servicio, tickets entre áreas, tareas del jefe y jornada (RN11 a RN14)
  lib/servicio.test.ts    Pruebas de tickets, tareas y confirmación de la persona usuaria
  lib/jornada.ts          Actividades de cada persona en el turno, quién está dónde y carriles del Gantt
  lib/jornada.test.ts     Pruebas de la jornada
  components/admin/       Consola del personal (inicio de sesión y módulos operativos)
  components/vistas/      Vistas por perfil: Mi cuenta, Mi estación hoy, Mi jornada, Mesa de atención y Tickets;
                          Jornada.tsx dibuja la línea de la jornada, el Gantt del equipo y el reloj del turno
  components/Apoyo.tsx    Pedir apoyo en la estación y ver su avance (app pública)
  components/MetroMap.tsx Mapa interactivo (SVG con zoom, arrastre y selección de estaciones)
  components/             Interfaz (planificador, resultado, reportes, moderación, emergencia, privacidad)
public/                   Manifiesto PWA, íconos y service worker
.github/workflows/        Publicación automática en GitHub Pages
```

## Limitaciones conocidas

- Las coordenadas de las estaciones son aproximadas y solo sirven para dibujar el mapa.
- El inventario de accesos y equipos y la afluencia son ilustrativos; en la versión final provienen del STC, de ADIP y de la EOD 2017 del INEGI.
- La autenticación es simulada: no se conecta con Llave CDMX ni pide contraseñas.
- Los reportes, sesiones y fotos se guardan solo en el navegador de cada persona; no se comparten entre dispositivos.
