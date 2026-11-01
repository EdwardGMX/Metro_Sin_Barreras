/**
 * Consola del personal: cuentas, roles y permisos (RN8 y RN9).
 *
 * Principio: solo tienen cuenta las personas del STC que operan el servicio,
 * y cada una ve únicamente lo que necesita para su función (mínimo privilegio).
 * Las personas usuarias no tienen cuenta en la consola: entran a la app
 * pública con Llave CDMX.
 *
 * En producción la consola es un servicio aparte en Cloud Run protegido por
 * Identity-Aware Proxy (IAP): solo entran cuentas de Cloud Identity con
 * verificación en dos pasos. La autorización por rol la aplica la API de la
 * consola con estas mismas reglas. En el prototipo todo se simula en el navegador.
 */
import { linesAtStation } from "../data/metroData"

/* ------------------------------------------------------------------ */
/* Roles y permisos                                                    */
/* ------------------------------------------------------------------ */

export type RolId = "jefe_estacion" | "personal_estacion" | "personal_seguridad" | "moderacion" | "mantenimiento"

export type Permiso =
  | "moderacion.ver"
  | "moderacion.decidir"
  | "evidencias.ver"
  | "rondas.programar"
  | "rondas.registrar"
  | "estacion.ver"
  | "reportes.verificar"
  | "ordenes.ver"
  | "ordenes.crear"
  | "ordenes.atender"
  | "incidentes.ver"
  | "incidentes.asignar"
  | "incidentes.atender"
  | "seguridad.ver"
  | "tickets.levantar"
  | "tickets.ver"
  | "tickets.gestionar"
  | "tickets.asignar"
  | "tickets.atender"
  | "tareas.asignar"

export const PERMISO_LABEL: Record<Permiso, string> = {
  "moderacion.ver": "Ver la cola de reportes en revisión",
  "moderacion.decidir": "Aprobar o rechazar reportes",
  "evidencias.ver": "Ver las fotos de los reportes",
  "rondas.programar": "Programar las rondas de revisión y definir quién las da",
  "rondas.registrar": "Registrar las rondas de revisión de los equipos",
  "estacion.ver": "Ver los equipos, reportes y solicitudes de apoyo de su estación",
  "reportes.verificar": "Verificar en sitio los reportes ciudadanos",
  "ordenes.ver": "Ver las órdenes de mantenimiento",
  "ordenes.crear": "Enviar una falla a mantenimiento",
  "ordenes.atender": "Tomar y cerrar órdenes de mantenimiento",
  "incidentes.ver": "Ver los incidentes y solicitudes de apoyo",
  "incidentes.asignar": "Asignar incidentes y solicitudes de apoyo a una persona",
  "incidentes.atender": "Atender los incidentes y apoyos que tiene asignados",
  "seguridad.ver": "Ver el panel de seguridad y apoyo",
  "tickets.levantar": "Levantar tickets a cualquier área, en las estaciones a su cargo",
  "tickets.ver": "Ver los tickets de su alcance",
  "tickets.gestionar": "Turnar reportes ciudadanos como tickets y asignar, cerrar o reabrir los de cualquier área",
  "tickets.asignar": "Asignar los tickets del área que encarga",
  "tickets.atender": "Atender los tickets y tareas que tiene asignados",
  "tareas.asignar": "Asignar tareas al personal de su estación (seguridad, estación y limpieza)",
}

export type Rol = {
  id: RolId
  nombre: string
  descripcion: string
  /** Quién ocupa el rol en el STC. */
  operacion: string
  /** Unidad del Estatuto Orgánico del STC (GOCDMX, 17/09/2024) de la que depende el rol. */
  unidad: string
  permisos: Permiso[]
  noPuede: string[]
}

