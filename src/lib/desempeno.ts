/**
 * Tablero de desempeño del personal (RN16, propuesta).
 *
 * Quién ve a quién:
 * - Personal de estación y de seguridad: solo su propio tablero.
 * - Jefe(a) de estación: a todo el personal de su estación.
 * - Mantenimiento: a su equipo técnico.
 * - Mesa de atención y reportes: a todo el personal de la red, por estación.
 * Consultar el tablero de otra persona queda en la bitácora de auditoría.
 *
 * Solo se usan datos laborales: asistencia del turno, tareas, tickets, apoyos, rondas,
 * verificaciones, órdenes y reportes turnados. Nada de salud, domicilio ni datos personales.
 *
 * De dónde salen los números:
 * - Hoy y los registros que ya existen en el prototipo (tareas, tickets, apoyos, rondas de los
 *   últimos 14 días, verificaciones, órdenes) son datos reales de la demostración.
 * - El resto del historial de 60 días, la asistencia, el número de empleado, la antigüedad y la
 *   capacitación son **datos de muestra** deterministas (siempre iguales para cada persona),
 *   para que el tablero tenga volumen. En producción saldrían del resumen diario del proceso
 *   por lotes y del sistema de recursos humanos del STC.
 */
import { DIA, HORA, MIN, auditar, actor, type Cuenta, type EstadoConsola } from "./admin"
import { ESTACIONES_PILOTO, operacionDe, programaDe, rondasDelDia, SLOTS, vencida, type Persona } from "./operacion"
import type { BaseDatos } from "./reports"
import { AREA_DE_PUESTO, PERSONAL_DE_AREA, servicioDe, turnoEnCurso, vencimiento, type AreaId, type Ticket } from "./servicio"
import { urgenciasDe } from "./urgencias"

/* ------------------------------------------------------------------ */
/* Empleados                                                           */
/* ------------------------------------------------------------------ */

export type PerfilEmpleado = "jefe" | "personal" | "guardia" | "limpieza" | "mant" | "mesa" | "sistemas"

export type Empleado = {
  id: string
  nombre: string
  puesto: string
  area: AreaId
  perfil: PerfilEmpleado
  /** Sin estación: personal de áreas centrales (mantenimiento, atención, sistemas). */
  station?: string
  cuentaId?: string
  /** Persona de la plantilla de una estación: tiene jornada, rondas y tareas del jefe. */
  plantilla?: Persona
}

const PERFIL_DE_PUESTO: Record<Persona["puesto"], PerfilEmpleado> = {
  "Jefe(a) de estación": "jefe",
  "Personal de estación": "personal",
  "Policía auxiliar": "guardia",
  "Personal de limpieza": "limpieza",
}
const PERFIL_DE_AREA: Partial<Record<AreaId, PerfilEmpleado>> = { mantenimiento: "mant", atencion: "mesa", sistemas: "sistemas" }
const ORDEN_PERFIL: PerfilEmpleado[] = ["jefe", "personal", "guardia", "limpieza", "mant", "mesa", "sistemas"]

export const CENTRALES = "Áreas centrales"

/** Todo el personal de la demostración: la plantilla de las estaciones del piloto y las áreas centrales. */
export function empleados(db: BaseDatos, cuentas: Cuenta[]): Empleado[] {
  const op = operacionDe(db)
  const deEstacion: Empleado[] = op.plantilla
    .filter((p) => ESTACIONES_PILOTO.includes(p.station))
    .map((p) => ({ id: p.id, nombre: p.nombre, puesto: p.puesto, area: AREA_DE_PUESTO[p.puesto], perfil: PERFIL_DE_PUESTO[p.puesto], station: p.station, cuentaId: p.cuentaId, plantilla: p }))
  const centrales: Empleado[] = (Object.entries(PERSONAL_DE_AREA) as Array<[AreaId, Array<{ id: string; nombre: string; puesto: string }>]>).flatMap(([area, lista]) =>
    lista.map((a) => ({ id: a.id, nombre: a.nombre, puesto: a.puesto, area, perfil: PERFIL_DE_AREA[area] ?? "sistemas", cuentaId: cuentas.find((c) => c.nombre === a.nombre)?.id })),
  )
  const orden = (e: Empleado) => ESTACIONES_PILOTO.indexOf(e.station ?? "") + (e.station ? 0 : 99)
  return [...deEstacion, ...centrales].sort((a, b) => orden(a) - orden(b) || ORDEN_PERFIL.indexOf(a.perfil) - ORDEN_PERFIL.indexOf(b.perfil) || a.nombre.localeCompare(b.nombre))
}

