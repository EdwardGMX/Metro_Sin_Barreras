/**
 * Ruteo accesible (RF-10, RF-11, RF-18, RF-22).
 * Grafo de andenes con un nodo por estación-línea y un nodo de calle por estación;
 * aristas de tramo, transbordo y acceso. Dijkstra dependiente del tiempo:
 * al avanzar acumula la hora para saber en qué franja pasa por cada estación.
 */
import {
  accesibilidad,
  claveTransbordo,
  equipoPorId,
  MEDIO_CON_EQUIPO,
  MEDIO_DESCONOCIDO,
  MEDIO_LABEL,
  type Medio,
  type Paso,
} from "../data/accessibility"
import { getLine, linesAtStation, metroLines } from "../data/metroData"
import { enHorario, HORARIO, saturacion, tipoDia, type Nivel } from "../data/saturation"
import { factorPeso, type Restricciones } from "./profiles"

export type EstadoEquipo = "disponible" | "incierto" | "fuera_servicio"
export type ConsultaEstado = (equipoId: string) => { estado: EstadoEquipo; fuente: string }

export type TipoHora = "salir_ahora" | "salir_a" | "llegar_a"

export type ConsultaRuta = {
  origen: string
  destino: string
  restricciones: Restricciones
  fecha: Date
  /** Minutos desde la medianoche. */
  hora: number
  tipoHora: TipoHora
}

type Arista = {
  to: string
  tipo: "tramo" | "transbordo" | "acceso"
  station: string
  line?: string
  lineFrom?: string
  lineTo?: string
  paso?: Paso
  tiempo: number
}

export type PasoRuta = { texto: string; tipo: "acceso" | "tramo" | "transbordo" | "salida"; incierto?: boolean }

export type EstacionRuta = { station: string; line: string; llegada: number; nivel: Nivel }

export type EquipoRuta = {
  id: string
  station: string
  tipo: string
  ubicacion: string
  estado: EstadoEquipo
  fuente: string
}

export type ResultadoRuta = {
  estado: "accesible" | "accesible_con_apoyo" | "sin_ruta" | "fuera_de_horario"
  mensaje?: string
  salida: number
  llegada: number
  duracion: number
  transbordos: number
  lineIds: string[]
  estaciones: EstacionRuta[]
  pasos: PasoRuta[]
  equipos: EquipoRuta[]
  penalizados: string[]
}

const TIEMPO_TRAMO = 2.5
const TIEMPO_TRANSBORDO = 4
const TIEMPO_MEDIO: Record<Medio, number> = {
  elevador: 3,
  salvaescaleras: 4,
  escalera_electrica: 1.5,
  escalera_fija: 2,
  nivel: 1,
}
const FACTOR_NIVEL: Record<Nivel, number> = { baja: 0, media: 0.5, alta: 1 }

const nodo = (station: string, line: string) => `${station}::${line}`
const calle = (station: string) => `${station}::calle`

/** Construye el grafo una sola vez (RF-10). */
const GRAFO: Map<string, Arista[]> = (() => {
  const g = new Map<string, Arista[]>()
  const add = (from: string, a: Arista) => {
    if (!g.has(from)) g.set(from, [])
    g.get(from)!.push(a)
  }
  for (const line of metroLines) {
    line.stations.forEach((station, i) => {
      const next = line.stations[i + 1]
      if (next) {
        add(nodo(station, line.id), { to: nodo(next, line.id), tipo: "tramo", station: next, line: line.id, tiempo: TIEMPO_TRAMO })
        add(nodo(next, line.id), { to: nodo(station, line.id), tipo: "tramo", station, line: line.id, tiempo: TIEMPO_TRAMO })
      }
    })
  }
  const estaciones = new Set(metroLines.flatMap((l) => l.stations))
  for (const station of estaciones) {
    const acc = accesibilidad(station)
    const lineas = linesAtStation(station)
    for (const l of lineas) {
      add(calle(station), { to: nodo(station, l), tipo: "acceso", station, line: l, paso: acc.acceso, tiempo: 1 })
      add(nodo(station, l), { to: calle(station), tipo: "acceso", station, line: l, paso: acc.acceso, tiempo: 1 })
    }
    for (const a of lineas) {
      for (const b of lineas) {
        if (a === b) continue
        const paso = acc.transbordos[claveTransbordo(a, b)]
        add(nodo(station, a), { to: nodo(station, b), tipo: "transbordo", station, lineFrom: a, lineTo: b, paso, tiempo: TIEMPO_TRANSBORDO })
      }
    }
  }
  return g
})()

