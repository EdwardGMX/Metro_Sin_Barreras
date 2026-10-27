/**
 * Consola del personal: cuentas, roles y permisos (HU-23 a HU-30; RN8 y RN9).
 *
 * Principio: solo tienen cuenta las personas que operan el sistema una vez
 * entregado, y cada una ve únicamente lo que necesita para su función
 * (mínimo privilegio). Las personas usuarias no tienen cuenta en la consola.
 *
 * En producción la consola es un servicio aparte en Cloud Run protegido por
 * Identity-Aware Proxy (IAP): solo entran cuentas de Cloud Identity con
 * verificación en dos pasos. La autorización por rol la aplica la API de la
 * consola con estas mismas reglas. En el prototipo todo se simula en el navegador.
 */
import { allStations, normalizar } from "../data/metroData"
import { PERFIL_HORARIO } from "../data/saturation"

/* ------------------------------------------------------------------ */
/* Roles y permisos                                                    */
/* ------------------------------------------------------------------ */

export type RolId = "plataforma" | "datos" | "modelos" | "moderacion" | "gobernanza" | "contenidos" | "supervision"

export type Permiso =
  | "cuentas.ver"
  | "cuentas.gestionar"
  | "plataforma.ver"
  | "plataforma.operar"
  | "datos.ver"
  | "datos.operar"
  | "modelos.ver"
  | "modelos.publicar"
  | "moderacion.ver"
  | "moderacion.decidir"
  | "evidencias.ver"
  | "privacidad.ver"
  | "privacidad.arco"
  | "privacidad.retencion"
  | "accesos.recertificar"
  | "contenidos.ver"
  | "contenidos.proponer"
  | "contenidos.aprobar"
  | "bitacora.ver"
  | "indicadores.ver"

export const PERMISO_LABEL: Record<Permiso, string> = {
  "cuentas.ver": "Consultar las cuentas del personal y sus roles",
  "cuentas.gestionar": "Dar de alta, suspender y asignar roles a cuentas del personal",
  "plataforma.ver": "Ver el estado de los servicios, despliegues y costos",
  "plataforma.operar": "Revertir un despliegue a la revisión anterior",
  "datos.ver": "Ver ejecuciones de ingesta, capturas y calidad de los datos",
  "datos.operar": "Reintentar una ejecución y resolver excepciones de homologación",
  "modelos.ver": "Ver versiones del modelo y sus métricas",
  "modelos.publicar": "Publicar o revertir el modelo de saturación",
  "moderacion.ver": "Ver la cola de reportes en revisión",
  "moderacion.decidir": "Aprobar o rechazar reportes",
  "evidencias.ver": "Ver las fotos de los reportes",
  "privacidad.ver": "Ver solicitudes ARCO, consentimientos y retención",
  "privacidad.arco": "Responder solicitudes ARCO",
  "privacidad.retencion": "Ejecutar las reglas de retención",
  "accesos.recertificar": "Recertificar accesos y solicitar revocaciones",
  "contenidos.ver": "Ver el contenido de emergencia y los textos de la interfaz",
  "contenidos.proponer": "Proponer cambios al contenido",
  "contenidos.aprobar": "Aprobar y publicar el contenido",
  "bitacora.ver": "Consultar y exportar la bitácora de auditoría",
  "indicadores.ver": "Ver indicadores agregados del servicio",
}

export type Rol = {
  id: RolId
  nombre: string
  descripcion: string
  /** Quién ocupa el rol durante el piloto y quién después de la entrega. */
  piloto: string
  operacion: string
  permisos: Permiso[]
  noPuede: string[]
}

export const ROLES: Record<RolId, Rol> = {
  plataforma: {
    id: "plataforma",
    nombre: "Administración de la plataforma",
    descripcion: "Mantiene la infraestructura y las cuentas del personal.",
    piloto: "Arquitecto Cloud / MLOps",
    operacion: "Área de TI del STC",
    permisos: ["cuentas.ver", "cuentas.gestionar", "plataforma.ver", "plataforma.operar"],
    noPuede: ["Ver reportes, fotos o seudónimos", "Consultar la bitácora de auditoría", "Publicar modelos o contenidos", "Modificar su propia cuenta"],
  },
  datos: {
    id: "datos",
    nombre: "Ingeniería de datos",
    descripcion: "Opera la ingesta, las capturas del inventario y la calidad de los datos.",
    piloto: "Ingeniero de Datos",
    operacion: "Persona ingeniera de datos designada",
    permisos: ["datos.ver", "datos.operar", "modelos.ver"],
    noPuede: ["Ver reportes, fotos o seudónimos", "Publicar modelos", "Administrar cuentas"],
  },
  modelos: {
    id: "modelos",
    nombre: "Ciencia de datos e IA",
    descripcion: "Evalúa, publica y revierte el modelo de saturación y el perfil horario.",
    piloto: "Especialista en IA / ML",
    operacion: "Persona científica de datos designada",
    permisos: ["modelos.ver", "modelos.publicar", "datos.ver"],
    noPuede: ["Publicar un modelo que no supere la regla de HU-09", "Ver reportes, fotos o seudónimos", "Administrar cuentas"],
  },
  moderacion: {
    id: "moderacion",
    nombre: "Moderación de reportes",
    descripcion: "Revisa los reportes en cuarentena y sus fotos.",
    piloto: "Ingeniera de QA / UAT",
    operacion: "Personal de atención a usuarios del STC",
    permisos: ["moderacion.ver", "moderacion.decidir", "evidencias.ver"],
    noPuede: ["Ver el seudónimo completo de quien reporta", "Cambiar el estado oficial de un equipo", "Administrar cuentas o ver la bitácora"],
  },
  gobernanza: {
    id: "gobernanza",
    nombre: "Gobernanza y protección de datos",
    descripcion: "Vigila la LFPDPPP: ARCO, consentimientos, retención, accesos y auditoría.",
    piloto: "Oficial de Gobernanza de Datos",
    operacion: "Oficial de protección de datos del STC",
    permisos: [
      "privacidad.ver",
      "privacidad.arco",
      "privacidad.retencion",
      "accesos.recertificar",
      "cuentas.ver",
      "contenidos.ver",
      "contenidos.aprobar",
      "bitacora.ver",
    ],
    noPuede: ["Ver las fotos de los reportes", "Dar de alta cuentas o asignar roles (solo solicita revocaciones)", "Aprobar un contenido que propuso la misma persona"],
  },
  contenidos: {
    id: "contenidos",
    nombre: "Accesibilidad y contenidos",
    descripcion: "Redacta el contenido de emergencia y los textos con lenguaje inclusivo.",
    piloto: "Desarrollador Frontend / UX",
    operacion: "Persona responsable de comunicación accesible del STC",
    permisos: ["contenidos.ver", "contenidos.proponer"],
    noPuede: ["Publicar contenido sin la aprobación de Gobernanza", "Ver reportes, fotos o datos personales"],
  },
  supervision: {
    id: "supervision",
    nombre: "Supervisión del servicio",
    descripcion: "Consulta indicadores agregados, sin datos personales.",
    piloto: "Project Manager / Product Owner",
    operacion: "Dirección o enlace del STC",
    permisos: ["indicadores.ver"],
    noPuede: ["Ver datos personales, reportes individuales o fotos", "Ejecutar cualquier acción"],
  },
}