export const lugarDe = (e: Empleado) => e.station ?? CENTRALES

export function empleadoDeCuenta(lista: Empleado[], c: Cuenta): Empleado | undefined {
  return lista.find((e) => e.cuentaId === c.id) ?? lista.find((e) => e.nombre === c.nombre)
}

export type TipoAlcance = "propio" | "estacion" | "area" | "red"

/** El alcance más amplio de los roles de la cuenta. */
export function alcanceTablero(c: Cuenta): TipoAlcance {
  if (c.roles.includes("moderacion")) return "red"
  if (c.roles.includes("jefe_estacion")) return "estacion"
  if (c.roles.includes("mantenimiento")) return "area"
  return "propio"
}

export const NOMBRE_MODULO: Record<TipoAlcance, string> = {
  propio: "Mi desempeño",
  estacion: "Desempeño de mi equipo",
  area: "Desempeño del equipo técnico",
  red: "Personal de la red",
}

/** A quién puede ver la cuenta en el tablero (RN16). */
export function empleadosVisibles(lista: Empleado[], c: Cuenta): Empleado[] {
  if (c.estado !== "activa") return []
  switch (alcanceTablero(c)) {
    case "red":
      return lista
    case "estacion":
      return lista.filter((e) => e.station && (c.estaciones ?? []).includes(e.station))
    case "area": {
      const yo = empleadoDeCuenta(lista, c)
      return lista.filter((e) => e.area === "mantenimiento" || e.id === yo?.id)
    }
    default: {
      const yo = empleadoDeCuenta(lista, c)
      return yo ? [yo] : []
    }
  }
}

export const puedeVerEmpleado = (lista: Empleado[], c: Cuenta, id: string) => empleadosVisibles(lista, c).some((e) => e.id === id)

/** Registra en la bitácora que alguien consultó el tablero de otra persona. */
export function registrarConsulta(e: EstadoConsola, quien: Cuenta, emp: Empleado, now: number): void {
  if (emp.cuentaId === quien.id) return
  auditar(e, { ...actor(quien), accion: "consultar desempeño", objeto: `${emp.nombre} · ${lugarDe(emp)}`, resultado: "permitido", detalle: emp.puesto }, now)
}

/* ------------------------------------------------------------------ */
/* Métricas por perfil                                                 */
/* ------------------------------------------------------------------ */

export type MetricaId = "tareas" | "apoyos" | "rondas" | "tickets" | "verificaciones" | "asignadas" | "levantados" | "ordenes" | "turnados" | "cerrados"

export type InfoMetrica = { nombre: string; corto: string; unidad: string; calidad?: string; meta?: number }

export const METRICAS: Record<MetricaId, InfoMetrica> = {
  tareas: { nombre: "Tareas del jefe", corto: "Tareas", unidad: "tareas hechas", calidad: "a tiempo", meta: 0.9 },
  apoyos: { nombre: "Apoyos a personas usuarias", corto: "Apoyos", unidad: "apoyos atendidos", calidad: "atendidos en 15 min o menos", meta: 0.9 },
  rondas: { nombre: "Rondas de revisión", corto: "Rondas", unidad: "rondas", calidad: "a tiempo", meta: 0.9 },
  tickets: { nombre: "Tickets resueltos", corto: "Tickets", unidad: "tickets resueltos", calidad: "en plazo", meta: 0.85 },
  verificaciones: { nombre: "Verificaciones en sitio", corto: "Verificaciones", unidad: "verificaciones" },
  asignadas: { nombre: "Tareas asignadas a su equipo", corto: "Tareas asignadas", unidad: "tareas asignadas", calidad: "hechas a tiempo", meta: 0.85 },
  levantados: { nombre: "Tickets levantados", corto: "Levantados", unidad: "tickets levantados" },
  ordenes: { nombre: "Órdenes de elevadores y escaleras", corto: "Órdenes", unidad: "órdenes cerradas", calidad: "dentro del plazo", meta: 0.85 },
  turnados: { nombre: "Reportes ciudadanos turnados", corto: "Turnados", unidad: "reportes turnados", calidad: "en menos de 1 h", meta: 0.9 },
  cerrados: { nombre: "Tickets cerrados", corto: "Cerrados", unidad: "tickets cerrados" },
}

