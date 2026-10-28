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
import { equipoPorId, todosLosEquipos } from "../data/accessibility"
import { allStations, metroLines } from "../data/metroData"
import {
  calidadHomologacion,
  diasHabiles,
  evaluarPublicacion,
  revisarTerminologia,
  DIA,
  F1_MINIMO,
  HORA,
  MIN,
  MARGEN,
  PLAZO_ARCO,
  REFERENCIA,
  SUSPENSION_POR_INACTIVIDAD,
  type Cuenta,
  type EstadoConsola,
  type ModuloId,
  type RolId,
} from "./admin"
import {
  cumplimientoPorResponsable,
  etiquetaSlot,
  mediana,
  mttrHoras,
  operacionDe,
  personaDeCuenta,
  personaPorId,
  recurrentes,
  reportesPorVerificar,
  rondasDelDia,
  rondasVencidas,
  saturacionProxima,
  ultimaObservacionPersonal,
  vencida,
  ESTACIONES_PILOTO,
  ESTADO_RONDA_LABEL,
  META_ASIGNACION,
  META_LLEGADA,
  RESULTADO_LABEL,
  SLOTS,
  TIPO_INCIDENTE_LABEL,
  type EstadoRonda,
  type Operacion,
  type TipoIncidente,
} from "./operacion"
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
      /** Textos de la simbología cuando la matriz no es de ejecuciones. */
      leyenda?: Partial<Record<EstadoCelda, string>>
      /** «extremos»: primera, media y última fecha; «todas»: una etiqueta por columna. */
      ejes?: "extremos" | "todas"
      demo?: boolean
    }
  | { tipo: "medidores"; id: string; titulo: string; descripcion: string; items: Array<{ etiqueta: string; valor: number; max: number; tono: Tono; texto: string }>; vacio: string }
  | { tipo: "partes"; id: string; titulo: string; descripcion: string; partes: Array<{ etiqueta: string; valor: number; tono: Tono }>; demo?: boolean }