export const ORDEN_ROLES: RolId[] = ["plataforma", "datos", "modelos", "moderacion", "gobernanza", "contenidos", "supervision"]

/** Acciones finales que una cuenta externa nunca ejecuta: solo consulta y propone (RN8). */
export const ACCIONES_FINALES: Permiso[] = [
  "cuentas.gestionar",
  "plataforma.operar",
  "datos.operar",
  "modelos.publicar",
  "moderacion.decidir",
  "privacidad.arco",
  "privacidad.retencion",
  "accesos.recertificar",
  "contenidos.aprobar",
]

/** Pares de roles que una misma cuenta no puede tener (separación de funciones, RN9). */
export const ROLES_INCOMPATIBLES: Array<[RolId, RolId, string]> = [
  ["plataforma", "gobernanza", "quien administra las cuentas no puede auditarlas"],
  ["plataforma", "moderacion", "quien administra la plataforma no debe ver las fotos de los reportes"],
  ["gobernanza", "moderacion", "quien audita la moderación no puede moderar"],
  ["gobernanza", "contenidos", "quien aprueba el contenido no puede proponerlo"],
]

export type ModuloId = "inicio" | "cuentas" | "plataforma" | "datos" | "modelos" | "moderacion" | "privacidad" | "contenidos" | "bitacora" | "indicadores"