type Eleccion = { medio: Medio; equipo?: string; incierto: boolean; penalizado: boolean }

/** Elige el mejor medio compatible del paso; null si ninguno (RN1). */
function elegirMedio(paso: Paso, station: string, tipo: Arista["tipo"], r: Restricciones, estado: ConsultaEstado): Eleccion | null {
  const opciones: Eleccion[] = []
  for (const medio of paso.medios) {
    if (!r.desniveles_admitidos.includes(medio)) continue
    let incierto = tipo === "acceso" && MEDIO_DESCONOCIDO.has(station)
    let equipo: string | undefined
    if (MEDIO_CON_EQUIPO.includes(medio)) {
      equipo = paso.equipos[medio]
      if (equipo) {
        const e = estado(equipo).estado
        if (e === "fuera_servicio") continue
        if (e === "incierto") incierto = true
      }
    }
    opciones.push({ medio, equipo, incierto, penalizado: r.desniveles_penalizados.includes(medio) })
  }
  if (opciones.length === 0) return null
  const puntaje = (o: Eleccion) => (o.penalizado ? 2 : 0) + (o.incierto ? 1 : 0)
  return opciones.sort((a, b) => puntaje(a) - puntaje(b))[0]
}

type Etiqueta = { costo: number; tiempo: number; prev?: string; arista?: Arista; eleccion?: Eleccion | null }

function dijkstra(q: ConsultaRuta, salida: number, estado: ConsultaEstado) {
  const r = q.restricciones
  const fSat = factorPeso(r.peso_saturacion)
  const fTr = factorPeso(r.peso_transbordos)
  const inicio = calle(q.origen)
  const meta = calle(q.destino)
  const best = new Map<string, Etiqueta>([[inicio, { costo: 0, tiempo: salida }]])
  const hechos = new Set<string>()
  const abiertos = new Set<string>([inicio])
  while (abiertos.size) {
    let u = ""
    let uc = Infinity
    for (const n of abiertos) {
      const c = best.get(n)!.costo
      if (c < uc) {
        uc = c
        u = n
      }
    }
    abiertos.delete(u)
    if (u === meta) break
    hechos.add(u)
    const eu = best.get(u)!
    for (const a of GRAFO.get(u) ?? []) {
      if (hechos.has(a.to)) continue
      // No se permite atravesar la calle de una estación intermedia.
      if (a.to.endsWith("::calle") && a.to !== meta) continue
      let tiempo = a.tiempo
      let costo = 0
      let eleccion: Eleccion | null | undefined
      if (a.paso) {
        eleccion = elegirMedio(a.paso, a.station, a.tipo, r, estado)
        if (!eleccion) continue
        tiempo += TIEMPO_MEDIO[eleccion.medio]
        if (eleccion.penalizado) costo += tiempo + 5
      }
      const llegada = eu.tiempo + tiempo
      const nivel = saturacion(a.station, q.fecha, llegada).nivel
      costo += tiempo
      if (a.tipo !== "transbordo") costo += tiempo * fSat * FACTOR_NIVEL[nivel]
      if (a.tipo === "transbordo") costo += tiempo * fTr + 2
      const total = eu.costo + costo
      const actual = best.get(a.to)
      if (!actual || total < actual.costo) {
        best.set(a.to, { costo: total, tiempo: llegada, prev: u, arista: a, eleccion })
        abiertos.add(a.to)
      }
    }
  }
  if (!best.has(meta)) return null
  const camino: Etiqueta[] = []
  let cur: string | undefined = meta
  while (cur && cur !== inicio) {
    const e: Etiqueta = best.get(cur)!
    camino.unshift(e)
    cur = e.prev
  }
  return camino
}

function direccion(lineId: string, desde: string, hasta: string): string {
  const line = getLine(lineId)
  const i = line.stations.indexOf(desde)
  const j = line.stations.indexOf(hasta)
  return j > i ? line.stations.at(-1)! : line.stations[0]
}

