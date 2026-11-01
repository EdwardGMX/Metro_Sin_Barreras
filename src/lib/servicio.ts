/**
 * Reportes de servicio, tickets entre áreas y tareas del jefe de estación (RN11 a RN14).
 *
 * - Las personas usuarias reportan con opciones predefinidas (sin texto libre, RF-16) otros
 *   problemas además de los equipos: limpieza, seguridad, señalización accesible, trato y aglomeración.
 * - La Mesa de atención (Gerencia de Atención al Usuario) agrupa los reportes iguales y los turna
 *   como ticket al área responsable. Cualquier cuenta del personal puede levantar un ticket a
 *   cualquier área; las personas usuarias no: sus reportes son la entrada de la mesa (RN11).
 * - Asigna la mesa o quien encarga el área; quien resolvió no cierra su propio ticket (RN9, RN12).
 * - El jefe de estación asigna tareas solo al personal de su estación; a otras áreas les levanta
 *   un ticket (RN13).
 * - La persona que reportó confirma si se resolvió; si dice que sigue, el ticket se reabre (RN14).
 *
 * En producción estas colecciones viven en Firestore detrás de la API; aquí, en el navegador.
 */
import { allStations } from "../data/metroData"
import { actor, alcanzaEstacion, auditar, exigir, puede, type Cuenta, type EstadoConsola, type Resultado, type RolId } from "./admin"
import { isoDia, operacionDe, personaDeCuenta, personaPorId, personasDe, ESTACIONES_PILOTO, type Persona, type Puesto } from "./operacion"
import { LIMITE_DIARIO, registrarEvento, VENTANA_DUPLICADO, VERSION_AVISO, type BaseDatos } from "./reports"

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

/* ------------------------------------------------------------------ */
/* Áreas y catálogos                                                   */
/* ------------------------------------------------------------------ */

export type AreaId = "estacion" | "limpieza" | "seguridad" | "mantenimiento" | "atencion" | "sistemas"
export type Prioridad = "alta" | "media" | "baja"

export type Area = {
  id: AreaId
  nombre: string
  unidad: string
  /** Roles que encargan el área: ven sus tickets y los asignan. La Mesa de atención puede con todas. */
  encargan: RolId[]
  /** Asuntos predefinidos para levantar un ticket a esta área. */
  asuntos: string[]
}

export const AREAS: Record<AreaId, Area> = {
  estacion: {
    id: "estacion",
    nombre: "Operación de la estación",
    unidad: "Jefatura de estación, bajo la Gerencia de Líneas que la atiende",
    encargan: ["jefe_estacion"],
    asuntos: ["Apoyo de personal en un punto de la estación", "Colocar aviso para personas usuarias", "Informar ruta alterna en taquilla", "Puerta de cortesía sin personal"],
  },
  limpieza: {
    id: "limpieza",
    nombre: "Limpieza",
    unidad: "Servicio de limpieza de la estación, supervisado por la jefatura (el Estatuto no nombra la unidad; por validar con el STC)",
    encargan: ["jefe_estacion"],
    asuntos: ["Derrame o piso resbaloso", "Basura acumulada", "Sanitario sucio o sin insumos", "Limpiar la guía táctil"],
  },
  seguridad: {
    id: "seguridad",
    nombre: "Seguridad",
    unidad: "Gerencia de Seguridad Institucional · Policía auxiliar de la estación",
    encargan: ["jefe_estacion"],
    asuntos: ["Rondín adicional de vigilancia", "Comercio o bloqueo en pasillo", "Persona en situación de riesgo", "Control de acceso por aglomeración"],
  },
  mantenimiento: {
    id: "mantenimiento",
    nombre: "Mantenimiento",
    unidad: "Subdirección General de Mantenimiento › Dirección de Instalaciones Fijas",
    encargan: ["mantenimiento"],
    asuntos: ["Luminaria apagada", "Filtración de agua", "Guía táctil dañada o bloqueada", "Señalética en braille faltante o dañada", "Aviso sonoro o visual no funciona"],
  },
  atencion: {
    id: "atencion",
    nombre: "Atención al usuario",
    unidad: "Dirección de Medios › Gerencia de Atención al Usuario",
    encargan: ["moderacion"],
    asuntos: ["Queja de una persona usuaria", "Información incorrecta en la app", "Seguimiento a una persona que pidió apoyo"],
  },
  sistemas: {
    id: "sistemas",
    nombre: "Sistemas",
    unidad: "Gerencia de Organización y Sistemas (soporte de la plataforma; sus tickets los asigna la Mesa)",
    encargan: [],
    asuntos: ["La app o la consola no responde", "Cuenta bloqueada o sin acceso", "Dato incorrecto en el mapa"],
  },
}
export const ORDEN_AREAS: AreaId[] = ["estacion", "limpieza", "seguridad", "mantenimiento", "atencion", "sistemas"]

export type CategoriaId = "limpieza" | "seguridad" | "senalizacion" | "trato" | "aglomeracion"
export type Problema = { id: string; texto: string; area: AreaId; prioridad: Prioridad }
export type Categoria = { id: CategoriaId; nombre: string; ayuda: string; problemas: Problema[] }

/** Lo que una persona usuaria puede reportar además de los equipos. Solo opciones predefinidas (RF-16). */
export const CATEGORIAS: Record<CategoriaId, Categoria> = {
  limpieza: {
    id: "limpieza",
    nombre: "Limpieza",
    ayuda: "Derrames, basura o sanitarios",
    problemas: [
      { id: "derrame", texto: "Derrame o piso resbaloso", area: "limpieza", prioridad: "alta" },
      { id: "basura", texto: "Basura acumulada", area: "limpieza", prioridad: "media" },
      { id: "sanitario", texto: "Sanitario sucio o sin insumos", area: "limpieza", prioridad: "baja" },
    ],
  },
  seguridad: {
    id: "seguridad",
    nombre: "Seguridad",
    ayuda: "Zonas oscuras, bloqueos o algo que te hizo sentir en riesgo",
    problemas: [
      { id: "iluminacion", texto: "Zona con poca iluminación", area: "mantenimiento", prioridad: "media" },
      { id: "bloqueo", texto: "Comercio o bloqueo en pasillo", area: "seguridad", prioridad: "media" },
      { id: "riesgo", texto: "Me sentí en riesgo en esta zona", area: "seguridad", prioridad: "alta" },
    ],
  },
  senalizacion: {
    id: "senalizacion",
    nombre: "Señalización accesible",
    ayuda: "Guía táctil, braille, avisos sonoros o visuales",
    problemas: [
      { id: "guia", texto: "Guía táctil dañada o bloqueada", area: "mantenimiento", prioridad: "alta" },
      { id: "braille", texto: "Señalética en braille faltante o dañada", area: "mantenimiento", prioridad: "media" },
      { id: "avisos", texto: "Aviso sonoro o visual no funciona", area: "mantenimiento", prioridad: "media" },
      { id: "ruta_alterna", texto: "La ruta alterna indicada es incorrecta", area: "estacion", prioridad: "media" },
    ],
  },
  trato: {
    id: "trato",
    nombre: "Atención del personal",
    ayuda: "Apoyo que no llegó o trato inadecuado",
    problemas: [
      { id: "sin_apoyo", texto: "No recibí el apoyo que pedí", area: "atencion", prioridad: "alta" },
      { id: "cortesia", texto: "No me abrieron la puerta de cortesía", area: "estacion", prioridad: "alta" },
      { id: "trato", texto: "Trato inadecuado del personal", area: "atencion", prioridad: "media" },
    ],
  },
  aglomeracion: {
    id: "aglomeracion",
    nombre: "Aglomeración",
    ayuda: "Andenes o filas sin control",
    problemas: [
      { id: "anden", texto: "Andén saturado sin control", area: "seguridad", prioridad: "alta" },
      { id: "fila_elevador", texto: "Fila muy larga para el elevador", area: "estacion", prioridad: "media" },
    ],
  },
}
export const ORDEN_CATEGORIAS: CategoriaId[] = ["limpieza", "seguridad", "senalizacion", "trato", "aglomeracion"]

