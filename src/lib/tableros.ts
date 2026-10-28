/**
 * Tableros por rol de la consola del personal (HU-30 ampliada).
 *
 * Cada rol tiene una pregunta que su tablero responde, indicadores con meta y
 * semáforo, gráficas propias y una lista de lo que debe atender hoy. Los valores
 * se calculan con el estado de la consola y la base de reportes del prototipo;
 * los que en producción vendrían de Cloud Monitoring, de la facturación o del
 * pipeline de entrenamiento se generan de forma determinista (misma serie todo
 * el día) y se marcan como «demostración».
 */
import { equipoPorId } from "../data/accessibility"
import { allStations } from "../data/metroData"
import {
  calidadHomologacion,
  diasHabiles,
  evaluarPublicacion,
  revisarTerminologia,
  DIA,
  F1_MINIMO,
  HORA,
  MARGEN,
  PLAZO_ARCO,
  REFERENCIA,
  SUSPENSION_POR_INACTIVIDAD,
  type Cuenta,
  type EstadoConsola,
  type ModuloId,
  type RolId,
} from "./admin"
import { combinarRestricciones } from "./profiles"
import { confiabilidad, estadoComunitario, estadoEquipo, type BaseDatos } from "./reports"
import { calcularRuta } from "./router"

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type Tono = "ok" | "warn" | "bad" | "neutral"

export type Indicador = {
  id: string
  etiqueta: string
  valor: string
  /** Meta o umbral, con el requisito que lo fija. */
  meta: string
  tono: Tono
  nota?: string
  /** true si el valor es de demostración (en producción viene de otro sistema). */
  demo?: boolean
}

export type Accion = { texto: string; prioridad: "alta" | "media"; modulo?: ModuloId; detalle?: string }

export type Barra = { etiqueta: string; valor: number; texto: string; marca?: string }

export type EstadoCelda = "ok" | "recuperada" | "falla" | "omitida" | "sin_programa"

export type Grafica =
  | { tipo: "barras"; id: string; titulo: string; descripcion: string; unidad: string; max: number; barras: Barra[]; meta?: { valor: number; etiqueta: string }; demo?: boolean }
  | { tipo: "columnas"; id: string; titulo: string; descripcion: string; unidad: string; max: number; columnas: Barra[]; meta?: { valor: number; etiqueta: string }; demo?: boolean }
  | {
      tipo: "matriz"
      id: string
      titulo: string
      descripcion: string
      columnas: string[]
      filas: Array<{ etiqueta: string; celdas: Array<{ estado: EstadoCelda; detalle: string }> }>
      demo?: boolean
    }
  | { tipo: "medidores"; id: string; titulo: string; descripcion: string; items: Array<{ etiqueta: string; valor: number; max: number; tono: Tono; texto: string }>; vacio: string }
  | { tipo: "partes"; id: string; titulo: string; descripcion: string; partes: Array<{ etiqueta: string; valor: number; tono: Tono }>; demo?: boolean }

/** La pregunta que responde el tablero de cada rol. */
export const PREGUNTAS: Record<RolId, string> = {
  plataforma: "¿La plataforma está disponible, protegida y dentro del presupuesto?",
  datos: "¿Los datos llegan completos, a tiempo y bien homologados?",
  modelos: "¿El modelo publicado sigue siendo confiable y justo en todas las líneas?",
  moderacion: "¿La cola se atiende a tiempo y lo que pasa a validación es confiable?",
  gobernanza: "¿Cumplimos la LFPDPPP y cada acceso sigue justificado?",
  contenidos: "¿Lo que leen las personas es oficial, vigente, claro y accesible?",
  supervision: "¿El servicio cumple su propósito de accesibilidad para las personas usuarias?",
}

export type Tablero = { rol: RolId; pregunta: string; indicadores: Indicador[]; graficas: Grafica[]; acciones: Accion[] }

export type EntradaTablero = { estado: EstadoConsola; db: BaseDatos; ahora: number; cuenta: Cuenta }

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const pct = (x: number, dec = 1) => `${(x * 100).toFixed(dec)} %`
const num = (x: number) => x.toLocaleString("es-MX")
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const diaCorto = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "")

/** Generador pseudoaleatorio con semilla (mulberry32): la misma serie durante todo el día. */
function rng(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const semillaDelDia = (ahora: number, salt: number) => {
  const d = new Date(ahora)
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 31 + salt
}

/** Medianoche de los últimos n días, del más antiguo a hoy. */
export function ultimosDias(ahora: number, n: number): Date[] {
  const hoy = new Date(ahora)
  hoy.setHours(0, 0, 0, 0)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - (n - 1 - i))
    return d
  })
}

const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/* ------------------------------------------------------------------ */
/* Series de operación (demostración compartida por Plataforma y Supervisión) */
/* ------------------------------------------------------------------ */

export function operacionDemo(ahora: number) {
  const r = rng(semillaDelDia(ahora, 7))
  const dias = ultimosDias(ahora, 14)
  const solicitudes = dias.map((d, i) => {
    const finDeSemana = d.getDay() === 0 || d.getDay() === 6
    return Math.round((finDeSemana ? 150 : 270) + r() * 90 + i * 5)
  })
  const total = solicitudes.reduce((a, b) => a + b, 0)
  const errores = Math.round(total * (0.0008 + r() * 0.0008))
  const minutosCaida = 38 + Math.round(r() * 40)
  const hoy = new Date(ahora)
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const costoProyectado = 0.45
  return {
    dias,
    solicitudes,
    errores,
    tasaErrores: errores / total,
    minutosCaida,
    disponibilidad: 1 - minutosCaida / (30 * 24 * 60),
    p95ApiMs: Math.round(560 + r() * 240),
    costoAcumulado: (costoProyectado * hoy.getDate()) / diasMes,
    costoProyectado,
  }
}

/* ------------------------------------------------------------------ */
/* Administración de la plataforma                                     */
/* ------------------------------------------------------------------ */