export const METRICAS_DE: Record<PerfilEmpleado, MetricaId[]> = {
  jefe: ["rondas", "asignadas", "apoyos", "levantados"],
  personal: ["tareas", "apoyos", "rondas", "verificaciones"],
  guardia: ["tareas", "apoyos", "tickets"],
  limpieza: ["tareas", "tickets"],
  mant: ["tickets", "ordenes"],
  mesa: ["turnados", "cerrados", "tickets"],
  sistemas: ["tickets"],
}

/** Volumen de muestra por día trabajado [mínimo, máximo]. Las rondas salen del programa de la estación. */
const VOLUMEN: Record<PerfilEmpleado, Partial<Record<MetricaId, [number, number]>>> = {
  jefe: { asignadas: [9, 14], apoyos: [0, 2], levantados: [0, 2] },
  personal: { tareas: [2, 4], apoyos: [1, 3], verificaciones: [0, 2] },
  guardia: { tareas: [5, 7], apoyos: [2, 5], tickets: [0, 2] },
  limpieza: { tareas: [3, 4], tickets: [1, 3] },
  mant: { tickets: [1, 3], ordenes: [0, 1] },
  mesa: { turnados: [7, 14], cerrados: [4, 9], tickets: [0, 2] },
  sistemas: { tickets: [1, 3] },
}

/* ------------------------------------------------------------------ */
/* Datos de muestra deterministas                                      */
/* ------------------------------------------------------------------ */

function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

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

const medianoche = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const entero = (r: () => number, [a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1))
const exitos = (r: () => number, n: number, p: number) => {
  let k = 0
  for (let i = 0; i < n; i++) if (r() < p) k++
  return k
}

/** Constancia de cada persona (0.70–0.98): hace que el equipo no sea uniforme. */
const constancia = (e: Empleado) => 0.7 + rng(hash(`constancia:${e.id}`))() * 0.28

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

export type Ficha = {
  numero: string
  alta: number
  antiguedad: number
  turno: string
  horario: string
  descanso: number[]
  descansoTexto: string
}

/** Datos de la ficha laboral (muestra): número de empleado, antigüedad, turno y días de descanso. */
export function fichaDe(e: Empleado, now: number): Ficha {
  const r = rng(hash(`ficha:${e.id}`))
  const anios = 1 + Math.floor(r() * 17)
  const alta = new Date(now)
  alta.setFullYear(alta.getFullYear() - anios, Math.floor(r() * 12), 1 + Math.floor(r() * 27))
  const inicio = Math.floor(r() * 7)
  const descanso = [inicio, (inicio + 1) % 7]
  const turno = e.plantilla ? turnoEnCurso(now) : { nombre: "Matutino", inicio: 8 * 60, fin: 16 * 60 }
  const h = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  return {
    numero: `STC-${String(10000 + (hash(`num:${e.id}`) % 89999)).padStart(5, "0")}`,
    alta: alta.getTime(),
    antiguedad: anios,
    turno: turno.nombre,
    horario: `${h(turno.inicio)} a ${h(turno.fin)}`,
    descanso: descanso.sort(),
    descansoTexto: descanso.map((d) => DIAS_SEMANA[d]).join(" y "),
  }
}

/* ------------------------------------------------------------------ */
/* Historial diario                                                    */
/* ------------------------------------------------------------------ */

export type EstadoDia = "a_tiempo" | "retardo" | "falta" | "descanso" | "por_iniciar"
export const ESTADO_DIA_LABEL: Record<EstadoDia, string> = { a_tiempo: "Llegó a tiempo", retardo: "Retardo", falta: "Falta", descanso: "Descanso", por_iniciar: "Turno por iniciar" }

export type ValorDia = { n: number; ok: number }