export const LUGARES = ["Acceso de calle", "Taquilla o torniquetes", "Pasillo", "Andén", "Transbordo entre líneas", "Elevador o salvaescaleras", "Sanitarios"]

export const problemaPorId = (categoria: CategoriaId, id: string) => CATEGORIAS[categoria]?.problemas.find((p) => p.id === id)

/** Plazo para resolver un ticket según su prioridad (propuesta del equipo, por validar con el STC). */
export const PLAZO_TICKET: Record<Prioridad, number> = { alta: 4 * HORA, media: 24 * HORA, baja: 72 * HORA }
/** Una tarea se considera atrasada 30 minutos después de su hora. */
export const TOLERANCIA_TAREA = 30 * MIN

export const PRIORIDAD_LABEL: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" }

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type EstadoTicket = "nuevo" | "asignado" | "en_proceso" | "resuelto" | "cerrado"
export const ESTADO_TICKET_LABEL: Record<EstadoTicket, string> = {
  nuevo: "Sin asignar",
  asignado: "Asignado",
  en_proceso: "En proceso",
  resuelto: "Resuelto, por cerrar",
  cerrado: "Cerrado",
}
export const ESTADO_TAREA_LABEL: Record<EstadoTicket, string> = {
  nuevo: "Pendiente",
  asignado: "Pendiente",
  en_proceso: "En curso",
  resuelto: "Hecha",
  cerrado: "Hecha",
}

export type EventoTicket = { ts: number; texto: string; por: string }

export type Ticket = {
  id: string
  /** «tarea»: la asignó el jefe de estación a su personal; «ticket»: va a un área y lo turna su encargado. */
  clase: "ticket" | "tarea"
  area: AreaId
  station: string
  asunto: string
  detalle?: string
  lugar?: string
  prioridad: Prioridad
  estado: EstadoTicket
  origen: "persona_usuaria" | "personal"
  reportes: string[]
  creado: number
  creadoPor: string
  creadoPorCuenta?: string
  /** Minuto del día en que se programa una tarea. */
  hora?: number
  asignadoA?: string
  asignadoNombre?: string
  asignado?: number
  iniciado?: number
  resuelto?: number
  resueltoPor?: string
  cerrado?: number
  cerradoPor?: string
  reabierto?: number
  historial: EventoTicket[]
  demo?: boolean
}

export type ReporteServicio = {
  id: string
  station: string
  categoria: CategoriaId
  problema: string
  lugar: string
  ts: number
  seudonimo: string
  verificado: boolean
  ticketId?: string
  /** Respuesta de la persona cuando el ticket se resolvió (RN14). */
  respuesta?: { ts: number; resuelto: boolean }
  demo?: boolean
}

export type Servicio = { sembrado: string; reportes: ReporteServicio[]; tickets: Ticket[] }

export const servicioVacio = (): Servicio => ({ sembrado: "", reportes: [], tickets: [] })
export const servicioDe = (db: BaseDatos): Servicio => db.servicio ?? servicioVacio()
function asegurar(db: BaseDatos): Servicio {
  if (!db.servicio) db.servicio = servicioVacio()
  return db.servicio
}

const siguienteFolio = (prefijo: string, existentes: string[], base: number) => {
  const nums = existentes.filter((x) => x.startsWith(prefijo)).map((x) => Number(x.slice(prefijo.length)) || 0)
  return `${prefijo}${String(Math.max(base, ...nums) + 1).padStart(4, "0")}`
}

const medianoche = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/* ------------------------------------------------------------------ */
/* Quién recibe cada ticket                                            */
/* ------------------------------------------------------------------ */

export type Asignable = { id: string; nombre: string; puesto: string }

/** Personal que no depende de una estación (ficticio, de demostración). */
export const PERSONAL_DE_AREA: Partial<Record<AreaId, Asignable[]>> = {
  mantenimiento: [
    { id: "T-DIEGO", nombre: "Diego Herrera Campos", puesto: "Técnico electromecánico" },
    { id: "T-MARIANA", nombre: "Mariana Cortés Ibáñez", puesto: "Técnica de instalaciones fijas" },
    { id: "T-ALEJANDRA", nombre: "Alejandra Torres Luna", puesto: "Supervisora de mantenimiento" },
  ],
  atencion: [
    { id: "A-PATRICIA", nombre: "Patricia Olvera Fuentes", puesto: "Mesa de atención" },
    { id: "A-SAMUEL", nombre: "Samuel Rangel Díaz", puesto: "Atención al usuario" },
  ],
  sistemas: [{ id: "S-HECTOR", nombre: "Héctor Salas Rivas", puesto: "Soporte de sistemas" }],
}

/** Puestos de la estación que atienden cada área. */
const PUESTOS_DE_AREA: Partial<Record<AreaId, Puesto[]>> = {
  estacion: ["Personal de estación", "Jefe(a) de estación"],
  limpieza: ["Personal de limpieza"],
  seguridad: ["Policía auxiliar"],
}

/** Área a la que pertenece el personal de la estación según su puesto. */
export const AREA_DE_PUESTO: Record<Puesto, AreaId> = {
  "Jefe(a) de estación": "estacion",
  "Personal de estación": "estacion",
  "Policía auxiliar": "seguridad",
  "Personal de limpieza": "limpieza",
}

export function asignables(db: BaseDatos, area: AreaId, station: string): Asignable[] {
  const puestos = PUESTOS_DE_AREA[area]
  if (puestos) return personasDe(operacionDe(db), station).filter((p) => puestos.includes(p.puesto)).map((p) => ({ id: p.id, nombre: p.nombre, puesto: p.puesto }))
  return PERSONAL_DE_AREA[area] ?? []
}

/** Identificador de la persona que corresponde a una cuenta, para saber qué tiene asignado. */
export function idPersonal(db: BaseDatos, c: Cuenta): string {
  for (const lista of Object.values(PERSONAL_DE_AREA)) {
    const p = lista?.find((x) => x.nombre === c.nombre)
    if (p) return p.id
  }
  return personaDeCuenta(operacionDe(db), c).id
}

export function nombreDe(db: BaseDatos, id: string | undefined): string {
  if (!id) return ""
  const p = personaPorId(operacionDe(db), id)
  if (p) return p.nombre
  for (const lista of Object.values(PERSONAL_DE_AREA)) {
    const x = lista?.find((y) => y.id === id)
    if (x) return x.nombre
  }
  return id
}

/** ¿La cuenta encarga esta área en esta estación? La Mesa de atención encarga todas (RN12). */
export function encargaArea(c: Cuenta, area: AreaId, station: string, now: number): boolean {
  if (puede(c, "tickets.gestionar", now)) return true
  if (!puede(c, "tickets.asignar", now)) return false
  return AREAS[area].encargan.some((r) => c.roles.includes(r)) && alcanzaEstacion(c, station)
}

/** Áreas que encarga una cuenta (para filtrar su bandeja). */
export function areasQueEncarga(c: Cuenta, now: number): AreaId[] {
  if (puede(c, "tickets.gestionar", now)) return [...ORDEN_AREAS]
  if (!puede(c, "tickets.asignar", now)) return []
  return ORDEN_AREAS.filter((a) => AREAS[a].encargan.some((r) => c.roles.includes(r)))
}