/** La pregunta que responde el tablero de cada rol. */
export const PREGUNTAS: Record<RolId, string> = {
  operacion: "¿La infraestructura accesible funciona en toda la red y se revisa a tiempo?",
  jefe_estacion: "¿Mi estación está accesible ahora y todo se revisó a tiempo?",
  personal_estacion: "¿Qué me toca revisar y atender ahora?",
  mantenimiento: "¿Qué equipos reparo primero y cuánto tardamos?",
  jefe_seguridad: "¿Respondemos a tiempo y hay personal donde se necesita?",
  personal_seguridad: "¿A quién debo atender ahora?",
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
  const confirmados = todosLosEquipos.filter((eq) => estadoEquipo(db, eq.id, ahora).estado === "fuera_servicio").map((eq) => ({ id: eq.id, fuente: estadoEquipo(db, eq.id, ahora).fuente }))
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
      etiqueta: "Equipos fuera de servicio ahora",
      valor: String(confirmados.length),
      meta: "Seguimiento con mantenimiento del STC",
      tono: confirmados.length ? "warn" : "ok",
      nota: "Confirmados por el personal de la estación o por la comunidad (RN5)",
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
    return { texto: `${eq?.tipo ?? "Equipo"} de ${eq?.station ?? "estación"} fuera de servicio`, detalle: c.fuente, prioridad: "alta" as const }
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
/* Roles operativos del STC (después de la entrega)                    */
/* ------------------------------------------------------------------ */

const CELDA_RONDA: Record<EstadoRonda, EstadoCelda> = { hecha: "ok", tarde: "recuperada", atrasada: "falla", en_curso: "omitida", programada: "sin_programa" }
const LEYENDA_RONDA: Partial<Record<EstadoCelda, string>> = { ok: "Hecha a tiempo", recuperada: "Fuera de tiempo", falla: "Atrasada (no se registró)", omitida: "En curso", sin_programa: "Programada" }
const minutos = (ms: number) => Math.round(ms / MIN)
const dur = (ms: number) => (ms < HORA ? `${Math.max(0, Math.round(ms / MIN))} min` : `${(ms / HORA).toFixed(1)} h`)
const estacionDe = (c: Cuenta) => c.estaciones?.[0] ?? ESTACIONES_PILOTO[0]
const medianoche = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function semanaDeRondas(op: Operacion, station: string, ahora: number, soloPersona?: string) {
  const dias = ultimosDias(ahora, 7)
  return {
    columnas: SLOTS.map((s) => etiquetaSlot(s, new Date(ahora)).replace(" · apertura", " (apertura)")),
    filas: dias.map((d) => ({
      etiqueta: mismoDia(d, new Date(ahora)) ? "Hoy" : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" }),
      celdas: rondasDelDia(op, station, d.getTime(), ahora).map((r) => {
        const mia = !soloPersona || r.responsable?.id === soloPersona || r.registro?.porId === soloPersona
        if (!mia) return { estado: "sin_programa" as EstadoCelda, detalle: `Le toca a ${r.responsable?.nombre ?? "—"}` }
        const quien = r.registro ? `${r.registro.porNombre} a las ${new Date(r.registro.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}` : `Responsable: ${r.responsable?.nombre ?? "sin asignar"}`
        return { estado: CELDA_RONDA[r.estado], detalle: `${ESTADO_RONDA_LABEL[r.estado]} · ${quien}` }
      }),
    })),
  }
}

function equiposConEstado(db: BaseDatos, station: string | null, ahora: number) {
  const lista = station ? todosLosEquipos.filter((e) => e.station === station) : todosLosEquipos
  return lista.map((eq) => ({ eq, ...estadoEquipo(db, eq.id, ahora) }))
}

function tableroOperacion({ estado, db, ahora }: EntradaTablero): Tablero {
  const op = operacionDe(db)
  const equipos = equiposConEstado(db, null, ahora)
  const disponibles = equipos.filter((x) => x.estado === "disponible").length
  const fuera = equipos.filter((x) => x.estado === "fuera_servicio")
  const inciertos = equipos.filter((x) => x.estado === "incierto").length
  const hoy = ESTACIONES_PILOTO.flatMap((s) => rondasDelDia(op, s, ahora, ahora))
  const vencidasHoy = hoy.filter((r) => r.estado === "hecha" || r.estado === "tarde" || r.estado === "atrasada")
  const aTiempoHoy = vencidasHoy.filter((r) => r.estado === "hecha").length
  const atrasadas = hoy.filter((r) => r.estado === "atrasada")
  const semana = rondasVencidas(op, ESTACIONES_PILOTO, 7, ahora)
  const aTiempoSemana = semana.filter((r) => r.estado === "hecha").length
  const abiertas = op.ordenes.filter((o) => o.estado !== "resuelta")
  const fueraPlazo = abiertas.filter((o) => vencida(o, ahora))
  const mttr = mttrHoras(op, 30, ahora)
  const rec = recurrentes(op, 30, ahora)
  const porVerificar = reportesPorVerificar(db, null, ahora)
  void estado

  const lineas = metroLines.map((l) => {
    const eqs = equipos.filter((x) => l.stations.includes(x.eq.station))
    const ok = eqs.filter((x) => x.estado === "disponible").length
    return { linea: l.id, total: eqs.length, ok }
  }).filter((l) => l.total > 0)

  const resp = cumplimientoPorResponsable(op, ESTACIONES_PILOTO, 7, ahora)

  const indicadores: Indicador[] = [
    {
      id: "funcionando",
      etiqueta: "Equipos funcionando en la red",
      valor: pct(disponibles / Math.max(equipos.length, 1)),
      meta: "≥ 95 % (propuesta)",
      tono: disponibles / equipos.length >= 0.95 ? "ok" : disponibles / equipos.length >= 0.9 ? "warn" : "bad",
      nota: `${fuera.length} fuera de servicio · ${inciertos} con fallas o sin confirmar, de ${equipos.length}`,
    },
    {
      id: "rondas-hoy",
      etiqueta: "Rondas a tiempo hoy",
      valor: `${aTiempoHoy} de ${vencidasHoy.length}`,
      meta: "Todas a tiempo (RN10)",
      tono: atrasadas.length ? "bad" : aTiempoHoy === vencidasHoy.length ? "ok" : "warn",
      nota: atrasadas.length ? `Atrasada: ${atrasadas.map((r) => `${r.station} ${r.slot === "apertura" ? "apertura" : r.slot}`).join(", ")}` : `En las ${ESTACIONES_PILOTO.length} estaciones del piloto`,
    },
    {
      id: "rondas-semana",
      etiqueta: "Rondas a tiempo (7 días)",
      valor: pct(aTiempoSemana / Math.max(semana.length, 1)),
      meta: "≥ 95 % (propuesta)",
      tono: aTiempoSemana / Math.max(semana.length, 1) >= 0.95 ? "ok" : "warn",
      nota: `${semana.length - aTiempoSemana} fuera de tiempo u omitidas de ${semana.length}`,
    },
    {
      id: "ordenes",
      etiqueta: "Órdenes de mantenimiento abiertas",
      valor: String(abiertas.length),
      meta: "Alta ≤ 24 h, media ≤ 72 h (propuesta)",
      tono: fueraPlazo.length ? "bad" : abiertas.length ? "warn" : "ok",
      nota: `${abiertas.filter((o) => o.prioridad === "alta").length} de prioridad alta · ${fueraPlazo.length} fuera de plazo`,
    },
    {
      id: "mttr",
      etiqueta: "Tiempo medio de reparación (30 días)",
      valor: mttr === null ? "—" : `${mttr.toFixed(1)} h`,
      meta: "≤ 24 h (propuesta)",
      tono: mttr === null ? "neutral" : mttr <= 24 ? "ok" : "warn",
      nota: "Desde que se detecta hasta que mantenimiento cierra la orden",
    },
    {
      id: "recurrentes",
      etiqueta: "Equipos con fallas recurrentes",
      valor: String(rec.length),
      meta: "3 o más órdenes en 30 días: revisar la causa",
      tono: rec.length ? "warn" : "ok",
      nota: rec.length ? rec.map((x) => `${equipoPorId(x.equipmentId)?.tipo} de ${equipoPorId(x.equipmentId)?.station} (${x.n})`).join(" · ") : "Ninguno",
    },
    {
      id: "por-verificar",
      etiqueta: "Reportes ciudadanos sin verificar",
      valor: String(porVerificar.length),
      meta: "Verificar en sitio en ≤ 2 h (propuesta)",
      tono: porVerificar.some((p) => ahora - p.desde > 2 * HORA) ? "bad" : porVerificar.length ? "warn" : "ok",
      nota: porVerificar.length ? porVerificar.map((p) => `${equipoPorId(p.equipmentId)?.tipo} de ${p.station}`).join(" · ") : "Todos revisados por el personal",
    },
  ]

  const acciones: Accion[] = []
  for (const r of atrasadas) acciones.push({ texto: `Ronda atrasada en ${r.station} (${r.slot === "apertura" ? "apertura" : r.slot}), responsable: ${r.responsable?.nombre ?? "sin asignar"}`, detalle: "Avisa al jefe de estación o reasígnala.", prioridad: "alta", modulo: "rondas" })
  for (const o of fueraPlazo) acciones.push({ texto: `Orden ${o.id} fuera de plazo: ${equipoPorId(o.equipmentId)?.tipo} de ${o.station}`, prioridad: "alta", modulo: "mantenimiento" })
  for (const p of porVerificar.filter((x) => ahora - x.desde > 2 * HORA)) acciones.push({ texto: `Pedir a ${p.station} que verifique el ${equipoPorId(p.equipmentId)?.tipo.toLowerCase()} reportado hace ${dur(ahora - p.desde)}`, prioridad: "media", modulo: "infraestructura" })
  for (const x of rec) acciones.push({ texto: `Revisar con mantenimiento la causa de las fallas del ${equipoPorId(x.equipmentId)?.tipo.toLowerCase()} de ${equipoPorId(x.equipmentId)?.station}`, prioridad: "media", modulo: "mantenimiento" })

  return {
    rol: "operacion",
    pregunta: PREGUNTAS.operacion,
    indicadores,
    graficas: [
      {
        tipo: "matriz",
        id: "rondas-hoy",
        titulo: "Rondas de revisión de hoy",
        descripcion: "Cinco rondas por estación: antes de abrir y cada cuatro horas. Pasa el puntero para ver quién la dio.",
        columnas: SLOTS.map((s) => etiquetaSlot(s, new Date(ahora)).replace(" · apertura", "")),
        ejes: "todas",
        leyenda: LEYENDA_RONDA,
        filas: ESTACIONES_PILOTO.map((s) => ({ etiqueta: s, celdas: rondasDelDia(op, s, ahora, ahora).map((r) => ({ estado: CELDA_RONDA[r.estado], detalle: `${ESTADO_RONDA_LABEL[r.estado]} · ${r.registro ? r.registro.porNombre : `responsable: ${r.responsable?.nombre ?? "—"}`}` })) })),
      },
      {
        tipo: "barras",
        id: "disponibilidad-lineas",
        titulo: "Equipos funcionando por línea",
        descripcion: "Elevadores, salvaescaleras y escaleras eléctricas de las estaciones de cada línea (un transbordo cuenta en todas sus líneas).",
        unidad: "%",
        max: 100,
        meta: { valor: 95, etiqueta: "Meta 95 %" },
        barras: lineas.map((l) => ({ etiqueta: `Línea ${l.linea}`, valor: (l.ok / l.total) * 100, texto: `${Math.round((l.ok / l.total) * 100)} % (${l.ok}/${l.total})`, marca: l.ok / l.total < 0.95 ? "bajo la meta" : undefined })),
      },
      {
        tipo: "barras",
        id: "cumplimiento-responsables",
        titulo: "Quién da las rondas: cumplimiento a tiempo (7 días)",
        descripcion: "Por persona responsable. Las rondas que no se registraron cuentan como no cumplidas.",
        unidad: "%",
        max: 100,
        meta: { valor: 95, etiqueta: "95 %" },
        barras: resp.map((f) => ({ etiqueta: `${f.persona.nombre} · ${f.persona.puesto === "Jefe(a) de estación" ? "Jefe(a)" : "Personal"} · ${f.persona.station}`, valor: (f.aTiempo / f.programadas) * 100, texto: `${Math.round((f.aTiempo / f.programadas) * 100)} % (${f.aTiempo}/${f.programadas})`, marca: f.omitidas ? `${f.omitidas} sin registrar` : undefined })),
      },
    ],
    acciones,
  }
}

function tableroJefeEstacion({ db, ahora, cuenta }: EntradaTablero): Tablero {
  const op = operacionDe(db)
  const station = estacionDe(cuenta)
  const equipos = equiposConEstado(db, station, ahora)
  const ok = equipos.filter((x) => x.estado === "disponible").length
  const conFalla = equipos.filter((x) => x.estado !== "disponible")
  const hoy = rondasDelDia(op, station, ahora, ahora)
  const hechas = hoy.filter((r) => r.estado === "hecha" || r.estado === "tarde").length
  const atrasadas = hoy.filter((r) => r.estado === "atrasada")
  const siguiente = hoy.find((r) => r.estado === "en_curso" || r.estado === "programada")
  const porVerificar = reportesPorVerificar(db, [station], ahora)
  const incid = op.incidentes.filter((x) => x.station === station)
  const sinAsignar = incid.filter((x) => x.estado === "abierta")
  const enCurso = incid.filter((x) => x.estado === "asignada" || x.estado === "en_camino")
  const ordenes = op.ordenes.filter((o) => o.station === station && o.estado !== "resuelta")
  const masAntigua = sinAsignar.reduce((m, x) => Math.min(m, x.ts), Infinity)

  const indicadores: Indicador[] = [
    {
      id: "equipos",
      etiqueta: "Equipos funcionando en la estación",
      valor: `${ok} de ${equipos.length}`,
      meta: "Todos funcionando",
      tono: conFalla.some((x) => x.estado === "fuera_servicio") ? "bad" : conFalla.length ? "warn" : "ok",
      nota: conFalla.length ? conFalla.map((x) => `${x.eq.tipo} (${x.eq.ubicacion.toLowerCase()})`).join(" · ") : "Sin fallas conocidas",
    },
    {
      id: "rondas",
      etiqueta: "Rondas de hoy",
      valor: `${hechas} de ${SLOTS.length}`,
      meta: "Cada una dentro de 45 min de su hora (RN10)",
      tono: atrasadas.length ? "bad" : "ok",
      nota: atrasadas.length ? `Atrasada: ${atrasadas.map((r) => r.hora).join(", ")}` : siguiente ? `Siguiente: ${siguiente.hora} · ${siguiente.responsable?.nombre ?? "sin responsable"}` : "Todas las rondas del día registradas",
    },
    {
      id: "por-verificar",
      etiqueta: "Reportes ciudadanos por verificar",
      valor: String(porVerificar.length),
      meta: "Verificar en sitio en ≤ 2 h (propuesta)",
      tono: porVerificar.some((p) => ahora - p.desde > 2 * HORA) ? "bad" : porVerificar.length ? "warn" : "ok",
      nota: porVerificar.length ? porVerificar.map((p) => `${equipoPorId(p.equipmentId)?.tipo}: ${p.reportes.length} reportes`).join(" · ") : "Nada pendiente",
    },
    {
      id: "apoyos",
      etiqueta: "Solicitudes de apoyo sin asignar",
      valor: String(sinAsignar.length),
      meta: "Asignar en ≤ 5 min (propuesta)",
      tono: !sinAsignar.length ? "ok" : ahora - masAntigua > META_ASIGNACION ? "bad" : "warn",
      nota: sinAsignar.length ? `La más antigua espera desde hace ${dur(ahora - masAntigua)}` : "Ninguna esperando",
    },
    {
      id: "en-curso",
      etiqueta: "Apoyos e incidentes en curso",
      valor: String(enCurso.length),
      meta: "Llegar en ≤ 15 min (propuesta)",
      tono: enCurso.some((x) => ahora - x.ts > META_LLEGADA) ? "warn" : "neutral",
      nota: enCurso.length ? enCurso.map((x) => `${x.id}: ${personaPorId(op, x.asignadoA)?.nombre ?? "—"}`).join(" · ") : "Ninguno",
    },
    {
      id: "ordenes",
      etiqueta: "Órdenes de mantenimiento abiertas",
      valor: String(ordenes.length),
      meta: "Seguimiento hasta la reparación",
      tono: ordenes.some((o) => vencida(o, ahora)) ? "bad" : ordenes.length ? "warn" : "ok",
      nota: ordenes.length ? ordenes.map((o) => `${o.id} ${o.estado === "en_atencion" ? "en atención" : "sin tomar"}`).join(" · ") : "Ninguna",
    },
  ]

  const acciones: Accion[] = []
  for (const x of sinAsignar) acciones.push({ texto: `Asignar ${x.id}: ${TIPO_INCIDENTE_LABEL[x.tipo].toLowerCase()} en ${x.punto.toLowerCase()}`, detalle: x.detalle || undefined, prioridad: "alta", modulo: "estacion" })
  for (const p of porVerificar) acciones.push({ texto: `Verificar el ${equipoPorId(p.equipmentId)?.tipo.toLowerCase()} (${equipoPorId(p.equipmentId)?.ubicacion.toLowerCase()}): ${p.reportes.length} reportes desde hace ${dur(ahora - p.desde)}`, prioridad: ahora - p.desde > 2 * HORA ? "alta" : "media", modulo: "estacion" })
  for (const r of atrasadas) acciones.push({ texto: `Cubrir la ronda atrasada de las ${r.hora} (le tocaba a ${r.responsable?.nombre ?? "—"})`, prioridad: "alta", modulo: "rondas" })
  if (siguiente && siguiente.responsable?.cuentaId === cuenta.id) acciones.push({ texto: `Te toca la ronda de las ${siguiente.hora}`, prioridad: siguiente.estado === "en_curso" ? "alta" : "media", modulo: "rondas" })

  const semana = semanaDeRondas(op, station, ahora)
  return {
    rol: "jefe_estacion",
    pregunta: PREGUNTAS.jefe_estacion,
    indicadores,
    graficas: [
      { tipo: "matriz", id: "rondas-semana", titulo: `Rondas de ${station} en la última semana`, descripcion: "Una fila por día y una columna por ronda. Pasa el puntero para ver quién la dio y a qué hora.", columnas: semana.columnas, ejes: "todas", leyenda: LEYENDA_RONDA, filas: semana.filas },
      {
        tipo: "barras",
        id: "equipos-estacion",
        titulo: "Tiempo desde la última revisión de cada equipo",
        descripcion: "Horas desde la última ronda, verificación u orden. Con más de 12 h, lo que vio el personal deja de contar para las rutas.",
        unidad: "horas",
        max: 14,
        meta: { valor: 12, etiqueta: "12 h" },
        barras: equipos.map((x) => {
          const h = (ahora - ultimaObservacionPersonal(op, x.eq.id)) / HORA
          return { etiqueta: `${x.eq.tipo} · ${x.eq.ubicacion.replace("Acceso de calle a andén", "acceso").replace("Transbordo ", "")}`, valor: Math.min(h, 14), texto: h > 48 ? "sin revisión" : `${h.toFixed(1)} h`, marca: x.estado === "fuera_servicio" ? "fuera de servicio" : x.estado === "incierto" ? "con fallas" : undefined }
        }),
      },
    ],
    acciones,
  }
}

function tableroPersonalEstacion({ db, ahora, cuenta }: EntradaTablero): Tablero {
  const op = operacionDe(db)
  const station = estacionDe(cuenta)
  const yo = personaDeCuenta(op, cuenta)
  const hoy = rondasDelDia(op, station, ahora, ahora)
  const mias = hoy.filter((r) => r.responsable?.id === yo.id)
  const siguiente = mias.find((r) => r.estado === "en_curso" || r.estado === "programada")
  const atrasada = mias.find((r) => r.estado === "atrasada")
  const porVerificar = reportesPorVerificar(db, [station], ahora)
  const asignados = op.incidentes.filter((x) => x.asignadoA === yo.id && (x.estado === "asignada" || x.estado === "en_camino"))
  const semana = rondasVencidas(op, [station], 7, ahora).filter((r) => r.responsable?.id === yo.id)
  const aTiempo = semana.filter((r) => r.estado === "hecha").length
  const equipos = equiposConEstado(db, station, ahora)
  const conFalla = equipos.filter((x) => x.estado !== "disponible")

  const indicadores: Indicador[] = [
    {
      id: "siguiente",
      etiqueta: "Tu siguiente ronda",
      valor: siguiente ? siguiente.hora.replace(" · apertura", "") : "—",
      meta: "Registrar dentro de 45 min de su hora (RN10)",
      tono: atrasada ? "bad" : siguiente?.estado === "en_curso" ? "warn" : "ok",
      nota: atrasada ? `Tienes atrasada la de las ${atrasada.hora}` : siguiente ? (siguiente.estado === "en_curso" ? "Es ahora: regístrala" : `Faltan ${dur(siguiente.ts - ahora)}`) : "No tienes más rondas hoy",
    },
    {
      id: "mis-rondas",
      etiqueta: "Tus rondas de hoy",
      valor: `${mias.filter((r) => r.registro).length} de ${mias.length}`,
      meta: "Todas las que tienes asignadas",
      tono: atrasada ? "bad" : "ok",
      nota: mias.map((r) => r.hora.replace(" · apertura", "")).join(" · ") || "Sin rondas asignadas",
    },
    {
      id: "por-verificar",
      etiqueta: "Reportes por verificar en tu estación",
      valor: String(porVerificar.length),
      meta: "Verificar en sitio en ≤ 2 h (propuesta)",
      tono: porVerificar.some((p) => ahora - p.desde > 2 * HORA) ? "bad" : porVerificar.length ? "warn" : "ok",
      nota: porVerificar.length ? porVerificar.map((p) => equipoPorId(p.equipmentId)?.tipo).join(" · ") : "Nada pendiente",
    },
    {
      id: "asignados",
      etiqueta: "Apoyos asignados a ti",
      valor: String(asignados.length),
      meta: "Llegar en ≤ 15 min (propuesta)",
      tono: asignados.some((x) => ahora - x.ts > META_LLEGADA) ? "bad" : asignados.length ? "warn" : "ok",
      nota: asignados.length ? asignados.map((x) => `${x.id} · ${x.punto}`).join(" · ") : "Ninguno",
    },
    {
      id: "a-tiempo",
      etiqueta: "Tus rondas a tiempo (7 días)",
      valor: semana.length ? pct(aTiempo / semana.length, 0) : "—",
      meta: "≥ 95 % (propuesta)",
      tono: !semana.length ? "neutral" : aTiempo / semana.length >= 0.95 ? "ok" : "warn",
      nota: `${aTiempo} de ${semana.length}`,
    },
    {
      id: "fallas",
      etiqueta: "Equipos con falla en tu estación",
      valor: String(conFalla.length),
      meta: "Confirmarlos en cada ronda",
      tono: conFalla.length ? "warn" : "ok",
      nota: conFalla.length ? conFalla.map((x) => `${x.eq.tipo} (${x.eq.ubicacion.toLowerCase()})`).join(" · ") : "Todos funcionan",
    },
  ]

  const acciones: Accion[] = []
  for (const x of asignados) acciones.push({ texto: `Atender ${x.id} en ${x.punto.toLowerCase()}: ${TIPO_INCIDENTE_LABEL[x.tipo].toLowerCase()}`, detalle: x.detalle || undefined, prioridad: "alta", modulo: "estacion" })
  if (atrasada) acciones.push({ texto: `Registrar la ronda atrasada de las ${atrasada.hora}`, prioridad: "alta", modulo: "rondas" })
  if (siguiente?.estado === "en_curso") acciones.push({ texto: `Dar la ronda de las ${siguiente.hora}`, prioridad: "alta", modulo: "rondas" })
  for (const p of porVerificar) acciones.push({ texto: `Verificar en sitio el ${equipoPorId(p.equipmentId)?.tipo.toLowerCase()} (${equipoPorId(p.equipmentId)?.ubicacion.toLowerCase()})`, detalle: `${p.reportes.length} reportes de personas usuarias`, prioridad: "alta", modulo: "estacion" })

  const sem = semanaDeRondas(op, station, ahora, yo.id)
  return {
    rol: "personal_estacion",
    pregunta: PREGUNTAS.personal_estacion,
    indicadores,
    graficas: [{ tipo: "matriz", id: "mis-rondas", titulo: "Tus rondas de la última semana", descripcion: "Solo se colorean las que te tocaban.", columnas: sem.columnas, ejes: "todas", leyenda: { ...LEYENDA_RONDA, sin_programa: "Programada o no te toca" }, filas: sem.filas }],
    acciones,
  }
}

function tableroMantenimiento({ db, ahora }: EntradaTablero): Tablero {
  const op = operacionDe(db)
  const abiertas = op.ordenes.filter((o) => o.estado !== "resuelta").sort((a, b) => (a.prioridad === b.prioridad ? a.creada - b.creada : a.prioridad === "alta" ? -1 : 1))
  const fueraPlazo = abiertas.filter((o) => vencida(o, ahora))
  const sinTomar = abiertas.filter((o) => o.estado === "abierta")
  const mttr = mttrHoras(op, 30, ahora)
  const resueltas30 = op.ordenes.filter((o) => o.resuelta && ahora - o.resuelta <= 30 * DIA)
  const enPlazo = resueltas30.filter((o) => !vencida(o, ahora)).length
  const rec = recurrentes(op, 30, ahora)
  const tipos = new Map<string, number>()
  for (const o of op.ordenes.filter((x) => ahora - x.creada <= 30 * DIA)) {
    const t = equipoPorId(o.equipmentId)?.tipo ?? "Otro"
    tipos.set(t, (tipos.get(t) ?? 0) + 1)
  }

  const indicadores: Indicador[] = [
    { id: "abiertas", etiqueta: "Órdenes abiertas", valor: String(abiertas.length), meta: "Atender primero la prioridad alta", tono: abiertas.length ? "warn" : "ok", nota: `${abiertas.filter((o) => o.prioridad === "alta").length} de prioridad alta (elevadores y salvaescaleras)` },
    { id: "fuera-plazo", etiqueta: "Órdenes fuera de plazo", valor: String(fueraPlazo.length), meta: "0 · alta ≤ 24 h, media ≤ 72 h (propuesta)", tono: fueraPlazo.length ? "bad" : "ok", nota: fueraPlazo.map((o) => o.id).join(", ") || "Todas dentro de plazo" },
    { id: "sin-tomar", etiqueta: "Órdenes sin tomar", valor: String(sinTomar.length), meta: "Tomar en ≤ 2 h (propuesta)", tono: sinTomar.some((o) => ahora - o.creada > 2 * HORA) ? "bad" : sinTomar.length ? "warn" : "ok", nota: sinTomar.map((o) => `${o.id} (${dur(ahora - o.creada)})`).join(" · ") || "Ninguna" },
    { id: "mttr", etiqueta: "Tiempo medio de reparación (30 días)", valor: mttr === null ? "—" : `${mttr.toFixed(1)} h`, meta: "≤ 24 h (propuesta)", tono: mttr === null ? "neutral" : mttr <= 24 ? "ok" : "warn", nota: `${resueltas30.length} órdenes cerradas` },
    { id: "en-plazo", etiqueta: "Reparadas dentro de plazo (30 días)", valor: resueltas30.length ? pct(enPlazo / resueltas30.length, 0) : "—", meta: "≥ 90 % (propuesta)", tono: !resueltas30.length ? "neutral" : enPlazo / resueltas30.length >= 0.9 ? "ok" : "warn", nota: `${enPlazo} de ${resueltas30.length}` },
    { id: "recurrentes", etiqueta: "Equipos con fallas recurrentes", valor: String(rec.length), meta: "3 o más órdenes en 30 días: análisis de causa", tono: rec.length ? "warn" : "ok", nota: rec.map((x) => `${equipoPorId(x.equipmentId)?.tipo} de ${equipoPorId(x.equipmentId)?.station} (${x.n})`).join(" · ") || "Ninguno" },
  ]

  const acciones: Accion[] = abiertas.map((o) => {
    const eq = equipoPorId(o.equipmentId)
    return {
      texto: `${o.estado === "abierta" ? "Tomar" : "Cerrar"} ${o.id}: ${eq?.tipo} de ${o.station} (${eq?.ubicacion.toLowerCase()})`,
      detalle: `${o.prioridad === "alta" ? "Prioridad alta" : "Prioridad media"} · ${RESULTADO_LABEL[o.gravedad].toLowerCase()} · abierta hace ${dur(ahora - o.creada)}`,
      prioridad: o.prioridad,
      modulo: "mantenimiento" as const,
    }
  })

  return {
    rol: "mantenimiento",
    pregunta: PREGUNTAS.mantenimiento,
    indicadores,
    graficas: [
      {
        tipo: "barras",
        id: "antiguedad",
        titulo: "Antigüedad de las órdenes abiertas",
        descripcion: "La línea marca el plazo de 24 h de la prioridad alta.",
        unidad: "horas",
        max: Math.max(28, ...abiertas.map((o) => ((ahora - o.creada) / HORA) * 1.15)),
        meta: { valor: 24, etiqueta: "24 h" },
        barras: abiertas.map((o) => ({ etiqueta: `${o.id} · ${equipoPorId(o.equipmentId)?.tipo} · ${o.station}`, valor: (ahora - o.creada) / HORA, texto: dur(ahora - o.creada), marca: vencida(o, ahora) ? "fuera de plazo" : o.prioridad === "alta" ? "prioridad alta" : undefined })),
      },
      {
        tipo: "barras",
        id: "por-tipo",
        titulo: "Órdenes por tipo de equipo (30 días)",
        descripcion: "Abiertas y cerradas.",
        unidad: "órdenes",
        max: Math.max(4, ...[...tipos.values()].map((v) => v * 1.2)),
        barras: [...tipos.entries()].sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ etiqueta: t, valor: v, texto: plural(v, "orden", "órdenes") })),
      },
    ],
    acciones,
  }
}

