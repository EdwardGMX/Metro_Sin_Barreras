/**
 * Operación en las estaciones después de la entrega (HU-31 a HU-37).
 *
 * - Rondas de revisión a distintas horas del día, con la persona responsable de cada una.
 * - Verificación en sitio de los reportes ciudadanos por el personal de la estación.
 * - Órdenes de mantenimiento con prioridad y plazo.
 * - Incidentes y solicitudes de apoyo de las personas usuarias, asignados a una persona.
 *
 * En producción estas colecciones viven en Firestore detrás de la API de la consola;
 * en el prototipo se guardan en el navegador junto con los reportes. Los registros de
 * demostración se regeneran una vez al día (marcados con demo: true) y se conservan los
 * que crea quien prueba el prototipo.
 */
import { equipoPorId, equiposDeEstacion, type Equipo } from "../data/accessibility"
import { allStations } from "../data/metroData"
import { HORARIO, saturacion, tipoDia } from "../data/saturation"
import { actor, alcanzaEstacion, auditar, exigir, DIA, HORA, MIN, type Cuenta, type EstadoConsola, type Resultado } from "./admin"
import type { BaseDatos, Reporte } from "./reports"

/* ------------------------------------------------------------------ */
/* Reglas (RN10 y propuestas del equipo)                               */
/* ------------------------------------------------------------------ */

/** Estaciones del piloto con rondas programadas. */
export const ESTACIONES_PILOTO = ["Tacubaya", "Pantitlán", "Hidalgo", "Balderas", "Zapata"]

export type SlotId = "apertura" | "09:00" | "13:00" | "17:00" | "21:00"
/** Cinco rondas al día: antes de abrir y cada cuatro horas (RN10). */
export const SLOTS: SlotId[] = ["apertura", "09:00", "13:00", "17:00", "21:00"]
/** Una ronda se considera a tiempo si se registra dentro de esta tolerancia. */
export const TOLERANCIA_RONDA = 45 * MIN
/** Plazo para reparar según la prioridad (propuesta). */
export const SLA_ORDEN = { alta: 24 * HORA, media: 72 * HORA } as const
/** Meta para asignar y llegar con una persona que pidió apoyo (propuesta). */
export const META_ASIGNACION = 5 * MIN
export const META_LLEGADA = 15 * MIN
/** Vigencia de lo que observa el personal en una ronda o verificación. */
export const VIGENCIA_OBSERVACION = 12 * HORA

export type Puesto = "Jefe(a) de estación" | "Personal de estación" | "Policía auxiliar"
export type Persona = { id: string; station: string; nombre: string; puesto: Puesto; cuentaId?: string }
export type ProgramaEstacion = { station: string; responsables: Record<SlotId, string> }
export type ResultadoEquipo = "funciona" | "con_fallas" | "fuera_servicio"
export const RESULTADO_LABEL: Record<ResultadoEquipo, string> = { funciona: "Funciona", con_fallas: "Funciona con fallas", fuera_servicio: "Fuera de servicio" }

export type RegistroRonda = {
  id: string
  station: string
  fecha: string
  slot: SlotId
  ts: number
  porId: string
  porNombre: string
  porPuesto: string
  resultados: Record<string, ResultadoEquipo>
  observaciones?: string
  demo?: boolean
}

export type Verificacion = {
  id: string
  station: string
  equipmentId: string
  resultado: "confirmada" | "sin_falla"
  ts: number
  porNombre: string
  porPuesto: string
  reportes: string[]
  demo?: boolean
}

export type Prioridad = "alta" | "media"
export type OrdenMantenimiento = {
  id: string
  station: string
  equipmentId: string
  gravedad: Exclude<ResultadoEquipo, "funciona">
  origen: "ronda" | "verificacion" | "jefe_estacion"
  detalle: string
  prioridad: Prioridad
  estado: "abierta" | "en_atencion" | "resuelta"
  creada: number
  creadaPor: string
  tomada?: number
  atiende?: string
  resuelta?: number
  nota?: string
  demo?: boolean
}

export type TipoIncidente = "apoyo_movilidad" | "persona_atrapada" | "aglomeracion" | "acceso_cerrado" | "otro"
export const TIPO_INCIDENTE_LABEL: Record<TipoIncidente, string> = {
  apoyo_movilidad: "Apoyo a persona con movilidad limitada",
  persona_atrapada: "Persona atrapada en un elevador",
  aglomeracion: "Aglomeración en andén o transbordo",
  acceso_cerrado: "Acceso cerrado o acordonado",
  otro: "Otro",
}
export type EstadoIncidente = "abierta" | "asignada" | "en_camino" | "atendida" | "cancelada"
export const ESTADO_INCIDENTE_LABEL: Record<EstadoIncidente, string> = {
  abierta: "Sin asignar",
  asignada: "Asignada",
  en_camino: "En camino",
  atendida: "Atendida",
  cancelada: "Cancelada",
}
export type Incidente = {
  id: string
  station: string
  tipo: TipoIncidente
  origen: "persona_usuaria" | "personal"
  punto: string
  detalle: string
  prioridad: Prioridad
  estado: EstadoIncidente
  ts: number
  registradoPor?: string
  asignadoA?: string
  asignada?: number
  enCamino?: number
  atendida?: number
  cierre?: string
  demo?: boolean
}