function construirResultado(q: ConsultaRuta, salida: number, camino: Etiqueta[], estado: ConsultaEstado): ResultadoRuta {
  const pasos: PasoRuta[] = []
  const estaciones: EstacionRuta[] = []
  const equipos: EquipoRuta[] = []
  const penalizados: string[] = []
  const lineIds: string[] = []
  let incierto = false
  let transbordos = 0
  let tramoInicio: { station: string; line: string } | null = null
  let ultimaEstacion = q.origen

  const registrarEleccion = (a: Arista, el: Eleccion | null | undefined) => {
    if (!el) return
    if (el.incierto) incierto = true
    if (el.penalizado) penalizados.push(`${MEDIO_LABEL[el.medio]} en ${a.station}`)
    if (el.equipo) {
      const eq = equipoPorId(el.equipo)
      if (eq && !equipos.some((x) => x.id === eq.id)) {
        const st = estado(eq.id)
        equipos.push({ id: eq.id, station: eq.station, tipo: eq.tipo, ubicacion: eq.ubicacion, estado: st.estado, fuente: st.fuente })
      }
    }
  }
  const cerrarTramo = (hasta: string) => {
    if (!tramoInicio || tramoInicio.station === hasta) return
    const n = Math.abs(getLine(tramoInicio.line).stations.indexOf(hasta) - getLine(tramoInicio.line).stations.indexOf(tramoInicio.station))
    pasos.push({
      tipo: "tramo",
      texto: `Toma la ${getLine(tramoInicio.line).name} dirección ${direccion(tramoInicio.line, tramoInicio.station, hasta)} y baja en ${hasta} (${n} ${n === 1 ? "estación" : "estaciones"}).`,
    })
  }

  for (const e of camino) {
    const a = e.arista!
    if (a.tipo === "acceso" && !a.to.endsWith("::calle")) {
      registrarEleccion(a, e.eleccion)
      const medio = e.eleccion ? MEDIO_LABEL[e.eleccion.medio] : "acceso"
      pasos.push({
        tipo: "acceso",
        incierto: e.eleccion?.incierto,
        texto: `Entra en ${a.station} y baja al andén de la ${getLine(a.line!).name} por ${medio}${e.eleccion?.incierto ? " (información incierta: pide apoyo al personal)" : ""}.`,
      })
      tramoInicio = { station: a.station, line: a.line! }
      lineIds.push(a.line!)
      estaciones.push({ station: a.station, line: a.line!, llegada: e.tiempo, nivel: saturacion(a.station, q.fecha, e.tiempo).nivel })
    } else if (a.tipo === "tramo") {
      ultimaEstacion = a.station
      estaciones.push({ station: a.station, line: a.line!, llegada: e.tiempo, nivel: saturacion(a.station, q.fecha, e.tiempo).nivel })
    } else if (a.tipo === "transbordo") {
      cerrarTramo(a.station)
      registrarEleccion(a, e.eleccion)
      transbordos++
      const medio = e.eleccion ? MEDIO_LABEL[e.eleccion.medio] : "pasillo"
      pasos.push({
        tipo: "transbordo",
        incierto: e.eleccion?.incierto,
        texto: `En ${a.station}, transborda de la ${getLine(a.lineFrom!).name} a la ${getLine(a.lineTo!).name} por ${medio}${e.eleccion?.incierto ? " (información incierta: pide apoyo al personal)" : ""}.`,
      })
      tramoInicio = { station: a.station, line: a.lineTo! }
      if (!lineIds.includes(a.lineTo!)) lineIds.push(a.lineTo!)
    } else if (a.tipo === "acceso" && a.to.endsWith("::calle")) {
      cerrarTramo(a.station)
      registrarEleccion(a, e.eleccion)
      const medio = e.eleccion ? MEDIO_LABEL[e.eleccion.medio] : "salida"
      pasos.push({
        tipo: "salida",
        incierto: e.eleccion?.incierto,
        texto: `Sal de ${a.station} por ${medio}${e.eleccion?.incierto ? " (información incierta: pide apoyo al personal)" : ""}.`,
      })
      ultimaEstacion = a.station
    }
  }
  void ultimaEstacion
  const llegada = camino.at(-1)!.tiempo
  return {
    estado: incierto ? "accesible_con_apoyo" : "accesible",
    salida,
    llegada,
    duracion: Math.round(llegada - salida),
    transbordos,
    lineIds,
    estaciones,
    pasos,
    equipos,
    penalizados,
  }
}

