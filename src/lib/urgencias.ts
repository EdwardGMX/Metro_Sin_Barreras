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
import { ESTACIONES_PILOTO } from "./operacion"
import { registrarEvento, type BaseDatos } from "./reports"

export type TipoUrgencia = "persona_vias" | "homicidio" | "agresion" | "robo" | "acoso" | "medica" | "incendio" | "objeto" | "auxilio"

export type InfoUrgencia = { id: TipoUrgencia; nombre: string; ayuda: string; lugar: string }

/** Ordenadas de mayor a menor riesgo para la vida. */
export const TIPOS_URGENCIA: InfoUrgencia[] = [
  { id: "persona_vias", nombre: "Persona en las vías", ayuda: "Alguien cayó o bajó a las vías", lugar: "Vías" },
  { id: "homicidio", nombre: "Homicidio", ayuda: "Asesinato o persona sin vida por violencia", lugar: "Andén" },
  { id: "agresion", nombre: "Agresión con violencia", ayuda: "Riña, ataque o persona armada", lugar: "Andén" },
  { id: "robo", nombre: "Robo o asalto", ayuda: "Con o sin violencia, en curso o recién ocurrido", lugar: "Andén" },
  { id: "acoso", nombre: "Acoso o abuso", ayuda: "Alguien sigue, molesta o toca sin consentimiento", lugar: "Dentro del tren" },
  { id: "medica", nombre: "Emergencia médica grave", ayuda: "Persona inconsciente, sin respirar o con sangrado", lugar: "Andén" },
  { id: "incendio", nombre: "Incendio o humo", ayuda: "Fuego, humo u olor a quemado", lugar: "Andén" },
  { id: "objeto", nombre: "Objeto sospechoso", ayuda: "Paquete abandonado o amenaza de bomba", lugar: "Andén" },
]
/** Motivo genérico de una llamada de una persona usuaria que no elige otro. */
const AUXILIO: InfoUrgencia = { id: "auxilio", nombre: "Pide ayuda de seguridad", ayuda: "Otro motivo o prefiere decirlo en la llamada", lugar: "Andén" }
export const INFO_URGENCIA = Object.fromEntries([...TIPOS_URGENCIA, AUXILIO].map((t) => [t.id, t])) as Record<TipoUrgencia, InfoUrgencia>

export const LUGARES_URGENCIA = ["Vías", "Andén", "Dentro del tren", "Pasillo", "Transbordo entre líneas", "Escaleras", "Elevador", "Taquilla o torniquetes", "Acceso de calle", "Sanitarios"]
export const SIN_PRECISAR = "Sin precisar"

export type Urgencia = {
  id: string
  station: string
  tipo: TipoUrgencia
  lugar: string
  ts: number
  activadaPor: string
  activadaPorCuenta: string
  estado: "activa" | "atendida" | "cancelada"
  /** Cuentas que ya marcaron «Enterado»: su alarma deja de sonar. */
  enterados: string[]
  atendida?: number
  atendidaPor?: string
  /** Quién la originó: el personal (RN15) o una persona usuaria que llamó a seguridad (RN17). */
  origen?: "personal" | "usuaria"
  /** Seudónimo de la persona usuaria que llamó. El personal nunca lo ve. */
  seudonimo?: string
  llaveVerificada?: boolean
  /** La persona eligió compartir que necesita apoyo de movilidad (solo para esta llamada). */
  apoyoMovilidad?: boolean
  llamada?: Llamada
  resultado?: "atendida" | "mal_uso"
}

export type Llamada = {
  estado: "sonando" | "en_curso" | "terminada"
  contestadaPor?: string
  contestadaPorCuenta?: string
  contestada?: number
  fin?: number
  colgo?: "usuaria" | "oficial"
}

/** Lo único que la Mesa de atención puede ver de una urgencia: dónde y cuándo. */
export type UbicacionUrgencia = Pick<Urgencia, "id" | "station" | "lugar" | "ts" | "estado">

/** Roles que activan una urgencia: todos menos la Mesa de atención. */
export const ACTIVAN: RolId[] = ["jefe_estacion", "personal_estacion", "personal_seguridad", "mantenimiento"]
/** Roles de la estación que ven la urgencia completa y escuchan la alarma. */
export const ESCUCHAN: RolId[] = ["jefe_estacion", "personal_estacion", "personal_seguridad"]
/** Roles de la estación que la cierran como atendida. */
export const CIERRAN: RolId[] = ["jefe_estacion", "personal_seguridad"]