/* ------------------------------------------------------------------ */
/* Plazos y etapas                                                     */
/* ------------------------------------------------------------------ */

export function vencimiento(t: Ticket): number {
  if (t.clase === "tarea" && t.hora !== undefined) return medianoche(t.creado) + t.hora * MIN + TOLERANCIA_TAREA
  return t.creado + PLAZO_TICKET[t.prioridad]
}
export const abierto = (t: Ticket) => t.estado !== "resuelto" && t.estado !== "cerrado"
export const fueraDePlazo = (t: Ticket, now: number) => (t.resuelto ?? now) > vencimiento(t)
/** Fracción del plazo usada (0 a 1, puede pasar de 1). */
export function plazoUsado(t: Ticket, now: number): number {
  const total = vencimiento(t) - t.creado
  return total > 0 ? ((t.resuelto ?? now) - t.creado) / total : 1
}
export const ETAPAS_TICKET: EstadoTicket[] = ["nuevo", "asignado", "en_proceso", "resuelto", "cerrado"]
export const etapaTicket = (t: Ticket) => ETAPAS_TICKET.indexOf(t.estado)

/* ------------------------------------------------------------------ */
/* Persona usuaria: reportar y dar seguimiento                         */
/* ------------------------------------------------------------------ */

export type DatosReporteServicio = { station: string; categoria: CategoriaId; problema: string; lugar: string }
export type ResultadoReporte = { ok: true; codigo: 201; reporte: ReporteServicio; mensaje: string } | { ok: false; codigo: 400 | 401 | 429; mensaje: string }

/** Equivalente a POST /api/v1/reportes-servicio. Comparte el límite diario con los reportes de equipos (RN5). */
export function reportarServicio(db: BaseDatos, sesion: { seudonimo: string; expira: number } | null, d: DatosReporteServicio, now: number): ResultadoReporte {
  if (!sesion || sesion.expira < now) return { ok: false, codigo: 401, mensaje: "Tu sesión no es válida o venció. Inicia sesión con Llave CDMX para reportar." }
  const problema = problemaPorId(d.categoria, d.problema)
  if (!problema) return { ok: false, codigo: 400, mensaje: "Elige qué pasó entre las opciones." }
  if (!allStations.includes(d.station)) return { ok: false, codigo: 400, mensaje: "Elige una estación de la lista." }
  if (!LUGARES.includes(d.lugar)) return { ok: false, codigo: 400, mensaje: "Elige en qué parte de la estación fue." }
  const sv = asegurar(db)
  const seud = sesion.seudonimo
  const hoy = db.reportes.filter((r) => r.seudonimo === seud && now - r.ts < DIA).length + sv.reportes.filter((r) => r.seudonimo === seud && now - r.ts < DIA).length
  if (hoy >= LIMITE_DIARIO) return { ok: false, codigo: 429, mensaje: `Llegaste al límite de ${LIMITE_DIARIO} reportes por día. Podrás reportar de nuevo mañana.` }
  if (sv.reportes.some((r) => r.seudonimo === seud && r.station === d.station && r.problema === d.problema && now - r.ts < VENTANA_DUPLICADO))
    return { ok: false, codigo: 429, mensaje: "Ya reportaste esto en esta estación en las últimas 2 horas. Tu reporte anterior sigue en seguimiento." }

  const verificado = Boolean(db.usuarios[seud]?.verificado)
  const reporte: ReporteServicio = { id: siguienteFolio("RS-", sv.reportes.map((r) => r.id), 200), station: d.station, categoria: d.categoria, problema: d.problema, lugar: d.lugar, ts: now, seudonimo: seud, verificado }
  // Si ya hay un ticket abierto por lo mismo en esa estación, el reporte se suma a él.
  const existente = sv.tickets.find((t) => t.clase === "ticket" && abierto(t) && t.station === d.station && t.asunto === problema.texto)
  if (existente) {
    reporte.ticketId = existente.id
    existente.reportes.push(reporte.id)
    existente.historial.push({ ts: now, texto: "Otra persona usuaria reportó lo mismo", por: "Sistema" })
  }
  sv.reportes.unshift(reporte)
  registrarEvento(db, { evento: "reporte de servicio recibido", objeto: `${reporte.id} · ${d.station}`, decision: existente ? `sumado a ${existente.id}` : "en la Mesa de atención", rol: "sistema" }, now)
  return {
    ok: true,
    codigo: 201,
    reporte,
    mensaje: existente
      ? `Recibimos tu reporte ${reporte.id}. Ya había un ticket por lo mismo; tu reporte se sumó a él.`
      : `Recibimos tu reporte ${reporte.id}. La Mesa de atención lo turnará al área responsable.`,
  }
}

export type Seguimiento = {
  /** 0 Recibido, 1 Turnado, 2 En atención, 3 Solucionado. */
  etapa: 0 | 1 | 2 | 3
  mensaje: string
  pideConfirmacion: boolean
  solucionado: boolean
  area?: AreaId
  ticket?: Ticket
}
export const ETAPAS_CIUDADANAS = ["Recibido", "Turnado al área", "En atención", "Solucionado"]

export function seguimientoServicio(db: BaseDatos, r: ReporteServicio): Seguimiento {
  const t = r.ticketId ? servicioDe(db).tickets.find((x) => x.id === r.ticketId) : undefined
  if (!t) return { etapa: 0, mensaje: "La Mesa de atención revisará tu reporte y lo turnará al área responsable.", pideConfirmacion: false, solucionado: false }
  const area = AREAS[t.area].nombre
  if (t.estado === "nuevo") return { etapa: 1, mensaje: `Se turnó a ${area}. Pronto lo asignarán a una persona.`, pideConfirmacion: false, solucionado: false, area: t.area, ticket: t }
  if (t.estado === "asignado" || t.estado === "en_proceso")
    return {
      etapa: 2,
      mensaje: t.reabierto && r.respuesta && !r.respuesta.resuelto ? `Nos dijiste que el problema sigue. ${area} lo atiende de nuevo.` : `${area} lo está atendiendo.`,
      pideConfirmacion: false,
      solucionado: false,
      area: t.area,
      ticket: t,
    }
  const pide = !r.respuesta || r.respuesta.ts < (t.resuelto ?? 0)
  return {
    etapa: 3,
    mensaje: pide ? `${area} indica que ya quedó. ¿Nos confirmas si se resolvió?` : r.respuesta?.resuelto ? "Confirmaste que se resolvió. Gracias." : "Se resolvió.",
    pideConfirmacion: pide && t.estado === "resuelto",
    solucionado: true,
    area: t.area,
    ticket: t,
  }
}

/** La persona confirma si se resolvió (RN14). Si sigue, el ticket vuelve a quien lo atendía. */
export function confirmarSolucion(db: BaseDatos, seudonimo: string, reporteId: string, resuelto: boolean, now: number): { ok: boolean; mensaje: string } {
  const sv = asegurar(db)
  const r = sv.reportes.find((x) => x.id === reporteId && x.seudonimo === seudonimo)
  if (!r) return { ok: false, mensaje: "No encontramos ese reporte en tu cuenta." }
  const t = sv.tickets.find((x) => x.id === r.ticketId)
  if (!t || t.estado !== "resuelto") return { ok: false, mensaje: "Este reporte todavía no está marcado como resuelto." }
  r.respuesta = { ts: now, resuelto }
  if (resuelto) {
    t.estado = "cerrado"
    t.cerrado = now
    t.cerradoPor = "Persona usuaria (confirmó)"
    t.historial.push({ ts: now, texto: "La persona usuaria confirmó que se resolvió", por: "Persona usuaria" })
  } else {
    t.estado = t.asignadoA ? "asignado" : "nuevo"
    t.reabierto = now
    t.resuelto = undefined
    t.resueltoPor = undefined
    t.iniciado = undefined
    t.historial.push({ ts: now, texto: "La persona usuaria indicó que el problema sigue: se reabrió", por: "Persona usuaria" })
  }
  registrarEvento(db, { evento: "confirmación de la persona usuaria", objeto: `${r.id} · ${t.id}`, decision: resuelto ? "resuelto" : "sigue: reabierto", rol: "persona usuaria" }, now)
  return { ok: true, mensaje: resuelto ? "Gracias por confirmar. Cerramos el ticket." : "Gracias por avisar. Reabrimos el ticket y el área lo atenderá de nuevo." }
}

