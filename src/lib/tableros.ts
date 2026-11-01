/**
 * Tableros por rol de la consola del personal (HU-30 ampliada).
 *
 * Cada rol tiene una pregunta que su tablero responde, indicadores con meta y
 * semáforo, gráficas propias y una lista de lo que debe atender hoy. Los valores
 * se calculan con el estado de la consola y la base de reportes del prototipo.
 */
import { equipoPorId, todosLosEquipos } from "../data/accessibility"
import {
  DIA,
  HORA,
  MIN,
  type Cuenta,
  type EstadoConsola,
  type ModuloId,
  type RolId,
} from "./admin"
import {
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
} from "./operacion"
import { confiabilidad, estadoComunitario, estadoEquipo, type BaseDatos } from "./reports"

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
  jefe_estacion: "¿Mi estación está accesible ahora y todo se revisó a tiempo?",
  personal_estacion: "¿Qué me toca revisar y atender ahora?",
  personal_seguridad: "¿A quién debo atender ahora?",
  moderacion: "¿La cola se atiende a tiempo y lo que pasa a validación es confiable?",
  mantenimiento: "¿Qué equipos reparo primero y cuánto tardamos?",
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
/* Mesa de atención y reportes                                         */
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
/* Operación en las estaciones                                         */
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

export function tableroDe(rol: RolId, entrada: EntradaTablero): Tablero {
  switch (rol) {
    case "moderacion":
      return tableroModeracion(entrada)
    case "jefe_estacion":
      return tableroJefeEstacion(entrada)
    case "personal_estacion":
      return tableroPersonalEstacion(entrada)
    case "mantenimiento":
      return tableroMantenimiento(entrada)
    case "personal_seguridad":
      return tableroPersonalSeguridad(entrada)
  }
}
