/**
 * Inventario de accesibilidad DEMOSTRATIVO.
 *
 * En la versión final estos datos provienen de la captura diaria del inventario
 * del STC (RF-02) y del perfilado de accesos y transbordos (WBS 2.3). Aquí se
 * generan de forma determinista para que el prototipo sea reproducible.
 */
import { allStations, getLine, linesAtStation } from "./metroData"

/** Medio para salvar un desnivel (RF-10). */
export type Medio =
  | "elevador"
  | "salvaescaleras"
  | "escalera_electrica"
  | "escalera_fija"
  | "nivel"

export const MEDIO_LABEL: Record<Medio, string> = {
  elevador: "elevador",
  salvaescaleras: "salvaescaleras",
  escalera_electrica: "escalera eléctrica",
  escalera_fija: "escaleras fijas",
  nivel: "acceso a nivel o rampa",
}

/** Medios que dependen de un equipo electromecánico del inventario. */
export const MEDIO_CON_EQUIPO: Medio[] = ["elevador", "salvaescaleras", "escalera_electrica"]

export type TipoEquipo = "Elevador" | "Salvaescaleras" | "Escalera eléctrica"

export type Equipo = {
  id: string
  station: string
  tipo: TipoEquipo
  medio: Medio
  ubicacion: string
  /** Estatus publicado en el inventario oficial (al 30/09/2026 todos “FUNCIONANDO”). */
  estatusOficial: "FUNCIONANDO"
}

export type Paso = {
  /** Medios disponibles para salvar el desnivel. */
  medios: Medio[]
  /** Equipo que corresponde a cada medio con equipo. */
  equipos: Partial<Record<Medio, string>>
}

export type AccesibilidadEstacion = {
  station: string
  acceso: Paso
  /** Transbordos por par de líneas, clave "1-5" ordenada. */
  transbordos: Record<string, Paso>
}

/** Estaciones con elevador en el acceso dentro del prototipo (dato ilustrativo). */
const CON_ELEVADOR = new Set([
  "Pantitlán", "Tacubaya", "Hidalgo", "Balderas", "Pino Suárez", "Chabacano", "La Raza",
  "Centro Médico", "Zapata", "Ermita", "Mixcoac", "Atlalilco", "Garibaldi", "Bellas Artes",
  "Universidad", "Indios Verdes", "Tasqueña", "Cuatro Caminos", "El Rosario", "Martín Carrera",
  "Buenavista", "Ciudad Azteca", "Politécnico", "Deportivo 18 de Marzo", "Insurgentes",
  "Salto del Agua", "Candelaria", "San Lázaro", "Jamaica", "Santa Anita", "Oceanía",
  "Consulado", "Guerrero", "Morelos", "Instituto del Petróleo", "Constitución de 1917",
  "Observatorio", "Barranca del Muerto", "Terminal Aérea",
])
const LINEA_12 = new Set(getLine("12").stations)
/** Estaciones con salvaescaleras en lugar de elevador (dato ilustrativo). */
const CON_SALVAESCALERAS = new Set(["Normal", "Patriotismo", "Lázaro Cárdenas"])
/** Accesos cuyo medio no está perfilado todavía: se tratan como inciertos (RN2). */
export const MEDIO_DESCONOCIDO = new Set(["Talismán", "Canal de San Juan"])

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const equipos: Equipo[] = []
const porEstacion = new Map<string, AccesibilidadEstacion>()

function nuevoEquipo(station: string, medio: Medio, ubicacion: string, n: number): string {
  const tipo: TipoEquipo =
    medio === "elevador" ? "Elevador" : medio === "salvaescaleras" ? "Salvaescaleras" : "Escalera eléctrica"
  const pref = medio === "elevador" ? "EL" : medio === "salvaescaleras" ? "SE" : "EE"
  const id = `${pref}-${slug(station).slice(0, 10)}-${String(n).padStart(2, "0")}`
  equipos.push({ id, station, tipo, medio, ubicacion, estatusOficial: "FUNCIONANDO" })
  return id
}

function construirPaso(station: string, ubicacion: string, semilla: string, n0: number): Paso {
  const h = hash(semilla)
  let medios: Medio[]
  if (LINEA_12.has(station) || CON_ELEVADOR.has(station)) {
    medios = ["elevador", "escalera_electrica", "escalera_fija"]
  } else if (CON_SALVAESCALERAS.has(station)) {
    medios = ["salvaescaleras", "escalera_fija"]
  } else if (h % 10 < 4) {
    medios = ["escalera_electrica", "escalera_fija"]
  } else if (h % 10 < 5) {
    medios = ["nivel"]
  } else {
    medios = ["escalera_fija"]
  }
  const equiposPaso: Partial<Record<Medio, string>> = {}
  let n = n0
  for (const medio of medios) {
    if ((["elevador", "salvaescaleras", "escalera_electrica"] as Medio[]).includes(medio)) {
      equiposPaso[medio] = nuevoEquipo(station, medio, ubicacion, n++)
    }
  }
  return { medios, equipos: equiposPaso }
}

for (const station of allStations) {
  const acceso = construirPaso(station, "Acceso de calle a andén", `${station}|acceso`, 1)
  const transbordos: Record<string, Paso> = {}
  const lineas = linesAtStation(station)
  let n = 5
  for (let i = 0; i < lineas.length; i++) {
    for (let j = i + 1; j < lineas.length; j++) {
      const clave = [lineas[i], lineas[j]].sort().join("-")
      transbordos[clave] = construirPaso(
        station,
        `Transbordo Línea ${lineas[i]} ↔ Línea ${lineas[j]}`,
        `${station}|${clave}`,
        n,
      )
      n += 3
    }
  }
  porEstacion.set(station, { station, acceso, transbordos })
}

export function accesibilidad(station: string): AccesibilidadEstacion {
  const data = porEstacion.get(station)
  if (!data) throw new Error(`Estación desconocida: ${station}`)
  return data
}

export function claveTransbordo(a: string, b: string): string {
  return [a, b].sort().join("-")
}

export function equiposDeEstacion(station: string): Equipo[] {
  return equipos.filter((e) => e.station === station)
}

export function equipoPorId(id: string): Equipo | undefined {
  return equipos.find((e) => e.id === id)
}

export const todosLosEquipos: readonly Equipo[] = equipos

/** Fecha y hora de la captura diaria simulada del inventario (RF-02). */
export function ultimaCaptura(now: Date): Date {
  const captura = new Date(now)
  captura.setHours(6, 0, 0, 0)
  if (captura > now) captura.setDate(captura.getDate() - 1)
  return captura
}