function tableroPlataforma({ estado, ahora }: EntradaTablero): Tablero {
  const op = operacionDemo(ahora)
  const revocaciones = estado.revocaciones.filter((r) => r.estado === "pendiente")
  const masAntigua = revocaciones.reduce((m, r) => Math.min(m, r.ts), Infinity)
  const en30 = new Date(ahora + 30 * DIA).toISOString().slice(0, 10)
  const porVencer = estado.cuentas.filter((c) => c.estado === "activa" && c.vence && c.vence <= en30)
  const inactivas = estado.cuentas.filter((c) => c.estado === "activa" && c.ultimoAcceso && ahora - c.ultimoAcceso > SUSPENSION_POR_INACTIVIDAD - 9 * DIA)
  const negados = estado.auditoria.filter((x) => x.accion === "inicio de sesión" && x.resultado === "denegado" && ahora - x.ts <= 7 * DIA).length

  const indicadores: Indicador[] = [
    {
      id: "disponibilidad",
      etiqueta: "Disponibilidad de la API (30 días)",
      valor: pct(op.disponibilidad, 2),
      meta: "≥ 99 % mensual (RNF-08)",
      tono: op.disponibilidad >= 0.99 ? "ok" : "bad",
      nota: `${op.minutosCaida} min sin servicio en 30 días`,
      demo: true,
    },
    {
      id: "latencia",
      etiqueta: "Latencia p95 de la API (24 h)",
      valor: `${(op.p95ApiMs / 1000).toFixed(2)} s`,
      meta: "< 5 s (RNF-01)",
      tono: op.p95ApiMs < 5000 ? "ok" : "bad",
      nota: "Cálculo de ruta, incluido el arranque en frío",
      demo: true,
    },
    {
      id: "errores",
      etiqueta: "Respuestas con error 5xx (14 días)",
      valor: pct(op.tasaErrores, 2),
      meta: "< 1 % (propuesta)",
      tono: op.tasaErrores < 0.01 ? "ok" : "warn",
      nota: `${num(op.errores)} de ${num(op.solicitudes.reduce((a, b) => a + b, 0))} solicitudes`,
      demo: true,
    },
    {
      id: "costo",
      etiqueta: "Costo de nube del mes",
      valor: `USD ${op.costoAcumulado.toFixed(2)}`,
      meta: "Alerta en USD 15 (RNF-02)",
      tono: op.costoProyectado < 15 ? "ok" : "bad",
      nota: `Proyección al cierre: USD ${op.costoProyectado.toFixed(2)} sin instancia mínima`,
      demo: true,
    },
    {
      id: "revocaciones",
      etiqueta: "Revocaciones por atender",
      valor: String(revocaciones.length),
      meta: "0 pendientes al cierre del día",
      tono: revocaciones.length === 0 ? "ok" : ahora - masAntigua > DIA ? "bad" : "warn",
      nota: revocaciones.length ? "Las solicita Gobernanza al recertificar" : "Sin solicitudes de Gobernanza",
    },
    {
      id: "vencimientos",
      etiqueta: "Cuentas por vencer o inactivas",
      valor: String(porVencer.length + inactivas.length),
      meta: "Renovar o suspender antes del vencimiento (RNF-25)",
      tono: porVencer.length + inactivas.length ? "warn" : "ok",
      nota: [porVencer.length ? `${plural(porVencer.length, "externa vence", "externas vencen")} en ≤ 30 días` : "", inactivas.length ? `${plural(inactivas.length, "cuenta", "cuentas")} con más de 21 días sin acceso` : ""]
        .filter(Boolean)
        .join(" · ") || "Ninguna en los próximos 30 días",
    },
    {
      id: "negados",
      etiqueta: "Inicios de sesión rechazados (7 días)",
      valor: String(negados),
      meta: "Revisar si hay más de 5 al día",
      tono: negados > 35 ? "bad" : negados > 0 ? "warn" : "ok",
      nota: "Cuentas no registradas, suspendidas o código incorrecto (IAP)",
    },
  ]

  const acciones: Accion[] = []
  if (revocaciones.length) acciones.push({ texto: `Atender ${plural(revocaciones.length, "solicitud", "solicitudes")} de revocación de Gobernanza`, prioridad: "alta", modulo: "cuentas" })
  for (const c of porVencer) acciones.push({ texto: `Renovar o dar de baja la cuenta de ${c.nombre} (vence el ${c.vence})`, prioridad: "media", modulo: "cuentas" })
  for (const c of inactivas) acciones.push({ texto: `Confirmar si ${c.nombre} sigue necesitando acceso: se suspenderá a los 30 días sin uso`, prioridad: "media", modulo: "cuentas" })
  acciones.push({ texto: "Revisar la revisión vigente de cada servicio y que exista una anterior para revertir (RD-08)", prioridad: "media", modulo: "plataforma" })

  return {
    rol: "plataforma",
    pregunta: PREGUNTAS.plataforma,
    indicadores,
    graficas: [
      {
        tipo: "columnas",
        id: "solicitudes",
        titulo: "Solicitudes diarias a la API pública",
        descripcion: "Consultas de ruta y reportes de los últimos 14 días. Sirve para anticipar costo y capacidad; no contiene datos de personas.",
        unidad: "solicitudes",
        max: Math.max(...op.solicitudes) * 1.15,
        columnas: op.dias.map((d, i) => ({ etiqueta: diaCorto(d), valor: op.solicitudes[i], texto: `${num(op.solicitudes[i])} solicitudes` })),
        demo: true,
      },
    ],
    acciones,
  }
}

/* ------------------------------------------------------------------ */
/* Ingeniería de datos                                                 */
/* ------------------------------------------------------------------ */

/** Equipos del inventario oficial del STC al 30/09/2026 (el prototipo usa un subconjunto demostrativo). */
export const EQUIPOS_INVENTARIO_STC = 673

const TRABAJOS = [
  { nombre: "Captura diaria del inventario de equipos", corto: "Captura del inventario", programa: "diaria" as const },
  { nombre: "Ingesta de afluencia diaria (ADIP)", corto: "Ingesta de afluencia (ADIP)", programa: "mensual" as const },
  { nombre: "Perfil horario y saturación por franja", corto: "Perfil horario", programa: "mensual" as const },
]