export const ROLES: Record<RolId, Rol> = {
  jefe_estacion: {
    id: "jefe_estacion",
    nombre: "Jefe(a) de estación",
    descripcion: "Responde por su estación: ve sus equipos, los reportes ciudadanos y las solicitudes de apoyo, da o asigna las rondas, asigna tareas a su personal de seguridad, estación y limpieza, levanta tickets a otras áreas, envía las fallas a mantenimiento y conduce el protocolo de persona atrapada.",
    operacion: "Jefe(a) de cada estación",
    unidad: "Personal operativo de la estación, bajo la Gerencia de Líneas de cada línea que la atiende",
    permisos: ["estacion.ver", "rondas.registrar", "rondas.programar", "reportes.verificar", "ordenes.ver", "ordenes.crear", "incidentes.ver", "incidentes.asignar", "incidentes.atender", "tareas.asignar", "tickets.levantar", "tickets.ver", "tickets.asignar", "tickets.atender"],
    noPuede: ["Ver otras estaciones", "Cerrar órdenes de mantenimiento", "Asignar tareas a Mantenimiento u otras áreas (les levanta un ticket)", "Ver fotos o seudónimos de quien reporta"],
  },
  personal_estacion: {
    id: "personal_estacion",
    nombre: "Personal de estación",
    descripcion: "Da las rondas que tiene asignadas, verifica en sitio los reportes ciudadanos y atiende las solicitudes de apoyo de su estación.",
    operacion: "Personal de cada estación",
    unidad: "Personal operativo de la estación, bajo la Gerencia de Líneas de cada línea que la atiende",
    permisos: ["estacion.ver", "rondas.registrar", "reportes.verificar", "incidentes.ver", "incidentes.atender", "tickets.levantar", "tickets.atender"],
    noPuede: ["Cambiar el programa de rondas", "Asignar incidentes a otras personas", "Ver otras estaciones o datos de quien reporta"],
  },
  personal_seguridad: {
    id: "personal_seguridad",
    nombre: "Personal de seguridad",
    descripcion: "Sigue su jornada: atiende las tareas que le asigna la jefatura de estación, los tickets de seguridad y los acompañamientos de su estación.",
    operacion: "Policía auxiliar y vigilancia de cada estación",
    unidad: "Policía auxiliar asignada a la estación, coordinada por la Gerencia de Seguridad Institucional",
    permisos: ["seguridad.ver", "incidentes.ver", "incidentes.atender", "tickets.levantar", "tickets.atender"],
    noPuede: ["Ver incidentes de otras estaciones", "Asignar incidentes"],
  },
  moderacion: {
    id: "moderacion",
    nombre: "Mesa de atención y reportes",
    descripcion: "Desde la Gerencia de Atención al Usuario recibe los reportes ciudadanos: agrupa los iguales, los turna como ticket al área responsable, vigila los plazos y cierra lo resuelto. También revisa los reportes en cuarentena y sus fotos.",
    operacion: "Personal de la Gerencia de Atención al Usuario",
    unidad: "Dirección de Medios › Gerencia de Atención al Usuario",
    permisos: ["moderacion.ver", "moderacion.decidir", "evidencias.ver", "tickets.levantar", "tickets.ver", "tickets.gestionar"],
    noPuede: ["Ver el seudónimo completo de quien reporta", "Cerrar un ticket que resolvió ella misma", "Cambiar el estado oficial de un equipo", "Administrar cuentas o ver la bitácora"],
  },
  mantenimiento: {
    id: "mantenimiento",
    nombre: "Mantenimiento electromecánico",
    descripcion: "Recibe las órdenes de trabajo de los equipos con falla y los tickets de instalaciones (luminarias, filtraciones, guía táctil, señalética), los asigna a su personal técnico y registra la reparación.",
    operacion: "Supervisión de instalaciones mecánicas (elevadores y escaleras)",
    unidad: "Subdirección General de Mantenimiento › Dirección de Instalaciones Fijas",
    permisos: ["ordenes.ver", "ordenes.atender", "tickets.levantar", "tickets.ver", "tickets.asignar", "tickets.atender"],
    noPuede: ["Confirmar en sitio su propia reparación (lo hace el personal de la estación)", "Ver reportes individuales o datos de personas"],
  },
}

export const ORDEN_ROLES: RolId[] = ["jefe_estacion", "personal_estacion", "personal_seguridad", "moderacion", "mantenimiento"]

/** Pares de roles que una misma cuenta no puede tener (separación de funciones, RN9). */
export const ROLES_INCOMPATIBLES: Array<[RolId, RolId, string]> = [
  ["mantenimiento", "personal_estacion", "quien repara un equipo no confirma en sitio su propia reparación"],
  ["mantenimiento", "jefe_estacion", "quien repara un equipo no confirma en sitio su propia reparación"],
]

export type ModuloId = "inicio" | "estacion" | "rondas" | "mantenimiento" | "seguridad" | "moderacion" | "tickets"