export type Dia = {
  ts: number
  estado: EstadoDia
  /** Hoy, con el turno en curso. */
  enCurso?: boolean
  /** Minutos desde la medianoche. */
  entrada?: number
  salida?: number
  retardo: number
  m: Partial<Record<MetricaId, ValorDia>>
  /** Minutos que tardó en atender cada apoyo. */
  atencion: number[]
  /** Horas que tardó en resolver cada ticket. */
  resolucion: number[]
  /** Parte del día que es de muestra (no viene de los registros del prototipo). */
  muestra: boolean
}

type Indice = Partial<Record<MetricaId, Map<number, ValorDia>>> & { atencion: Map<number, number[]>; resolucion: Map<number, number[]> }

const sumar = (mapa: Map<number, ValorDia>, ts: number, ok: boolean) => {
  const k = medianoche(ts)
  const v = mapa.get(k) ?? { n: 0, ok: 0 }
  v.n++
  if (ok) v.ok++
  mapa.set(k, v)
}
const anotar = (mapa: Map<number, number[]>, ts: number, x: number) => {
  const k = medianoche(ts)
  mapa.set(k, [...(mapa.get(k) ?? []), x])
}

/** Los registros reales del prototipo de una persona, por día. */
function indiceReal(db: BaseDatos, e: Empleado, now: number): Indice {
  const sv = servicioDe(db)
  const op = operacionDe(db)
  const ix: Indice = { atencion: new Map(), resolucion: new Map() }
  const mapa = (m: MetricaId) => (ix[m] ??= new Map())
  const esYo = (nombre?: string) => nombre === e.nombre
  const porId = new Map(sv.reportes.map((r) => [r.id, r]))

  for (const t of sv.tickets) {
    if (t.asignadoA === e.id && t.resuelto) {
      const aTiempo = t.resuelto <= vencimiento(t)
      if (t.clase === "tarea") sumar(mapa("tareas"), t.resuelto, aTiempo)
      else {
        sumar(mapa("tickets"), t.resuelto, aTiempo)
        anotar(ix.resolucion, t.resuelto, (t.resuelto - (t.asignado ?? t.creado)) / HORA)
      }
    }
    if (t.clase === "tarea" && (t.creadoPorCuenta ? t.creadoPorCuenta === e.cuentaId : esYo(t.creadoPor)) && e.perfil === "jefe")
      sumar(mapa("asignadas"), t.creado, Boolean(t.resuelto && t.resuelto <= vencimiento(t)))
    if (t.clase === "ticket" && t.origen === "personal" && (esYo(t.creadoPor) || (e.cuentaId && t.creadoPorCuenta === e.cuentaId))) sumar(mapa("levantados"), t.creado, true)
    if (t.clase === "ticket" && t.origen === "persona_usuaria" && esYo(t.creadoPor)) {
      const primero = Math.min(t.creado, ...t.reportes.map((id) => porId.get(id)?.ts ?? t.creado))
      sumar(mapa("turnados"), t.creado, t.creado - primero <= HORA)
    }
    if (t.cerrado && esYo(t.cerradoPor)) sumar(mapa("cerrados"), t.cerrado, true)
  }
  for (const x of op.incidentes) {
    if (x.asignadoA !== e.id || !x.atendida) continue
    const min = (x.atendida - (x.asignada ?? x.ts)) / MIN
    sumar(mapa("apoyos"), x.atendida, min <= 15)
    anotar(ix.atencion, x.atendida, min)
  }
  for (const v of op.verificaciones) if (esYo(v.porNombre)) sumar(mapa("verificaciones"), v.ts, true)
  for (const o of op.ordenes) if (o.resuelta && esYo(o.atiende)) sumar(mapa("ordenes"), o.resuelta, !vencida(o, now))

  // Rondas de los últimos 14 días que tenía a su cargo (o que registró).
  if (e.plantilla) {
    const rondas = mapa("rondas")
    for (let i = 0; i < 14; i++) {
      const dia = medianoche(now) - i * DIA
      for (const r of rondasDelDia(op, e.plantilla.station, dia, now)) {
        const suya = r.registro ? r.registro.porId === e.id : r.responsable?.id === e.id
        if (!suya || r.estado === "programada" || r.estado === "en_curso") continue
        const v = rondas.get(dia) ?? { n: 0, ok: 0 }
        v.n++
        if (r.estado === "hecha") v.ok++
        rondas.set(dia, v)
      }
    }
  }
  return ix
}

