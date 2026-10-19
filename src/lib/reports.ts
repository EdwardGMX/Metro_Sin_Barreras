/**
 * Backend SIMULADO de reportes (RF-06, RF-16, RF-19, RF-20; RN2, RN3, RN5).
 * En producción estas colecciones viven en Firestore y solo la API las toca;
 * aquí se guardan en el navegador para que el prototipo funcione sin servidor.
 */
import { equipoPorId, todosLosEquipos, ultimaCaptura } from "../data/accessibility"
import type { EstadoEquipo } from "./router"

export type EstadoReportado = "no_funciona" | "con_fallas" | "cerrado" | "funciona"

export const ESTADO_REPORTADO_LABEL: Record<EstadoReportado, string> = {
  no_funciona: "No funciona",
  con_fallas: "Funciona con fallas",
  cerrado: "Cerrado o acordonado",
  funciona: "Funciona de nuevo",
}

export type Usuario = {
  seudonimo: string
  nivel: "Llave" | "Llave Verificada"
  verificado: boolean
  consentimiento?: { fecha: number; version: string }
  alta: number
}

export type Reporte = {
  id: string
  station: string
  equipmentId: string
  estado: EstadoReportado
  ts: number
  seudonimo: string
  verificado: boolean
  evidencias: string[]
  cuarentena: boolean
  motivoCuarentena?: string
  moderacion: "pendiente" | "aprobado" | "rechazado" | null
}

export type EvidenciaMeta = {
  id: string
  reporteId: string
  formato: string
  bytes: number
  ancho: number
  alto: number
  sha256: string
  borrarEn: number
  repetida: boolean
}

export type EventoBitacora = { ts: number; evento: string; objeto: string; decision: string; rol: string }

export type BaseDatos = {
  usuarios: Record<string, Usuario>
  reportes: Reporte[]
  evidencias: EvidenciaMeta[]
  bitacora: EventoBitacora[]
}

export const VERSION_AVISO = "AP-2026-10"
const HORA = 3600_000
export const LIMITE_DIARIO = 5
export const VENTANA_DUPLICADO = 2 * HORA
export const VENTANA_CONFIRMACION = 6 * HORA
export const VIGENCIA_CONFIRMADO = 24 * HORA
export const RETENCION_EVIDENCIA = 90 * 24 * HORA

const FALLA: EstadoReportado[] = ["no_funciona", "con_fallas", "cerrado"]

export function baseVacia(): BaseDatos {
  return { usuarios: {}, reportes: [], evidencias: [], bitacora: [] }
}