export function matrizEjecuciones(estado: EstadoConsola, ahora: number, n = 30) {
  const dias = ultimosDias(ahora, n)
  const fallaDemo = n - 12 // un día con falla recuperada en la captura diaria (demostración)
  const hoyCaptura = new Date(ahora)
  const filas = TRABAJOS.map((t) => {
    const reales = estado.ejecuciones.filter((e) => e.trabajo === t.nombre)
    const celdas = dias.map((d, i): { estado: EstadoCelda; detalle: string } => {
      const delDia = reales.filter((e) => mismoDia(new Date(e.ts), d)).sort((a, b) => a.ts - b.ts)
      if (delDia.length) {
        const ultima = delDia[delDia.length - 1]
        if (ultima.resultado === "éxito") {
          return delDia.some((e) => e.resultado === "falla")
            ? { estado: "recuperada", detalle: `Falla recuperada con reintento: ${ultima.detalle}` }
            : { estado: "ok", detalle: ultima.detalle }
        }
        const recuperadaDespues = reales.some((e) => e.ts > ultima.ts && e.resultado === "éxito")
        return recuperadaDespues
          ? { estado: "recuperada", detalle: `${ultima.detalle} Reintento posterior con éxito.` }
          : { estado: "falla", detalle: ultima.detalle }
      }
      if (t.programa === "diaria") {
        if (mismoDia(d, hoyCaptura) && new Date(ahora).getHours() < 6) return { estado: "sin_programa", detalle: "Programada a las 06:00" }
        if (i === fallaDemo) return { estado: "recuperada", detalle: "Tiempo de espera del portal del STC; el reintento automático de las 06:30 terminó con éxito." }
        return { estado: "ok", detalle: `${num(EQUIPOS_INVENTARIO_STC)} equipos capturados con marca de tiempo.` }
      }
      if (d.getDate() === 1) {
        if (t.nombre.startsWith("Perfil")) {
          const ingesta = estado.ejecuciones.filter((e) => e.trabajo === TRABAJOS[1].nombre && mismoDia(new Date(e.ts), d))
          if (ingesta.some((e) => e.resultado === "falla") && !ingesta.some((e) => e.resultado === "éxito")) {
            return { estado: "omitida", detalle: "No se ejecutó porque la ingesta falló; se conservó el perfil vigente (RNF-09)." }
          }
        }
        return { estado: "ok", detalle: "Ejecución mensual con esquema validado." }
      }
      return { estado: "sin_programa", detalle: t.programa === "mensual" ? "Trabajo mensual: corre el día 1" : "Sin ejecución programada" }
    })
    return { etiqueta: t.corto, celdas }
  })
  return { dias, filas }
}

function tableroDatos({ estado, ahora }: EntradaTablero): Tablero {
  const calidad = calidadHomologacion(estado)
  const capturas = estado.ejecuciones.filter((e) => e.trabajo === TRABAJOS[0].nombre && e.resultado === "éxito").sort((a, b) => b.ts - a.ts)
  const ultimaCaptura = capturas[0]?.ts
  const horasCaptura = ultimaCaptura ? (ahora - ultimaCaptura) / HORA : Infinity
  const ultimas = new Map<string, (typeof estado.ejecuciones)[number]>()
  for (const ej of [...estado.ejecuciones].sort((a, b) => b.ts - a.ts)) if (!ultimas.has(ej.trabajo)) ultimas.set(ej.trabajo, ej)
  const sinRecuperar = [...ultimas.values()].filter((e) => e.resultado === "falla")
  const matriz = matrizEjecuciones(estado, ahora)
  const corridas = matriz.filas.flatMap((f) => f.celdas).filter((c) => c.estado === "ok" || c.estado === "recuperada" || c.estado === "falla")
  const exitosas = corridas.filter((c) => c.estado === "ok").length
  const tasa = corridas.length ? exitosas / corridas.length : 1

  const indicadores: Indicador[] = [
    {
      id: "frescura",
      etiqueta: "Antigüedad de la captura del inventario",
      valor: Number.isFinite(horasCaptura) ? `${horasCaptura < 1 ? "< 1" : Math.floor(horasCaptura)} h` : "Sin captura",
      meta: "≤ 24 h; con más de 48 h las rutas marcan «incierto»",
      tono: horasCaptura <= 24 ? "ok" : horasCaptura <= 48 ? "warn" : "bad",
      nota: "Captura diaria de las 06:00 (RF-02)",
    },
    {
      id: "sin-recuperar",
      etiqueta: "Trabajos con falla sin recuperar",
      valor: String(sinRecuperar.length),
      meta: "0; toda falla conserva la versión vigente (RNF-09)",
      tono: sinRecuperar.length ? "bad" : "ok",
      nota: sinRecuperar.length ? sinRecuperar.map((e) => e.trabajo).join(" · ") : "Todas las últimas ejecuciones terminaron con éxito",
    },
    {
      id: "exito",
      etiqueta: "Ejecuciones exitosas a la primera (30 días)",
      valor: pct(tasa),
      meta: "≥ 99.5 % (RNF-09)",
      tono: tasa >= 0.995 ? "ok" : tasa >= 0.95 ? "warn" : "bad",
      nota: `${exitosas} de ${corridas.length} ejecuciones programadas`,
      demo: true,
    },
    {
      id: "homologacion",
      etiqueta: "Estaciones homologadas",
      valor: pct(calidad.final),
      meta: "Automática ≥ 95 % (RNF-11); final 100 %",
      tono: calidad.final === 1 ? "ok" : calidad.automatica >= 0.95 ? "warn" : "bad",
      nota: `Automática: ${pct(calidad.automatica)}`,
    },
    {
      id: "excepciones",
      etiqueta: "Excepciones de homologación pendientes",
      valor: String(calidad.pendientes),
      meta: "0 antes de entrenar (CA-04.2)",
      tono: calidad.pendientes === 0 ? "ok" : "warn",
      nota: "Nombres abreviados o sin línea en las fuentes",
    },
    {
      id: "completitud",
      etiqueta: "Equipos con estado en la última captura",
      valor: "100 %",
      meta: "100 % con marca de tiempo; 0 sobrescrituras",
      tono: "ok",
      nota: `${num(EQUIPOS_INVENTARIO_STC)} elevadores, salvaescaleras y escaleras eléctricas del STC`,
      demo: true,
    },
  ]

  const acciones: Accion[] = []
  for (const e of sinRecuperar) acciones.push({ texto: `Reintentar «${e.trabajo}»`, detalle: e.detalle, prioridad: "alta", modulo: "datos" })
  if (horasCaptura > 24) acciones.push({ texto: "La captura del inventario tiene más de 24 h: revisar el trabajo de las 06:00", prioridad: "alta", modulo: "datos" })
  if (calidad.pendientes) acciones.push({ texto: `Resolver ${plural(calidad.pendientes, "excepción", "excepciones")} de homologación antes del siguiente entrenamiento`, prioridad: "media", modulo: "datos" })

  return {
    rol: "datos",
    pregunta: PREGUNTAS.datos,
    indicadores,
    graficas: [
      {
        tipo: "matriz",
        id: "ejecuciones",
        titulo: "Ejecuciones de los trabajos programados (30 días)",
        descripcion: "Un cuadro por día y trabajo. Las fallas recuperadas cuentan como falla en la tasa de éxito.",
        columnas: matriz.dias.map(diaCorto),
        filas: matriz.filas,
        demo: true,
      },
    ],
    acciones,
  }
}