/* ------------------------------------------------------------------ */
/* Mesa de atención: reportes por turnar                               */
/* ------------------------------------------------------------------ */

export type GrupoPorTurnar = { clave: string; station: string; categoria: CategoriaId; problema: Problema; lugar: string; reportes: ReporteServicio[]; desde: number; verificadas: number; prioridad: Prioridad }

/** Reportes sin ticket, agrupados por estación y problema. La prioridad sube si 3 o más personas reportan lo mismo. */
export function porTurnar(db: BaseDatos, now: number, stations?: string[]): GrupoPorTurnar[] {
  const grupos = new Map<string, GrupoPorTurnar>()
  for (const r of servicioDe(db).reportes) {
    if (r.ticketId || r.ts > now) continue
    if (stations && !stations.includes(r.station)) continue
    const problema = problemaPorId(r.categoria, r.problema)
    if (!problema) continue
    const clave = `${r.station}|${r.problema}`
    const g = grupos.get(clave) ?? { clave, station: r.station, categoria: r.categoria, problema, lugar: r.lugar, reportes: [], desde: r.ts, verificadas: 0, prioridad: problema.prioridad }
    g.reportes.push(r)
    g.desde = Math.min(g.desde, r.ts)
    if (r.verificado) g.verificadas++
    grupos.set(clave, g)
  }
  for (const g of grupos.values()) {
    const personas = new Set(g.reportes.map((r) => r.seudonimo)).size
    if (personas >= 3 && g.prioridad !== "alta") g.prioridad = g.prioridad === "baja" ? "media" : "alta"
  }
  return [...grupos.values()].sort((a, b) => (a.prioridad === b.prioridad ? a.desde - b.desde : a.prioridad === "alta" ? -1 : b.prioridad === "alta" ? 1 : a.prioridad === "media" ? -1 : 1))
}

const negar = (e: EstadoConsola, quien: Cuenta, accion: string, objeto: string, mensaje: string, now: number): Resultado => {
  auditar(e, { ...actor(quien), accion: `intento: ${accion}`, objeto, resultado: "denegado", detalle: "403" }, now)
  return { ok: false, codigo: 403, mensaje }
}

/** La Mesa convierte un grupo de reportes en un ticket para el área responsable. */
export function turnarReportes(db: BaseDatos, e: EstadoConsola, quien: Cuenta, reporteIds: string[], area: AreaId, prioridad: Prioridad, now: number): Resultado {
  const negado = exigir(e, quien, "tickets.gestionar", reporteIds.join(", "), now)
  if (negado) return negado
  const sv = asegurar(db)
  const reportes = sv.reportes.filter((r) => reporteIds.includes(r.id))
  if (reportes.length === 0 || reportes.length !== reporteIds.length) return { ok: false, codigo: 400, mensaje: "No encontramos esos reportes." }
  if (reportes.some((r) => r.ticketId)) return { ok: false, codigo: 409, mensaje: "Alguno de esos reportes ya se turnó." }
  if (new Set(reportes.map((r) => `${r.station}|${r.problema}`)).size > 1) return { ok: false, codigo: 400, mensaje: "Solo se turnan juntos reportes de la misma estación y el mismo problema." }
  if (!AREAS[area]) return { ok: false, codigo: 400, mensaje: "Elige un área." }
  const r0 = reportes[0]
  const problema = problemaPorId(r0.categoria, r0.problema)!
  const id = siguienteFolio("TK-", sv.tickets.map((t) => t.id), 100)
  const personas = new Set(reportes.map((r) => r.seudonimo)).size
  sv.tickets.unshift({
    id,
    clase: "ticket",
    area,
    station: r0.station,
    asunto: problema.texto,
    lugar: r0.lugar,
    prioridad,
    estado: "nuevo",
    origen: "persona_usuaria",
    reportes: reportes.map((r) => r.id),
    creado: now,
    creadoPor: quien.nombre,
    creadoPorCuenta: quien.id,
    historial: [{ ts: now, texto: `Turnado a ${AREAS[area].nombre} desde ${personas} ${personas === 1 ? "reporte" : "reportes"} de personas usuarias`, por: quien.nombre }],
  })
  for (const r of reportes) r.ticketId = id
  auditar(e, { ...actor(quien), accion: "turnar reportes", objeto: `${id} · ${r0.station}`, resultado: "permitido", detalle: `${AREAS[area].nombre}, prioridad ${prioridad}` }, now)
  return { ok: true, mensaje: `Se creó el ticket ${id} para ${AREAS[area].nombre}.` }
}

/* ------------------------------------------------------------------ */
/* Tickets entre áreas                                                 */
/* ------------------------------------------------------------------ */

export type DatosTicket = { area: AreaId; station: string; asunto: string; detalle: string; prioridad: Prioridad; lugar?: string }

export function validarTicket(d: DatosTicket): string | null {
  if (!AREAS[d.area]) return "Elige el área que debe atenderlo."
  if (!allStations.includes(d.station)) return "Elige una estación de la lista."
  if (!d.asunto.trim()) return "Escribe o elige el asunto."
  if (d.asunto.trim().length > 80) return "El asunto debe tener 80 caracteres o menos."
  if (d.detalle.trim().length > 200) return "Las indicaciones deben tener 200 caracteres o menos."
  if (d.lugar && !LUGARES.includes(d.lugar)) return "Elige un lugar de la lista."
  return null
}

/** Cualquier cuenta del personal levanta un ticket a cualquier área, en las estaciones que alcanza (RN11, RN8). */
export function levantarTicket(db: BaseDatos, e: EstadoConsola, quien: Cuenta, d: DatosTicket, now: number): Resultado {
  const negado = exigir(e, quien, "tickets.levantar", `${d.area} · ${d.station}`, now)
  if (negado) return negado
  if (!alcanzaEstacion(quien, d.station)) return negar(e, quien, "levantar ticket", d.station, "Solo levantas tickets de las estaciones a tu cargo.", now)
  const error = validarTicket(d)
  if (error) return { ok: false, codigo: 400, mensaje: error }
  const sv = asegurar(db)
  const id = siguienteFolio("TK-", sv.tickets.map((t) => t.id), 100)
  sv.tickets.unshift({
    id,
    clase: "ticket",
    area: d.area,
    station: d.station,
    asunto: d.asunto.trim(),
    detalle: d.detalle.trim() || undefined,
    lugar: d.lugar,
    prioridad: d.prioridad,
    estado: "nuevo",
    origen: "personal",
    reportes: [],
    creado: now,
    creadoPor: quien.nombre,
    creadoPorCuenta: quien.id,
    historial: [{ ts: now, texto: `Ticket levantado para ${AREAS[d.area].nombre}`, por: quien.nombre }],
  })
  auditar(e, { ...actor(quien), accion: "levantar ticket", objeto: `${id} · ${d.station}`, resultado: "permitido", detalle: AREAS[d.area].nombre }, now)
  return { ok: true, mensaje: `Levantaste el ticket ${id} para ${AREAS[d.area].nombre}.` }
}