function tableroJefeSeguridad({ db, ahora }: EntradaTablero): Tablero {
  const op = operacionDe(db)
  const abiertos = op.incidentes.filter((x) => x.estado !== "atendida" && x.estado !== "cancelada")
  const sinAsignar = abiertos.filter((x) => x.estado === "abierta")
  const semana = op.incidentes.filter((x) => ahora - x.ts <= 7 * DIA && x.estado !== "cancelada")
  const tAsignar = mediana(semana.filter((x) => x.asignada).map((x) => x.asignada! - x.ts))
  const tAtender = mediana(semana.filter((x) => x.atendida).map((x) => x.atendida! - x.ts))
  const atrapadas = op.incidentes.filter((x) => x.tipo === "persona_atrapada" && ahora - x.ts <= 30 * DIA).length
  const sat = saturacionProxima(ahora)
  const altas = sat.filter((s) => s.nivel === "alta")
  const porTipo = new Map<TipoIncidente, number>()
  for (const x of semana) porTipo.set(x.tipo, (porTipo.get(x.tipo) ?? 0) + 1)

  const indicadores: Indicador[] = [
    { id: "abiertos", etiqueta: "Incidentes y apoyos abiertos", valor: String(abiertos.length), meta: "Cerrar cada uno con su atención", tono: abiertos.length ? "warn" : "ok", nota: abiertos.map((x) => `${x.id} ${x.station}`).join(" · ") || "Ninguno" },
    { id: "sin-asignar", etiqueta: "Sin asignar", valor: String(sinAsignar.length), meta: "Asignar en ≤ 5 min (propuesta)", tono: sinAsignar.some((x) => ahora - x.ts > META_ASIGNACION) ? "bad" : sinAsignar.length ? "warn" : "ok", nota: sinAsignar.map((x) => `${x.id} espera ${dur(ahora - x.ts)}`).join(" · ") || "Todos asignados" },
    { id: "t-asignar", etiqueta: "Tiempo para asignar (mediana, 7 días)", valor: tAsignar === null ? "—" : `${minutos(tAsignar)} min`, meta: "≤ 5 min (propuesta)", tono: tAsignar === null ? "neutral" : tAsignar <= META_ASIGNACION ? "ok" : "warn", nota: `${semana.length} casos en la semana` },
    { id: "t-atender", etiqueta: "Tiempo hasta atender (mediana, 7 días)", valor: tAtender === null ? "—" : `${minutos(tAtender)} min`, meta: "≤ 15 min (propuesta)", tono: tAtender === null ? "neutral" : tAtender <= META_LLEGADA ? "ok" : "warn", nota: "Desde la solicitud hasta que se cierra" },
    { id: "atrapadas", etiqueta: "Personas atrapadas en elevador (30 días)", valor: String(atrapadas), meta: "0; cada caso se revisa con mantenimiento", tono: atrapadas ? "warn" : "ok" },
    { id: "saturacion", etiqueta: "Estaciones con saturación alta en la próxima hora", valor: String(altas.length), meta: "Reforzar personal de apoyo donde sea alta", tono: altas.length ? "warn" : "ok", nota: altas.map((s) => s.station).join(" · ") || "Ninguna de las estaciones del piloto" },
  ]

  const acciones: Accion[] = []
  for (const x of sinAsignar) acciones.push({ texto: `Asignar ${x.id} en ${x.station} (${x.punto.toLowerCase()})`, detalle: `${TIPO_INCIDENTE_LABEL[x.tipo]} · espera desde hace ${dur(ahora - x.ts)}`, prioridad: "alta", modulo: "seguridad" })
  for (const x of abiertos.filter((y) => y.estado !== "abierta" && ahora - y.ts > META_LLEGADA)) acciones.push({ texto: `Dar seguimiento a ${x.id} en ${x.station}: lleva ${dur(ahora - x.ts)} sin cerrarse`, prioridad: "media", modulo: "seguridad" })
  for (const s of altas) acciones.push({ texto: `Reforzar personal en ${s.station}: saturación alta en la próxima hora`, prioridad: "media", modulo: "seguridad" })

  return {
    rol: "jefe_seguridad",
    pregunta: PREGUNTAS.jefe_seguridad,
    indicadores,
    graficas: [
      { tipo: "barras", id: "por-tipo", titulo: "Incidentes y apoyos por tipo (7 días)", descripcion: "Incluye las solicitudes de apoyo que hacen las personas usuarias desde la app.", unidad: "casos", max: Math.max(4, ...[...porTipo.values()].map((v) => v * 1.2)), barras: [...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ etiqueta: TIPO_INCIDENTE_LABEL[t], valor: v, texto: plural(v, "caso", "casos") })) },
      { tipo: "barras", id: "saturacion", titulo: "Afluencia esperada en la próxima hora", descripcion: "Personas por franja de 30 minutos en las estaciones del piloto, según el perfil horario.", unidad: "personas", max: Math.max(...sat.map((s) => s.afluencia)) * 1.15, barras: sat.map((s) => ({ etiqueta: s.station, valor: s.afluencia, texto: num(s.afluencia), marca: s.nivel === "alta" ? "saturación alta" : undefined })), demo: true },
    ],
    acciones,
  }
}

