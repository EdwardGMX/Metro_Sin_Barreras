/**
 * Urgencias graves en una estación (RN15, propuesta).
 *
 * - Las activa cualquier cuenta del personal excepto la Mesa de atención: jefatura, personal de
 *   estación, personal de seguridad y mantenimiento. Solo eligen opciones: qué pasó y dónde.
 * - La ve completa (qué pasó, dónde, quién la activó) solo el personal de esa estación, y suena
 *   la alarma para su jefatura, su personal de estación y su personal de seguridad.
 * - La Mesa de atención solo ve dónde sucedió (estación y lugar), sin el tipo ni quién la activó.
 * - Cada persona marca «Enterado» para silenciar su alarma; la jefatura o seguridad la cierra
 *   como atendida. Todo queda en la bitácora de auditoría.
 * - La alerta no sustituye al 911 ni a los protocolos oficiales del STC.
 *
 * En producción la alarma llega por notificación push desde la API; aquí, en el navegador.
 */
import { allStations } from "../data/metroData"
import { actor, alcanzaEstacion, auditar, type Cuenta, type EstadoConsola, type Resultado, type RolId } from "./admin"
import type { BaseDatos } from "./reports"

export type TipoUrgencia = "persona_vias" | "homicidio" | "agresion" | "robo" | "medica" | "incendio" | "objeto"

export type InfoUrgencia = { id: TipoUrgencia; nombre: string; ayuda: string; lugar: string }

/** Ordenadas de mayor a menor riesgo para la vida. */
export const TIPOS_URGENCIA: InfoUrgencia[] = [
  { id: "persona_vias", nombre: "Persona en las vías", ayuda: "Alguien cayó o bajó a las vías", lugar: "Vías" },
  { id: "homicidio", nombre: "Homicidio", ayuda: "Asesinato o persona sin vida por violencia", lugar: "Andén" },
  { id: "agresion", nombre: "Agresión con violencia", ayuda: "Riña, ataque o persona armada", lugar: "Andén" },
  { id: "robo", nombre: "Robo o asalto", ayuda: "Con o sin violencia, en curso o recién ocurrido", lugar: "Andén" },
  { id: "medica", nombre: "Emergencia médica grave", ayuda: "Persona inconsciente, sin respirar o con sangrado", lugar: "Andén" },
  { id: "incendio", nombre: "Incendio o humo", ayuda: "Fuego, humo u olor a quemado", lugar: "Andén" },
  { id: "objeto", nombre: "Objeto sospechoso", ayuda: "Paquete abandonado o amenaza de bomba", lugar: "Andén" },
]
export const INFO_URGENCIA = Object.fromEntries(TIPOS_URGENCIA.map((t) => [t.id, t])) as Record<TipoUrgencia, InfoUrgencia>

export const LUGARES_URGENCIA = ["Vías", "Andén", "Dentro del tren", "Pasillo", "Transbordo entre líneas", "Escaleras", "Elevador", "Taquilla o torniquetes", "Acceso de calle", "Sanitarios"]

export type Urgencia = {
  id: string
  station: string
  tipo: TipoUrgencia
  lugar: string
  ts: number
  activadaPor: string
  activadaPorCuenta: string
  estado: "activa" | "atendida"
  /** Cuentas que ya marcaron «Enterado»: su alarma deja de sonar. */
  enterados: string[]
  atendida?: number
  atendidaPor?: string
}

/** Lo único que la Mesa de atención puede ver de una urgencia: dónde y cuándo. */
export type UbicacionUrgencia = Pick<Urgencia, "id" | "station" | "lugar" | "ts" | "estado">

/** Roles que activan una urgencia: todos menos la Mesa de atención. */
export const ACTIVAN: RolId[] = ["jefe_estacion", "personal_estacion", "personal_seguridad", "mantenimiento"]
/** Roles de la estación que ven la urgencia completa y escuchan la alarma. */
export const ESCUCHAN: RolId[] = ["jefe_estacion", "personal_estacion", "personal_seguridad"]
/** Roles de la estación que la cierran como atendida. */
export const CIERRAN: RolId[] = ["jefe_estacion", "personal_seguridad"]

/** Una alerta activa se considera vigente 12 horas; después deja de sonar aunque nadie la cierre. */
export const VIGENCIA_URGENCIA = 12 * 60 * 60_000

const tiene = (c: Cuenta, roles: RolId[]) => c.estado === "activa" && c.roles.some((r) => roles.includes(r))
const esMesa = (c: Cuenta) => c.estado === "activa" && c.roles.includes("moderacion")

export const puedeActivar = (c: Cuenta) => tiene(c, ACTIVAN)
/** Personal de esa estación (no basta con alcanzarla: la cuenta debe estar asignada a ella). */
export const esDeLaEstacion = (c: Cuenta, station: string) => tiene(c, ESCUCHAN) && (c.estaciones ?? []).includes(station)

export const urgenciasDe = (db: BaseDatos): Urgencia[] => db.urgencias ?? []
export const vigente = (u: Urgencia, now: number) => u.estado === "activa" && now - u.ts < VIGENCIA_URGENCIA

/** Urgencias completas que ve una cuenta: las de su estación y las que ella misma activó. */
export function urgenciasVisibles(db: BaseDatos, c: Cuenta, now: number): Urgencia[] {
  return urgenciasDe(db).filter((u) => (esDeLaEstacion(c, u.station) || u.activadaPorCuenta === c.id) && (vigente(u, now) || now - (u.atendida ?? u.ts) < 30 * 60_000))
}