const buscar = (db: BaseDatos, id: string) => servicioDe(db).tickets.find((t) => t.id === id)

export function asignarTicket(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, personaId: string, now: number): Resultado {
  const t = buscar(db, id)
  if (!t) return { ok: false, codigo: 400, mensaje: "No encontramos ese ticket." }
  if (t.estado === "cerrado") return { ok: false, codigo: 409, mensaje: "El ticket ya está cerrado." }
  const tarea = t.clase === "tarea"
  const permitido = tarea ? puede(quien, "tareas.asignar", now) && alcanzaEstacion(quien, t.station) : encargaArea(quien, t.area, t.station, now)
  if (!permitido) return negar(e, quien, "asignar ticket", id, tarea ? "Solo el jefe o jefa de la estación reasigna sus tareas." : `Asigna la Mesa de atención o quien encarga ${AREAS[t.area].nombre}.`, now)
  const persona = asignables(db, t.area, t.station).find((p) => p.id === personaId)
  if (!persona) return { ok: false, codigo: 400, mensaje: `Esa persona no atiende ${AREAS[t.area].nombre} en ${t.station}.` }
  t.asignadoA = persona.id
  t.asignadoNombre = persona.nombre
  t.asignado = now
  if (t.estado === "nuevo" || t.estado === "resuelto") t.estado = "asignado"
  t.historial.push({ ts: now, texto: `Asignado a ${persona.nombre}`, por: quien.nombre })
  auditar(e, { ...actor(quien), accion: tarea ? "reasignar tarea" : "asignar ticket", objeto: id, resultado: "permitido", detalle: persona.nombre }, now)
  return { ok: true, mensaje: `${id} quedó asignado a ${persona.nombre}.` }
}

export function cambiarPrioridad(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, prioridad: Prioridad, now: number): Resultado {
  const t = buscar(db, id)
  if (!t) return { ok: false, codigo: 400, mensaje: "No encontramos ese ticket." }
  if (!encargaArea(quien, t.area, t.station, now)) return negar(e, quien, "cambiar prioridad", id, "Solo la Mesa o quien encarga el área cambia la prioridad.", now)
  if (t.prioridad === prioridad) return { ok: true, mensaje: "La prioridad no cambió." }
  t.historial.push({ ts: now, texto: `Prioridad ${PRIORIDAD_LABEL[t.prioridad].toLowerCase()} → ${PRIORIDAD_LABEL[prioridad].toLowerCase()}`, por: quien.nombre })
  t.prioridad = prioridad
  auditar(e, { ...actor(quien), accion: "cambiar prioridad", objeto: id, resultado: "permitido", detalle: prioridad }, now)
  return { ok: true, mensaje: `La prioridad de ${id} ahora es ${PRIORIDAD_LABEL[prioridad].toLowerCase()}.` }
}

/** Quien tiene el ticket asignado lo inicia y lo resuelve; quien encarga el área también puede hacerlo. */
export function avanzarTicket(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, paso: "en_proceso" | "resuelto", nota: string, now: number): Resultado {
  const t = buscar(db, id)
  if (!t) return { ok: false, codigo: 400, mensaje: "No encontramos ese ticket." }
  const propio = t.asignadoA !== undefined && t.asignadoA === idPersonal(db, quien)
  const encarga = t.clase === "tarea" ? puede(quien, "tareas.asignar", now) && alcanzaEstacion(quien, t.station) : encargaArea(quien, t.area, t.station, now)
  if (!propio && !encarga) return negar(e, quien, "avanzar ticket", id, "Solo la persona asignada o quien encarga el área lo actualiza.", now)
  if (!t.asignadoA) return { ok: false, codigo: 409, mensaje: "Primero asígnalo a una persona." }
  if (nota.trim().length > 200) return { ok: false, codigo: 400, mensaje: "La nota debe tener 200 caracteres o menos." }
  if (paso === "en_proceso") {
    if (t.estado !== "asignado") return { ok: false, codigo: 409, mensaje: "Solo se inicia lo que está asignado." }
    t.estado = "en_proceso"
    t.iniciado = now
    t.historial.push({ ts: now, texto: t.clase === "tarea" ? "Tarea iniciada" : "Atención iniciada", por: quien.nombre })
  } else {
    if (t.estado !== "asignado" && t.estado !== "en_proceso") return { ok: false, codigo: 409, mensaje: "Ese ticket no está en atención." }
    t.estado = "resuelto"
    t.resuelto = now
    t.resueltoPor = quien.nombre
    t.historial.push({ ts: now, texto: (t.clase === "tarea" ? "Tarea hecha" : "Marcado como resuelto") + (nota.trim() ? `: ${nota.trim()}` : ""), por: quien.nombre })
  }
  auditar(e, { ...actor(quien), accion: paso === "en_proceso" ? "iniciar atención" : t.clase === "tarea" ? "terminar tarea" : "resolver ticket", objeto: id, resultado: "permitido" }, now)
  return { ok: true, mensaje: paso === "en_proceso" ? `Iniciaste ${id}.` : t.clase === "tarea" ? `Marcaste ${id} como hecha.` : `Marcaste ${id} como resuelto. Lo cierra quien lo levantó o la Mesa.` }
}

/** Cierra un ticket resuelto. Quien lo resolvió no puede cerrarlo (RN9). */
export function cerrarTicket(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const t = buscar(db, id)
  if (!t) return { ok: false, codigo: 400, mensaje: "No encontramos ese ticket." }
  if (t.estado !== "resuelto") return { ok: false, codigo: 409, mensaje: "Solo se cierra un ticket resuelto." }
  const creador = t.creadoPorCuenta === quien.id
  if (!creador && !encargaArea(quien, t.area, t.station, now)) return negar(e, quien, "cerrar ticket", id, "Cierra quien lo levantó, la Mesa o quien encarga el área.", now)
  if (t.resueltoPor === quien.nombre) {
    auditar(e, { ...actor(quien), accion: "intento: cerrar su propio ticket", objeto: id, resultado: "denegado", detalle: "409 separación de funciones" }, now)
    return { ok: false, codigo: 409, mensaje: "Quien resolvió el ticket no lo cierra: lo revisa otra persona (separación de funciones)." }
  }
  t.estado = "cerrado"
  t.cerrado = now
  t.cerradoPor = quien.nombre
  t.historial.push({ ts: now, texto: "Cerrado después de revisar", por: quien.nombre })
  auditar(e, { ...actor(quien), accion: "cerrar ticket", objeto: id, resultado: "permitido" }, now)
  return { ok: true, mensaje: `Cerraste ${id}.` }
}

export function reabrirTicket(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const t = buscar(db, id)
  if (!t) return { ok: false, codigo: 400, mensaje: "No encontramos ese ticket." }
  if (t.estado !== "resuelto") return { ok: false, codigo: 409, mensaje: "Solo se reabre un ticket resuelto que no ha cerrado." }
  const creador = t.creadoPorCuenta === quien.id
  const encarga = t.clase === "tarea" ? puede(quien, "tareas.asignar", now) && alcanzaEstacion(quien, t.station) : encargaArea(quien, t.area, t.station, now)
  if (!creador && !encarga) return negar(e, quien, "reabrir ticket", id, "Reabre quien lo levantó, la Mesa o quien encarga el área.", now)
  t.estado = t.asignadoA ? "asignado" : "nuevo"
  t.reabierto = now
  t.resuelto = undefined
  t.resueltoPor = undefined
  t.iniciado = undefined
  t.historial.push({ ts: now, texto: "Reabierto: no quedó resuelto", por: quien.nombre })
  auditar(e, { ...actor(quien), accion: "reabrir ticket", objeto: id, resultado: "permitido" }, now)
  return { ok: true, mensaje: `Reabriste ${id}.` }
}