/** Llamadas de personas usuarias: contesta seguridad de la estación; si nadie contesta en 30 s, suena también a la jefatura. */
export const CONTESTAN: RolId[] = ["personal_seguridad", "jefe_estacion"]
export const ESCALA_JEFATURA = 30_000
/** Mal uso: con 2 marcas en 90 días, el botón se bloquea 30 días. Máximo 3 llamadas por día. */
export const MAL_USO_LIMITE = 2
export const MAL_USO_VENTANA = 90 * 24 * 60 * 60_000
export const BLOQUEO_MAL_USO = 30 * 24 * 60 * 60_000
export const LLAMADAS_POR_DIA = 3
/** En el piloto solo estas estaciones tienen personal de seguridad conectado a la consola. */
export const ESTACIONES_CON_SEGURIDAD = ESTACIONES_PILOTO

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

/** ¿Le suena esta llamada de una persona usuaria? A seguridad de la estación de inmediato; a la jefatura, a los 30 s. */
function suenaLlamada(u: Urgencia, c: Cuenta, now: number): boolean {
  if (u.llamada?.estado !== "sonando" || c.estado !== "activa" || !(c.estaciones ?? []).includes(u.station)) return false
  return c.roles.includes("personal_seguridad") || (c.roles.includes("jefe_estacion") && now - u.ts >= ESCALA_JEFATURA)
}

/** ¿Debe sonar la alarma para esta cuenta? Solo para el personal de la estación que no ha marcado «Enterado». */
export function debeSonar(db: BaseDatos, c: Cuenta, now: number): Urgencia[] {
  return urgenciasDe(db).filter((u) => vigente(u, now) && (u.origen === "usuaria" ? suenaLlamada(u, c, now) : esDeLaEstacion(c, u.station) && !u.enterados.includes(c.id)))
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
  if (u.origen === "usuaria") u.resultado = "atendida"
  terminarLlamada(u, "oficial", now)
  auditar(e, { ...actor(quien), accion: "cerrar urgencia", objeto: `${id} · ${u.station}`, resultado: "permitido", detalle: "atendida" }, now)
  return { ok: true, mensaje: `Cerraste la alerta ${id} como atendida.` }
}

/* ------------------------------------------------------------------ */
/* Llamada de una persona usuaria a seguridad (RN17, propuesta)        */
/* ------------------------------------------------------------------ */
/*
 * - Desde «Mi cuenta», con sesión de Llave CDMX. La ubicación se usa solo en el dispositivo para
 *   proponer la estación más cercana; al sistema llega solo el nombre de la estación.
 * - Llega como urgencia a la estación: suena para seguridad y, si nadie contesta en 30 s, para la
 *   jefatura. Contesta el primero; a los demás se les apaga la alarma y ven quién la tomó.
 * - El personal ve el motivo, el lugar, si la cuenta es Llave Verificada y, solo si la persona lo
 *   elige, que necesita apoyo de movilidad. Nunca ve su nombre ni su seudónimo.
 * - Mal uso: la jefatura o seguridad puede marcar la llamada como mal uso; con 2 marcas en 90
 *   días se bloquea el botón 30 días. Llamar con fines ociosos o dar falsas alarmas a servicios de
 *   emergencia es infracción según la Ley de Cultura Cívica de la Ciudad de México (art. 28, fr. IX).
 * - En el prototipo la voz es simulada; en producción sería una llamada por la app (VoIP).
 */

function terminarLlamada(u: Urgencia, quien: "usuaria" | "oficial", now: number) {
  if (!u.llamada || u.llamada.estado === "terminada") return
  u.llamada.estado = "terminada"
  u.llamada.fin = now
  u.llamada.colgo = quien
}

export type DatosLlamada = { station: string; motivo: TipoUrgencia; lugar?: string; apoyoMovilidad?: boolean }
export type Llamante = { seudonimo: string; nivel: "Llave" | "Llave Verificada" }
export type ResultadoLlamada = { ok: true; id: string; mensaje: string } | { ok: false; codigo: number; mensaje: string }