/** Historial de una persona, del día más antiguo a hoy. Hoy usa solo los registros reales. */
export function historial(db: BaseDatos, e: Empleado, now: number, dias = 60): Dia[] {
  const ix = indiceReal(db, e, now)
  const ficha = fichaDe(e, now)
  const f = constancia(e)
  const hoy = medianoche(now)
  const turno = e.plantilla ? turnoEnCurso(now) : { inicio: 8 * 60, fin: 16 * 60, dentro: false }
  const minAhora = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const prog = e.plantilla ? programaDe(operacionDe(db), e.plantilla.station) : undefined
  const rondasProgramadas = prog ? SLOTS.filter((s) => prog.responsables[s] === e.id).length : 0
  const metricas = METRICAS_DE[e.perfil]
  const salida: Dia[] = []

  for (let i = dias - 1; i >= 0; i--) {
    const ts = hoy - i * DIA
    const r = rng(hash(`dia:${e.id}:${Math.round(ts / DIA)}`))
    const d: Dia = { ts, estado: "a_tiempo", retardo: 0, m: {}, atencion: [], resolucion: [], muestra: i > 0 }
    const real = (m: MetricaId) => ix[m]?.get(ts)

    if (i === 0) {
      // Hoy: asistencia de muestra, actividad real.
      const tarde = r() > f + 0.05
      d.retardo = tarde ? 8 + Math.floor(r() * 18) : 0
      d.estado = e.plantilla && minAhora < turno.inicio ? "por_iniciar" : tarde ? "retardo" : "a_tiempo"
      if (d.estado !== "por_iniciar") d.entrada = turno.inicio - (tarde ? -d.retardo : 4 + Math.floor(r() * 8))
      if (e.plantilla && turno.dentro) d.enCurso = true
      else if (d.entrada !== undefined && minAhora >= turno.fin) d.salida = turno.fin + Math.floor(r() * 15)
      for (const m of metricas) d.m[m] = { ...(real(m) ?? { n: 0, ok: 0 }) }
      d.atencion = ix.atencion.get(ts) ?? []
      d.resolucion = ix.resolucion.get(ts) ?? []
      salida.push(d)
      continue
    }

    if (ficha.descanso.includes(new Date(ts).getDay())) {
      d.estado = "descanso"
      for (const m of metricas) d.m[m] = { n: 0, ok: 0 }
      salida.push(d)
      continue
    }
    const azar = r()
    if (azar < (1 - f) * 0.2) {
      d.estado = "falta"
      for (const m of metricas) d.m[m] = { n: 0, ok: 0 }
      salida.push(d)
      continue
    }
    if (azar < (1 - f) * 1.5) {
      d.estado = "retardo"
      d.retardo = 6 + Math.floor(r() * 25)
    }
    d.entrada = turno.inicio + (d.retardo || -(3 + Math.floor(r() * 10)))
    d.salida = turno.fin + Math.floor(r() * 25) + (r() < 0.12 ? 60 + Math.floor(r() * 60) : 0)

    for (const m of metricas) {
      const v: ValorDia = { n: 0, ok: 0 }
      if (m === "rondas") {
        if (i < 14) Object.assign(v, real("rondas") ?? { n: 0, ok: 0 })
        else {
          v.n = rondasProgramadas
          v.ok = exitos(r, v.n, Math.min(0.99, f + 0.02))
        }
      } else {
        const vol = VOLUMEN[e.perfil][m]
        if (vol) {
          v.n = entero(r, vol)
          v.ok = exitos(r, v.n, METRICAS[m].calidad ? Math.min(0.99, f) : 1)
        }
        const x = real(m)
        if (x) {
          v.n += x.n
          v.ok += x.ok
        }
      }
      d.m[m] = v
    }
    // Tiempos de atención y de resolución: los reales del día más los de muestra,
    // coherentes con cuántos cumplieron la meta.
    const ap = d.m.apoyos
    if (ap) {
      const reales = ix.atencion.get(ts) ?? []
      const okReales = real("apoyos")?.ok ?? 0
      for (let k = 0; k < ap.n - reales.length; k++) d.atencion.push(k < ap.ok - okReales ? 4 + Math.round(r() * 10) : 16 + Math.round(r() * 12))
      d.atencion.push(...reales)
    }
    const tk = d.m.tickets
    if (tk) {
      const reales = ix.resolucion.get(ts) ?? []
      const okReales = real("tickets")?.ok ?? 0
      for (let k = 0; k < tk.n - reales.length; k++) d.resolucion.push(k < tk.ok - okReales ? 1 + Math.round(r() * 14) : 26 + Math.round(r() * 30))
      d.resolucion.push(...reales)
    }
    salida.push(d)
  }
  return salida
}