/** Un módulo se muestra si la cuenta tiene al menos uno de los permisos que requiere. */
export const MODULOS: Array<{ id: ModuloId; nombre: string; requiere?: Permiso | Permiso[] }> = [
  { id: "inicio", nombre: "Inicio" },
  { id: "estacion", nombre: "Mi estación", requiere: "estacion.ver" },
  { id: "rondas", nombre: "Rondas de revisión", requiere: ["rondas.registrar", "rondas.programar"] },
  { id: "mantenimiento", nombre: "Mantenimiento", requiere: "ordenes.atender" },
  { id: "seguridad", nombre: "Seguridad y apoyo", requiere: "seguridad.ver" },
  { id: "tickets", nombre: "Tickets", requiere: "tickets.levantar" },
  { id: "moderacion", nombre: "Moderación", requiere: "moderacion.ver" },
]

/* ------------------------------------------------------------------ */
/* Cuentas del personal                                                */
/* ------------------------------------------------------------------ */

export const DOMINIO = "metrosinbarreras.com.mx"
export const MIN = 60_000
export const HORA = 60 * MIN
export const DIA = 24 * HORA
/** Cierre de sesión por inactividad y vigencia máxima de la sesión (propuesta). */
export const INACTIVIDAD = 15 * MIN
export const SESION_MAXIMA = 8 * HORA

/** Roles que trabajan en una estación concreta: su cuenta debe indicar cuál. */
export const ROLES_DE_ESTACION: RolId[] = ["jefe_estacion", "personal_estacion", "personal_seguridad"]

export type GerenciaLineas = { id: string; nombre: string; lineas: string[] }

/**
 * Gerencias de la Dirección de Transportación (Estatuto Orgánico del STC,
 * Gaceta Oficial de la CDMX del 17/09/2024). Cada estación depende de la
 * gerencia de cada línea que la atiende: Pantitlán, por ejemplo, de las tres.
 */
export const GERENCIAS_LINEAS: GerenciaLineas[] = [
  { id: "GL-1", nombre: "Gerencia de Líneas 1, 3, 4 y 12", lineas: ["1", "3", "4", "12"] },
  { id: "GL-2", nombre: "Gerencia de Líneas 2, 5, 6 y B", lineas: ["2", "5", "6", "B"] },
  { id: "GL-3", nombre: "Gerencia de Líneas 7, 8, 9 y A", lineas: ["7", "8", "9", "A"] },
]

/** Gerencias de las que depende una estación (una por cada línea distinta que la atiende). */
export function gerenciasDeEstacion(station: string): GerenciaLineas[] {
  const lineas = linesAtStation(station)
  return GERENCIAS_LINEAS.filter((g) => g.lineas.some((l) => lineas.includes(l)))
}

export type Cuenta = {
  id: string
  nombre: string
  correo: string
  puesto: string
  roles: RolId[]
  estado: "activa" | "suspendida"
  motivoSuspension?: string
  /** Estaciones que puede ver (roles de estación). Sin valor: toda la red. */
  estaciones?: string[]
  alta: number
  ultimoAcceso?: number
  creadaPor: string
}

export type EventoAuditoria = {
  id: string
  ts: number
  actor: string
  rol: string
  accion: string
  objeto: string
  resultado: "permitido" | "denegado"
  detalle?: string
}

export type ContenidoEmergencia = {
  version: number
  pasos: string[]
  fuente: string
  actualizado: string
  aprobadoPor?: string
  ejemplo: boolean
  /** Momento de la publicación (para vigilar la vigencia de la fuente). */
  publicadoTs?: number
}

export type EstadoConsola = {
  cuentas: Cuenta[]
  auditoria: EventoAuditoria[]
}

export type SesionPersonal = { cuentaId: string; inicio: number; ultimaActividad: number }

/* ------------------------------------------------------------------ */
/* Permisos efectivos                                                  */
/* ------------------------------------------------------------------ */

export function cuentaVigente(c: Cuenta): { ok: boolean; motivo?: string } {
  if (c.estado === "suspendida") return { ok: false, motivo: c.motivoSuspension ?? "Cuenta suspendida" }
  if (c.roles.length === 0) return { ok: false, motivo: "La cuenta no tiene roles asignados" }
  return { ok: true }
}

/** Permisos efectivos de una cuenta (RN8): la unión de los permisos de sus roles. */
export function permisosDe(c: Cuenta | undefined, _now?: number): Set<Permiso> {
  if (!c || !cuentaVigente(c).ok) return new Set()
  return new Set(c.roles.flatMap((r) => ROLES[r].permisos))
}