export const MODULOS: Array<{ id: ModuloId; nombre: string; requiere?: Permiso }> = [
  { id: "inicio", nombre: "Inicio" },
  { id: "indicadores", nombre: "Indicadores", requiere: "indicadores.ver" },
  { id: "cuentas", nombre: "Cuentas y roles", requiere: "cuentas.ver" },
  { id: "plataforma", nombre: "Plataforma", requiere: "plataforma.ver" },
  { id: "datos", nombre: "Datos", requiere: "datos.ver" },
  { id: "modelos", nombre: "Modelos", requiere: "modelos.ver" },
  { id: "moderacion", nombre: "Moderación", requiere: "moderacion.ver" },
  { id: "privacidad", nombre: "Privacidad", requiere: "privacidad.ver" },
  { id: "contenidos", nombre: "Contenidos", requiere: "contenidos.ver" },
  { id: "bitacora", nombre: "Bitácora", requiere: "bitacora.ver" },
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
/** Una cuenta sin acceso en este plazo se suspende y requiere recertificación. */
export const SUSPENSION_POR_INACTIVIDAD = 30 * DIA

export type TipoCuenta = "interno" | "externo" | "cliente"
export const TIPO_LABEL: Record<TipoCuenta, string> = { interno: "Equipo del proyecto", externo: "Especialista externo", cliente: "Cliente (STC)" }

export type Cuenta = {
  id: string
  nombre: string
  correo: string
  puesto: string
  roles: RolId[]
  tipo: TipoCuenta
  estado: "activa" | "suspendida"
  motivoSuspension?: string
  /** Fecha (ISO, AAAA-MM-DD) en que vence una cuenta externa. */
  vence?: string
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

export type SolicitudRevocacion = {
  id: string
  cuentaId: string
  motivo: string
  solicitadaPor: string
  ts: number
  estado: "pendiente" | "atendida" | "rechazada"
}

export type SolicitudArco = {
  id: string
  tipo: "Acceso" | "Rectificación" | "Cancelación" | "Oposición"
  seudonimo: string
  recibida: number
  estado: "pendiente" | "procedente" | "improcedente"
  respondida?: number
  respondidaPor?: string
}

export type ExcepcionHomologacion = {
  id: string
  fuente: "Inventario del STC" | "Afluencia diaria (ADIP)"
  original: string
  detalle: string
  estado: "pendiente" | "resuelta"
  station?: string
  resueltaPor?: string
}

export type Ejecucion = {
  id: string
  trabajo: string
  programa: string
  ts: number
  resultado: "éxito" | "falla"
  detalle: string
}

export type VersionModelo = {
  id: string
  algoritmo: string
  entrenado: string
  f1Macro: number
  recallAlta: number
  exactitud: number
  estado: "vigente" | "candidato" | "retirado"
  f1PorLinea: Record<string, number>
}

export type RevisionDespliegue = { id: string; servicio: string; ts: number; estado: "vigente" | "anterior"; nota: string }

export type ContenidoEmergencia = {
  version: number
  pasos: string[]
  fuente: string
  actualizado: string
  aprobadoPor?: string
  ejemplo: boolean
}

export type BorradorContenido = {
  pasos: string[]
  fuente: string
  propuestoPor: string
  ts: number
  estado: "en_revision" | "devuelto"
  observaciones?: string
}

export type Recertificacion = { cuentaId: string; decision: "mantener" | "revocar"; por: string; ts: number }

export type EstadoConsola = {
  cuentas: Cuenta[]
  auditoria: EventoAuditoria[]
  revocaciones: SolicitudRevocacion[]
  arco: SolicitudArco[]
  excepciones: ExcepcionHomologacion[]
  ejecuciones: Ejecucion[]
  modelos: VersionModelo[]
  despliegues: RevisionDespliegue[]
  contenido: { publicado: ContenidoEmergencia; borrador?: BorradorContenido }
  recertificaciones: Recertificacion[]
}

export type SesionPersonal = { cuentaId: string; inicio: number; ultimaActividad: number }

/* ------------------------------------------------------------------ */
/* Permisos efectivos                                                  */
/* ------------------------------------------------------------------ */

const hoyIso = (now: number) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function cuentaVigente(c: Cuenta, now: number): { ok: boolean; motivo?: string } {
  if (c.estado === "suspendida") return { ok: false, motivo: c.motivoSuspension ?? "Cuenta suspendida" }
  if (c.vence && c.vence < hoyIso(now)) return { ok: false, motivo: `La cuenta venció el ${c.vence}` }
  if (c.ultimoAcceso && now - c.ultimoAcceso > SUSPENSION_POR_INACTIVIDAD) return { ok: false, motivo: "Más de 30 días sin acceso: requiere recertificación" }
  if (c.roles.length === 0) return { ok: false, motivo: "La cuenta no tiene roles asignados" }
  return { ok: true }
}

/** Permisos efectivos de una cuenta (RN8): unión de sus roles, sin acciones finales si es externa. */
export function permisosDe(c: Cuenta | undefined, now: number): Set<Permiso> {
  if (!c || !cuentaVigente(c, now).ok) return new Set()
  const todos = new Set(c.roles.flatMap((r) => ROLES[r].permisos))
  if (c.tipo === "externo") for (const p of ACCIONES_FINALES) todos.delete(p)
  return todos
}

export function puede(c: Cuenta | undefined, p: Permiso, now: number): boolean {
  return permisosDe(c, now).has(p)
}

export function modulosVisibles(c: Cuenta | undefined, now: number) {
  const permisos = permisosDe(c, now)
  if (permisos.size === 0) return []
  return MODULOS.filter((m) => !m.requiere || permisos.has(m.requiere))
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

function actor(c: Cuenta): { actor: string; rol: string } {
  return { actor: `${c.nombre} <${c.correo}>`, rol: c.roles.map((r) => ROLES[r].nombre).join(", ") }
}

export type Resultado = { ok: true; mensaje: string } | { ok: false; codigo: 400 | 401 | 403 | 409; mensaje: string }

/** Verifica el permiso, registra la negación en la bitácora y devuelve 403 (RNF-06). */
function exigir(e: EstadoConsola, c: Cuenta, p: Permiso, objeto: string, now: number): Resultado | null {
  if (puede(c, p, now)) return null
  const externa = c.tipo === "externo" && ACCIONES_FINALES.includes(p) && c.roles.some((r) => ROLES[r].permisos.includes(p))
  const mensaje = externa
    ? "Las cuentas de especialistas externos solo consultan y proponen; esta acción la ejecuta una persona del equipo."
    : "Tu rol no tiene permiso para esta acción."
  auditar(e, { ...actor(c), accion: `intento: ${PERMISO_LABEL[p].toLowerCase()}`, objeto, resultado: "denegado", detalle: "403" }, now)
  return { ok: false, codigo: 403, mensaje }
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
  const vig = cuentaVigente(c, now)
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
/* Cuentas: alta, roles, suspensión (HU-23)                            */
/* ------------------------------------------------------------------ */

export type DatosCuenta = { nombre: string; correo: string; puesto: string; roles: RolId[]; tipo: TipoCuenta; vence?: string }

export function validarCuenta(d: DatosCuenta, existentes: Cuenta[], idEditando: string | null, now: number): string[] {
  const errores: string[] = []
  if (d.nombre.trim().length < 3) errores.push("Escribe el nombre de la persona o del puesto.")
  if (!d.correo.toLowerCase().endsWith(`@${DOMINIO}`)) errores.push(`El correo debe ser una cuenta institucional @${DOMINIO} (Cloud Identity).`)
  if (existentes.some((c) => c.correo.toLowerCase() === d.correo.toLowerCase() && c.id !== idEditando)) errores.push("Ya existe una cuenta con ese correo.")
  if (d.roles.length === 0) errores.push("Asigna al menos un rol.")
  for (const [a, b, razon] of ROLES_INCOMPATIBLES) {
    if (d.roles.includes(a) && d.roles.includes(b)) errores.push(`No se pueden combinar «${ROLES[a].nombre}» y «${ROLES[b].nombre}»: ${razon}.`)
  }
  if (d.tipo === "externo") {
    if (!d.vence) errores.push("Las cuentas externas requieren fecha de vencimiento (fin del contrato).")
    else if (d.vence < hoyIso(now)) errores.push("La fecha de vencimiento ya pasó.")
    else if (new Date(d.vence).getTime() - now > 183 * DIA) errores.push("Una cuenta externa no puede durar más de 6 meses sin renovarse.")
  }
  return errores
}

export function altaCuenta(e: EstadoConsola, quien: Cuenta, d: DatosCuenta, now: number): Resultado {
  const negado = exigir(e, quien, "cuentas.gestionar", d.correo, now)
  if (negado) return negado
  const errores = validarCuenta(d, e.cuentas, null, now)
  if (errores.length) return { ok: false, codigo: 400, mensaje: errores.join(" ") }
  const nueva: Cuenta = { id: `C-${now.toString(36).toUpperCase()}`, ...d, estado: "activa", alta: now, creadaPor: quien.nombre }
  e.cuentas.push(nueva)
  auditar(e, { ...actor(quien), accion: "alta de cuenta", objeto: d.correo, resultado: "permitido", detalle: d.roles.map((r) => ROLES[r].nombre).join(", ") }, now)
  return { ok: true, mensaje: `Cuenta creada para ${d.nombre}.` }
}

export function cambiarRoles(e: EstadoConsola, quien: Cuenta, cuentaId: string, roles: RolId[], now: number): Resultado {
  const c = e.cuentas.find((x) => x.id === cuentaId)
  if (!c) return { ok: false, codigo: 400, mensaje: "La cuenta no existe." }
  const negado = exigir(e, quien, "cuentas.gestionar", c.correo, now)
  if (negado) return negado
  if (c.id === quien.id) {
    auditar(e, { ...actor(quien), accion: "cambio de roles propio", objeto: c.correo, resultado: "denegado", detalle: "RN9: nadie modifica su propia cuenta" }, now)
    return { ok: false, codigo: 403, mensaje: "Nadie puede modificar los roles de su propia cuenta (RN9)." }
  }
  const errores = validarCuenta({ ...c, roles }, e.cuentas, c.id, now).filter((m) => !m.includes("vencimiento ya pasó"))
  if (errores.length) return { ok: false, codigo: 400, mensaje: errores.join(" ") }
  const antes = c.roles.map((r) => ROLES[r].nombre).join(", ")
  c.roles = roles
  auditar(e, { ...actor(quien), accion: "cambio de roles", objeto: c.correo, resultado: "permitido", detalle: `${antes} → ${roles.map((r) => ROLES[r].nombre).join(", ")}` }, now)
  return { ok: true, mensaje: "Roles actualizados." }
}

export function cambiarEstadoCuenta(e: EstadoConsola, quien: Cuenta, cuentaId: string, estado: "activa" | "suspendida", motivo: string, now: number): Resultado {
  const c = e.cuentas.find((x) => x.id === cuentaId)
  if (!c) return { ok: false, codigo: 400, mensaje: "La cuenta no existe." }
  const negado = exigir(e, quien, "cuentas.gestionar", c.correo, now)
  if (negado) return negado
  if (c.id === quien.id) return { ok: false, codigo: 403, mensaje: "Nadie puede suspender o reactivar su propia cuenta (RN9)." }
  if (estado === "suspendida" && !motivo.trim()) return { ok: false, codigo: 400, mensaje: "Indica el motivo de la suspensión." }
  c.estado = estado
  c.motivoSuspension = estado === "suspendida" ? motivo.trim() : undefined
  if (estado === "activa") c.ultimoAcceso = now
  for (const r of e.revocaciones) if (r.cuentaId === c.id && r.estado === "pendiente" && estado === "suspendida") r.estado = "atendida"
  auditar(e, { ...actor(quien), accion: estado === "suspendida" ? "suspensión de cuenta" : "reactivación de cuenta", objeto: c.correo, resultado: "permitido", detalle: motivo || undefined }, now)
  return { ok: true, mensaje: estado === "suspendida" ? "Cuenta suspendida." : "Cuenta reactivada." }
}

/* ------------------------------------------------------------------ */
/* Recertificación de accesos (HU-27)                                  */
/* ------------------------------------------------------------------ */

export function recertificar(e: EstadoConsola, quien: Cuenta, cuentaId: string, decision: "mantener" | "revocar", motivo: string, now: number): Resultado {
  const c = e.cuentas.find((x) => x.id === cuentaId)
  if (!c) return { ok: false, codigo: 400, mensaje: "La cuenta no existe." }
  const negado = exigir(e, quien, "accesos.recertificar", c.correo, now)
  if (negado) return negado
  if (c.id === quien.id) return { ok: false, codigo: 403, mensaje: "Nadie recertifica su propio acceso (RN9)." }
  if (decision === "revocar" && !motivo.trim()) return { ok: false, codigo: 400, mensaje: "Indica el motivo de la revocación." }
  e.recertificaciones.unshift({ cuentaId, decision, por: quien.nombre, ts: now })
  if (decision === "revocar") {
    e.revocaciones.unshift({ id: `RV-${now.toString(36).toUpperCase()}`, cuentaId, motivo: motivo.trim(), solicitadaPor: quien.nombre, ts: now, estado: "pendiente" })
  }
  auditar(e, { ...actor(quien), accion: decision === "mantener" ? "recertificación: mantener acceso" : "solicitud de revocación", objeto: c.correo, resultado: "permitido", detalle: motivo || undefined }, now)
  return { ok: true, mensaje: decision === "mantener" ? "Acceso recertificado." : "Solicitud enviada a Administración de la plataforma." }
}

/* ------------------------------------------------------------------ */
/* Datos: excepciones de homologación y ejecuciones (HU-25)            */
/* ------------------------------------------------------------------ */

const tokens = (t: string) =>
  normalizar(t)
    .replace(/\bs\.\s*/g, "san ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** Sugiere la estación del catálogo más parecida a un nombre escrito de otra forma. */
export function sugerirEstacion(original: string): { station: string; puntaje: number } {
  const t = tokens(original)
  let mejor = { station: allStations[0], puntaje: -1 }
  for (const s of allStations) {
    const ts = tokens(s)
    const coinciden = t.filter((x) => ts.some((y) => y.startsWith(x) || x.startsWith(y))).length
    const puntaje = coinciden / Math.max(t.length, 1) - 0.01 * Math.abs(ts.length - t.length)
    if (puntaje > mejor.puntaje) mejor = { station: s, puntaje }
  }
  return mejor
}

export function resolverExcepcion(e: EstadoConsola, quien: Cuenta, id: string, station: string, now: number): Resultado {
  const x = e.excepciones.find((y) => y.id === id)
  if (!x) return { ok: false, codigo: 400, mensaje: "La excepción no existe." }
  const negado = exigir(e, quien, "datos.operar", x.original, now)
  if (negado) return negado
  if (!allStations.includes(station)) return { ok: false, codigo: 400, mensaje: "Elige una estación del catálogo." }
  x.estado = "resuelta"
  x.station = station
  x.resueltaPor = quien.nombre
  auditar(e, { ...actor(quien), accion: "homologación manual", objeto: `${x.fuente}: «${x.original}»`, resultado: "permitido", detalle: `→ ${station}` }, now)
  return { ok: true, mensaje: `«${x.original}» quedó asociado a ${station}.` }
}

/** Nombres de estación en las tres fuentes que se homologaron sin revisión manual (demostrativo). */
export const HOMOLOGADAS_AUTOMATICAMENTE = 158

export function calidadHomologacion(e: EstadoConsola) {
  const total = HOMOLOGADAS_AUTOMATICAMENTE + e.excepciones.length
  const resueltas = e.excepciones.filter((x) => x.estado === "resuelta").length
  return {
    automatica: HOMOLOGADAS_AUTOMATICAMENTE / total,
    final: (HOMOLOGADAS_AUTOMATICAMENTE + resueltas) / total,
    pendientes: e.excepciones.length - resueltas,
  }
}

export function reintentarEjecucion(e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const x = e.ejecuciones.find((y) => y.id === id)
  if (!x) return { ok: false, codigo: 400, mensaje: "La ejecución no existe." }
  const negado = exigir(e, quien, "datos.operar", x.trabajo, now)
  if (negado) return negado
  if (x.resultado === "éxito") return { ok: false, codigo: 409, mensaje: "La ejecución terminó con éxito; no hay nada que reintentar." }
  const nueva: Ejecucion = { id: `EJ-${now.toString(36).toUpperCase()}`, trabajo: x.trabajo, programa: "Reintento manual", ts: now, resultado: "éxito", detalle: "Esquema validado; serie nueva guardada como vigente (versión anterior conservada)." }
  e.ejecuciones.unshift(nueva)
  auditar(e, { ...actor(quien), accion: "reintento de ejecución", objeto: x.trabajo, resultado: "permitido", detalle: nueva.detalle }, now)
  return { ok: true, mensaje: "Reintento ejecutado con éxito." }
}

export function sumaPerfilHorario(): Record<string, number> {
  return Object.fromEntries(Object.entries(PERFIL_HORARIO).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)]))
}

/* ------------------------------------------------------------------ */
/* Modelos: publicación controlada (HU-26, regla de HU-09)            */
/* ------------------------------------------------------------------ */

export const REFERENCIA = { nombre: "Clase más frecuente por estación y día de la semana", f1Macro: 0.76, recallAlta: 0.81 }
export const F1_MINIMO = 0.79
export const MARGEN = 0.02

export function evaluarPublicacion(candidato: VersionModelo, vigente: VersionModelo | undefined): { ok: boolean; motivos: string[] } {
  const motivos: string[] = []
  const r2 = (n: number) => Math.round(n * 100) / 100
  if (candidato.f1Macro < F1_MINIMO) motivos.push(`F1 macro ${candidato.f1Macro.toFixed(2)} < ${F1_MINIMO}`)
  if (r2(candidato.f1Macro - REFERENCIA.f1Macro) < MARGEN) motivos.push(`no supera a la referencia por ${MARGEN} de F1 macro`)
  if (candidato.recallAlta < REFERENCIA.recallAlta) motivos.push(`recall de la clase alta ${candidato.recallAlta.toFixed(2)} menor que el de la referencia (${REFERENCIA.recallAlta})`)
  if (vigente) {
    if (r2(candidato.f1Macro - vigente.f1Macro) < MARGEN) motivos.push(`no supera al modelo vigente por ${MARGEN} de F1 macro`)
    if (candidato.recallAlta < vigente.recallAlta) motivos.push("reduce el recall de la clase alta respecto al vigente")
  }
  return { ok: motivos.length === 0, motivos }
}

export function publicarModelo(e: EstadoConsola, quien: Cuenta, id: string, now: number): Resultado {
  const cand = e.modelos.find((m) => m.id === id)
  if (!cand || cand.estado !== "candidato") return { ok: false, codigo: 400, mensaje: "Elige un modelo candidato." }
  const negado = exigir(e, quien, "modelos.publicar", cand.id, now)
  if (negado) return negado
  const vigente = e.modelos.find((m) => m.estado === "vigente")
  const ev = evaluarPublicacion(cand, vigente)
  if (!ev.ok) {
    auditar(e, { ...actor(quien), accion: "publicación de modelo", objeto: cand.id, resultado: "denegado", detalle: ev.motivos.join("; ") }, now)
    return { ok: false, codigo: 409, mensaje: `No se publica: ${ev.motivos.join("; ")}.` }
  }
  if (vigente) vigente.estado = "retirado"
  cand.estado = "vigente"
  auditar(e, { ...actor(quien), accion: "publicación de modelo", objeto: cand.id, resultado: "permitido", detalle: `F1 macro ${cand.f1Macro.toFixed(2)}; reemplaza a ${vigente?.id ?? "—"}` }, now)
  return { ok: true, mensaje: `${cand.id} es ahora el modelo vigente; ${vigente?.id ?? "el anterior"} se conserva para reversión.` }
}

export function revertirModelo(e: EstadoConsola, quien: Cuenta, motivo: string, now: number): Resultado {
  const negado = exigir(e, quien, "modelos.publicar", "modelo vigente", now)
  if (negado) return negado
  if (!motivo.trim()) return { ok: false, codigo: 400, mensaje: "Indica el motivo de la reversión." }
  const vigente = e.modelos.find((m) => m.estado === "vigente")
  const anterior = e.modelos.find((m) => m.estado === "retirado")
  if (!vigente || !anterior) return { ok: false, codigo: 409, mensaje: "No hay una versión anterior para revertir." }
  vigente.estado = "candidato"
  anterior.estado = "vigente"
  auditar(e, { ...actor(quien), accion: "reversión de modelo", objeto: `${vigente.id} → ${anterior.id}`, resultado: "permitido", detalle: motivo.trim() }, now)
  return { ok: true, mensaje: `Se restauró ${anterior.id}.` }
}

/* ------------------------------------------------------------------ */
/* Plataforma: reversión de despliegue (RD-08)                         */
/* ------------------------------------------------------------------ */

export function revertirDespliegue(e: EstadoConsola, quien: Cuenta, servicio: string, motivo: string, now: number): Resultado {
  const negado = exigir(e, quien, "plataforma.operar", servicio, now)
  if (negado) return negado
  if (!motivo.trim()) return { ok: false, codigo: 400, mensaje: "Indica el motivo de la reversión." }
  const revs = e.despliegues.filter((d) => d.servicio === servicio)
  const vigente = revs.find((d) => d.estado === "vigente")
  const anterior = revs.find((d) => d.estado === "anterior")
  if (!vigente || !anterior) return { ok: false, codigo: 409, mensaje: "No hay una revisión anterior." }
  vigente.estado = "anterior"
  anterior.estado = "vigente"
  auditar(e, { ...actor(quien), accion: "reversión de despliegue", objeto: `${servicio}: ${vigente.id} → ${anterior.id}`, resultado: "permitido", detalle: motivo.trim() }, now)
  return { ok: true, mensaje: `${servicio} volvió a ${anterior.id}.` }
}

/* ------------------------------------------------------------------ */
/* Contenidos: propuesta y aprobación con doble control (HU-28, RN9)   */
/* ------------------------------------------------------------------ */

/** Términos a evitar (RNF-23). */
export const TERMINOS_A_EVITAR = ["discapacitado", "discapacitada", "invidente", "minusválido", "minusválida", "sufre de", "visibilidad nula"]

export function revisarTerminologia(textos: string[]): string[] {
  const todo = normalizar(textos.join(" "))
  return TERMINOS_A_EVITAR.filter((t) => todo.includes(normalizar(t)))
}

export function proponerContenido(e: EstadoConsola, quien: Cuenta, pasos: string[], fuente: string, now: number): Resultado {
  const negado = exigir(e, quien, "contenidos.proponer", "contenido de emergencia", now)
  if (negado) return negado
  const limpios = pasos.map((p) => p.trim()).filter(Boolean)
  if (limpios.length < 2) return { ok: false, codigo: 400, mensaje: "El contenido debe tener al menos dos pasos." }
  if (!fuente.trim()) return { ok: false, codigo: 400, mensaje: "Indica la fuente oficial y la fecha de consulta (CA-15.1)." }
  const terminos = revisarTerminologia(limpios)
  if (terminos.length) return { ok: false, codigo: 400, mensaje: `Cambia estos términos antes de enviar (RNF-23): ${terminos.join(", ")}.` }
  e.contenido.borrador = { pasos: limpios, fuente: fuente.trim(), propuestoPor: quien.nombre, ts: now, estado: "en_revision" }
  auditar(e, { ...actor(quien), accion: "propuesta de contenido", objeto: "contenido de emergencia", resultado: "permitido", detalle: `${limpios.length} pasos` }, now)
  return { ok: true, mensaje: "Propuesta enviada a Gobernanza para su aprobación." }
}

export function decidirContenido(e: EstadoConsola, quien: Cuenta, decision: "aprobar" | "devolver", observaciones: string, now: number): Resultado {
  const b = e.contenido.borrador
  if (!b || b.estado !== "en_revision") return { ok: false, codigo: 409, mensaje: "No hay una propuesta en revisión." }
  const negado = exigir(e, quien, "contenidos.aprobar", "contenido de emergencia", now)
  if (negado) return negado
  if (b.propuestoPor === quien.nombre) {
    auditar(e, { ...actor(quien), accion: "aprobación de contenido propio", objeto: "contenido de emergencia", resultado: "denegado", detalle: "RN9: doble control" }, now)
    return { ok: false, codigo: 403, mensaje: "Quien propone un contenido no puede aprobarlo (RN9)." }
  }
  if (decision === "devolver") {
    if (!observaciones.trim()) return { ok: false, codigo: 400, mensaje: "Escribe las observaciones para quien propuso el contenido." }
    b.estado = "devuelto"
    b.observaciones = observaciones.trim()
    auditar(e, { ...actor(quien), accion: "contenido devuelto", objeto: "contenido de emergencia", resultado: "permitido", detalle: observaciones.trim() }, now)
    return { ok: true, mensaje: "Propuesta devuelta con observaciones." }
  }
  const fecha = new Date(now).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
  e.contenido.publicado = { version: e.contenido.publicado.version + 1, pasos: b.pasos, fuente: b.fuente, actualizado: fecha, aprobadoPor: quien.nombre, ejemplo: false }
  e.contenido.borrador = undefined
  auditar(e, { ...actor(quien), accion: "publicación de contenido", objeto: `contenido de emergencia v${e.contenido.publicado.version}`, resultado: "permitido", detalle: `propuesto por ${b.propuestoPor}` }, now)
  return { ok: true, mensaje: `Publicada la versión ${e.contenido.publicado.version}. El botón de emergencia de la app ya la muestra.` }
}

/* ------------------------------------------------------------------ */
/* Privacidad: ARCO (art. 31 LFPDPPP)                                  */
/* ------------------------------------------------------------------ */

/** Plazo para comunicar la respuesta: 20 días hábiles (LFPDPPP, 2025, arts. 2 fr. VIII y 31). */
export const PLAZO_ARCO = 20

export function diasHabiles(desde: number, hasta: number): number {
  let n = 0
  const d = new Date(desde)
  d.setHours(0, 0, 0, 0)
  const fin = new Date(hasta)
  fin.setHours(0, 0, 0, 0)
  while (d < fin) {
    d.setDate(d.getDate() + 1)
    const w = d.getDay()
    if (w !== 0 && w !== 6) n++
  }
  return n
}

export function restarDiasHabiles(desde: number, dias: number): number {
  const d = new Date(desde)
  let n = 0
  while (n < dias) {
    d.setDate(d.getDate() - 1)
    const w = d.getDay()
    if (w !== 0 && w !== 6) n++
  }
  return d.getTime()
}

export function responderArco(e: EstadoConsola, quien: Cuenta, id: string, decision: "procedente" | "improcedente", now: number): Resultado {
  const s = e.arco.find((x) => x.id === id)
  if (!s || s.estado !== "pendiente") return { ok: false, codigo: 409, mensaje: "La solicitud no está pendiente." }
  const negado = exigir(e, quien, "privacidad.arco", s.id, now)
  if (negado) return negado
  s.estado = decision
  s.respondida = now
  s.respondidaPor = quien.nombre
  auditar(e, { ...actor(quien), accion: `respuesta ARCO (${s.tipo})`, objeto: s.id, resultado: "permitido", detalle: decision }, now)
  return { ok: true, mensaje: decision === "procedente" ? `${s.id} respondida: procedente. Debe hacerse efectiva en 15 días hábiles.` : `${s.id} respondida: improcedente, con su fundamento.` }
}

/* ------------------------------------------------------------------ */
/* Estado inicial de demostración                                      */
/* ------------------------------------------------------------------ */

export const CONTENIDO_EJEMPLO: ContenidoEmergencia = {
  version: 1,
  ejemplo: true,
  pasos: [
    "Si tú u otra persona están en peligro inmediato, llama al 911.",
    "Pide apoyo al personal del Metro o a la policía de la estación; puedes identificarlos por su uniforme.",
    "Si quedas dentro de un elevador detenido, usa el botón de alarma o el interfón del elevador y espera instrucciones. No intentes abrir las puertas.",
    "Dentro del tren, usa el dispositivo de emergencia del vagón solo ante una emergencia real.",
    "Nunca bajes a las vías. Si algo cae a las vías, avisa al personal.",
  ],
  fuente: "Contenido de ejemplo del equipo, pendiente de sustituir por la fuente oficial del STC.",
  actualizado: "octubre de 2026",
}

const PROPUESTA_OFICIAL: string[] = [
  "Si tú u otra persona están en peligro inmediato, llama al 911.",
  "En la estación, identifica al personal del STC (jefe de estación, policía, vigilante o taquillera) e infórmale de inmediato.",
  "Si no hay personal cerca, acciona el botón de alarma, que generalmente está al centro del andén.",
  "Dentro del tren, acciona la palanca de emergencia junto a las puertas: el tren se detiene en la siguiente estación y el personal acude.",
  "Los ruptores, las alarmas y los teléfonos rojos se usan solo en emergencias reales, como incendios o accidentes graves.",
  "Ante un sismo, un incendio o un objeto sospechoso, sigue las instrucciones del personal y repórtalo al jefe de estación o a la Policía Auxiliar.",
  "Orientación e Información del STC: 5709 1133 (ext. 5009 y 5051), 5627 4741 y 5627 4950.",
]

function cuenta(id: string, nombre: string, usuario: string, puesto: string, roles: RolId[], tipo: TipoCuenta, now: number, extra: Partial<Cuenta> = {}): Cuenta {
  return { id, nombre, correo: `${usuario}@${DOMINIO}`, puesto, roles, tipo, estado: "activa", alta: now - 9 * DIA, ultimoAcceso: now - 2 * DIA, creadaPor: "Configuración inicial", ...extra }
}

const f1Lineas = (base: number): Record<string, number> => {
  const ajustes: Record<string, number> = { "1": 0.02, "2": 0.03, "3": 0.01, "4": -0.04, "5": -0.02, "6": -0.05, "7": 0, "8": -0.01, "9": 0.01, A: -0.06, B: -0.03, "12": -0.08 }
  return Object.fromEntries(Object.entries(ajustes).map(([k, v]) => [k, Math.round((base + v) * 100) / 100]))
}

export function estadoInicial(now: number): EstadoConsola {
  const venceContratos = "2026-12-06"
  const cuentas: Cuenta[] = [
    cuenta("C-PEDRO", "Pedro Iván Robles Cervantes", "pedro.robles", "Arquitecto Cloud / MLOps", ["plataforma"], "interno", now),
    cuenta("C-SAID", "Said Cariño Sánchez", "said.carino", "Ingeniero de Datos y Especialista en IA / ML", ["datos", "modelos"], "interno", now),
    cuenta("C-BRISA", "Brisa Isabel Garcés Valencia", "brisa.garces", "Ingeniera de QA / UAT", ["moderacion"], "interno", now),
    cuenta("C-EDWARD", "Edward Gonzalez Magdaleno", "edward.gonzalez", "Oficial de Gobernanza de Datos", ["gobernanza"], "interno", now),
    cuenta("C-MANUEL", "Manuel García Venegas", "manuel.garcia", "Desarrollador Frontend / UX", ["contenidos"], "interno", now),
    cuenta("C-DIANA", "Diana María Vélez Gallardo", "diana.velez", "Project Manager / Product Owner", ["supervision"], "interno", now),
    cuenta("C-EXT-PD", "Especialista en protección de datos", "esp.privacidad", "Consultoría externa (36 h)", ["gobernanza"], "externo", now, { vence: venceContratos }),
    cuenta("C-EXT-AC", "Especialista en accesibilidad digital", "esp.accesibilidad", "Consultoría externa (48 h)", ["contenidos"], "externo", now, { vence: venceContratos }),
    cuenta("C-STC", "Enlace del STC", "enlace.stc", "Dirección o enlace del cliente", ["supervision"], "cliente", now),
    cuenta("C-SUSP", "Cuenta de prueba suspendida", "cuenta.suspendida", "Ejemplo de suspensión por inactividad", ["datos"], "interno", now, {
      estado: "suspendida",
      motivoSuspension: "Más de 30 días sin acceso: requiere recertificación",
      ultimoAcceso: now - 41 * DIA,
    }),
  ]
  const hoy6 = new Date(now)
  hoy6.setHours(6, 0, 0, 0)
  if (hoy6.getTime() > now) hoy6.setDate(hoy6.getDate() - 1)
  const mesActual = new Date(now)
  mesActual.setDate(1)
  mesActual.setHours(3, 0, 0, 0)
  const mesAnterior = new Date(mesActual)
  mesAnterior.setMonth(mesAnterior.getMonth() - 1)

  const e: EstadoConsola = {
    cuentas,
    auditoria: [],
    revocaciones: [],
    recertificaciones: [],
    arco: [
      { id: "ARCO-0007", tipo: "Acceso", seudonimo: "3f9a2c71e0", recibida: restarDiasHabiles(now, 4), estado: "pendiente" },
      { id: "ARCO-0006", tipo: "Cancelación", seudonimo: "b81d0e4f9a", recibida: restarDiasHabiles(now, 17), estado: "pendiente" },
      { id: "ARCO-0005", tipo: "Rectificación", seudonimo: "77ce10a3b2", recibida: restarDiasHabiles(now, 30), estado: "procedente", respondida: restarDiasHabiles(now, 22), respondidaPor: "Edward Gonzalez Magdaleno" },
    ],
    excepciones: [
      { id: "EX-01", fuente: "Inventario del STC", original: "S. ANDRES TOMATLAN", detalle: "Nombre abreviado" },
      { id: "EX-02", fuente: "Inventario del STC", original: "HOSPITAL 20 DE NOV", detalle: "Nombre abreviado" },
      { id: "EX-03", fuente: "Inventario del STC", original: "PANTITLAN", detalle: "Sin acento y sin línea asignada (Línea A)" },
      { id: "EX-04", fuente: "Inventario del STC", original: "OCEANIA", detalle: "Sin línea asignada (Línea B)" },
      { id: "EX-05", fuente: "Afluencia diaria (ADIP)", original: "Etiopía", detalle: "Nombre corto" },
      { id: "EX-06", fuente: "Afluencia diaria (ADIP)", original: "Ferrería", detalle: "Nombre corto" },
    ].map((x) => ({ ...x, estado: "pendiente" as const })) as ExcepcionHomologacion[],
    ejecuciones: [
      { id: "EJ-1", trabajo: "Captura diaria del inventario de equipos", programa: "Diaria 06:00", ts: hoy6.getTime(), resultado: "éxito", detalle: "673 equipos capturados con marca de tiempo; 0 sobrescrituras del histórico." },
      { id: "EJ-2", trabajo: "Ingesta de afluencia diaria (ADIP)", programa: "Mensual, día 1, 03:00", ts: mesActual.getTime(), resultado: "falla", detalle: "Cambio de esquema: falta el campo «linea». Se conservó la serie vigente (RNF-09)." },
      { id: "EJ-3", trabajo: "Perfil horario y saturación por franja", programa: "Mensual, después de la ingesta", ts: mesAnterior.getTime() + 2 * HORA, resultado: "éxito", detalle: "Perfil EOD 2017 v3; fracciones por tipo de día = 1." },
      { id: "EJ-4", trabajo: "Ingesta de afluencia diaria (ADIP)", programa: "Mensual, día 1, 03:00", ts: mesAnterior.getTime(), resultado: "éxito", detalle: "Esquema validado; serie versionada en Cloud Storage." },
    ],
    modelos: [
      { id: "sat-2026.11-gb", algoritmo: "Gradient Boosting (histogramas)", entrenado: "nov 2026", f1Macro: 0.84, recallAlta: 0.85, exactitud: 0.85, estado: "candidato", f1PorLinea: f1Lineas(0.84) },
      { id: "sat-2026.11-gb-sin-rezagos", algoritmo: "Gradient Boosting sin rezagos", entrenado: "nov 2026", f1Macro: 0.82, recallAlta: 0.8, exactitud: 0.83, estado: "candidato", f1PorLinea: f1Lineas(0.82) },
      { id: "sat-2026.10-rf", algoritmo: "Random Forest", entrenado: "oct 2026", f1Macro: 0.81, recallAlta: 0.83, exactitud: 0.82, estado: "vigente", f1PorLinea: f1Lineas(0.81) },
    ],
    despliegues: [
      { id: "api-00012", servicio: "API pública de ruteo y reportes", ts: now - 1 * DIA, estado: "vigente", nota: "Validación comunitaria v2" },
      { id: "api-00011", servicio: "API pública de ruteo y reportes", ts: now - 8 * DIA, estado: "anterior", nota: "Versión del pitch" },
      { id: "consola-00003", servicio: "Consola del personal (IAP)", ts: now - 1 * DIA, estado: "vigente", nota: "Roles y bitácora" },
      { id: "consola-00002", servicio: "Consola del personal (IAP)", ts: now - 6 * DIA, estado: "anterior", nota: "Moderación" },
    ],
    contenido: {
      publicado: CONTENIDO_EJEMPLO,
      borrador: {
        pasos: PROPUESTA_OFICIAL,
        fuente: "Sistema de Transporte Colectivo (s. f.-a, s. f.-c): Manual para el usuario del Metro y Qué hacer en caso de emergencia médica; consultados el 1 de octubre de 2026.",
        propuestoPor: "Manuel García Venegas",
        ts: now - 3 * HORA,
        estado: "en_revision",
      },
    },
  }
  auditar(e, { actor: "Configuración inicial", rol: "sistema", accion: "carga de cuentas del personal", objeto: `${cuentas.length} cuentas`, resultado: "permitido", detalle: "IAP: solo cuentas de Cloud Identity con verificación en dos pasos" }, now - 9 * DIA)
  auditar(e, { actor: "Manuel García Venegas <manuel.garcia@metrosinbarreras.com.mx>", rol: ROLES.contenidos.nombre, accion: "propuesta de contenido", objeto: "contenido de emergencia", resultado: "permitido", detalle: `${PROPUESTA_OFICIAL.length} pasos con fuente del STC` }, now - 3 * HORA)
  return e
}

/* ------------------------------------------------------------------ */
/* Exportación de la bitácora                                          */
/* ------------------------------------------------------------------ */

export function bitacoraCsv(eventos: EventoAuditoria[]): string {
  const esc = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`
  const filas = eventos.map((x) => [new Date(x.ts).toISOString(), x.actor, x.rol, x.accion, x.objeto, x.resultado, x.detalle].map((v) => esc(v)).join(","))
  return ["fecha_hora,actor,rol,accion,objeto,resultado,detalle", ...filas].join("\n")
}