/* ------------------------------------------------------------------ */
/* Tareas del jefe de estación                                         */
/* ------------------------------------------------------------------ */

/** Tareas predefinidas por área del personal de la estación; también se puede escribir otra. */
export const TAREAS_SUGERIDAS: Partial<Record<AreaId, string[]>> = {
  seguridad: ["Rondín de vigilancia en andenes", "Vigilar el acceso con el elevador fuera de servicio", "Apoyar el ascenso en el transbordo", "Ordenar la fila en torniquetes"],
  estacion: ["Colocar aviso de equipo fuera de servicio", "Verificar en sitio un reporte", "Informar ruta alterna en taquilla", "Revisar la guía táctil del acceso"],
  limpieza: ["Limpiar derrame en escalera", "Limpiar sanitarios", "Retirar basura del andén", "Limpiar la guía táctil"],
}

export type DatosTarea = { station: string; personaId: string; asunto: string; detalle: string; hora: number; prioridad: Prioridad }

/** El jefe asigna tareas solo a su personal (seguridad, estación, limpieza). Otras áreas reciben un ticket (RN13). */
export function crearTarea(db: BaseDatos, e: EstadoConsola, quien: Cuenta, d: DatosTarea, now: number): Resultado {
  const negado = exigir(e, quien, "tareas.asignar", d.station, now)
  if (negado) return negado
  if (!alcanzaEstacion(quien, d.station)) return negar(e, quien, "asignar tarea", d.station, "Solo asignas tareas en tu estación.", now)
  const persona = personasDe(operacionDe(db), d.station).find((p) => p.id === d.personaId)
  if (!persona || persona.puesto === "Jefe(a) de estación") return { ok: false, codigo: 400, mensaje: "Las tareas son para el personal de tu estación. Para Mantenimiento u otras áreas, levanta un ticket." }
  if (!d.asunto.trim() || d.asunto.trim().length > 80) return { ok: false, codigo: 400, mensaje: "Escribe la tarea en 80 caracteres o menos." }
  if (d.detalle.trim().length > 200) return { ok: false, codigo: 400, mensaje: "Las indicaciones deben tener 200 caracteres o menos." }
  if (!Number.isInteger(d.hora) || d.hora < 0 || d.hora >= 24 * 60) return { ok: false, codigo: 400, mensaje: "Elige una hora válida." }
  const sv = asegurar(db)
  const id = siguienteFolio("TA-", sv.tickets.map((t) => t.id), 500)
  sv.tickets.unshift({
    id,
    clase: "tarea",
    area: AREA_DE_PUESTO[persona.puesto],
    station: d.station,
    asunto: d.asunto.trim(),
    detalle: d.detalle.trim() || undefined,
    prioridad: d.prioridad,
    estado: "asignado",
    origen: "personal",
    reportes: [],
    creado: now,
    creadoPor: quien.nombre,
    creadoPorCuenta: quien.id,
    hora: d.hora,
    asignadoA: persona.id,
    asignadoNombre: persona.nombre,
    asignado: now,
    historial: [{ ts: now, texto: `Tarea asignada a ${persona.nombre}`, por: quien.nombre }],
  })
  auditar(e, { ...actor(quien), accion: "asignar tarea", objeto: `${id} · ${d.station}`, resultado: "permitido", detalle: persona.nombre }, now)
  return { ok: true, mensaje: `Asignaste «${d.asunto.trim()}» a ${persona.nombre}.` }
}

/* ------------------------------------------------------------------ */
/* Jornada del personal                                                */
/* ------------------------------------------------------------------ */

export type Turno = { id: "matutino" | "vespertino"; nombre: string; inicio: number; fin: number }
export const TURNOS: Turno[] = [
  { id: "matutino", nombre: "Matutino", inicio: 6 * 60, fin: 14 * 60 },
  { id: "vespertino", nombre: "Vespertino", inicio: 14 * 60, fin: 22 * 60 },
]

/** En la demostración todo el personal está en el turno en curso (o el más cercano). */
export function turnoEnCurso(now: number): Turno & { dentro: boolean; inicioTs: number; finTs: number } {
  const d = new Date(now)
  const m = d.getHours() * 60 + d.getMinutes()
  const t = m < 14 * 60 ? TURNOS[0] : TURNOS[1]
  const base = medianoche(now)
  return { ...t, dentro: m >= t.inicio && m < t.fin, inicioTs: base + t.inicio * MIN, finTs: base + t.fin * MIN }
}

/** Lo que una persona tiene asignado hoy: tareas del jefe y tickets abiertos de cualquier área. */
export function asignadoA(db: BaseDatos, personaId: string, now: number): Ticket[] {
  const hoy = medianoche(now)
  const deHoy = (t: Ticket) => (t.clase === "tarea" ? medianoche(t.creado) === hoy || abierto(t) : abierto(t) || (t.resuelto ?? 0) >= hoy)
  return servicioDe(db)
    .tickets.filter((t) => t.asignadoA === personaId && deHoy(t))
    .sort((a, b) => horaDe(a) - horaDe(b))
}

/** Minuto del día en que toca: la hora de la tarea o, para un ticket, cuando se asignó. */
export function horaDe(t: Ticket): number {
  if (t.hora !== undefined) return t.hora
  const d = new Date(t.asignado ?? t.creado)
  return d.getHours() * 60 + d.getMinutes()
}

export const atrasada = (t: Ticket, now: number) => abierto(t) && now > vencimiento(t)

/* ------------------------------------------------------------------ */
/* Datos de demostración                                               */
/* ------------------------------------------------------------------ */

/**
 * Seudónimo de la «Cuenta de prueba» (Ana Lucía) (HMAC-SHA-256 de su identificador de prueba con la clave
 * de demostración), para que la vista «Mi cuenta» tenga historial al iniciar sesión con ella.
 */
export const SEUDONIMO_DEMO = "6b2703f452612b69092ef4fb1d390ebc153c4394400c97ef2c84b84c7fc99f79"

