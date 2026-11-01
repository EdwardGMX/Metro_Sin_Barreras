/**
 * La jornada de cada persona como actividades con hora de inicio y de fin dentro del turno:
 * las tareas del jefe de estación, los tickets de cualquier área, los apoyos a personas
 * usuarias y las rondas de revisión que tiene a su cargo. Con ellas se dibuja la línea de la
 * jornada (personal), el diagrama de Gantt del equipo (jefe) y el reloj del turno, y se sabe
 * qué está haciendo cada quien en este momento.
 */
import { META_LLEGADA, operacionDe, rondasDelDia, type Incidente, type Persona } from "./operacion"
import type { BaseDatos } from "./reports"
import { abierto, asignadoA, atrasada, horaDe, turnoEnCurso, type Ticket } from "./servicio"

export type TipoActividad = "tarea" | "ticket" | "apoyo" | "ronda"
export type EstadoActividad = "hecha" | "curso" | "pendiente" | "atrasada"

export type Actividad = {
  id: string
  tipo: TipoActividad
  titulo: string
  /** Minutos desde la medianoche. */
  inicio: number
  fin: number
  estado: EstadoActividad
  alta?: boolean
  ticket?: Ticket
  incidente?: Incidente
}

export const TIPO_ACTIVIDAD_LABEL: Record<TipoActividad, string> = { tarea: "Tarea", ticket: "Ticket", apoyo: "Apoyo", ronda: "Ronda" }
export const ESTADO_ACTIVIDAD_LABEL: Record<EstadoActividad, string> = { hecha: "Hecha", curso: "En curso", pendiente: "Pendiente", atrasada: "Atrasada" }

/** Duración que se reserva en la línea cuando aún no termina (propuesta para la visualización). */
export const DURACION_MIN: Record<TipoActividad, number> = { tarea: 30, ticket: 30, apoyo: 20, ronda: 30 }

const minDelDia = (ts: number) => {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}
const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

function deTicket(t: Ticket, turnoInicio: number, ahora: number): Actividad {
  const minAhora = minDelDia(ahora)
  // Un ticket asignado antes del turno aparece al inicio del turno.
  let inicio = t.clase === "ticket" ? Math.max(horaDe(t), turnoInicio) : horaDe(t)
  let fin = inicio + DURACION_MIN[t.clase]
  let estado: EstadoActividad = "pendiente"
  if (!abierto(t)) {
    estado = "hecha"
    if (t.resuelto && mismoDia(t.resuelto, ahora)) fin = Math.max(inicio + 10, minDelDia(t.resuelto))
  } else if (atrasada(t, ahora)) {
    estado = "atrasada"
  } else if (t.estado === "en_proceso") {
    estado = "curso"
    if (t.iniciado && mismoDia(t.iniciado, ahora)) inicio = Math.max(turnoInicio, Math.min(inicio, minDelDia(t.iniciado)))
    fin = Math.max(fin, minAhora + 10)
  }
  return { id: t.id, tipo: t.clase, titulo: t.asunto, inicio, fin, estado, alta: t.prioridad === "alta", ticket: t }
}

function deApoyo(x: Incidente, ahora: number): Actividad {
  const inicio = minDelDia(x.asignada ?? x.ts)
  let fin = inicio + DURACION_MIN.apoyo
  let estado: EstadoActividad
  if (x.estado === "atendida") {
    estado = "hecha"
    if (x.atendida) fin = Math.max(inicio + 10, minDelDia(x.atendida))
  } else {
    // Asignado y sin llegar: urgente; pasado el tiempo meta de llegada, atrasado.
    estado = x.estado === "asignada" && ahora - (x.asignada ?? x.ts) > META_LLEGADA ? "atrasada" : "curso"
    fin = Math.max(fin, minDelDia(ahora) + 10)
  }
  return { id: x.id, tipo: "apoyo", titulo: `Apoyo · ${x.punto}`, inicio, fin, estado, alta: true, incidente: x }
}

/** Todo lo que una persona tiene en el turno en curso, ordenado por hora. */
export function actividadesDe(db: BaseDatos, persona: Persona, ahora: number): Actividad[] {
  const turno = turnoEnCurso(ahora)
  const op = operacionDe(db)
  const acts: Actividad[] = asignadoA(db, persona.id, ahora).map((t) => deTicket(t, turno.inicio, ahora))

  for (const x of op.incidentes) {
    if (x.asignadoA !== persona.id || x.estado === "cancelada") continue
    if (!mismoDia(x.asignada ?? x.ts, ahora) && x.estado === "atendida") continue
    acts.push(deApoyo(x, ahora))
  }

  for (const r of rondasDelDia(op, persona.station, ahora, ahora)) {
    if (r.responsable?.id !== persona.id) continue
    const inicio = minDelDia(r.ts)
    const estado: EstadoActividad = r.estado === "hecha" || r.estado === "tarde" ? "hecha" : r.estado === "atrasada" ? "atrasada" : r.estado === "en_curso" ? "curso" : "pendiente"
    const fin = r.registro ? Math.max(inicio + 10, minDelDia(r.registro.ts)) : inicio + DURACION_MIN.ronda
    acts.push({ id: `ronda-${r.slot}`, tipo: "ronda", titulo: `Ronda de las ${r.hora}`, inicio, fin, estado })
  }

  // Solo lo que cae en el turno en curso, recortado a sus límites.
  return acts
    .filter((a) => a.fin > turno.inicio && a.inicio < turno.fin)
    .map((a) => ({ ...a, inicio: Math.max(a.inicio, turno.inicio), fin: Math.min(Math.max(a.fin, a.inicio + 10), turno.fin) }))
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin)
}

export type Presencia = { clave: "apoyo" | "ocupado" | "atrasado" | "disponible" | "fuera"; texto: string; detalle?: string; actividad?: Actividad }

/** Qué está haciendo la persona en este momento, para los indicadores de «quién está dónde». */
export function presenciaDe(acts: Actividad[], ahora: number): Presencia {
  const turno = turnoEnCurso(ahora)
  if (!turno.dentro) return { clave: "fuera", texto: "Fuera de turno" }
  const m = minDelDia(ahora)
  const hh = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`
  const apoyo = acts.find((a) => a.tipo === "apoyo" && a.estado !== "hecha")
  if (apoyo) return { clave: "apoyo", texto: apoyo.incidente?.estado === "en_camino" ? "En camino a un apoyo" : "Apoyo por atender", detalle: apoyo.incidente?.punto, actividad: apoyo }
  const enCurso = acts.find((a) => a.estado === "curso" && a.inicio <= m)
  if (enCurso) return { clave: "ocupado", texto: "En una actividad", detalle: enCurso.titulo, actividad: enCurso }
  const atrasada = acts.find((a) => a.estado === "atrasada")
  if (atrasada) return { clave: "atrasado", texto: "Con algo atrasado", detalle: atrasada.titulo, actividad: atrasada }
  const siguiente = acts.find((a) => a.estado === "pendiente" && a.inicio >= m)
  return { clave: "disponible", texto: "Disponible", detalle: siguiente ? `Sigue ${hh(siguiente.inicio)} · ${siguiente.titulo}` : "Sin pendientes en el turno", actividad: siguiente }
}

/** Reparte actividades que se enciman en carriles para que ninguna barra tape a otra. */
export function carriles(acts: Actividad[]): Array<{ a: Actividad; carril: number }> {
  const fines: number[] = []
  return acts.map((a) => {
    let c = fines.findIndex((f) => f <= a.inicio)
    if (c === -1) c = fines.push(0) - 1
    fines[c] = a.fin
    return { a, carril: c }
  })
}
