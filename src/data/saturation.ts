/**
 * Saturación estimada por estación y franja de 30 minutos (RF-12, RF-17, RN4).
 *
 * DEMOSTRATIVO: en producción la clase diaria viene del modelo (Random Forest o
 * Gradient Boosting, RF-08) y la fracción por franja del perfil horario
 * construido con la EOD 2017 del INEGI o con los datos horarios del STC.
 * Aquí se usa un perfil ilustrativo con horas pico de la mañana y de la tarde.
 */
import { allStations, linesAtStation } from "./metroData"

export type Nivel = "baja" | "media" | "alta"
export type TipoDia = "entre_semana" | "sabado" | "domingo_festivo"

export const NIVEL_LABEL: Record<Nivel, string> = { baja: "Baja", media: "Media", alta: "Alta" }

/** Horario de servicio en minutos desde la medianoche (Azteca Noticias, 2022). */
export const HORARIO: Record<TipoDia, { abre: number; cierra: number }> = {
  entre_semana: { abre: 5 * 60, cierra: 24 * 60 },
  sabado: { abre: 6 * 60, cierra: 24 * 60 },
  domingo_festivo: { abre: 7 * 60, cierra: 24 * 60 },
}

export function tipoDia(fecha: Date): TipoDia {
  const d = fecha.getDay()
  if (d === 0) return "domingo_festivo"
  if (d === 6) return "sabado"
  return "entre_semana"
}

/** Índice de franja de 30 minutos (0 = 00:00–00:29). */
export function franja(minutos: number): number {
  return Math.floor(minutos / 30)
}

export function etiquetaFranja(f: number): string {
  const h = Math.floor(f / 2)
  const m = f % 2 === 0 ? "00" : "30"
  const fin = f % 2 === 0 ? `${h}:29` : `${h}:59`
  return `${h}:${m}–${fin}`
}

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))

/** Perfil horario ilustrativo: fracción de viajes diarios que inicia en cada franja. */
function construirPerfil(tipo: TipoDia): number[] {
  const { abre, cierra } = HORARIO[tipo]
  const pesos = Array.from({ length: 48 }, (_, f) => {
    const centro = f * 30 + 15
    if (centro < abre || centro >= cierra) return 0
    const h = centro / 60
    if (tipo === "entre_semana") return 0.25 + 2.6 * gauss(h, 7.6, 0.9) + 1.7 * gauss(h, 18.7, 1.2) + 0.5 * gauss(h, 14, 1.6)
    if (tipo === "sabado") return 0.3 + 1.2 * gauss(h, 12.5, 2.5) + 0.8 * gauss(h, 18, 1.5)
    return 0.3 + 1.1 * gauss(h, 13.5, 2.8)
  })
  const total = pesos.reduce((a, b) => a + b, 0)
  return pesos.map((p) => p / total)
}

export const PERFIL_HORARIO: Record<TipoDia, number[]> = {
  entre_semana: construirPerfil("entre_semana"),
  sabado: construirPerfil("sabado"),
  domingo_festivo: construirPerfil("domingo_festivo"),
}

const FACTOR_DIA: Record<TipoDia, number> = { entre_semana: 1, sabado: 0.68, domingo_festivo: 0.48 }

const TERMINALES = new Set(["Pantitlán", "Indios Verdes", "Cuatro Caminos", "Tasqueña", "Universidad",
  "Observatorio", "El Rosario", "Ciudad Azteca", "Tláhuac", "La Paz", "Politécnico", "Martín Carrera"])

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Afluencia diaria de referencia (entre semana) por estación, ilustrativa. */
const AFLUENCIA_REF = new Map<string, number>(
  allStations.map((station) => {
    let base = 14000 + (hash(station) % 36000)
    if (linesAtStation(station).length > 1) base *= 1.6
    if (TERMINALES.has(station)) base *= 1.7
    return [station, Math.round(base)]
  }),
)

/** Umbrales comunes a toda la red: terciles de la afluencia por franja. */
const UMBRALES = (() => {
  const valores: number[] = []
  for (const tipo of Object.keys(PERFIL_HORARIO) as TipoDia[]) {
    PERFIL_HORARIO[tipo].forEach((frac) => {
      if (frac === 0) return
      for (const v of AFLUENCIA_REF.values()) valores.push(v * FACTOR_DIA[tipo] * frac)
    })
  }
  valores.sort((a, b) => a - b)
  return { t1: valores[Math.floor(valores.length / 3)], t2: valores[Math.floor((2 * valores.length) / 3)] }
})()

export type EstimacionSaturacion = {
  nivel: Nivel
  afluenciaFranja: number
  fuente: string
}

export function saturacion(station: string, fecha: Date, minutos: number): EstimacionSaturacion {
  const tipo = tipoDia(fecha)
  const frac = PERFIL_HORARIO[tipo][franja(minutos) % 48] ?? 0
  const valor = (AFLUENCIA_REF.get(station) ?? 20000) * FACTOR_DIA[tipo] * frac
  const nivel: Nivel = valor >= UMBRALES.t2 ? "alta" : valor >= UMBRALES.t1 ? "media" : "baja"
  return {
    nivel,
    afluenciaFranja: Math.round(valor),
    fuente: "Perfil horario ilustrativo (en producción: EOD 2017 o datos del STC)",
  }
}

export function enHorario(fecha: Date, minutos: number): boolean {
  const { abre, cierra } = HORARIO[tipoDia(fecha)]
  return minutos >= abre && minutos < cierra
}

/** Franjas de 30 minutos válidas para una fecha, como minutos desde la medianoche. */
export function franjasValidas(fecha: Date): number[] {
  const { abre, cierra } = HORARIO[tipoDia(fecha)]
  const out: number[] = []
  for (let m = abre; m < cierra; m += 30) out.push(m)
  return out
}

export function formatoHora(minutos: number): string {
  const total = ((Math.round(minutos) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