/* ------------------------------------------------------------------ */
/* Ciencia de datos e IA                                               */
/* ------------------------------------------------------------------ */

export const PSI_ESTABLE = 0.1
export const PSI_REENTRENAR = 0.25
export const BRECHA_MAXIMA = 0.1

export function psiSemanal(ahora: number): Array<{ semana: string; psi: number }> {
  const r = rng(semillaDelDia(ahora, 11))
  const hoy = new Date(ahora)
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - 7 * (7 - i))
    return { semana: diaCorto(d), psi: Math.round((0.03 + i * 0.006 + r() * 0.025) * 1000) / 1000 }
  })
}

function tableroModelos({ estado, ahora }: EntradaTablero): Tablero {
  const vigente = estado.modelos.find((m) => m.estado === "vigente")
  const candidatos = estado.modelos.filter((m) => m.estado === "candidato")
  const listos = candidatos.filter((m) => evaluarPublicacion(m, vigente).ok)
  const lineas = vigente ? Object.entries(vigente.f1PorLinea) : []
  const valores = lineas.map(([, v]) => v)
  const brecha = valores.length ? Math.max(...valores) - Math.min(...valores) : 0
  const peor = lineas.reduce<[string, number] | null>((m, x) => (!m || x[1] < m[1] ? x : m), null)
  const bajoUmbral = lineas.filter(([, v]) => v < F1_MINIMO)
  const psi = psiSemanal(ahora)
  const psiActual = psi[psi.length - 1].psi
  const margen = vigente ? vigente.f1Macro - REFERENCIA.f1Macro : 0

  const indicadores: Indicador[] = [
    {
      id: "f1",
      etiqueta: "F1 macro del modelo vigente",
      valor: vigente ? vigente.f1Macro.toFixed(2) : "—",
      meta: `≥ ${F1_MINIMO} (RNF-12)`,
      tono: vigente && vigente.f1Macro >= F1_MINIMO ? "ok" : "bad",
      nota: vigente ? `${vigente.id} · ${vigente.algoritmo}` : "Sin modelo vigente",
      demo: true,
    },
    {
      id: "margen",
      etiqueta: "Margen sobre la referencia",
      valor: `${margen >= 0 ? "+" : ""}${margen.toFixed(2)}`,
      meta: `≥ +${MARGEN} de F1 macro (HU-09)`,
      tono: Math.round(margen * 100) / 100 >= MARGEN ? "ok" : "bad",
      nota: `Referencia: ${REFERENCIA.nombre.toLowerCase()} (${REFERENCIA.f1Macro})`,
      demo: true,
    },
    {
      id: "recall",
      etiqueta: "Recall de la clase «alta»",
      valor: vigente ? vigente.recallAlta.toFixed(2) : "—",
      meta: `≥ ${REFERENCIA.recallAlta} (no empeorar la referencia)`,
      tono: vigente && vigente.recallAlta >= REFERENCIA.recallAlta ? "ok" : "bad",
      nota: "Avisar una franja saturada es lo que más importa a la persona usuaria",
      demo: true,
    },
    {
      id: "brecha",
      etiqueta: "Brecha de F1 entre líneas",
      valor: brecha.toFixed(2),
      meta: `≤ ${BRECHA_MAXIMA.toFixed(2)} (propuesta, revisión de sesgos)`,
      tono: brecha <= BRECHA_MAXIMA ? "ok" : "warn",
      nota: peor ? `Peor: Línea ${peor[0]} (${peor[1].toFixed(2)}); ${plural(bajoUmbral.length, "línea", "líneas")} bajo ${F1_MINIMO}` : undefined,
      demo: true,
    },
    {
      id: "psi",
      etiqueta: "Deriva de la afluencia (PSI semanal)",
      valor: psiActual.toFixed(3),
      meta: `< ${PSI_ESTABLE} estable; ≥ ${PSI_REENTRENAR} reentrenar`,
      tono: psiActual < PSI_ESTABLE ? "ok" : psiActual < PSI_REENTRENAR ? "warn" : "bad",
      nota: "Distribución de la semana contra la del entrenamiento",
      demo: true,
    },
    {
      id: "candidatos",
      etiqueta: "Candidatos que cumplen la regla",
      valor: `${listos.length} de ${candidatos.length}`,
      meta: "Publicar solo si supera al vigente (HU-09)",
      tono: listos.length ? "warn" : "neutral",
      nota: listos.length ? listos.map((m) => m.id).join(", ") : "Ninguno listo para publicar",
    },
  ]

  const acciones: Accion[] = []
  for (const m of listos) acciones.push({ texto: `Evaluar y, si procede, publicar ${m.id} (F1 macro ${m.f1Macro.toFixed(2)})`, prioridad: "media", modulo: "modelos" })
  if (bajoUmbral.length) acciones.push({ texto: `Revisar el desempeño en ${bajoUmbral.map(([l]) => `Línea ${l}`).join(", ")}: están bajo ${F1_MINIMO}`, prioridad: "media", modulo: "modelos" })
  if (psiActual >= PSI_ESTABLE) acciones.push({ texto: "La deriva supera 0.10: programar un reentrenamiento", prioridad: psiActual >= PSI_REENTRENAR ? "alta" : "media", modulo: "modelos" })

  return {
    rol: "modelos",
    pregunta: PREGUNTAS.modelos,
    indicadores,
    graficas: [
      {
        tipo: "barras",
        id: "f1-lineas",
        titulo: "F1 por línea del modelo vigente",
        descripcion: `La línea vertical marca el umbral de ${F1_MINIMO}. Las líneas con menos historia o con cierres largos suelen quedar abajo.`,
        unidad: "F1",
        max: 1,
        meta: { valor: F1_MINIMO, etiqueta: `Umbral ${F1_MINIMO}` },
        barras: lineas.map(([l, v]) => ({ etiqueta: `Línea ${l}`, valor: v, texto: v.toFixed(2), marca: v < F1_MINIMO ? "bajo el umbral" : undefined })),
        demo: true,
      },
      {
        tipo: "columnas",
        id: "psi",
        titulo: "Deriva semanal de la afluencia (PSI)",
        descripcion: `Últimas 8 semanas. Por debajo de ${PSI_ESTABLE} la distribución se considera estable.`,
        unidad: "PSI",
        max: Math.max(PSI_ESTABLE * 1.4, ...psi.map((p) => p.psi * 1.15)),
        meta: { valor: PSI_ESTABLE, etiqueta: `Estable < ${PSI_ESTABLE}` },
        columnas: psi.map((p) => ({ etiqueta: p.semana, valor: p.psi, texto: p.psi.toFixed(3) })),
        demo: true,
      },
    ],
    acciones,
  }
}