export function sembrarServicio(db: BaseDatos, now: number, forzar = false): BaseDatos {
  const hoy = isoDia(now)
  const previo = db.servicio
  if (previo && previo.sembrado === hoy && !forzar) return db
  const sv: Servicio = previo && !forzar ? previo : servicioVacio()
  sv.reportes = sv.reportes.filter((r) => !r.demo)
  sv.tickets = sv.tickets.filter((t) => !t.demo)
  const op = operacionDe(db)
  const p = (station: string, puesto: Puesto, k = 0): Persona | undefined => personasDe(op, station).filter((x) => x.puesto === puesto)[k]
  const turno = turnoEnCurso(now)
  const base = medianoche(now)

  // La cuenta de prueba tiene la Tarjeta Incluyente verificada y dos reportes de equipos.
  if (!db.usuarios[SEUDONIMO_DEMO])
    db.usuarios[SEUDONIMO_DEMO] = { seudonimo: SEUDONIMO_DEMO, nivel: "Llave Verificada", verificado: true, consentimiento: { fecha: now - 20 * DIA, version: VERSION_AVISO }, alta: now - 40 * DIA }
  db.reportes = db.reportes.filter((r) => !r.id.startsWith("R-MSB-DEMO"))
  const propio = (id: string, station: string, equipmentId: string, horas: number) =>
    db.reportes.push({ id, station, equipmentId, estado: "no_funciona", ts: now - horas * HORA, seudonimo: SEUDONIMO_DEMO, verificado: true, evidencias: [], cuarentena: false, moderacion: null })
  propio("R-MSB-DEMO-1", "Tacubaya", "EL-TACUBAYA-01", 3.4)
  propio("R-MSB-DEMO-2", "Pantitlán", "EL-PANTITLAN-05", 19.5 * 24)

  // Reportes de servicio: algunos de la cuenta de prueba y otros de distintas personas.
  const rs = (id: string, station: string, categoria: CategoriaId, problema: string, lugar: string, horas: number, seudonimo: string, verificado = false, ticketId?: string, respuesta?: ReporteServicio["respuesta"]) =>
    sv.reportes.push({ id, station, categoria, problema, lugar, ts: now - horas * HORA, seudonimo, verificado, ticketId, respuesta, demo: true })
  rs("RS-0190", "Hidalgo", "senalizacion", "braille", "Elevador o salvaescaleras", 6 * 24, SEUDONIMO_DEMO, true, "TK-0041", { ts: now - 4 * DIA, resuelto: true })
  rs("RS-0193", "Balderas", "limpieza", "basura", "Andén", 30, "demo-k2", false, "TK-0042")
  rs("RS-0198", "Balderas", "seguridad", "iluminacion", "Pasillo", 28, SEUDONIMO_DEMO, true, "TK-0046")
  rs("RS-0199", "Balderas", "seguridad", "iluminacion", "Pasillo", 27.5, "demo-m4", false, "TK-0046")
  rs("RS-0201", "Tacubaya", "limpieza", "derrame", "Andén", 2.6, SEUDONIMO_DEMO, true, "TK-0051")
  rs("RS-0202", "Tacubaya", "limpieza", "derrame", "Andén", 2.4, "demo-n7", false, "TK-0051")
  rs("RS-0204", "Pantitlán", "trato", "sin_apoyo", "Transbordo entre líneas", 1.2, SEUDONIMO_DEMO, true)
  rs("RS-0205", "Hidalgo", "senalizacion", "avisos", "Andén", 0.9, "demo-p1")
  rs("RS-0206", "Hidalgo", "senalizacion", "avisos", "Andén", 0.6, "demo-p2", true)
  rs("RS-0207", "Hidalgo", "senalizacion", "avisos", "Andén", 0.4, "demo-p3")
  rs("RS-0208", "Tacubaya", "limpieza", "sanitario", "Sanitarios", 0.6, "demo-q8")
  rs("RS-0209", "Zapata", "aglomeracion", "fila_elevador", "Elevador o salvaescaleras", 0.3, "demo-r5", true)
  rs("RS-0210", "Pantitlán", "aglomeracion", "anden", "Andén", 0.35, "demo-s3", false, "TK-0053")
  rs("RS-0211", "Pantitlán", "aglomeracion", "anden", "Andén", 0.3, "demo-s4", false, "TK-0053")

  const tk = (t: Omit<Ticket, "demo" | "historial" | "reportes"> & { reportes?: string[]; historial?: EventoTicket[] }) => {
    const historial: EventoTicket[] = t.historial ?? [
      { ts: t.creado, texto: t.origen === "persona_usuaria" ? `Turnado a ${AREAS[t.area].nombre}` : `Ticket levantado para ${AREAS[t.area].nombre}`, por: t.creadoPor },
      ...(t.asignado ? [{ ts: t.asignado, texto: `Asignado a ${t.asignadoNombre}`, por: t.creadoPor }] : []),
      ...(t.iniciado ? [{ ts: t.iniciado, texto: "Atención iniciada", por: t.asignadoNombre ?? "" }] : []),
      ...(t.resuelto ? [{ ts: t.resuelto, texto: "Marcado como resuelto", por: t.resueltoPor ?? "" }] : []),
      ...(t.cerrado ? [{ ts: t.cerrado, texto: t.cerradoPor?.startsWith("Persona") ? "La persona usuaria confirmó que se resolvió" : "Cerrado después de revisar", por: t.cerradoPor ?? "" }] : []),
    ]
    sv.tickets.push({ reportes: [], ...t, historial, demo: true })
  }
  const mesa = "Patricia Olvera Fuentes"
  const rosa = p("Tacubaya", "Personal de limpieza")
  const karla = p("Tacubaya", "Policía auxiliar")
  const jorge = p("Tacubaya", "Personal de estación")
  const raul = p("Pantitlán", "Policía auxiliar")
  const limpBal = p("Balderas", "Personal de limpieza")

  // Ticket de la cuenta de prueba resuelto: espera su confirmación.
  tk({ id: "TK-0051", clase: "ticket", area: "limpieza", station: "Tacubaya", asunto: "Derrame o piso resbaloso", lugar: "Andén", prioridad: "alta", estado: "resuelto", origen: "persona_usuaria", reportes: ["RS-0201", "RS-0202"], creado: now - 2.3 * HORA, creadoPor: mesa, asignadoA: rosa?.id, asignadoNombre: rosa?.nombre, asignado: now - 2.1 * HORA, iniciado: now - 1.9 * HORA, resuelto: now - 1.5 * HORA, resueltoPor: rosa?.nombre })
  tk({ id: "TK-0041", clase: "ticket", area: "mantenimiento", station: "Hidalgo", asunto: "Señalética en braille faltante o dañada", lugar: "Elevador o salvaescaleras", prioridad: "media", estado: "cerrado", origen: "persona_usuaria", reportes: ["RS-0190"], creado: now - 5.9 * DIA, creadoPor: mesa, asignadoA: "T-MARIANA", asignadoNombre: "Mariana Cortés Ibáñez", asignado: now - 5.8 * DIA, iniciado: now - 5.2 * DIA, resuelto: now - 4.3 * DIA, resueltoPor: "Mariana Cortés Ibáñez", cerrado: now - 4 * DIA, cerradoPor: "Persona usuaria (confirmó)" })
  tk({ id: "TK-0042", clase: "ticket", area: "limpieza", station: "Balderas", asunto: "Basura acumulada", lugar: "Andén", prioridad: "media", estado: "cerrado", origen: "persona_usuaria", reportes: ["RS-0193"], creado: now - 29 * HORA, creadoPor: mesa, asignadoA: limpBal?.id, asignadoNombre: limpBal?.nombre, asignado: now - 28.5 * HORA, resuelto: now - 27 * HORA, resueltoPor: limpBal?.nombre, cerrado: now - 26 * HORA, cerradoPor: mesa })
  tk({ id: "TK-0046", clase: "ticket", area: "mantenimiento", station: "Balderas", asunto: "Zona con poca iluminación", lugar: "Pasillo", prioridad: "media", estado: "en_proceso", origen: "persona_usuaria", reportes: ["RS-0198", "RS-0199"], creado: now - 26 * HORA, creadoPor: mesa, asignadoA: "T-DIEGO", asignadoNombre: "Diego Herrera Campos", asignado: now - 25 * HORA, iniciado: now - 3 * HORA })
  tk({ id: "TK-0053", clase: "ticket", area: "seguridad", station: "Pantitlán", asunto: "Andén saturado sin control", lugar: "Andén", prioridad: "alta", estado: "asignado", origen: "persona_usuaria", reportes: ["RS-0210", "RS-0211"], creado: now - 0.25 * HORA, creadoPor: mesa, asignadoA: raul?.id, asignadoNombre: raul?.nombre, asignado: now - 0.2 * HORA })
  tk({ id: "TK-0054", clase: "ticket", area: "seguridad", station: "Tacubaya", asunto: "Comercio o bloqueo en pasillo", lugar: "Transbordo entre líneas", detalle: "Bloquean el paso hacia el elevador de la Línea 7.", prioridad: "media", estado: "asignado", origen: "personal", creado: now - 1.1 * HORA, creadoPor: jorge?.nombre ?? "Personal de estación", creadoPorCuenta: "C-PE-TAC", asignadoA: karla?.id, asignadoNombre: karla?.nombre, asignado: now - 0.9 * HORA })
  tk({ id: "TK-0055", clase: "ticket", area: "limpieza", station: "Zapata", asunto: "Basura acumulada", lugar: "Acceso de calle", prioridad: "media", estado: "nuevo", origen: "personal", creado: now - 0.5 * HORA, creadoPor: "Verónica Núñez Lara" })
  tk({ id: "TK-0056", clase: "ticket", area: "mantenimiento", station: "Tacubaya", asunto: "Puerta de cortesía descompuesta", lugar: "Taquilla o torniquetes", detalle: "La chapa no cierra; se queda una persona cuidándola.", prioridad: "media", estado: "asignado", origen: "personal", creado: now - 27 * HORA, creadoPor: "Arturo Lemus Pineda", creadoPorCuenta: "C-JE-TAC", asignadoA: "T-MARIANA", asignadoNombre: "Mariana Cortés Ibáñez", asignado: now - 25 * HORA })
  tk({ id: "TK-0057", clase: "ticket", area: "sistemas", station: "Hidalgo", asunto: "La app o la consola no responde", detalle: "La consola tarda en abrir la ronda de las 9:00.", prioridad: "baja", estado: "resuelto", origen: "personal", creado: now - 20 * HORA, creadoPor: "Patricia Lugo Reyes", asignadoA: "S-PEDRO", asignadoNombre: "Pedro Iván Robles Cervantes", asignado: now - 19 * HORA, resuelto: now - 6 * HORA, resueltoPor: "Pedro Iván Robles Cervantes" })
  tk({ id: "TK-0058", clase: "ticket", area: "atencion", station: "Pantitlán", asunto: "Seguimiento a una persona que pidió apoyo", detalle: "Esperó 20 minutos en el transbordo; dar seguimiento.", prioridad: "media", estado: "nuevo", origen: "personal", creado: now - 0.7 * HORA, creadoPor: "Mónica Ruiz Cabrera", creadoPorCuenta: "C-JE-PAN" })
  // Historial de la semana para las gráficas de la Mesa.
  const historicos: Array<[AreaId, string, number, number]> = [
    ["limpieza", "Tacubaya", 1.2, 2],
    ["seguridad", "Pantitlán", 1.5, 1],
    ["mantenimiento", "Zapata", 2.1, 30],
    ["limpieza", "Hidalgo", 2.6, 3],
    ["estacion", "Balderas", 3.2, 2],
    ["seguridad", "Tacubaya", 3.5, 0.5],
    ["limpieza", "Pantitlán", 4.1, 5],
    ["mantenimiento", "Hidalgo", 4.4, 50],
    ["atencion", "Tacubaya", 5.1, 20],
    ["limpieza", "Zapata", 5.6, 1],
    ["seguridad", "Hidalgo", 6.2, 2],
    ["estacion", "Pantitlán", 6.5, 1],
  ]
  historicos.forEach(([area, station, dias, horas], k) => {
    const creado = now - dias * DIA
    const asunto = AREAS[area].asuntos[k % AREAS[area].asuntos.length]
    const quien = asignables(db, area, station)[0]
    tk({ id: `TK-00${String(20 + k).padStart(2, "0")}`, clase: "ticket", area, station, asunto, prioridad: horas <= 4 ? "alta" : "media", estado: "cerrado", origen: k % 2 ? "persona_usuaria" : "personal", creado, creadoPor: mesa, asignadoA: quien?.id, asignadoNombre: quien?.nombre, asignado: creado + 0.3 * HORA, resuelto: creado + horas * HORA, resueltoPor: quien?.nombre, cerrado: creado + (horas + 1) * HORA, cerradoPor: mesa })
  })

  // Tareas de hoy que asignaron los jefes de estación, relativas al turno en curso.
  const jefe = (station: string) => p(station, "Jefe(a) de estación")
  let n = 400
  const tarea = (station: string, persona: Persona | undefined, desde: number, asunto: string, prioridad: Prioridad, opciones: { detalle?: string; atrasar?: boolean } = {}) => {
    if (!persona) return
    const hora = Math.max(0, Math.min(24 * 60 - 1, turno.inicio + desde))
    const ts = base + hora * MIN
    const j = jefe(station)
    const creado = Math.min(now, turno.inicioTs - 10 * MIN)
    const t: Omit<Ticket, "demo" | "historial" | "reportes"> = {
      id: `TA-0${++n}`,
      clase: "tarea",
      area: AREA_DE_PUESTO[persona.puesto],
      station,
      asunto,
      detalle: opciones.detalle,
      prioridad,
      estado: "asignado",
      origen: "personal",
      creado,
      creadoPor: j?.nombre ?? "Jefatura de estación",
      creadoPorCuenta: j?.cuentaId,
      hora,
      asignadoA: persona.id,
      asignadoNombre: persona.nombre,
      asignado: creado,
    }
    if (!opciones.atrasar && ts + 35 * MIN <= now) {
      t.estado = "resuelto"
      t.iniciado = ts + 2 * MIN
      t.resuelto = ts + 25 * MIN
      t.resueltoPor = persona.nombre
    } else if (!opciones.atrasar && ts <= now) {
      t.estado = "en_proceso"
      t.iniciado = ts + 2 * MIN
    }
    tk({
      ...t,
      historial: [
        { ts: creado, texto: `Tarea asignada a ${persona.nombre}`, por: t.creadoPor },
        ...(t.iniciado ? [{ ts: t.iniciado, texto: "Tarea iniciada", por: persona.nombre }] : []),
        ...(t.resuelto ? [{ ts: t.resuelto, texto: "Tarea hecha", por: persona.nombre }] : []),
      ],
    })
  }
  for (const station of ESTACIONES_PILOTO) {
    const pol = p(station, "Policía auxiliar")
    const [pe1, pe2] = [p(station, "Personal de estación", 0), p(station, "Personal de estación", 1)]
    const lim = p(station, "Personal de limpieza")
    tarea(station, pol, 15, "Pase de lista y revisión de radio", "media")
    tarea(station, pol, 60, "Rondín de vigilancia en andenes", "media")
    tarea(station, pol, 150, station === "Tacubaya" ? "Vigilar el acceso con el elevador fuera de servicio" : "Apoyar el ascenso en el transbordo", "alta", station === "Tacubaya" ? { detalle: "Acceso de calle: el elevador no funciona. Orientar a quien llegue en silla de ruedas y pedir apoyo por radio.", atrasar: true } : {})
    tarea(station, pol, 240, "Ordenar la fila en torniquetes", "media")
    tarea(station, pol, 330, "Rondín de vigilancia en andenes", "media")
    tarea(station, pol, 450, "Entrega de turno y novedades", "baja")
    tarea(station, pe1, 30, "Colocar aviso de equipo fuera de servicio", "alta")
    tarea(station, pe1, 200, "Informar ruta alterna en taquilla", "media")
    tarea(station, pe2, 120, "Revisar la guía táctil del acceso", "media")
    tarea(station, pe2, 300, "Verificar en sitio un reporte", "alta")
    tarea(station, lim, 45, "Limpiar sanitarios", "baja")
    tarea(station, lim, 180, "Retirar basura del andén", "media")
    tarea(station, lim, 360, "Limpiar la guía táctil", "media")
  }

  sv.reportes.sort((a, b) => b.ts - a.ts)
  sv.tickets.sort((a, b) => b.creado - a.creado)
  sv.sembrado = hoy
  db.servicio = sv
  return db
}