function tableroPersonalSeguridad({ db, ahora, cuenta }: EntradaTablero): Tablero {
  const op = operacionDe(db)
  const station = estacionDe(cuenta)
  const yo = personaDeCuenta(op, cuenta)
  const activos = op.incidentes.filter((x) => x.asignadoA === yo.id && (x.estado === "asignada" || x.estado === "en_camino")).sort((a, b) => a.ts - b.ts)
  const hoy0 = medianoche(ahora)
  const atendidosHoy = op.incidentes.filter((x) => x.asignadoA === yo.id && x.atendida && x.atendida >= hoy0 && x.estado === "atendida").length
  const mios7 = op.incidentes.filter((x) => x.asignadoA === yo.id && x.atendida && ahora - x.ts <= 7 * DIA)
  const tMio = mediana(mios7.map((x) => x.atendida! - x.ts))
  const sinAsignar = op.incidentes.filter((x) => x.station === station && x.estado === "abierta").length
  const sat = saturacionProxima(ahora, [station])[0]
  const dias = ultimosDias(ahora, 7)

  const indicadores: Indicador[] = [
    { id: "activos", etiqueta: "Asignaciones activas", valor: String(activos.length), meta: "Llegar en ≤ 15 min (propuesta)", tono: activos.some((x) => ahora - x.ts > META_LLEGADA) ? "bad" : activos.length ? "warn" : "ok", nota: activos.map((x) => `${x.id} · ${x.punto}`).join(" · ") || "Ninguna" },
    { id: "antigua", etiqueta: "La más antigua", valor: activos.length ? dur(ahora - activos[0].ts) : "—", meta: "≤ 15 min (propuesta)", tono: !activos.length ? "ok" : ahora - activos[0].ts > META_LLEGADA ? "bad" : "warn", nota: activos.length ? TIPO_INCIDENTE_LABEL[activos[0].tipo] : "Sin pendientes" },
    { id: "hoy", etiqueta: "Atendidas hoy", valor: String(atendidosHoy), meta: "Referencia del turno", tono: "neutral" },
    { id: "t-mio", etiqueta: "Tu tiempo hasta atender (mediana, 7 días)", valor: tMio === null ? "—" : `${minutos(tMio)} min`, meta: "≤ 15 min (propuesta)", tono: tMio === null ? "neutral" : tMio <= META_LLEGADA ? "ok" : "warn", nota: `${mios7.length} atenciones en la semana` },
    { id: "sin-asignar", etiqueta: `Sin asignar en ${station}`, valor: String(sinAsignar), meta: "Las asigna el jefe de estación o de seguridad", tono: sinAsignar ? "warn" : "ok" },
    { id: "saturacion", etiqueta: "Saturación en la próxima hora", valor: sat.nivel === "alta" ? "Alta" : sat.nivel === "media" ? "Media" : "Baja", meta: "Con saturación alta, acompañar en andenes y transbordos", tono: sat.nivel === "alta" ? "warn" : "ok", nota: `${num(sat.afluencia)} personas por franja de 30 min`, demo: true },
  ]
  const acciones: Accion[] = activos.map((x) => ({ texto: `${x.estado === "en_camino" ? "Cerrar" : "Ir a"} ${x.id}: ${x.punto}`, detalle: `${TIPO_INCIDENTE_LABEL[x.tipo]}${x.detalle ? ` · ${x.detalle}` : ""}`, prioridad: "alta" as const, modulo: "seguridad" as const }))

  return {
    rol: "personal_seguridad",
    pregunta: PREGUNTAS.personal_seguridad,
    indicadores,
    graficas: [
      {
        tipo: "columnas",
        id: "atenciones",
        titulo: "Tus atenciones de los últimos 7 días",
        descripcion: "Incidentes y apoyos que cerraste cada día.",
        unidad: "atenciones",
        max: Math.max(3, ...dias.map((d) => op.incidentes.filter((x) => x.asignadoA === yo.id && x.atendida && mismoDia(new Date(x.atendida), d)).length * 1.2)),
        columnas: dias.map((d) => {
          const n = op.incidentes.filter((x) => x.asignadoA === yo.id && x.atendida && x.estado === "atendida" && mismoDia(new Date(x.atendida), d)).length
          return { etiqueta: diaCorto(d), valor: n, texto: plural(n, "atención", "atenciones") }
        }),
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
    case "operacion":
      return tableroOperacion(entrada)
    case "jefe_estacion":
      return tableroJefeEstacion(entrada)
    case "personal_estacion":
      return tableroPersonalEstacion(entrada)
    case "mantenimiento":
      return tableroMantenimiento(entrada)
    case "jefe_seguridad":
      return tableroJefeSeguridad(entrada)
    case "personal_seguridad":
      return tableroPersonalSeguridad(entrada)
  }
}