/** Lo que ve la Mesa de atención: solo estación, lugar y hora de las urgencias vigentes. */
export function ubicacionesParaMesa(db: BaseDatos, c: Cuenta, now: number): UbicacionUrgencia[] {
  if (!esMesa(c)) return []
  return urgenciasDe(db)
    .filter((u) => vigente(u, now))
    .map(({ id, station, lugar, ts, estado }) => ({ id, station, lugar, ts, estado }))
}

/** ¿Debe sonar la alarma para esta cuenta? Solo para el personal de la estación que no ha marcado «Enterado». */
export function debeSonar(db: BaseDatos, c: Cuenta, now: number): Urgencia[] {
  return urgenciasDe(db).filter((u) => vigente(u, now) && esDeLaEstacion(c, u.station) && !u.enterados.includes(c.id))
}

const siguienteFolio = (existentes: Urgencia[]) => {
  const n = Math.max(0, ...existentes.map((u) => Number(u.id.slice(3)) || 0))
  return `UR-${String(n + 1).padStart(4, "0")}`
}

export type DatosUrgencia = { station: string; tipo: TipoUrgencia; lugar: string }

export function activarUrgencia(db: BaseDatos, e: EstadoConsola, quien: Cuenta, d: DatosUrgencia, now: number): Resultado {
  if (!puedeActivar(quien)) {
    auditar(e, { ...actor(quien), accion: "intento: activar urgencia", objeto: d.station, resultado: "denegado", detalle: "403" }, now)
    return { ok: false, codigo: 403, mensaje: "La Mesa de atención no activa urgencias: avisa al personal de la estación." }
  }
  if (!allStations.includes(d.station)) return { ok: false, codigo: 400, mensaje: "Elige una estación de la lista." }
  if (!alcanzaEstacion(quien, d.station)) {
    auditar(e, { ...actor(quien), accion: "intento: activar urgencia", objeto: d.station, resultado: "denegado", detalle: "fuera de su estación" }, now)
    return { ok: false, codigo: 403, mensaje: "Solo activas urgencias en tu estación." }
  }
  if (!INFO_URGENCIA[d.tipo]) return { ok: false, codigo: 400, mensaje: "Elige qué pasó." }
  if (!LUGARES_URGENCIA.includes(d.lugar)) return { ok: false, codigo: 400, mensaje: "Elige dónde pasó." }
  const lista = (db.urgencias ??= [])
  // Una segunda alerta igual en 5 minutos no duplica la alarma: se suma a la vigente.
  const igual = lista.find((u) => vigente(u, now) && u.station === d.station && u.tipo === d.tipo && u.lugar === d.lugar && now - u.ts < 5 * 60_000)
  if (igual) {
    if (!igual.enterados.includes(quien.id)) igual.enterados.push(quien.id)
    return { ok: true, mensaje: `Ya hay una alerta activa por lo mismo (${igual.id}). El personal de ${d.station} ya fue avisado.` }
  }
  const u: Urgencia = { id: siguienteFolio(lista), station: d.station, tipo: d.tipo, lugar: d.lugar, ts: now, activadaPor: quien.nombre, activadaPorCuenta: quien.id, estado: "activa", enterados: [quien.id] }
  lista.unshift(u)
  auditar(e, { ...actor(quien), accion: "activar urgencia", objeto: `${u.id} · ${d.station}`, resultado: "permitido", detalle: `${INFO_URGENCIA[d.tipo].nombre} · ${d.lugar}` }, now)
  return { ok: true, mensaje: `Alerta ${u.id} activada. Sonó la alarma para el personal de ${d.station}. Si hay riesgo para la vida, llama al 911.` }
}

export function marcarEnterado(db: BaseDatos, quien: Cuenta, id: string): Resultado {
  const u = urgenciasDe(db).find((x) => x.id === id)
  if (!u || !esDeLaEstacion(quien, u.station)) return { ok: false, codigo: 403, mensaje: "Esa alerta no es de tu estación." }
  if (!u.enterados.includes(quien.id)) u.enterados.push(quien.id)
  return { ok: true, mensaje: `Enterado de ${u.id}. Tu alarma se silenció; la alerta sigue activa hasta que la cierren.` }
}

export function atenderUrgencia(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const u = urgenciasDe(db).find((x) => x.id === id)
  if (!u) return { ok: false, codigo: 400, mensaje: "No encontramos esa alerta." }
  if (!(tiene(quien, CIERRAN) && (quien.estaciones ?? []).includes(u.station))) {
    auditar(e, { ...actor(quien), accion: "intento: cerrar urgencia", objeto: id, resultado: "denegado", detalle: "403" }, now)
    return { ok: false, codigo: 403, mensaje: "La cierra la jefatura o el personal de seguridad de la estación." }
  }
  if (u.estado !== "activa") return { ok: false, codigo: 409, mensaje: "Esa alerta ya está cerrada." }
  u.estado = "atendida"
  u.atendida = now
  u.atendidaPor = quien.nombre
  auditar(e, { ...actor(quien), accion: "cerrar urgencia", objeto: `${id} · ${u.station}`, resultado: "permitido", detalle: "atendida" }, now)
  return { ok: true, mensaje: `Cerraste la alerta ${id} como atendida.` }
}