/* ------------------------------------------------------------------ */
/* Moderación de reportes                                              */
/* ------------------------------------------------------------------ */

export const PLAZO_MODERACION_H = 24

function tableroModeracion({ db, ahora }: EntradaTablero): Tablero {
  const cola = db.reportes.filter((r) => r.moderacion === "pendiente").sort((a, b) => a.ts - b.ts)
  const masAntiguoH = cola.length ? (ahora - cola[0].ts) / HORA : 0
  const recibidos24 = db.reportes.filter((r) => r.ts <= ahora && ahora - r.ts < DIA).length
  const decididos = db.reportes.filter((r) => (r.moderacion === "aprobado" || r.moderacion === "rechazado") && ahora - r.ts <= 30 * DIA)
  const rechazados = decididos.filter((r) => r.moderacion === "rechazado").length
  const equipos = [...new Set(db.reportes.map((r) => r.equipmentId))]
  const confirmados = equipos.filter((id) => estadoComunitario(db, id, ahora).estado === "confirmado").length
  const seudonimos = [...new Set(db.reportes.map((r) => r.seudonimo))]
  const baja = seudonimos.filter((s) => confiabilidad(db, s) < 0.5).length

  const indicadores: Indicador[] = [
    {
      id: "cola",
      etiqueta: "Reportes en la cola",
      valor: String(cola.length),
      meta: `Revisar cada uno en ≤ ${PLAZO_MODERACION_H} h (propuesta)`,
      tono: cola.length === 0 ? "ok" : "warn",
      nota: "Con foto, foto repetida o cuenta de baja confiabilidad",
    },
    {
      id: "antiguedad",
      etiqueta: "Antigüedad del más antiguo",
      valor: cola.length ? `${masAntiguoH < 1 ? Math.round(masAntiguoH * 60) + " min" : masAntiguoH.toFixed(1) + " h"}` : "—",
      meta: `≤ ${PLAZO_MODERACION_H} h (propuesta)`,
      tono: !cola.length || masAntiguoH <= PLAZO_MODERACION_H / 2 ? "ok" : masAntiguoH <= PLAZO_MODERACION_H ? "warn" : "bad",
      nota: cola.length ? `${equipoPorId(cola[0].equipmentId)?.tipo ?? "Equipo"} en ${cola[0].station}` : "Cola vacía",
    },
    {
      id: "recibidos",
      etiqueta: "Reportes recibidos (24 h)",
      valor: String(recibidos24),
      meta: "Referencia de carga de trabajo",
      tono: "neutral",
      nota: "Incluye los que van directo a validación comunitaria",
    },
    {
      id: "rechazo",
      etiqueta: "Rechazados de lo moderado (30 días)",
      valor: decididos.length ? pct(rechazados / decididos.length, 0) : "—",
      meta: "Vigilar si supera 30 % (propuesta)",
      tono: !decididos.length ? "neutral" : rechazados / decididos.length > 0.3 ? "warn" : "ok",
      nota: decididos.length ? `${rechazados} de ${decididos.length} decisiones; rechazar borra las fotos` : "Aún no hay decisiones registradas",
    },
    {
      id: "confirmados",
      etiqueta: "Equipos fuera de servicio confirmados",
      valor: String(confirmados),
      meta: "Contexto: 3 personas en 6 h, o 2 con una verificada (RN5)",
      tono: "neutral",
      nota: "Confirmados por la comunidad; moderar no cambia el estado oficial",
    },
    {
      id: "baja-confiabilidad",
      etiqueta: "Cuentas con confiabilidad baja",
      valor: String(baja),
      meta: "Sus reportes pasan siempre por revisión",
      tono: baja ? "warn" : "ok",
      nota: "Índice < 0.5 por rechazos o reportes contradichos",
    },
  ]

  const acciones: Accion[] = cola.slice(0, 4).map((r) => ({
    texto: `Revisar ${equipoPorId(r.equipmentId)?.tipo.toLowerCase() ?? "equipo"} de ${r.station}${r.motivoCuarentena ? ` (${r.motivoCuarentena.toLowerCase()})` : ""}`,
    prioridad: (ahora - r.ts) / HORA > PLAZO_MODERACION_H / 2 ? ("alta" as const) : ("media" as const),
    modulo: "moderacion" as const,
  }))

  const maxH = Math.max(PLAZO_MODERACION_H * 1.15, ...cola.map((r) => ((ahora - r.ts) / HORA) * 1.15))
  return {
    rol: "moderacion",
    pregunta: PREGUNTAS.moderacion,
    indicadores,
    graficas: [
      {
        tipo: "barras",
        id: "cola",
        titulo: "Antigüedad de los reportes en la cola",
        descripcion: `Del más antiguo al más reciente. La línea marca el plazo propuesto de ${PLAZO_MODERACION_H} h.`,
        unidad: "horas",
        max: maxH,
        meta: { valor: PLAZO_MODERACION_H, etiqueta: `${PLAZO_MODERACION_H} h` },
        barras: cola.map((r) => {
          const h = (ahora - r.ts) / HORA
          return { etiqueta: `${equipoPorId(r.equipmentId)?.tipo ?? "Equipo"} · ${r.station}`, valor: h, texto: h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`, marca: h > PLAZO_MODERACION_H ? "fuera de plazo" : undefined }
        }),
      },
    ],
    acciones,
  }
}

/* ------------------------------------------------------------------ */
/* Gobernanza y protección de datos                                    */
/* ------------------------------------------------------------------ */

function tableroGobernanza({ estado, db, ahora, cuenta }: EntradaTablero): Tablero {
  const abiertas = estado.arco
    .filter((s) => s.estado === "pendiente")
    .map((s) => {
      const usados = diasHabiles(s.recibida, ahora)
      return { s, usados, restantes: PLAZO_ARCO - usados }
    })
    .sort((a, b) => a.restantes - b.restantes)
  const respondidas = estado.arco.filter((s) => s.respondida)
  const enPlazo = respondidas.filter((s) => diasHabiles(s.recibida, s.respondida!) <= PLAZO_ARCO).length
  const inicioMes = new Date(ahora)
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const porRecertificar = estado.cuentas.filter((c) => c.estado === "activa" && c.id !== cuenta.id)
  const recertificadas = porRecertificar.filter((c) => estado.recertificaciones.some((r) => r.cuentaId === c.id && r.ts >= inicioMes.getTime())).length
  const finMes = new Date(inicioMes)
  finMes.setMonth(finMes.getMonth() + 1)
  const diasAlCierre = Math.ceil((finMes.getTime() - ahora) / DIA)
  const negados = estado.auditoria.filter((x) => x.resultado === "denegado" && ahora - x.ts <= 7 * DIA).length
  const fotosVencidas = db.evidencias.filter((x) => x.borrarEn <= ahora).length
  const porAprobar = estado.contenido.borrador?.estado === "en_revision" ? 1 : 0
  const urgente = abiertas[0]

  const indicadores: Indicador[] = [
    {
      id: "arco",
      etiqueta: "Solicitudes ARCO abiertas",
      valor: String(abiertas.length),
      meta: `Responder en ≤ ${PLAZO_ARCO} días hábiles (art. 31)`,
      tono: !urgente ? "ok" : urgente.restantes <= 3 ? "bad" : urgente.restantes <= 7 ? "warn" : "ok",
      nota: urgente ? `La más urgente (${urgente.s.id}) vence en ${plural(urgente.restantes, "día hábil", "días hábiles")}` : "Sin solicitudes pendientes",
    },
    {
      id: "arco-plazo",
      etiqueta: "ARCO respondidas en plazo",
      valor: respondidas.length ? pct(enPlazo / respondidas.length, 0) : "—",
      meta: "100 % (LFPDPPP)",
      tono: !respondidas.length || enPlazo === respondidas.length ? "ok" : "bad",
      nota: `${enPlazo} de ${respondidas.length} respondidas`,
    },
    {
      id: "recertificacion",
      etiqueta: "Accesos recertificados este mes",
      valor: `${recertificadas} de ${porRecertificar.length}`,
      meta: "100 % antes del cierre de mes (HU-27)",
      tono: recertificadas === porRecertificar.length ? "ok" : diasAlCierre <= 5 ? "bad" : "warn",
      nota: `Faltan ${plural(diasAlCierre, "día", "días")} para el cierre de mes`,
    },
    {
      id: "negados",
      etiqueta: "Acciones o accesos negados (7 días)",
      valor: String(negados),
      meta: "Revisar cada uno en la bitácora (RNF-24)",
      tono: negados ? "warn" : "ok",
      nota: "Incluye intentos sin permiso y cuentas rechazadas",
    },
    {
      id: "fotos",
      etiqueta: "Fotos vencidas sin borrar",
      valor: String(fotosVencidas),
      meta: "0: se borran a los 90 días (RD-12)",
      tono: fotosVencidas ? "bad" : "ok",
      nota: `${db.evidencias.length} fotos guardadas en total`,
    },
    {
      id: "aprobaciones",
      etiqueta: "Contenido esperando tu aprobación",
      valor: String(porAprobar),
      meta: "Doble control: quien propone no aprueba (RN9)",
      tono: porAprobar ? "warn" : "ok",
      nota: porAprobar ? `Propuso ${estado.contenido.borrador!.propuestoPor}` : "Sin propuestas en revisión",
    },
  ]

  const acciones: Accion[] = []
  for (const a of abiertas) acciones.push({ texto: `Responder ${a.s.id} (${a.s.tipo}): quedan ${plural(a.restantes, "día hábil", "días hábiles")}`, prioridad: a.restantes <= 7 ? "alta" : "media", modulo: "privacidad" })
  if (porAprobar) acciones.push({ texto: "Revisar la fuente y aprobar o devolver el contenido de emergencia propuesto", prioridad: "media", modulo: "contenidos" })
  if (recertificadas < porRecertificar.length) acciones.push({ texto: `Recertificar ${plural(porRecertificar.length - recertificadas, "cuenta", "cuentas")} antes del cierre de mes`, prioridad: diasAlCierre <= 5 ? "alta" : "media", modulo: "privacidad" })
  if (negados) acciones.push({ texto: `Revisar ${plural(negados, "evento negado", "eventos negados")} en la bitácora`, prioridad: "media", modulo: "bitacora" })
  if (fotosVencidas) acciones.push({ texto: "Ejecutar la retención: hay fotos vencidas", prioridad: "alta", modulo: "privacidad" })

  return {
    rol: "gobernanza",
    pregunta: PREGUNTAS.gobernanza,
    indicadores,
    graficas: [
      {
        tipo: "medidores",
        id: "plazos-arco",
        titulo: "Plazo usado de las solicitudes ARCO abiertas",
        descripcion: `Días hábiles transcurridos de los ${PLAZO_ARCO} que da la ley para comunicar la respuesta.`,
        items: abiertas.map((a) => ({
          etiqueta: `${a.s.id} · ${a.s.tipo}`,
          valor: Math.min(a.usados, PLAZO_ARCO),
          max: PLAZO_ARCO,
          tono: a.restantes <= 3 ? "bad" : a.restantes <= 7 ? "warn" : "ok",
          texto: `${a.usados} de ${PLAZO_ARCO} · quedan ${a.restantes}`,
        })),
        vacio: "No hay solicitudes ARCO abiertas.",
      },
      {
        tipo: "partes",
        id: "recertificacion",
        titulo: "Recertificación de accesos del mes",
        descripcion: "Cuentas activas del personal (sin contar la tuya, que recertifica otra persona).",
        partes: [
          { etiqueta: "Recertificadas", valor: recertificadas, tono: "ok" },
          { etiqueta: "Pendientes", valor: porRecertificar.length - recertificadas, tono: "warn" },
        ],
      },
    ],
    acciones,
  }
}

/* ------------------------------------------------------------------ */
/* Accesibilidad y contenidos                                          */
/* ------------------------------------------------------------------ */

export const PALABRAS_MAXIMAS = 25
export const REVISION_CONTENIDO_DIAS = 90

export const contarPalabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

function tableroContenidos({ estado, ahora }: EntradaTablero): Tablero {
  const pub = estado.contenido.publicado
  const b = estado.contenido.borrador
  const diasPublicado = pub.publicadoTs ? Math.floor((ahora - pub.publicadoTs) / DIA) : null
  const terminosPub = revisarTerminologia(pub.pasos)
  const terminosProp = b ? revisarTerminologia(b.pasos) : []
  const largos = pub.pasos.filter((p) => contarPalabras(p) > PALABRAS_MAXIMAS).length
  const horasPropuesta = b ? (ahora - b.ts) / HORA : 0

  const indicadores: Indicador[] = [
    {
      id: "fuente",
      etiqueta: "Fuente del contenido publicado",
      valor: pub.ejemplo ? "Ejemplo" : "Oficial",
      meta: "Fuente oficial del STC con fecha de consulta (CA-15.1)",
      tono: pub.ejemplo ? "warn" : "ok",
      nota: `Versión ${pub.version}${pub.aprobadoPor ? ` · aprobó ${pub.aprobadoPor}` : ""}`,
    },
    {
      id: "vigencia",
      etiqueta: "Días desde la última publicación",
      valor: diasPublicado === null ? "—" : String(diasPublicado),
      meta: `Revisar la fuente cada ${REVISION_CONTENIDO_DIAS} días (propuesta)`,
      tono: diasPublicado === null ? "neutral" : diasPublicado <= REVISION_CONTENIDO_DIAS * 0.8 ? "ok" : diasPublicado <= REVISION_CONTENIDO_DIAS ? "warn" : "bad",
      nota: `Actualizado: ${pub.actualizado}`,
    },
    {
      id: "propuesta",
      etiqueta: "Tu propuesta",
      valor: !b ? "Sin propuesta" : b.estado === "en_revision" ? "En revisión" : "Devuelta",
      meta: "Aprobación de Gobernanza (RN9)",
      tono: !b ? "neutral" : b.estado === "devuelto" ? "bad" : "warn",
      nota: !b ? "Puedes proponer cambios desde Contenidos" : b.estado === "en_revision" ? `Espera aprobación desde hace ${horasPropuesta < 1 ? "menos de 1 h" : `${Math.floor(horasPropuesta)} h`}` : `Observaciones: ${b.observaciones}`,
    },
    {
      id: "terminos",
      etiqueta: "Términos a evitar",
      valor: String(terminosPub.length + terminosProp.length),
      meta: "0 en lo publicado y en la propuesta (RNF-23)",
      tono: terminosPub.length + terminosProp.length ? "bad" : "ok",
      nota: terminosPub.length + terminosProp.length ? [...terminosPub, ...terminosProp].join(", ") : "Lenguaje centrado en la persona",
    },
    {
      id: "largos",
      etiqueta: `Pasos de más de ${PALABRAS_MAXIMAS} palabras`,
      valor: `${largos} de ${pub.pasos.length}`,
      meta: "0: frases cortas para lectura fácil y lectores de pantalla",
      tono: largos ? "warn" : "ok",
      nota: "Del contenido que hoy ve la persona usuaria",
    },
    {
      id: "wcag",
      etiqueta: "Infracciones WCAG 2.2 automáticas",
      valor: "0",
      meta: "0 en la app y la consola (RNF-14, RNF-26)",
      tono: "ok",
      nota: "Última revisión con axe-core; la prueba con TalkBack y VoiceOver la hace la especialista",
      demo: true,
    },
  ]

  const acciones: Accion[] = []
  if (b?.estado === "devuelto") acciones.push({ texto: "Corregir la propuesta devuelta por Gobernanza y reenviarla", prioridad: "alta", modulo: "contenidos" })
  if (pub.ejemplo && !b) acciones.push({ texto: "Proponer el contenido con la fuente oficial para sustituir el de ejemplo", prioridad: "alta", modulo: "contenidos" })
  if (b?.estado === "en_revision") acciones.push({ texto: "Dar seguimiento: tu propuesta espera la aprobación de Gobernanza", prioridad: "media", modulo: "contenidos" })
  if (largos) acciones.push({ texto: `Acortar ${plural(largos, "paso", "pasos")} del contenido publicado`, prioridad: "media", modulo: "contenidos" })
  if (diasPublicado !== null && diasPublicado > REVISION_CONTENIDO_DIAS * 0.8) acciones.push({ texto: "Verificar que la fuente oficial siga vigente", prioridad: "media", modulo: "contenidos" })

  const barrasDe = (pasos: string[]): Barra[] =>
    pasos.map((p, i) => {
      const n = contarPalabras(p)
      return { etiqueta: `Paso ${i + 1}`, valor: n, texto: `${n} palabras`, marca: n > PALABRAS_MAXIMAS ? "largo" : undefined }
    })
  const graficas: Grafica[] = [
    {
      tipo: "barras",
      id: "palabras-publicado",
      titulo: `Palabras por paso · publicado (v${pub.version})`,
      descripcion: `La línea marca ${PALABRAS_MAXIMAS} palabras, el máximo propuesto para lenguaje claro.`,
      unidad: "palabras",
      max: Math.max(PALABRAS_MAXIMAS * 1.3, ...pub.pasos.map((p) => contarPalabras(p) * 1.1)),
      meta: { valor: PALABRAS_MAXIMAS, etiqueta: `${PALABRAS_MAXIMAS} palabras` },
      barras: barrasDe(pub.pasos),
    },
  ]
  if (b) {
    graficas.push({
      tipo: "barras",
      id: "palabras-propuesta",
      titulo: `Palabras por paso · propuesta ${b.estado === "en_revision" ? "en revisión" : "devuelta"}`,
      descripcion: "Misma regla aplicada a la propuesta antes de que Gobernanza la apruebe.",
      unidad: "palabras",
      max: Math.max(PALABRAS_MAXIMAS * 1.3, ...b.pasos.map((p) => contarPalabras(p) * 1.1)),
      meta: { valor: PALABRAS_MAXIMAS, etiqueta: `${PALABRAS_MAXIMAS} palabras` },
      barras: barrasDe(b.pasos),
    })
  }

  return { rol: "contenidos", pregunta: PREGUNTAS.contenidos, indicadores, graficas, acciones }
}

/* ------------------------------------------------------------------ */
/* Supervisión del servicio                                            */
/* ------------------------------------------------------------------ */

export function muestraRutas(db: BaseDatos, ahora: number) {
  const n = allStations.length
  const restr = combinarRestricciones(["silla_ruedas"])
  const est = (id: string) => estadoEquipo(db, id, ahora)
  const conteo = { accesible: 0, accesible_con_apoyo: 0, sin_ruta: 0, fuera_de_horario: 0 }
  const tiempos: number[] = []
  for (let i = 0; i < 40; i++) {
    const origen = allStations[(i * 7) % n]
    const destino = allStations[(i * 13 + 41) % n]
    if (origen === destino) continue
    const t0 = performance.now()
    const r = calcularRuta({ origen, destino, restricciones: restr, fecha: new Date(ahora), hora: 8 * 60, tipoHora: "salir_a" }, est)
    tiempos.push(performance.now() - t0)
    conteo[r.estado]++
  }
  tiempos.sort((a, b) => a - b)
  const total = tiempos.length
  return { conteo, total, p95: tiempos[Math.min(total - 1, Math.floor(total * 0.95))] ?? 0 }
}

const FALLAS = new Set(["no_funciona", "con_fallas", "cerrado"])

function tableroSupervision({ estado, db, ahora }: EntradaTablero, muestra = muestraRutas(db, ahora)): Tablero {
  const op = operacionDemo(ahora)
  const total = Math.max(muestra.total, 1)
  const equipos = [...new Set(db.reportes.map((r) => r.equipmentId))]
  const comunitarios = equipos.map((id) => ({ id, ...estadoComunitario(db, id, ahora) }))
  const confirmados = comunitarios.filter((c) => c.estado === "confirmado")
  const reportes24 = db.reportes.filter((r) => r.ts <= ahora && ahora - r.ts < DIA)
  const vigente = estado.modelos.find((m) => m.estado === "vigente")
  const porEstacion = new Map<string, number>()
  for (const r of reportes24) if (FALLAS.has(r.estado) && !r.cuarentena && r.moderacion !== "rechazado") porEstacion.set(r.station, (porEstacion.get(r.station) ?? 0) + 1)
  const top = [...porEstacion.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)

  const indicadores: Indicador[] = [
    {
      id: "accesibles",
      etiqueta: "Trayectos con ruta accesible",
      valor: pct((muestra.conteo.accesible + muestra.conteo.accesible_con_apoyo) / total),
      meta: "Línea base del piloto; seguir la tendencia mensual",
      tono: "neutral",
      nota: `Muestra de ${muestra.total} trayectos en silla de ruedas, hoy a las 8:00`,
    },
    {
      id: "sin-ruta",
      etiqueta: "Trayectos sin ruta posible",
      valor: pct(muestra.conteo.sin_ruta / total),
      meta: "Brecha de infraestructura para el STC",
      tono: muestra.conteo.sin_ruta ? "warn" : "ok",
      nota: "Estaciones sin elevador o salvaescaleras en el trayecto",
    },
    {
      id: "fuera-servicio",
      etiqueta: "Equipos fuera de servicio confirmados",
      valor: String(confirmados.length),
      meta: "Seguimiento con mantenimiento del STC",
      tono: confirmados.length ? "warn" : "ok",
      nota: "Confirmados por la comunidad (RN5); no es el estado oficial",
    },
    {
      id: "disponibilidad",
      etiqueta: "Disponibilidad del servicio (30 días)",
      valor: pct(op.disponibilidad, 2),
      meta: "≥ 99 % mensual (RNF-08)",
      tono: op.disponibilidad >= 0.99 ? "ok" : "bad",
      demo: true,
    },
    {
      id: "calculo",
      etiqueta: "Tiempo de cálculo de ruta (p95)",
      valor: `${muestra.p95.toFixed(1)} ms`,
      meta: "< 5 s (RNF-01)",
      tono: muestra.p95 < 5000 ? "ok" : "bad",
      nota: "Medido en este navegador con la muestra",
    },
    {
      id: "reportes",
      etiqueta: "Reportes ciudadanos (24 h)",
      valor: String(reportes24.length),
      meta: "Participación de la comunidad",
      tono: "neutral",
      nota: "Sin datos personales: solo conteos",
    },
    {
      id: "modelo",
      etiqueta: "Confiabilidad del pronóstico de saturación",
      valor: vigente ? vigente.f1Macro.toFixed(2) : "—",
      meta: `F1 macro ≥ ${F1_MINIMO} (RNF-12)`,
      tono: vigente && vigente.f1Macro >= F1_MINIMO ? "ok" : "bad",
      demo: true,
    },
    {
      id: "costo",
      etiqueta: "Costo de nube del mes",
      valor: `USD ${op.costoAcumulado.toFixed(2)}`,
      meta: "≤ USD 15 al mes (RNF-02)",
      tono: "ok",
      demo: true,
    },
  ]

  const acciones: Accion[] = confirmados.slice(0, 3).map((c) => {
    const eq = equipoPorId(c.id)
    return { texto: `${eq?.tipo ?? "Equipo"} de ${eq?.station ?? "estación"} fuera de servicio, confirmado por ${c.personas} personas: canalizar a mantenimiento`, prioridad: "alta" as const }
  })
  if (muestra.conteo.sin_ruta) acciones.push({ texto: `${plural(muestra.conteo.sin_ruta, "trayecto", "trayectos")} de la muestra no tienen ruta accesible: priorizar obra en esas estaciones`, prioridad: "media" })

  return {
    rol: "supervision",
    pregunta: PREGUNTAS.supervision,
    indicadores,
    graficas: [
      {
        tipo: "partes",
        id: "resultado-rutas",
        titulo: `Resultado de ${muestra.total} trayectos de muestra`,
        descripcion: "Perfil silla de ruedas, salida a las 8:00, con el estado de los equipos de hoy.",
        partes: [
          { etiqueta: "Accesible", valor: muestra.conteo.accesible, tono: "ok" },
          { etiqueta: "Accesible con apoyo", valor: muestra.conteo.accesible_con_apoyo, tono: "warn" },
          { etiqueta: "Sin ruta posible", valor: muestra.conteo.sin_ruta + muestra.conteo.fuera_de_horario, tono: "bad" },
        ],
      },
      {
        tipo: "barras",
        id: "estaciones-reportes",
        titulo: "Estaciones con más reportes de falla (24 h)",
        descripcion: "Reportes válidos (sin los que están en revisión o fueron rechazados).",
        unidad: "reportes",
        max: Math.max(4, ...top.map(([, n]) => n * 1.2)),
        barras: top.map(([s, n]) => ({ etiqueta: s, valor: n, texto: plural(n, "reporte", "reportes") })),
      },
    ],
    acciones,
  }
}

/* ------------------------------------------------------------------ */
/* Punto de entrada                                                    */
/* ------------------------------------------------------------------ */

export function tableroDe(rol: RolId, entrada: EntradaTablero, muestra?: ReturnType<typeof muestraRutas>): Tablero {
  switch (rol) {
    case "plataforma":
      return tableroPlataforma(entrada)
    case "datos":
      return tableroDatos(entrada)
    case "modelos":
      return tableroModelos(entrada)
    case "moderacion":
      return tableroModeracion(entrada)
    case "gobernanza":
      return tableroGobernanza(entrada)
    case "contenidos":
      return tableroContenidos(entrada)
    case "supervision":
      return tableroSupervision(entrada, muestra)
  }
}