/** Seudónimo HMAC-SHA-256 del identificador del proveedor (RN3). La clave real vive en Secret Manager. */
export async function seudonimo(sub: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode("clave-demo-solo-para-el-prototipo"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const firma = await crypto.subtle.sign("HMAC", key, enc.encode(sub))
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function registrarEvento(db: BaseDatos, evento: Omit<EventoBitacora, "ts">, now: number) {
  db.bitacora.unshift({ ts: now, ...evento })
  db.bitacora = db.bitacora.slice(0, 200)
}

/** Índice de confiabilidad: baja con rechazos de moderación y con reportes contradichos. */
export function confiabilidad(db: BaseDatos, seud: string): number {
  const propios = db.reportes.filter((r) => r.seudonimo === seud)
  const rechazados = propios.filter((r) => r.moderacion === "rechazado").length
  const contradichos = propios.filter((r) => {
    if (!FALLA.includes(r.estado)) return false
    const oks = new Set(
      db.reportes
        .filter((o) => o.equipmentId === r.equipmentId && o.estado === "funciona" && o.seudonimo !== seud && o.ts > r.ts && o.ts - r.ts < 3 * HORA)
        .map((o) => o.seudonimo),
    )
    return oks.size >= 2
  }).length
  return Math.max(0, Math.min(1, 1 - 0.25 * rechazados - 0.1 * contradichos))
}

export type EstadoComunitario = {
  estado: "sin_reportes" | "incierto" | "confirmado" | "restablecido"
  personas: number
  venceEn?: number
}

/** Validación comunitaria (RN5, RF-20). */
export function estadoComunitario(db: BaseDatos, equipmentId: string, now: number): EstadoComunitario {
  const validos = db.reportes
    .filter((r) => r.equipmentId === equipmentId && !r.cuarentena && r.moderacion !== "rechazado" && now - r.ts < VIGENCIA_CONFIRMADO && r.ts <= now)
    .sort((a, b) => a.ts - b.ts)
  const fallas = validos.filter((r) => FALLA.includes(r.estado))
  if (fallas.length === 0) return { estado: "sin_reportes", personas: 0 }
  const ultimaFalla = fallas.at(-1)!.ts
  const oksDespues = new Set(validos.filter((r) => r.estado === "funciona" && r.ts > ultimaFalla).map((r) => r.seudonimo))

  // ¿Hubo una ventana de 6 h con 3 personas distintas (o 2 si una está verificada)?
  let confirmado = false
  for (const r of fallas) {
    const ventana = fallas.filter((o) => o.ts <= r.ts && r.ts - o.ts <= VENTANA_CONFIRMACION)
    const personas = new Set(ventana.map((o) => o.seudonimo))
    const verificada = ventana.some((o) => o.verificado)
    if (personas.size >= 3 || (personas.size >= 2 && verificada)) confirmado = true
  }
  const personas = new Set(fallas.map((r) => r.seudonimo)).size
  if (oksDespues.size >= 2) return { estado: "restablecido", personas }
  if (confirmado) return { estado: "confirmado", personas, venceEn: ultimaFalla + VIGENCIA_CONFIRMADO }
  if (now - ultimaFalla < VENTANA_CONFIRMACION || oksDespues.size === 1) {
    return { estado: "incierto", personas, venceEn: ultimaFalla + VENTANA_CONFIRMACION }
  }
  return { estado: "sin_reportes", personas: 0 }
}

/** Estado de disponibilidad por equipo (RF-06): captura diaria + estado comunitario. */
export function estadoEquipo(db: BaseDatos, equipmentId: string, now: number): { estado: EstadoEquipo; fuente: string } {
  const captura = ultimaCaptura(new Date(now))
  const antigua = now - captura.getTime() > 48 * HORA
  const com = estadoComunitario(db, equipmentId, now)
  if (com.estado === "confirmado") return { estado: "fuera_servicio", fuente: `Fuera de servicio confirmado por ${com.personas} personas` }
  if (com.estado === "incierto") return { estado: "incierto", fuente: "Reporte de falla sin confirmar" }
  if (antigua) return { estado: "incierto", fuente: "Captura del inventario con más de 48 h" }
  const hora = captura.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })
  return { estado: "disponible", fuente: `Inventario del STC (captura de las ${hora})` }
}

export type ResultadoEnvio =
  | { ok: true; codigo: 201; reporte: Reporte; mensaje: string }
  | { ok: false; codigo: 400 | 401 | 429; mensaje: string }