function sinRuta(q: ConsultaRuta, salida: number, estado: ConsultaEstado): ResultadoRuta {
  const r = q.restricciones
  const accesoOk = (st: string) => elegirMedio(accesibilidad(st).acceso, st, "acceso", r, estado) !== null
  let mensaje = "No encontramos una ruta compatible con tu perfil de movilidad."
  if (!accesoOk(q.origen)) mensaje += ` ${q.origen} no tiene ahora un acceso compatible (por ejemplo, solo escaleras fijas o el equipo está fuera de servicio).`
  else if (!accesoOk(q.destino)) mensaje += ` ${q.destino} no tiene ahora un acceso compatible (por ejemplo, solo escaleras fijas o el equipo está fuera de servicio).`
  else mensaje += " Ningún transbordo disponible permite conectar las dos estaciones."
  return { estado: "sin_ruta", mensaje, salida, llegada: salida, duracion: 0, transbordos: 0, lineIds: [], estaciones: [], pasos: [], equipos: [], penalizados: [] }
}

/** Calcula la ruta para una hora de salida fija. */
function rutaDesde(q: ConsultaRuta, salida: number, estado: ConsultaEstado): ResultadoRuta {
  if (q.origen === q.destino) {
    return { ...sinRuta(q, salida, estado), mensaje: "El origen y el destino son la misma estación." }
  }
  const camino = dijkstra(q, salida, estado)
  return camino ? construirResultado(q, salida, camino, estado) : sinRuta(q, salida, estado)
}

/** Punto de entrada equivalente a POST /api/v1/ruta (RIE-06). */
export function calcularRuta(q: ConsultaRuta, estado: ConsultaEstado): ResultadoRuta {
  const { abre, cierra } = HORARIO[tipoDia(q.fecha)]
  const fuera = (msg: string, salida: number): ResultadoRuta => ({
    estado: "fuera_de_horario", mensaje: msg, salida, llegada: salida, duracion: 0, transbordos: 0, lineIds: [], estaciones: [], pasos: [], equipos: [], penalizados: [],
  })
  if (q.tipoHora !== "llegar_a") {
    if (!enHorario(q.fecha, q.hora)) {
      return fuera(`El Metro no da servicio a esa hora. Ese día abre a las ${Math.floor(abre / 60)}:00 y cierra a las 24:00.`, q.hora)
    }
    return rutaDesde(q, q.hora, estado)
  }
  // "Llegar a las": estima la salida restando el tiempo de una primera ruta y recalcula (RF-11).
  let salida = q.hora - 45
  let res = rutaDesde(q, Math.max(salida, abre), estado)
  if (res.estado === "sin_ruta") return res
  salida = q.hora - res.duracion
  for (let i = 0; i < 3; i++) {
    if (salida < abre) {
      return fuera(`Para llegar a esa hora tendrías que salir antes de que abra el Metro (${Math.floor(abre / 60)}:00).`, salida)
    }
    res = rutaDesde(q, salida, estado)
    if (res.llegada <= q.hora + 0.01) break
    salida -= res.llegada - q.hora
  }
  if (res.llegada > cierra) return fuera("El Metro cierra antes de la hora de llegada.", salida)
  return res
}

const PUNTAJE: Record<Nivel, number> = { baja: 0, media: 1, alta: 2 }

export function puntajeSaturacion(r: ResultadoRuta): number {
  return r.estaciones.reduce((s, e) => s + PUNTAJE[e.nivel], 0)
}

/** Compara la salida elegida con ±30 y ±60 minutos y sugiere la de menor saturación (RF-12). */
export function sugerirHora(q: ConsultaRuta, actual: ResultadoRuta, estado: ConsultaEstado): ResultadoRuta | null {
  if (actual.estado === "sin_ruta" || actual.estado === "fuera_de_horario") return null
  let mejor: ResultadoRuta | null = null
  for (const delta of [-60, -30, 30, 60]) {
    const salida = actual.salida + delta
    if (!enHorario(q.fecha, salida)) continue
    const r = rutaDesde(q, salida, estado)
    if (r.estado === "sin_ruta") continue
    if (puntajeSaturacion(r) < puntajeSaturacion(mejor ?? actual)) mejor = r
  }
  return mejor
}