export function puede(c: Cuenta | undefined, p: Permiso, now?: number): boolean {
  return permisosDe(c, now).has(p)
}

export function modulosVisibles(c: Cuenta | undefined, now?: number) {
  const permisos = permisosDe(c, now)
  if (permisos.size === 0) return []
  return MODULOS.filter((m) => !m.requiere || (Array.isArray(m.requiere) ? m.requiere.some((p) => permisos.has(p)) : permisos.has(m.requiere)))
}

/** ¿La cuenta puede ver esta estación? Una cuenta con estaciones solo ve esas; las demás, toda la red. */
export function alcanzaEstacion(c: Cuenta, station: string): boolean {
  if (c.estaciones && c.estaciones.length > 0) return c.estaciones.includes(station)
  return true
}

/** Las estaciones de una lista que la cuenta puede ver. */
export function estacionesVisibles(c: Cuenta, universo: string[]): string[] {
  return universo.filter((s) => alcanzaEstacion(c, s))
}

/** Texto corto del alcance de la cuenta: su estación o toda la red. */
export function alcanceTexto(c: Cuenta): string {
  return c.estaciones?.length ? c.estaciones.join(", ") : "Toda la red"
}

export function rolesTexto(c: Cuenta): string {
  return c.roles.map((r) => ROLES[r].nombre).join(" · ")
}

/* ------------------------------------------------------------------ */
/* Bitácora de auditoría (append-only)                                 */
/* ------------------------------------------------------------------ */

export function auditar(e: EstadoConsola, evento: Omit<EventoAuditoria, "id" | "ts">, now: number): void {
  e.auditoria.unshift({ id: `AU-${now.toString(36).toUpperCase()}-${e.auditoria.length}`, ts: now, ...evento })
}

export function actor(c: Cuenta): { actor: string; rol: string } {
  return { actor: `${c.nombre} <${c.correo}>`, rol: c.roles.map((r) => ROLES[r].nombre).join(", ") }
}

export type Resultado = { ok: true; mensaje: string } | { ok: false; codigo: 400 | 401 | 403 | 409; mensaje: string }

/** Verifica el permiso, registra la negación en la bitácora y devuelve 403 (RNF-06). */
export function exigir(e: EstadoConsola, c: Cuenta, p: Permiso, objeto: string, now: number): Resultado | null {
  if (puede(c, p, now)) return null
  auditar(e, { ...actor(c), accion: `intento: ${PERMISO_LABEL[p].toLowerCase()}`, objeto, resultado: "denegado", detalle: "403" }, now)
  return { ok: false, codigo: 403, mensaje: "Tu rol no tiene permiso para esta acción." }
}

/* ------------------------------------------------------------------ */
/* Inicio de sesión del personal (IAP + Cloud Identity simulados)      */
/* ------------------------------------------------------------------ */

export type ResultadoSesion = { ok: true; sesion: SesionPersonal; cuenta: Cuenta } | { ok: false; codigo: 401 | 403; mensaje: string }

export function iniciarSesion(e: EstadoConsola, correo: string, mfaCorrecto: boolean, now: number): ResultadoSesion {
  const c = e.cuentas.find((x) => x.correo.toLowerCase() === correo.trim().toLowerCase())
  if (!c) {
    auditar(e, { actor: correo, rol: "—", accion: "inicio de sesión", objeto: "consola", resultado: "denegado", detalle: "cuenta no registrada (IAP 403)" }, now)
    return { ok: false, codigo: 403, mensaje: "Esta cuenta no está autorizada para la consola. Las personas usuarias no necesitan cuenta para consultar rutas." }
  }
  const vig = cuentaVigente(c)
  if (!vig.ok) {
    auditar(e, { ...actor(c), accion: "inicio de sesión", objeto: "consola", resultado: "denegado", detalle: vig.motivo }, now)
    return { ok: false, codigo: 403, mensaje: `Acceso denegado: ${vig.motivo}.` }
  }
  if (!mfaCorrecto) {
    auditar(e, { ...actor(c), accion: "inicio de sesión", objeto: "consola", resultado: "denegado", detalle: "verificación en dos pasos incorrecta" }, now)
    return { ok: false, codigo: 401, mensaje: "El código de verificación no es correcto." }
  }
  c.ultimoAcceso = now
  auditar(e, { ...actor(c), accion: "inicio de sesión", objeto: "consola", resultado: "permitido", detalle: "IAP + verificación en dos pasos" }, now)
  return { ok: true, cuenta: c, sesion: { cuentaId: c.id, inicio: now, ultimaActividad: now } }
}