/* ------------------------------------------------------------------ */
/* Resumen de un periodo                                               */
/* ------------------------------------------------------------------ */

export type ResumenMetrica = { n: number; ok: number; tasa: number | null }

export type Resumen = {
  dias: Dia[]
  laborables: number
  aTiempo: number
  retardos: number
  faltas: number
  descansos: number
  /** Días con asistencia entre días laborables. */
  asistencia: number
  /** Días a tiempo entre días que asistió. */
  puntualidad: number
  horas: number
  metricas: Partial<Record<MetricaId, ResumenMetrica>>
  atencionProm: number | null
  resolucionProm: number | null
  /** 0 a 100: asistencia y puntualidad (25 %) y cumplimiento de las metas de cada actividad (75 %). */
  indice: number
  /** Las dos partes del índice, de 0 a 1. */
  presencia: number
  calidad: number
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function resumir(dias: Dia[], perfil: PerfilEmpleado): Resumen {
  const cuenta = (s: EstadoDia) => dias.filter((d) => d.estado === s).length
  const aTiempo = cuenta("a_tiempo")
  const retardos = cuenta("retardo")
  const faltas = cuenta("falta")
  const descansos = cuenta("descanso")
  const laborables = aTiempo + retardos + faltas
  const asistio = aTiempo + retardos
  const metricas: Resumen["metricas"] = {}
  for (const m of METRICAS_DE[perfil]) {
    const n = dias.reduce((a, d) => a + (d.m[m]?.n ?? 0), 0)
    const ok = dias.reduce((a, d) => a + (d.m[m]?.ok ?? 0), 0)
    metricas[m] = { n, ok, tasa: METRICAS[m].calidad && n > 0 ? ok / n : null }
  }
  const horas = dias.reduce((a, d) => a + (d.entrada !== undefined && d.salida !== undefined ? (d.salida - d.entrada) / 60 : 0), 0)
  const presencia = laborables ? (aTiempo + 0.5 * retardos) / laborables : 1
  const tasas = Object.values(metricas)
    .map((x) => x?.tasa)
    .filter((x): x is number => x !== null && x !== undefined)
  const calidad = tasas.length ? tasas.reduce((a, b) => a + b, 0) / tasas.length : presencia
  return {
    dias,
    laborables,
    aTiempo,
    retardos,
    faltas,
    descansos,
    asistencia: laborables ? asistio / laborables : 1,
    puntualidad: asistio ? aTiempo / asistio : 1,
    horas,
    metricas,
    atencionProm: promedio(dias.flatMap((d) => d.atencion)),
    resolucionProm: promedio(dias.flatMap((d) => d.resolucion)),
    indice: Math.round(100 * (0.25 * presencia + 0.75 * calidad)),
    presencia,
    calidad,
  }
}

/** El periodo pedido y el anterior de la misma duración (para la comparación). */
export function periodos(h: Dia[], dias: number, perfil: PerfilEmpleado): { actual: Resumen; anterior: Resumen } {
  return { actual: resumir(h.slice(-dias), perfil), anterior: resumir(h.slice(-2 * dias, -dias), perfil) }
}

export type Nivel = { etiqueta: string; tono: "ok" | "warn" | "bad" }
export function nivel(indice: number): Nivel {
  if (indice >= 90) return { etiqueta: "Sobresaliente", tono: "ok" }
  if (indice >= 80) return { etiqueta: "En meta", tono: "ok" }
  if (indice >= 70) return { etiqueta: "Por mejorar", tono: "warn" }
  return { etiqueta: "Requiere atención", tono: "bad" }
}

/** Días seguidos llegando a tiempo, contando hacia atrás desde hoy (los descansos no rompen la racha). */
export function racha(h: Dia[]): number {
  let n = 0
  for (let i = h.length - 1; i >= 0; i--) {
    const d = h[i]
    if (d.estado === "descanso" || d.estado === "por_iniciar") continue
    if (d.estado !== "a_tiempo") break
    n++
  }
  return n
}

/* ------------------------------------------------------------------ */
/* Insignias (salen de los datos) y capacitación (muestra)            */
/* ------------------------------------------------------------------ */

export type Insignia = { id: string; nombre: string; detalle: string }

export function insignias(r: Resumen, h: Dia[]): Insignia[] {
  const out: Insignia[] = []
  const rach = racha(h)
  if (r.laborables >= 5 && r.retardos === 0 && r.faltas === 0) out.push({ id: "puntual", nombre: "Puntualidad perfecta", detalle: "Sin retardos ni faltas en el periodo" })
  else if (rach >= 5) out.push({ id: "racha", nombre: `${rach} días a tiempo`, detalle: "Racha de llegadas a tiempo" })
  const ronda = r.metricas.rondas
  if (ronda && ronda.n >= 3 && ronda.ok === ronda.n) out.push({ id: "rondas", nombre: "Rondas impecables", detalle: `Las ${ronda.n} rondas a tiempo` })
  const ap = r.metricas.apoyos
  if (ap && ap.n >= 3 && r.atencionProm !== null && r.atencionProm <= 10) out.push({ id: "rapida", nombre: "Respuesta rápida", detalle: `Atiende los apoyos en ${Math.round(r.atencionProm)} min en promedio` })
  const ta = r.metricas.tareas
  if (ta && ta.n >= 5 && (ta.tasa ?? 0) >= 0.95) out.push({ id: "tareas", nombre: "Tareas al día", detalle: `${Math.round((ta.tasa ?? 0) * 100)} % de sus tareas a tiempo` })
  const asg = r.metricas.asignadas
  if (asg && asg.n >= 5 && (asg.tasa ?? 0) >= 0.9) out.push({ id: "equipo", nombre: "Equipo en meta", detalle: "Su equipo hace a tiempo 9 de cada 10 tareas" })
  const tur = r.metricas.turnados
  if (tur && tur.n >= 5 && (tur.tasa ?? 0) >= 0.95) out.push({ id: "mesa", nombre: "Mesa ágil", detalle: "Turna casi todo en menos de 1 hora" })
  const tk = r.metricas.tickets
  if (tk && tk.n >= 3 && (tk.tasa ?? 0) >= 0.95) out.push({ id: "plazo", nombre: "Siempre en plazo", detalle: `${tk.n} tickets resueltos en plazo` })
  if (r.indice >= 90) out.push({ id: "top", nombre: "Desempeño sobresaliente", detalle: `Índice de ${r.indice}` })
  return out
}

export type Curso = { nombre: string; estado: "acreditado" | "en_curso" | "pendiente"; fecha?: number; avance?: number; vence?: number }

const CURSOS_COMUNES = ["Trato digno a personas con discapacidad", "Protección de datos personales", "Uso de la consola Metro Sin Barreras"]
const CURSOS_DE: Record<PerfilEmpleado, string[]> = {
  jefe: ["Protocolo de persona atrapada en elevador", "Evacuación y sismos", "Liderazgo de equipos operativos"],
  personal: ["Protocolo de persona atrapada en elevador", "Primeros auxilios", "Lengua de Señas Mexicana básica"],
  guardia: ["Primeros auxilios", "Atención de urgencias en andén", "Acompañamiento a personas con discapacidad visual"],
  limpieza: ["Manejo seguro de residuos y químicos", "Señalización de piso mojado"],
  mant: ["Seguridad en elevadores y escaleras eléctricas", "Bloqueo y etiquetado de equipos"],
  mesa: ["Atención ciudadana", "Moderación de evidencias fotográficas"],
  sistemas: ["Continuidad del servicio y respaldo", "Seguridad de la información"],
}

/** Capacitación (datos de muestra). */
export function capacitacion(e: Empleado, now: number): Curso[] {
  const r = rng(hash(`cursos:${e.id}`))
  return [...CURSOS_DE[e.perfil], ...CURSOS_COMUNES].map((nombre, i) => {
    const x = r()
    if (i === 0 || x < 0.62) return { nombre, estado: "acreditado", fecha: now - Math.floor(20 + r() * 500) * DIA }
    if (x < 0.85) return { nombre, estado: "en_curso", avance: 0.2 + Math.round(r() * 7) / 10 }
    return { nombre, estado: "pendiente", vence: now + Math.floor(10 + r() * 60) * DIA }
  })
}

/* ------------------------------------------------------------------ */
/* Actividad reciente (solo registros reales)                          */
/* ------------------------------------------------------------------ */

export type TipoEvento = MetricaId | "urgencia" | "acceso"
export type Evento = { ts: number; tipo: TipoEvento; texto: string; detalle?: string }

export function eventosDe(db: BaseDatos, e: Empleado, auditoria: EstadoConsola["auditoria"], max = 14): Evento[] {
  const sv = servicioDe(db)
  const op = operacionDe(db)
  const out: Evento[] = []
  const tipoTicket = (t: Ticket): TipoEvento => (t.clase === "tarea" ? "tareas" : "tickets")
  for (const t of sv.tickets)
    for (const h of t.historial) if (h.por === e.nombre) out.push({ ts: h.ts, tipo: tipoTicket(t), texto: h.texto, detalle: `${t.id} · ${t.asunto} · ${t.station}` })
  for (const x of op.incidentes)
    if (x.asignadoA === e.id) {
      if (x.atendida) out.push({ ts: x.atendida, tipo: "apoyos", texto: "Atendió una solicitud de apoyo", detalle: `${x.id} · ${x.punto} · ${x.station}` })
      else if (x.asignada) out.push({ ts: x.asignada, tipo: "apoyos", texto: "Recibió una solicitud de apoyo", detalle: `${x.id} · ${x.punto} · ${x.station}` })
    }
  for (const r of op.rondas) if (r.porId === e.id) out.push({ ts: r.ts, tipo: "rondas", texto: `Registró la ronda ${r.slot === "apertura" ? "de apertura" : `de las ${r.slot}`}`, detalle: `${Object.keys(r.resultados).length} equipos revisados · ${r.station}` })
  for (const v of op.verificaciones) if (v.porNombre === e.nombre) out.push({ ts: v.ts, tipo: "verificaciones", texto: v.resultado === "confirmada" ? "Confirmó una falla en sitio" : "Verificó en sitio: sin falla", detalle: `${v.equipmentId} · ${v.station}` })
  for (const o of op.ordenes) {
    if (o.creadaPor === e.nombre) out.push({ ts: o.creada, tipo: "ordenes", texto: "Envió una falla a mantenimiento", detalle: `${o.id} · ${o.equipmentId}` })
    if (o.atiende === e.nombre && o.resuelta) out.push({ ts: o.resuelta, tipo: "ordenes", texto: "Cerró una orden de mantenimiento", detalle: `${o.id} · ${o.nota ?? o.equipmentId}` })
  }
  for (const u of urgenciasDe(db)) {
    if (u.activadaPor === e.nombre) out.push({ ts: u.ts, tipo: "urgencia", texto: "Activó una urgencia", detalle: `${u.id} · ${u.station} · ${u.lugar}` })
    if (u.atendidaPor === e.nombre && u.atendida) out.push({ ts: u.atendida, tipo: "urgencia", texto: "Cerró una urgencia como atendida", detalle: `${u.id} · ${u.station}` })
    if (u.llamada?.contestadaPor === e.nombre && u.llamada.contestada) out.push({ ts: u.llamada.contestada, tipo: "urgencia", texto: "Contestó una llamada de una persona usuaria", detalle: `${u.id} · ${u.station} · ${u.lugar}` })
  }
  for (const a of auditoria) if (a.actor.startsWith(`${e.nombre} <`) && a.accion === "inicio de sesión" && a.resultado === "permitido") out.push({ ts: a.ts, tipo: "acceso", texto: "Inició sesión en la consola" })
  return out.sort((a, b) => b.ts - a.ts).slice(0, max)
}