/** ¿Tiene bloqueado el botón por mal uso? Devuelve hasta cuándo, o null. */
export function bloqueoPorMalUso(db: BaseDatos, seud: string, now: number): number | null {
  const marcas = (db.usuarios[seud]?.malUso ?? []).filter((t) => now - t < MAL_USO_VENTANA)
  if (marcas.length < MAL_USO_LIMITE) return null
  const hasta = Math.max(...marcas) + BLOQUEO_MAL_USO
  return hasta > now ? hasta : null
}

/** La llamada más reciente de la persona (para mostrar su estado en su pantalla). */
export function ultimaLlamada(db: BaseDatos, seud: string): Urgencia | undefined {
  return urgenciasDe(db).find((u) => u.origen === "usuaria" && u.seudonimo === seud)
}

const llamadaAbierta = (u: Urgencia, now: number) => vigente(u, now) && u.llamada?.estado !== "terminada"

export function llamarASeguridad(db: BaseDatos, quien: Llamante, d: DatosLlamada, now: number): ResultadoLlamada {
  if (!db.usuarios[quien.seudonimo]) return { ok: false, codigo: 401, mensaje: "Inicia sesión con Llave CDMX para llamar a seguridad." }
  const hasta = bloqueoPorMalUso(db, quien.seudonimo, now)
  if (hasta) {
    registrarEvento(db, { evento: "llamada a seguridad", objeto: quien.seudonimo.slice(0, 10), decision: "bloqueada por mal uso (403)", rol: "sistema" }, now)
    return { ok: false, codigo: 403, mensaje: `Este botón está bloqueado hasta el ${new Date(hasta).toLocaleDateString("es-MX", { day: "numeric", month: "long" })} por mal uso. En una emergencia llama al 911.` }
  }
  if (!ESTACIONES_CON_SEGURIDAD.includes(d.station)) return { ok: false, codigo: 400, mensaje: "Elige una estación con personal de seguridad del piloto." }
  if (!INFO_URGENCIA[d.motivo]) return { ok: false, codigo: 400, mensaje: "Elige el motivo o «Otro motivo»." }
  if (d.lugar && d.lugar !== SIN_PRECISAR && !LUGARES_URGENCIA.includes(d.lugar)) return { ok: false, codigo: 400, mensaje: "Elige un lugar de la lista." }
  const lista = (db.urgencias ??= [])
  const abierta = lista.find((u) => u.origen === "usuaria" && u.seudonimo === quien.seudonimo && llamadaAbierta(u, now))
  if (abierta) return { ok: true, id: abierta.id, mensaje: "Ya tienes una llamada en curso." }
  const hoy = lista.filter((u) => u.origen === "usuaria" && u.seudonimo === quien.seudonimo && now - u.ts < 24 * 60 * 60_000).length
  if (hoy >= LLAMADAS_POR_DIA) {
    registrarEvento(db, { evento: "llamada a seguridad", objeto: quien.seudonimo.slice(0, 10), decision: "límite diario (429)", rol: "sistema" }, now)
    return { ok: false, codigo: 429, mensaje: `Llegaste al límite de ${LLAMADAS_POR_DIA} llamadas por día. En una emergencia llama al 911.` }
  }
  const u: Urgencia = {
    id: siguienteFolio(lista),
    station: d.station,
    tipo: d.motivo,
    lugar: d.lugar || SIN_PRECISAR,
    ts: now,
    activadaPor: "Persona usuaria",
    activadaPorCuenta: "",
    estado: "activa",
    enterados: [],
    origen: "usuaria",
    seudonimo: quien.seudonimo,
    llaveVerificada: quien.nivel === "Llave Verificada",
    apoyoMovilidad: d.apoyoMovilidad || undefined,
    llamada: { estado: "sonando" },
  }
  lista.unshift(u)
  registrarEvento(db, { evento: "llamada a seguridad", objeto: `${u.id} · ${d.station}`, decision: INFO_URGENCIA[d.motivo].nombre, rol: "persona usuaria" }, now)
  return { ok: true, id: u.id, mensaje: `Llamando a seguridad de ${d.station}.` }
}