export function sesionValida(s: SesionPersonal | null, now: number): boolean {
  return Boolean(s && now - s.ultimaActividad <= INACTIVIDAD && now - s.inicio <= SESION_MAXIMA)
}

/* ------------------------------------------------------------------ */
/* Contenido de emergencia                                             */
/* ------------------------------------------------------------------ */

/** Contenido del botón de emergencia de la app, tomado de las fuentes oficiales del STC (CA-15.1). */
export const CONTENIDO_EMERGENCIA: ContenidoEmergencia = {
  version: 2,
  ejemplo: false,
  pasos: [
  "Si tú u otra persona están en peligro inmediato, llama al 911.",
  "En la estación, identifica al personal del STC (jefe de estación, policía, vigilante o taquillera) e infórmale de inmediato.",
  "Si no hay personal cerca, acciona el botón de alarma, que generalmente está al centro del andén.",
  "Dentro del tren, acciona la palanca de emergencia junto a las puertas: el tren se detiene en la siguiente estación y el personal acude.",
  "Los ruptores, las alarmas y los teléfonos rojos se usan solo en emergencias reales, como incendios o accidentes graves.",
  "Ante un sismo, un incendio o un objeto sospechoso, sigue las instrucciones del personal y repórtalo al jefe de estación o a la Policía Auxiliar.",
  "Orientación e Información del STC: 5709 1133 (ext. 5009 y 5051), 5627 4741 y 5627 4950.",
  ],
  fuente: "Sistema de Transporte Colectivo (s. f.-a, s. f.-c): Manual para el usuario del Metro y Qué hacer en caso de emergencia médica; consultados el 1 de octubre de 2026.",
  actualizado: "octubre de 2026",
}

/* ------------------------------------------------------------------ */
/* Estado inicial de demostración                                      */
/* ------------------------------------------------------------------ */

function cuenta(id: string, nombre: string, usuario: string, puesto: string, roles: RolId[], now: number, extra: Partial<Cuenta> = {}): Cuenta {
  return { id, nombre, correo: `${usuario}@${DOMINIO}`, puesto, roles, estado: "activa", alta: now - 9 * DIA, ultimoAcceso: now - 2 * DIA, creadaPor: "Configuración inicial", ...extra }
}

export function estadoInicial(now: number): EstadoConsola {
  // Personal del STC de las vistas por perfil (nombres ficticios de demostración).
  const cuentas: Cuenta[] = [
    cuenta("C-JE-TAC", "Arturo Lemus Pineda", "arturo.lemus", "Jefe de estación · Tacubaya", ["jefe_estacion"], now, { estaciones: ["Tacubaya"] }),
    cuenta("C-SEG-TAC", "Karla Jiménez Soto", "karla.jimenez", "Policía auxiliar · Tacubaya", ["personal_seguridad"], now, { estaciones: ["Tacubaya"] }),
    cuenta("C-PE-TAC", "Jorge Aranda Vela", "jorge.aranda", "Personal de estación · Tacubaya", ["personal_estacion"], now, { estaciones: ["Tacubaya"] }),
    cuenta("C-JE-PAN", "Mónica Ruiz Cabrera", "monica.ruiz", "Jefa de estación · Pantitlán", ["jefe_estacion"], now, { estaciones: ["Pantitlán"] }),
    cuenta("C-MESA", "Patricia Olvera Fuentes", "patricia.olvera", "Encargada de la mesa de atención · Gerencia de Atención al Usuario", ["moderacion"], now),
    cuenta("C-MANT", "Alejandra Torres Luna", "alejandra.torres", "Supervisora de mantenimiento electromecánico", ["mantenimiento"], now),
  ]
  const e: EstadoConsola = { cuentas, auditoria: [] }
  auditar(e, { actor: "Configuración inicial", rol: "sistema", accion: "carga de cuentas del personal", objeto: `${cuentas.length} cuentas`, resultado: "permitido", detalle: "IAP: solo cuentas de Cloud Identity con verificación en dos pasos" }, now - 9 * DIA)
  return e
}