export type Operacion = {
  sembrado: string
  plantilla: Persona[]
  programa: ProgramaEstacion[]
  rondas: RegistroRonda[]
  verificaciones: Verificacion[]
  ordenes: OrdenMantenimiento[]
  incidentes: Incidente[]
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export const isoDia = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const medianoche = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`

/** Minuto del día de una ronda. La de apertura es 30 minutos antes de abrir al público. */
export function minutoSlot(slot: SlotId, fecha: Date): number {
  if (slot === "apertura") return HORARIO[tipoDia(fecha)].abre - 30
  const [h, m] = slot.split(":").map(Number)
  return h * 60 + m
}
export const tsSlot = (dia: number, slot: SlotId) => medianoche(dia) + minutoSlot(slot, new Date(dia)) * MIN
export const etiquetaSlot = (slot: SlotId, fecha: Date) => (slot === "apertura" ? `${hhmm(minutoSlot(slot, fecha))} · apertura` : slot)

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

export const operacionVacia = (): Operacion => ({ sembrado: "", plantilla: [], programa: [], rondas: [], verificaciones: [], ordenes: [], incidentes: [] })
export const operacionDe = (db: BaseDatos): Operacion => db.operacion ?? operacionVacia()

const siguienteId = (prefijo: string, existentes: string[], base: number) => {
  const nums = existentes.filter((x) => x.startsWith(prefijo)).map((x) => Number(x.slice(prefijo.length)) || 0)
  return `${prefijo}${String(Math.max(base, ...nums) + 1).padStart(4, "0")}`
}

/** Elevadores y salvaescaleras son la única opción para silla de ruedas: prioridad alta. */
export const prioridadDe = (eq: Equipo | undefined): Prioridad => (eq?.tipo === "Escalera eléctrica" ? "media" : "alta")

/* ------------------------------------------------------------------ */
/* Plantilla y programa                                                */
/* ------------------------------------------------------------------ */

/** Personal ficticio de demostración de las estaciones del piloto. */
const PLANTILLA_DEMO: Array<[string, string, Puesto, string?]> = [
  ["Tacubaya", "Arturo Lemus Pineda", "Jefe(a) de estación", "C-JE-TAC"],
  ["Tacubaya", "Jorge Aranda Vela", "Personal de estación", "C-PE-TAC"],
  ["Tacubaya", "Lucía Ferrer Gómez", "Personal de estación"],
  ["Tacubaya", "Karla Jiménez Soto", "Policía auxiliar", "C-SEG-TAC"],
  ["Pantitlán", "Mónica Ruiz Cabrera", "Jefe(a) de estación", "C-JE-PAN"],
  ["Pantitlán", "Héctor Campos Nava", "Personal de estación"],
  ["Pantitlán", "Sofía Prieto León", "Personal de estación"],
  ["Pantitlán", "Raúl Ochoa Medina", "Policía auxiliar"],
  ["Hidalgo", "Fernando Ibarra Solís", "Jefe(a) de estación"],
  ["Hidalgo", "Patricia Lugo Reyes", "Personal de estación"],
  ["Hidalgo", "Andrés Robledo Paz", "Personal de estación"],
  ["Hidalgo", "Iván Castro Ruiz", "Policía auxiliar"],
  ["Balderas", "Gabriela Montes Vargas", "Jefe(a) de estación"],
  ["Balderas", "Óscar Peña Rosas", "Personal de estación"],
  ["Balderas", "Laura Quintero Sáenz", "Personal de estación"],
  ["Balderas", "Elena Duarte Gil", "Policía auxiliar"],
  ["Zapata", "Ricardo Salas Mora", "Jefe(a) de estación"],
  ["Zapata", "Verónica Núñez Lara", "Personal de estación"],
  ["Zapata", "Emilio Vega Ríos", "Personal de estación"],
  ["Zapata", "Tomás Ávila Cruz", "Policía auxiliar"],
]

export const personasDe = (op: Operacion, station: string) => op.plantilla.filter((p) => p.station === station)
export const personaPorId = (op: Operacion, id: string | undefined) => op.plantilla.find((p) => p.id === id)

/** La persona de la plantilla que corresponde a una cuenta; si no existe, se crea con su puesto. */
export function personaDeCuenta(op: Operacion, c: Cuenta): Persona {
  const p = op.plantilla.find((x) => x.cuentaId === c.id)
  if (p) return p
  const puesto: Puesto = c.roles.includes("jefe_estacion") ? "Jefe(a) de estación" : c.roles.includes("personal_seguridad") ? "Policía auxiliar" : "Personal de estación"
  return { id: c.id, station: c.estaciones?.[0] ?? "", nombre: c.nombre, puesto, cuentaId: c.id }
}

export const programaDe = (op: Operacion, station: string) => op.programa.find((p) => p.station === station)

/* ------------------------------------------------------------------ */
/* Estado de las rondas                                                */
/* ------------------------------------------------------------------ */

export type EstadoRonda = "hecha" | "tarde" | "atrasada" | "en_curso" | "programada"
export const ESTADO_RONDA_LABEL: Record<EstadoRonda, string> = {
  hecha: "Hecha a tiempo",
  tarde: "Hecha fuera de tiempo",
  atrasada: "Atrasada",
  en_curso: "En curso",
  programada: "Programada",
}

export type RondaDelDia = { station: string; slot: SlotId; hora: string; ts: number; responsable?: Persona; registro?: RegistroRonda; estado: EstadoRonda }

export function rondasDelDia(op: Operacion, station: string, dia: number, now: number): RondaDelDia[] {
  const fecha = isoDia(dia)
  const prog = programaDe(op, station)
  return SLOTS.map((slot) => {
    const ts = tsSlot(dia, slot)
    const registro = op.rondas.find((r) => r.station === station && r.fecha === fecha && r.slot === slot)
    const responsable = personaPorId(op, prog?.responsables[slot])
    let estado: EstadoRonda
    if (registro) estado = registro.ts - ts <= TOLERANCIA_RONDA ? "hecha" : "tarde"
    else if (now > ts + TOLERANCIA_RONDA) estado = "atrasada"
    else if (now >= ts) estado = "en_curso"
    else estado = "programada"
    return { station, slot, hora: etiquetaSlot(slot, new Date(dia)), ts, responsable, registro, estado }
  })
}

/** Rondas vencidas (ya pasó su hora más la tolerancia) entre dos fechas, con su resultado. */
export function rondasVencidas(op: Operacion, stations: string[], dias: number, now: number) {
  const salida: RondaDelDia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const dia = medianoche(now) - i * DIA
    for (const s of stations) for (const r of rondasDelDia(op, s, dia, now)) if (r.estado === "hecha" || r.estado === "tarde" || r.estado === "atrasada") salida.push(r)
  }
  return salida
}

/** Cumplimiento por persona responsable: quién da las rondas y si llegan a tiempo. */
export function cumplimientoPorResponsable(op: Operacion, stations: string[], dias: number, now: number) {
  const mapa = new Map<string, { persona: Persona; programadas: number; aTiempo: number; tarde: number; omitidas: number }>()
  for (const r of rondasVencidas(op, stations, dias, now)) {
    const quien = r.registro ? personaPorId(op, r.registro.porId) ?? r.responsable : r.responsable
    if (!quien) continue
    const fila = mapa.get(quien.id) ?? { persona: quien, programadas: 0, aTiempo: 0, tarde: 0, omitidas: 0 }
    fila.programadas++
    if (r.estado === "hecha") fila.aTiempo++
    else if (r.estado === "tarde") fila.tarde++
    else fila.omitidas++
    mapa.set(quien.id, fila)
  }
  return [...mapa.values()].sort((a, b) => a.persona.station.localeCompare(b.persona.station) || a.persona.puesto.localeCompare(b.persona.puesto))
}

/* ------------------------------------------------------------------ */
/* Estado operativo de los equipos                                     */
/* ------------------------------------------------------------------ */

export type Observacion = { estado: "disponible" | "incierto" | "fuera_servicio"; fuente: string; ts: number; orden?: OrdenMantenimiento }

const horaCorta = (ts: number) => new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })

/** Lo que dice el personal del STC sobre un equipo: orden abierta o última observación vigente. */
export function estadoOperativo(db: BaseDatos, equipmentId: string, now: number): Observacion | null {
  const op = db.operacion
  if (!op) return null
  const abierta = op.ordenes.filter((o) => o.equipmentId === equipmentId && o.estado !== "resuelta" && o.creada <= now).sort((a, b) => b.creada - a.creada)[0]
  if (abierta) {
    return abierta.gravedad === "fuera_servicio"
      ? { estado: "fuera_servicio", fuente: `En reparación (orden ${abierta.id})`, ts: abierta.creada, orden: abierta }
      : { estado: "incierto", fuente: `Funciona con fallas según el personal de la estación (orden ${abierta.id})`, ts: abierta.creada, orden: abierta }
  }
  const obs: Observacion[] = []
  for (const r of op.rondas) {
    const res = r.resultados[equipmentId]
    if (!res || r.ts > now) continue
    obs.push({ estado: res === "funciona" ? "disponible" : res === "con_fallas" ? "incierto" : "fuera_servicio", fuente: `Ronda de revisión de las ${horaCorta(r.ts)} (${r.porPuesto.toLowerCase()})`, ts: r.ts })
  }
  for (const v of op.verificaciones) {
    if (v.equipmentId !== equipmentId || v.ts > now) continue
    obs.push({ estado: v.resultado === "confirmada" ? "fuera_servicio" : "disponible", fuente: `Verificado en sitio a las ${horaCorta(v.ts)}`, ts: v.ts })
  }
  for (const o of op.ordenes) {
    if (o.equipmentId === equipmentId && o.resuelta && o.resuelta <= now) obs.push({ estado: "disponible", fuente: `Reparado por mantenimiento a las ${horaCorta(o.resuelta)}`, ts: o.resuelta })
  }
  const ultima = obs.sort((a, b) => b.ts - a.ts)[0]
  return ultima && now - ultima.ts <= VIGENCIA_OBSERVACION ? ultima : null
}

/* ------------------------------------------------------------------ */
/* Reportes ciudadanos por verificar en la estación                    */
/* ------------------------------------------------------------------ */

const FALLA = new Set(["no_funciona", "con_fallas", "cerrado"])

/** Momento de la última observación del personal sobre un equipo (ronda, verificación u orden). */
export function ultimaObservacionPersonal(op: Operacion, equipmentId: string): number {
  let ts = 0
  for (const r of op.rondas) if (r.resultados[equipmentId]) ts = Math.max(ts, r.ts)
  for (const v of op.verificaciones) if (v.equipmentId === equipmentId) ts = Math.max(ts, v.ts)
  for (const o of op.ordenes) if (o.equipmentId === equipmentId) ts = Math.max(ts, o.creada, o.resuelta ?? 0)
  return ts
}

export type PorVerificar = { equipmentId: string; station: string; reportes: Reporte[]; desde: number }

/** Reportes de falla válidos de las últimas 24 h que el personal todavía no ha revisado en sitio. */
export function reportesPorVerificar(db: BaseDatos, stations: string[] | null, now: number): PorVerificar[] {
  const op = operacionDe(db)
  const grupos = new Map<string, PorVerificar>()
  for (const r of db.reportes) {
    if (!FALLA.has(r.estado) || r.cuarentena || r.moderacion === "rechazado" || r.ts > now || now - r.ts > DIA) continue
    if (stations && !stations.includes(r.station)) continue
    if (ultimaObservacionPersonal(op, r.equipmentId) >= r.ts) continue
    if (op.ordenes.some((o) => o.equipmentId === r.equipmentId && o.estado !== "resuelta")) continue
    const g = grupos.get(r.equipmentId) ?? { equipmentId: r.equipmentId, station: r.station, reportes: [], desde: r.ts }
    g.reportes.push(r)
    g.desde = Math.min(g.desde, r.ts)
    grupos.set(r.equipmentId, g)
  }
  return [...grupos.values()].sort((a, b) => a.desde - b.desde)
}

/* ------------------------------------------------------------------ */
/* Seguimiento para la persona que reporta                             */
/* ------------------------------------------------------------------ */

export type Seguimiento = { etapa: "recibido" | "verificado" | "sin_falla" | "en_reparacion" | "reparado"; texto: string; tono: "ok" | "warn" | "bad" }

export function seguimientoReporte(db: BaseDatos, r: Reporte): Seguimiento | null {
  const op = db.operacion
  if (!op || r.cuarentena || r.moderacion === "rechazado") return null
  const ordenes = op.ordenes.filter((o) => o.equipmentId === r.equipmentId && (o.resuelta ?? Infinity) >= r.ts).sort((a, b) => a.creada - b.creada)
  const orden = ordenes[0]
  if (orden?.estado === "resuelta") return { etapa: "reparado", texto: `Reparado (orden ${orden.id})`, tono: "ok" }
  if (orden) return { etapa: "en_reparacion", texto: orden.estado === "en_atencion" ? `En reparación (orden ${orden.id})` : `Enviado a mantenimiento (orden ${orden.id})`, tono: "warn" }
  const v = op.verificaciones.filter((x) => x.equipmentId === r.equipmentId && x.ts >= r.ts).sort((a, b) => a.ts - b.ts)[0]
  if (v?.resultado === "sin_falla") return { etapa: "sin_falla", texto: "El personal de la estación lo revisó y funciona", tono: "ok" }
  if (v) return { etapa: "verificado", texto: "Confirmado por el personal de la estación", tono: "bad" }
  return null
}

/* ------------------------------------------------------------------ */
/* Indicadores de mantenimiento y atención                             */
/* ------------------------------------------------------------------ */

export const vencida = (o: OrdenMantenimiento, now: number) => (o.resuelta ?? now) - o.creada > SLA_ORDEN[o.prioridad]

export function mttrHoras(op: Operacion, dias: number, now: number): number | null {
  const resueltas = op.ordenes.filter((o) => o.resuelta && now - o.resuelta <= dias * DIA)
  if (!resueltas.length) return null
  return resueltas.reduce((a, o) => a + (o.resuelta! - o.creada), 0) / resueltas.length / HORA
}

export function recurrentes(op: Operacion, dias: number, now: number, minimo = 3) {
  const conteo = new Map<string, number>()
  for (const o of op.ordenes) if (now - o.creada <= dias * DIA) conteo.set(o.equipmentId, (conteo.get(o.equipmentId) ?? 0) + 1)
  return [...conteo.entries()].filter(([, n]) => n >= minimo).map(([equipmentId, n]) => ({ equipmentId, n }))
}

export const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Estaciones del piloto con saturación alta en la siguiente hora (para anticipar personal de apoyo). */
export function saturacionProxima(now: number, stations = ESTACIONES_PILOTO) {
  const d = new Date(now)
  const min = d.getHours() * 60 + d.getMinutes()
  return stations.map((s) => {
    const a = saturacion(s, d, Math.min(min + 30, 23 * 60 + 30))
    const b = saturacion(s, d, Math.min(min + 60, 23 * 60 + 30))
    const nivel = a.nivel === "alta" || b.nivel === "alta" ? "alta" : a.nivel === "media" || b.nivel === "media" ? "media" : "baja"
    return { station: s, nivel, afluencia: Math.max(a.afluenciaFranja, b.afluenciaFranja) }
  })
}

/* ------------------------------------------------------------------ */
/* Acciones del personal                                               */
/* ------------------------------------------------------------------ */

function asegurar(db: BaseDatos): Operacion {
  if (!db.operacion) db.operacion = operacionVacia()
  return db.operacion
}

function fueraDeEstacion(e: EstadoConsola, quien: Cuenta, station: string, accion: string, now: number): Resultado | null {
  if (alcanzaEstacion(quien, station)) return null
  auditar(e, { ...actor(quien), accion: `intento: ${accion}`, objeto: station, resultado: "denegado", detalle: "estación fuera de su asignación (403)" }, now)
  return { ok: false, codigo: 403, mensaje: `Tu cuenta solo puede operar ${quien.estaciones?.join(", ")}.` }
}

function nuevaOrden(op: Operacion, datos: Omit<OrdenMantenimiento, "id" | "estado" | "prioridad">): OrdenMantenimiento {
  const o: OrdenMantenimiento = { ...datos, id: siguienteId("OT-", op.ordenes.map((x) => x.id), 400), estado: "abierta", prioridad: prioridadDe(equipoPorId(datos.equipmentId)) }
  op.ordenes.unshift(o)
  return o
}

export function registrarRonda(
  db: BaseDatos,
  e: EstadoConsola,
  quien: Cuenta,
  station: string,
  slot: SlotId,
  resultados: Record<string, ResultadoEquipo>,
  observaciones: string,
  now: number,
): Resultado {
  const negado = exigir(e, quien, "rondas.registrar", `ronda ${station} ${slot}`, now) ?? fueraDeEstacion(e, quien, station, "registrar ronda", now)
  if (negado) return negado
  const op = asegurar(db)
  const fecha = isoDia(now)
  const inicio = tsSlot(now, slot)
  if (now < inicio - 30 * MIN) return { ok: false, codigo: 409, mensaje: "Esta ronda todavía no empieza; se puede registrar desde 30 minutos antes." }
  if (op.rondas.some((r) => r.station === station && r.fecha === fecha && r.slot === slot)) return { ok: false, codigo: 409, mensaje: "Esa ronda ya se registró hoy." }
  const persona = personaDeCuenta(op, quien)
  const responsable = programaDe(op, station)?.responsables[slot]
  if (!quien.roles.includes("jefe_estacion") && responsable && responsable !== persona.id) {
    auditar(e, { ...actor(quien), accion: "intento: registrar ronda de otra persona", objeto: `${station} ${slot}`, resultado: "denegado", detalle: "403" }, now)
    return { ok: false, codigo: 403, mensaje: "Esta ronda está asignada a otra persona; solo el jefe de estación puede cubrirla." }
  }
  const equipos = equiposDeEstacion(station)
  if (equipos.some((eq) => !resultados[eq.id])) return { ok: false, codigo: 400, mensaje: "Indica el estado de todos los equipos de la estación." }
  op.rondas.unshift({ id: `RR-${now.toString(36).toUpperCase()}`, station, fecha, slot, ts: now, porId: persona.id, porNombre: persona.nombre, porPuesto: persona.puesto, resultados, observaciones: observaciones.trim() || undefined })
  const fallas = equipos.filter((eq) => resultados[eq.id] !== "funciona")
  const nuevas: string[] = []
  for (const eq of fallas) {
    if (op.ordenes.some((o) => o.equipmentId === eq.id && o.estado !== "resuelta")) continue
    const g = resultados[eq.id] as Exclude<ResultadoEquipo, "funciona">
    nuevas.push(nuevaOrden(op, { station, equipmentId: eq.id, gravedad: g, origen: "ronda", detalle: `${RESULTADO_LABEL[g]} en la ronda de las ${etiquetaSlot(slot, new Date(now))}`, creada: now, creadaPor: persona.nombre }).id)
  }
  auditar(e, { ...actor(quien), accion: "registro de ronda", objeto: `${station} · ${etiquetaSlot(slot, new Date(now))}`, resultado: "permitido", detalle: fallas.length ? `${fallas.length} equipos con falla; órdenes ${nuevas.join(", ") || "ya abiertas"}` : "todos los equipos funcionan" }, now)
  const enviadas = nuevas.length === 1 ? `Se envió 1 falla a mantenimiento (${nuevas[0]}).` : `Se enviaron ${nuevas.length} fallas a mantenimiento (${nuevas.join(", ")}).`
  return { ok: true, mensaje: fallas.length ? `Ronda registrada. ${nuevas.length ? enviadas : "Las fallas ya tenían orden abierta."}` : "Ronda registrada: todos los equipos funcionan." }
}

export function asignarResponsable(db: BaseDatos, e: EstadoConsola, quien: Cuenta, station: string, slot: SlotId, personaId: string, now: number): Resultado {
  const negado = exigir(e, quien, "rondas.programar", `programa ${station}`, now) ?? fueraDeEstacion(e, quien, station, "programar rondas", now)
  if (negado) return negado
  const op = asegurar(db)
  const p = personaPorId(op, personaId)
  if (!p || p.station !== station || p.puesto === "Policía auxiliar") return { ok: false, codigo: 400, mensaje: "Elige al jefe o a una persona del personal de esa estación." }
  let prog = programaDe(op, station)
  if (!prog) {
    prog = { station, responsables: Object.fromEntries(SLOTS.map((s) => [s, p.id])) as Record<SlotId, string> }
    op.programa.push(prog)
  }
  const antes = personaPorId(op, prog.responsables[slot])?.nombre ?? "—"
  prog.responsables[slot] = p.id
  auditar(e, { ...actor(quien), accion: "cambio de responsable de ronda", objeto: `${station} · ${slot}`, resultado: "permitido", detalle: `${antes} → ${p.nombre}` }, now)
  return { ok: true, mensaje: `${p.nombre} dará la ronda de las ${etiquetaSlot(slot, new Date(now))} en ${station}.` }
}

export function verificarEnSitio(db: BaseDatos, e: EstadoConsola, quien: Cuenta, equipmentId: string, resultado: "confirmada" | "sin_falla", now: number): Resultado {
  const eq = equipoPorId(equipmentId)
  if (!eq) return { ok: false, codigo: 400, mensaje: "El equipo no existe." }
  const negado = exigir(e, quien, "reportes.verificar", equipmentId, now) ?? fueraDeEstacion(e, quien, eq.station, "verificar reporte", now)
  if (negado) return negado
  const pendientes = reportesPorVerificar(db, [eq.station], now).find((p) => p.equipmentId === equipmentId)
  const op = asegurar(db)
  const persona = personaDeCuenta(op, quien)
  op.verificaciones.unshift({ id: `VS-${now.toString(36).toUpperCase()}`, station: eq.station, equipmentId, resultado, ts: now, porNombre: persona.nombre, porPuesto: persona.puesto, reportes: pendientes?.reportes.map((r) => r.id) ?? [] })
  let orden: OrdenMantenimiento | undefined
  if (resultado === "confirmada" && !op.ordenes.some((o) => o.equipmentId === equipmentId && o.estado !== "resuelta")) {
    orden = nuevaOrden(op, { station: eq.station, equipmentId, gravedad: "fuera_servicio", origen: "verificacion", detalle: `Falla reportada por ${pendientes?.reportes.length ?? 0} personas y confirmada en sitio`, creada: now, creadaPor: persona.nombre })
  }
  auditar(e, { ...actor(quien), accion: "verificación en sitio", objeto: `${eq.tipo} · ${eq.station}`, resultado: "permitido", detalle: resultado === "confirmada" ? `falla confirmada${orden ? `; orden ${orden.id}` : ""}` : "funciona: no se encontró falla" }, now)
  return { ok: true, mensaje: resultado === "confirmada" ? `Falla confirmada${orden ? ` y enviada a mantenimiento (${orden.id})` : ""}. Las rutas ya lo consideran fuera de servicio.` : "Registrado: el equipo funciona. Las rutas vuelven a usarlo." }
}

export function crearOrden(db: BaseDatos, e: EstadoConsola, quien: Cuenta, equipmentId: string, gravedad: Exclude<ResultadoEquipo, "funciona">, detalle: string, now: number): Resultado {
  const eq = equipoPorId(equipmentId)
  if (!eq) return { ok: false, codigo: 400, mensaje: "El equipo no existe." }
  const negado = exigir(e, quien, "ordenes.crear", equipmentId, now) ?? fueraDeEstacion(e, quien, eq.station, "crear orden", now)
  if (negado) return negado
  if (!detalle.trim()) return { ok: false, codigo: 400, mensaje: "Describe la falla para mantenimiento." }
  const op = asegurar(db)
  if (op.ordenes.some((o) => o.equipmentId === equipmentId && o.estado !== "resuelta")) return { ok: false, codigo: 409, mensaje: "Ese equipo ya tiene una orden abierta." }
  const o = nuevaOrden(op, { station: eq.station, equipmentId, gravedad, origen: "jefe_estacion", detalle: detalle.trim(), creada: now, creadaPor: quien.nombre })
  auditar(e, { ...actor(quien), accion: "orden de mantenimiento", objeto: `${o.id} · ${eq.tipo} · ${eq.station}`, resultado: "permitido", detalle: detalle.trim() }, now)
  return { ok: true, mensaje: `Orden ${o.id} enviada a mantenimiento con prioridad ${o.prioridad}.` }
}

export function tomarOrden(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const negado = exigir(e, quien, "ordenes.atender", id, now)
  if (negado) return negado
  const o = asegurar(db).ordenes.find((x) => x.id === id)
  if (!o || o.estado !== "abierta") return { ok: false, codigo: 409, mensaje: "La orden no está abierta." }
  o.estado = "en_atencion"
  o.tomada = now
  o.atiende = quien.nombre
  auditar(e, { ...actor(quien), accion: "orden en atención", objeto: o.id, resultado: "permitido" }, now)
  return { ok: true, mensaje: `Tomaste la orden ${o.id}.` }
}

export function resolverOrden(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, nota: string, now: number): Resultado {
  const negado = exigir(e, quien, "ordenes.atender", id, now)
  if (negado) return negado
  const o = asegurar(db).ordenes.find((x) => x.id === id)
  if (!o || o.estado === "resuelta") return { ok: false, codigo: 409, mensaje: "La orden ya está cerrada." }
  if (!nota.trim()) return { ok: false, codigo: 400, mensaje: "Describe la reparación antes de cerrar la orden." }
  o.estado = "resuelta"
  o.resuelta = now
  o.tomada ??= now
  o.atiende ??= quien.nombre
  o.nota = nota.trim()
  auditar(e, { ...actor(quien), accion: "orden resuelta", objeto: o.id, resultado: "permitido", detalle: nota.trim() }, now)
  return { ok: true, mensaje: `Orden ${o.id} cerrada. El personal de la estación lo confirmará en la siguiente ronda.` }
}

export function registrarIncidente(db: BaseDatos, e: EstadoConsola, quien: Cuenta, station: string, tipo: TipoIncidente, punto: string, detalle: string, now: number): Resultado {
  const negado = exigir(e, quien, "incidentes.ver", station, now) ?? fueraDeEstacion(e, quien, station, "registrar incidente", now)
  if (negado) return negado
  if (!punto.trim()) return { ok: false, codigo: 400, mensaje: "Indica en qué punto de la estación." }
  const op = asegurar(db)
  const id = siguienteId("IN-", op.incidentes.map((x) => x.id), 200)
  op.incidentes.unshift({ id, station, tipo, origen: "personal", punto: punto.trim(), detalle: detalle.trim(), prioridad: tipo === "persona_atrapada" || tipo === "aglomeracion" ? "alta" : "media", estado: "abierta", ts: now, registradoPor: quien.nombre })
  auditar(e, { ...actor(quien), accion: "registro de incidente", objeto: `${id} · ${station}`, resultado: "permitido", detalle: TIPO_INCIDENTE_LABEL[tipo] }, now)
  return { ok: true, mensaje: `Incidente ${id} registrado.` }
}

export function asignarIncidente(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, personaId: string, now: number): Resultado {
  const op = asegurar(db)
  const x = op.incidentes.find((i) => i.id === id)
  if (!x || x.estado === "atendida" || x.estado === "cancelada") return { ok: false, codigo: 409, mensaje: "La solicitud ya está cerrada." }
  const negado = exigir(e, quien, "incidentes.asignar", id, now) ?? fueraDeEstacion(e, quien, x.station, "asignar incidente", now)
  if (negado) return negado
  const p = personaPorId(op, personaId)
  if (!p || p.station !== x.station) return { ok: false, codigo: 400, mensaje: "Elige a una persona de esa estación." }
  if (quien.roles.includes("jefe_seguridad") && !quien.roles.includes("jefe_estacion") && p.puesto !== "Policía auxiliar") return { ok: false, codigo: 400, mensaje: "Seguridad asigna al personal de seguridad de la estación." }
  x.asignadoA = p.id
  x.asignada = now
  if (x.estado === "abierta") x.estado = "asignada"
  auditar(e, { ...actor(quien), accion: "asignación de incidente", objeto: `${x.id} · ${x.station}`, resultado: "permitido", detalle: `${p.nombre} (${p.puesto})` }, now)
  return { ok: true, mensaje: `${x.id} asignada a ${p.nombre}.` }
}

export function avanzarIncidente(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, paso: "en_camino" | "atendida", cierre: string, now: number): Resultado {
  const op = asegurar(db)
  const x = op.incidentes.find((i) => i.id === id)
  if (!x || x.estado === "atendida" || x.estado === "cancelada") return { ok: false, codigo: 409, mensaje: "La solicitud ya está cerrada." }
  const negado = exigir(e, quien, "incidentes.atender", id, now) ?? fueraDeEstacion(e, quien, x.station, "atender incidente", now)
  if (negado) return negado
  const persona = personaDeCuenta(op, quien)
  if (x.asignadoA !== persona.id && !quien.roles.includes("jefe_estacion")) return { ok: false, codigo: 403, mensaje: "Esta solicitud está asignada a otra persona." }
  if (!x.asignadoA) {
    x.asignadoA = persona.id
    x.asignada = now
  }
  if (paso === "en_camino") {
    x.estado = "en_camino"
    x.enCamino = now
  } else {
    x.estado = "atendida"
    x.enCamino ??= now
    x.atendida = now
    x.cierre = cierre.trim() || undefined
  }
  auditar(e, { ...actor(quien), accion: paso === "en_camino" ? "en camino a incidente" : "incidente atendido", objeto: `${x.id} · ${x.station}`, resultado: "permitido", detalle: cierre.trim() || undefined }, now)
  return { ok: true, mensaje: paso === "en_camino" ? `Vas en camino a ${x.punto}.` : `${x.id} atendida.` }
}

/* ------------------------------------------------------------------ */
/* Solicitud de apoyo de la persona usuaria (app pública, sin cuenta)  */
/* ------------------------------------------------------------------ */

export type DatosApoyo = { station: string; punto: string; tipo: TipoIncidente; detalle: string }

export const PUNTOS_ENCUENTRO = ["Taquilla o torniquetes", "Acceso de calle", "Andén", "Transbordo entre líneas", "Elevador o salvaescaleras"]

export function validarApoyo(d: DatosApoyo): string | null {
  if (!allStations.includes(d.station)) return "Elige una estación de la lista."
  if (!d.punto.trim()) return "Elige dónde te encontramos."
  if (d.detalle.length > 160) return "Usa 160 caracteres o menos."
  if (/\d{7,}/.test(d.detalle.replace(/[\s-]/g, "")) || /@/.test(d.detalle)) return "No escribas teléfonos ni correos: el personal te ubica en el punto que elegiste."
  return null
}

export function solicitarApoyo(db: BaseDatos, d: DatosApoyo, now: number): { ok: true; folio: string } | { ok: false; mensaje: string } {
  const error = validarApoyo(d)
  if (error) return { ok: false, mensaje: error }
  const op = asegurar(db)
  const folio = siguienteId("AP-", op.incidentes.map((x) => x.id), 100)
  op.incidentes.unshift({ id: folio, station: d.station, tipo: d.tipo, origen: "persona_usuaria", punto: d.punto, detalle: d.detalle.trim(), prioridad: "alta", estado: "abierta", ts: now })
  return { ok: true, folio }
}

export function cancelarApoyo(db: BaseDatos, folio: string, now: number): boolean {
  const x = asegurar(db).incidentes.find((i) => i.id === folio)
  if (!x || x.estado === "atendida" || x.estado === "cancelada") return false
  x.estado = "cancelada"
  x.atendida = now
  x.cierre = "Cancelada por la persona usuaria"
  return true
}

/** Borra la descripción de las solicitudes cerradas hace más de 24 h (minimización, LFPDPPP). */
export function limpiarOperacion(op: Operacion, now: number) {
  for (const x of op.incidentes) if (x.origen === "persona_usuaria" && x.atendida && now - x.atendida > DIA) x.detalle = ""
}

/* ------------------------------------------------------------------ */
/* Datos de demostración                                               */
/* ------------------------------------------------------------------ */

type Averia = { equipmentId: string; inicio: number; fin?: number; gravedad: Exclude<ResultadoEquipo, "funciona">; nota?: string }

export function sembrarOperacion(db: BaseDatos, now: number, forzar = false): BaseDatos {
  const hoy = isoDia(now)
  const previo = db.operacion
  if (previo && previo.sembrado === hoy && !forzar) return db
  const op: Operacion = previo && !forzar ? previo : operacionVacia()
  const r = rng(Number(hoy.replace(/-/g, "")))

  // Plantilla y programa: se conservan los cambios de quien prueba el prototipo.
  for (const [station, nombre, puesto, cuentaId] of PLANTILLA_DEMO) {
    const id = `P-${station.slice(0, 3).toUpperCase()}-${nombre.split(" ")[0].toUpperCase()}`
    if (!op.plantilla.some((p) => p.id === id)) op.plantilla.push({ id, station, nombre, puesto, cuentaId })
  }
  for (const station of ESTACIONES_PILOTO) {
    if (programaDe(op, station)) continue
    const ps = personasDe(op, station)
    const jefe = ps.find((p) => p.puesto === "Jefe(a) de estación")!
    const [p1, p2] = ps.filter((p) => p.puesto === "Personal de estación")
    op.programa.push({ station, responsables: { apertura: jefe.id, "09:00": p1.id, "13:00": p2.id, "17:00": jefe.id, "21:00": p1.id } })
  }

  // Se regeneran los registros de demostración relativos a la hora actual.
  op.rondas = op.rondas.filter((x) => !x.demo)
  op.verificaciones = op.verificaciones.filter((x) => !x.demo)
  op.ordenes = op.ordenes.filter((x) => !x.demo)
  op.incidentes = op.incidentes.filter((x) => !x.demo)

  const averias: Averia[] = [
    { equipmentId: "EL-TACUBAYA-01", inicio: now - 3.6 * HORA, gravedad: "fuera_servicio" },
    { equipmentId: "EL-PANTITLAN-05", inicio: now - 7 * HORA, gravedad: "con_fallas" },
    { equipmentId: "EL-PANTITLAN-05", inicio: now - 20 * DIA, fin: now - 18.7 * DIA, gravedad: "fuera_servicio", nota: "Cambio de botonera de piso" },
    { equipmentId: "EL-PANTITLAN-05", inicio: now - 9 * DIA, fin: now - 8 * DIA, gravedad: "con_fallas", nota: "Ajuste de sensores de puerta" },
    { equipmentId: "EL-TACUBAYA-08", inicio: now - 15 * DIA, fin: now - 13 * DIA, gravedad: "fuera_servicio", nota: "Reemplazo de tarjeta de control (refacción importada)" },
    { equipmentId: "EE-HIDALGO-06", inicio: now - 12 * DIA, fin: now - 11.5 * DIA, gravedad: "fuera_servicio", nota: "Cambio de cadena de peldaños" },
    { equipmentId: "EL-BALDERAS-05", inicio: now - 6 * DIA, fin: now - 5.2 * DIA, gravedad: "fuera_servicio", nota: "Rescate y revisión de frenos" },
    { equipmentId: "EE-ZAPATA-02", inicio: now - 4 * DIA, fin: now - 3.8 * DIA, gravedad: "con_fallas", nota: "Limpieza y lubricación de pasamanos" },
    { equipmentId: "EE-TACUBAYA-02", inicio: now - 2 * DIA, fin: now - 1.7 * DIA, gravedad: "con_fallas", nota: "Ajuste de peines" },
  ]
  const averiaEn = (equipmentId: string, ts: number) => averias.find((a) => a.equipmentId === equipmentId && a.inicio <= ts && (a.fin ?? Infinity) > ts)

  // Rondas de los últimos 14 días.
  for (let i = 13; i >= 0; i--) {
    const dia = medianoche(now) - i * DIA
    for (const station of ESTACIONES_PILOTO) {
      const prog = programaDe(op, station)!
      for (const slot of SLOTS) {
        const inicio = tsSlot(dia, slot)
        if (inicio + TOLERANCIA_RONDA > now) continue
        const azar = r()
        if (i === 0 && station === "Pantitlán" && slot === "09:00") continue // ronda atrasada de demostración
        if (azar < 0.03) continue
        const ts = inicio + (azar < 0.1 ? 50 + Math.floor(r() * 40) : 4 + Math.floor(r() * 30)) * MIN
        if (ts > now) continue
        const p = personaPorId(op, prog.responsables[slot])!
        const resultados: Record<string, ResultadoEquipo> = {}
        for (const eq of equiposDeEstacion(station)) resultados[eq.id] = averiaEn(eq.id, ts)?.gravedad ?? "funciona"
        op.rondas.push({ id: `RR-D${i}-${station.slice(0, 3)}-${slot}`, station, fecha: isoDia(dia), slot, ts, porId: p.id, porNombre: p.nombre, porPuesto: p.puesto, resultados, demo: true })
      }
    }
  }

  // Cada avería genera su orden en la primera ronda que la encontró (o en una verificación en sitio).
  let n = 300
  const mant = "Alejandra Torres Luna"
  for (const a of [...averias].sort((x, y) => x.inicio - y.inicio)) {
    const eq = equipoPorId(a.equipmentId)!
    const ronda = op.rondas.filter((x) => x.station === eq.station && x.ts > a.inicio && (a.fin ?? Infinity) > x.ts).sort((x, y) => x.ts - y.ts)[0]
    let creada: number
    let origen: OrdenMantenimiento["origen"]
    let creadaPor: string
    if (ronda && (!a.fin || ronda.ts < a.fin)) {
      creada = ronda.ts
      origen = "ronda"
      creadaPor = ronda.porNombre
    } else {
      creada = Math.min(now - 0.8 * HORA, (a.fin ?? now) - HORA)
      origen = "verificacion"
      const p = personasDe(op, eq.station).find((x) => x.puesto === "Personal de estación")!
      creadaPor = p.nombre
      op.verificaciones.push({ id: `VS-D${n}`, station: eq.station, equipmentId: eq.id, resultado: "confirmada", ts: creada, porNombre: p.nombre, porPuesto: p.puesto, reportes: db.reportes.filter((x) => x.equipmentId === eq.id && x.ts < creada).map((x) => x.id), demo: true })
    }
    if (creada > now) continue
    n++
    const tomada = a.fin ? creada + (1 + r() * 2) * HORA : a.equipmentId === "EL-TACUBAYA-01" ? Math.min(now, creada + 0.4 * HORA) : undefined
    op.ordenes.push({
      id: `OT-0${n}`,
      station: eq.station,
      equipmentId: eq.id,
      gravedad: a.gravedad,
      origen,
      detalle: origen === "ronda" ? `${RESULTADO_LABEL[a.gravedad]} en la ronda de las ${horaCorta(creada)}` : "Falla reportada por personas usuarias y confirmada en sitio",
      prioridad: prioridadDe(eq),
      estado: a.fin ? "resuelta" : tomada ? "en_atencion" : "abierta",
      creada,
      creadaPor,
      tomada,
      atiende: tomada ? mant : undefined,
      resuelta: a.fin,
      nota: a.nota,
      demo: true,
    })
  }

  // Incidentes y solicitudes de apoyo.
  const persona = (station: string, puesto: Puesto, k = 0) => personasDe(op, station).filter((p) => p.puesto === puesto)[k]
  const inc = (x: Omit<Incidente, "demo">) => op.incidentes.push({ ...x, demo: true })
  inc({ id: "AP-0101", station: "Tacubaya", tipo: "apoyo_movilidad", origen: "persona_usuaria", punto: "Acceso de calle", detalle: "Voy en silla de ruedas y el elevador del acceso no funciona.", prioridad: "alta", estado: "abierta", ts: now - 6 * MIN })
  inc({ id: "AP-0100", station: "Tacubaya", tipo: "apoyo_movilidad", origen: "persona_usuaria", punto: "Transbordo entre líneas", detalle: "Uso bastón; necesito acompañamiento para cambiar a la Línea 7.", prioridad: "alta", estado: "asignada", ts: now - 12 * MIN, asignadoA: persona("Tacubaya", "Policía auxiliar").id, asignada: now - 9 * MIN })
  inc({ id: "IN-0201", station: "Pantitlán", tipo: "aglomeracion", origen: "personal", punto: "Transbordo Línea 1 ↔ Línea A", detalle: "Acumulación de personas en la escalera fija del transbordo.", prioridad: "alta", estado: "en_camino", ts: now - 15 * MIN, registradoPor: "Mónica Ruiz Cabrera", asignadoA: persona("Pantitlán", "Policía auxiliar").id, asignada: now - 13 * MIN, enCamino: now - 10 * MIN })
  const tipos: TipoIncidente[] = ["apoyo_movilidad", "apoyo_movilidad", "apoyo_movilidad", "persona_atrapada", "aglomeracion", "acceso_cerrado", "apoyo_movilidad", "apoyo_movilidad", "apoyo_movilidad", "aglomeracion", "apoyo_movilidad", "apoyo_movilidad"]
  tipos.forEach((tipo, k) => {
    const station = ESTACIONES_PILOTO[k % ESTACIONES_PILOTO.length]
    const ts = now - (2 + k * 13 + Math.floor(r() * 6)) * HORA
    const usuario = tipo === "apoyo_movilidad"
    const quien = usuario && k % 3 !== 0 ? persona(station, "Personal de estación") : persona(station, "Policía auxiliar")
    const asignada = ts + (1 + Math.floor(r() * 5)) * MIN
    const enCamino = asignada + (1 + Math.floor(r() * 3)) * MIN
    const atendida = enCamino + (3 + Math.floor(r() * 12)) * MIN
    inc({
      id: `${usuario ? "AP" : "IN"}-${String(usuario ? 60 + k : 160 + k).padStart(4, "0")}`,
      station,
      tipo,
      origen: usuario ? "persona_usuaria" : "personal",
      punto: usuario ? PUNTOS_ENCUENTRO[k % PUNTOS_ENCUENTRO.length] : tipo === "persona_atrapada" ? "Elevador del acceso de calle" : "Andén",
      detalle: now - atendida > DIA ? "" : usuario ? "Acompañamiento solicitado desde la app." : TIPO_INCIDENTE_LABEL[tipo],
      prioridad: "alta",
      estado: "atendida",
      ts,
      asignadoA: quien.id,
      asignada,
      enCamino,
      atendida,
      cierre: usuario ? "Persona acompañada hasta el andén" : "Situación controlada",
    })
  })

  op.rondas.sort((a, b) => b.ts - a.ts)
  op.ordenes.sort((a, b) => b.creada - a.creada)
  op.incidentes.sort((a, b) => b.ts - a.ts)
  op.verificaciones.sort((a, b) => b.ts - a.ts)
  op.sembrado = hoy
  limpiarOperacion(op, now)
  db.operacion = op
  return db
}