/** Equivalente a POST /api/v1/reportes (RIE-07). */
export function registrarReporte(
  db: BaseDatos,
  sesion: { seudonimo: string; expira: number } | null,
  datos: { station: string; equipmentId: string; estado: EstadoReportado; hashesFotos: string[] },
  now: number,
): ResultadoEnvio {
  if (!sesion || sesion.expira < now) return { ok: false, codigo: 401, mensaje: "Tu sesión no es válida o venció. Inicia sesión de nuevo para reportar." }
  const eq = equipoPorId(datos.equipmentId)
  if (!eq || eq.station !== datos.station) return { ok: false, codigo: 400, mensaje: "Elige una estación y un equipo válidos." }
  const usuario = db.usuarios[sesion.seudonimo]
  const propios = db.reportes.filter((r) => r.seudonimo === sesion.seudonimo)
  if (propios.filter((r) => now - r.ts < 24 * HORA).length >= LIMITE_DIARIO) {
    registrarEvento(db, { evento: "límite diario", objeto: datos.equipmentId, decision: "rechazado (429)", rol: "sistema" }, now)
    return { ok: false, codigo: 429, mensaje: `Llegaste al límite de ${LIMITE_DIARIO} reportes por día. Gracias por ayudar; podrás reportar de nuevo mañana.` }
  }
  if (propios.some((r) => r.equipmentId === datos.equipmentId && now - r.ts < VENTANA_DUPLICADO)) {
    registrarEvento(db, { evento: "reporte duplicado", objeto: datos.equipmentId, decision: "ignorado y registrado (429)", rol: "sistema" }, now)
    return { ok: false, codigo: 429, mensaje: "Ya reportaste este equipo en las últimas 2 horas. Tu reporte anterior sigue contando." }
  }
  const fotoRepetida = datos.hashesFotos.some((h) => db.evidencias.some((e) => e.sha256 === h))
  const baja = confiabilidad(db, sesion.seudonimo) < 0.5
  const reporte: Reporte = {
    id: `R-${now.toString(36).toUpperCase()}`,
    station: datos.station,
    equipmentId: datos.equipmentId,
    estado: datos.estado,
    ts: now,
    seudonimo: sesion.seudonimo,
    verificado: Boolean(usuario?.verificado),
    evidencias: [],
    cuarentena: fotoRepetida || baja,
    motivoCuarentena: fotoRepetida ? "Foto repetida de otro reporte" : baja ? "Confiabilidad baja de la cuenta" : undefined,
    moderacion: fotoRepetida || baja || datos.hashesFotos.length > 0 ? "pendiente" : null,
  }
  db.reportes.unshift(reporte)
  registrarEvento(db, {
    evento: "reporte recibido",
    objeto: `${reporte.id} · ${datos.equipmentId}`,
    decision: reporte.cuarentena ? `en revisión: ${reporte.motivoCuarentena}` : "en validación comunitaria",
    rol: "sistema",
  }, now)
  return {
    ok: true,
    codigo: 201,
    reporte,
    mensaje: reporte.cuarentena
      ? "Recibimos tu reporte. Pasará por revisión antes de contar para el estado del equipo."
      : "Recibimos tu reporte. Contará para el estado del equipo cuando otras personas lo confirmen.",
  }
}

export function moderar(db: BaseDatos, reporteId: string, decision: "aprobado" | "rechazado", now: number) {
  const r = db.reportes.find((x) => x.id === reporteId)
  if (!r) return
  r.moderacion = decision
  r.cuarentena = decision === "rechazado"
  registrarEvento(db, { evento: "moderación", objeto: `${r.id} · ${r.equipmentId}`, decision, rol: "moderación" }, now)
}

/** Reportes de otras personas para que el prototipo muestre la validación comunitaria. */
export function sembrarDemo(db: BaseDatos, now: number): BaseDatos {
  // Se regeneran en cada carga, relativos a la hora actual, para que siempre haya ejemplos vigentes.
  db.reportes = db.reportes.filter((r) => !r.id.startsWith("R-DEMO-"))
  const buscar = (station: string, tipo: string) =>
    todosLosEquipos.find((e) => e.station === station && e.tipo === tipo && e.ubicacion.startsWith("Acceso"))?.id ??
    todosLosEquipos.find((e) => e.station === station && e.tipo === tipo)?.id
  const semillas: Array<[string, string, EstadoReportado, number, string, boolean]> = [
    ["Tacubaya", "Elevador", "no_funciona", 3.5, "demo-ana", false],
    ["Tacubaya", "Elevador", "no_funciona", 2.2, "demo-beto", false],
    ["Tacubaya", "Elevador", "cerrado", 1.1, "demo-caro", true],
    ["Pantitlán", "Elevador", "con_fallas", 1.5, "demo-dani", false],
    ["Hidalgo", "Escalera eléctrica", "no_funciona", 0.7, "demo-elsa", false],
  ]
  for (const [station, tipo, estado, horas, seud, verificado] of semillas) {
    const id = buscar(station, tipo)
    if (!id) continue
    db.reportes.push({
      id: `R-DEMO-${seud}`,
      station,
      equipmentId: id,
      estado,
      ts: now - horas * HORA,
      seudonimo: seud,
      verificado,
      evidencias: [],
      cuarentena: false,
      moderacion: null,
    })
  }
  return db
}

/** Borra evidencias vencidas y anonimiza reportes de más de 12 meses (RD-12). */
export function aplicarRetencion(db: BaseDatos, now: number): string[] {
  const vencidas = db.evidencias.filter((e) => e.borrarEn <= now).map((e) => e.id)
  db.evidencias = db.evidencias.filter((e) => e.borrarEn > now)
  for (const r of db.reportes) {
    r.evidencias = r.evidencias.filter((id) => !vencidas.includes(id))
    if (now - r.ts > 365 * 24 * HORA) r.seudonimo = "anonimizado"
  }
  return vencidas
}