/** La persona cancela mientras suena, o cuelga ya en la llamada. */
export function colgarPersonaUsuaria(db: BaseDatos, seud: string, id: string, now: number): Resultado {
  const u = urgenciasDe(db).find((x) => x.id === id && x.seudonimo === seud)
  if (!u?.llamada) return { ok: false, codigo: 400, mensaje: "No encontramos tu llamada." }
  if (u.llamada.estado === "sonando") {
    terminarLlamada(u, "usuaria", now)
    u.estado = "cancelada"
    u.atendida = now
    registrarEvento(db, { evento: "llamada a seguridad", objeto: id, decision: "cancelada por la persona usuaria", rol: "persona usuaria" }, now)
    return { ok: true, mensaje: "Cancelaste la llamada." }
  }
  terminarLlamada(u, "usuaria", now)
  return { ok: true, mensaje: "Colgaste. El personal de seguridad sigue al tanto." }
}

const puedeContestar = (c: Cuenta, u: Urgencia) => tiene(c, CONTESTAN) && (c.estaciones ?? []).includes(u.station)

/** Contesta el primero: a los demás se les apaga la alarma y ven quién la tomó. */
export function contestarLlamada(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const u = urgenciasDe(db).find((x) => x.id === id)
  if (!u?.llamada) return { ok: false, codigo: 400, mensaje: "No encontramos esa llamada." }
  if (!puedeContestar(quien, u)) {
    auditar(e, { ...actor(quien), accion: "intento: contestar llamada", objeto: id, resultado: "denegado", detalle: "403" }, now)
    return { ok: false, codigo: 403, mensaje: "La contesta el personal de seguridad o la jefatura de la estación." }
  }
  if (u.llamada.estado === "en_curso") return { ok: false, codigo: 409, mensaje: `La contestó ${u.llamada.contestadaPor}.` }
  if (u.llamada.estado === "terminada" || u.estado !== "activa") return { ok: false, codigo: 409, mensaje: "La persona ya colgó." }
  u.llamada = { estado: "en_curso", contestadaPor: quien.nombre, contestadaPorCuenta: quien.id, contestada: now }
  if (!u.enterados.includes(quien.id)) u.enterados.push(quien.id)
  auditar(e, { ...actor(quien), accion: "contestar llamada", objeto: `${id} · ${u.station}`, resultado: "permitido", detalle: `a los ${Math.round((now - u.ts) / 1000)} s` }, now)
  return { ok: true, mensaje: `Contestaste la llamada ${id}.` }
}

export function colgarOficial(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const u = urgenciasDe(db).find((x) => x.id === id)
  if (!u?.llamada || u.llamada.contestadaPorCuenta !== quien.id) return { ok: false, codigo: 403, mensaje: "Solo cuelga quien contestó." }
  terminarLlamada(u, "oficial", now)
  auditar(e, { ...actor(quien), accion: "colgar llamada", objeto: id, resultado: "permitido", detalle: `duró ${Math.round((now - (u.llamada.contestada ?? now)) / 1000)} s` }, now)
  return { ok: true, mensaje: "Colgaste. Cierra la alerta cuando quede atendida." }
}

/** La jefatura o seguridad marca la llamada como mal uso: cuenta para el bloqueo del botón. */
export function marcarMalUso(db: BaseDatos, e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const u = urgenciasDe(db).find((x) => x.id === id)
  if (!u || u.origen !== "usuaria" || !u.seudonimo) return { ok: false, codigo: 400, mensaje: "Solo las llamadas de personas usuarias se marcan como mal uso." }
  if (!(tiene(quien, CIERRAN) && (quien.estaciones ?? []).includes(u.station))) return { ok: false, codigo: 403, mensaje: "La marca la jefatura o el personal de seguridad de la estación." }
  if (u.resultado === "mal_uso") return { ok: false, codigo: 409, mensaje: "Ya está marcada como mal uso." }
  terminarLlamada(u, "oficial", now)
  u.estado = "atendida"
  u.atendida = now
  u.atendidaPor = quien.nombre
  u.resultado = "mal_uso"
  const usuario = db.usuarios[u.seudonimo]
  if (usuario) usuario.malUso = [...(usuario.malUso ?? []), now]
  auditar(e, { ...actor(quien), accion: "marcar mal uso", objeto: `${id} · ${u.station}`, resultado: "permitido", detalle: "llamada de persona usuaria" }, now)
  registrarEvento(db, { evento: "mal uso de llamada a seguridad", objeto: u.seudonimo.slice(0, 10), decision: bloqueoPorMalUso(db, u.seudonimo, now) ? "botón bloqueado 30 días" : "advertencia", rol: "seguridad" }, now)
  return { ok: true, mensaje: `Marcaste ${id} como mal uso.` }
}
