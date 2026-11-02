/**
 * La jornada dibujada en el tiempo del turno.
 * - LineaJornada: la jornada de una persona como una sola línea de extremo a extremo
 *   (inicio a fin del turno), con cada actividad en su hora y la marca de «Ahora».
 * - GanttEquipo: el turno del equipo de una estación; cada fila es una persona, con su
 *   indicador de dónde está ahora mismo, y la línea de «Ahora» cruza todas las filas.
 * - RelojTurno: el turno como la carátula de un reloj, con la aguja en la hora actual.
 * El estado siempre lleva ícono y texto (o etiqueta accesible), nunca solo color.
 */
import { useEffect, useRef, type CSSProperties } from "react"
import { carriles, ESTADO_ACTIVIDAD_LABEL, TIPO_ACTIVIDAD_LABEL, type Actividad, type EstadoActividad, type Presencia, type TipoActividad } from "../../lib/jornada"
import { turnoEnCurso } from "../../lib/servicio"
import { Icon, type IconName } from "../Icon"
import { Avatar, hhmm, type Perfil } from "./Visual"

export const ICONO_TIPO: Record<TipoActividad, IconName> = { tarea: "clipboard", ticket: "ticket", apoyo: "people", ronda: "eye" }
export const ICONO_ESTADO: Record<EstadoActividad, IconName> = { hecha: "check", curso: "clock", pendiente: "minus", atrasada: "alert" }
const ICONO_PRESENCIA: Record<Presencia["clave"], IconName> = { apoyo: "people", ocupado: "clock", atrasado: "alert", disponible: "check", fuera: "minus" }

type Turno = ReturnType<typeof turnoEnCurso>
const minDelDia = (ts: number) => new Date(ts).getHours() * 60 + new Date(ts).getMinutes()
const pos = (m: number, t: Turno) => Math.min(100, Math.max(0, ((m - t.inicio) / (t.fin - t.inicio)) * 100))
/** En pantallas angostas la línea se desliza de lado: al abrir, se centra en «Ahora». */
function useCentrarAhora() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const ahora = el?.querySelector(".linea-ahora")
    if (!el || !ahora || el.scrollWidth <= el.clientWidth) return
    // Si hay una columna fija (nombres del Gantt), se centra en el espacio que queda a su derecha.
    const fija = el.querySelector<HTMLElement>(".gantt-fila .gantt-col-persona")
    const ancho = fija && getComputedStyle(fija).position === "sticky" ? fija.offsetWidth : 0
    el.scrollLeft += ahora.getBoundingClientRect().left - el.getBoundingClientRect().left - ancho - (el.clientWidth - ancho) / 2
  }, [])
  return ref
}

const etiquetaAct = (a: Actividad) => `${hhmm(a.inicio)} a ${hhmm(a.fin)}: ${TIPO_ACTIVIDAD_LABEL[a.tipo]}, ${a.titulo}. ${ESTADO_ACTIVIDAD_LABEL[a.estado]}.`

export function faltan(ahora: number): string {
  const t = turnoEnCurso(ahora)
  if (!t.dentro) return `Turno ${t.nombre.toLowerCase()} de ${hhmm(t.inicio)} a ${hhmm(t.fin)}`
  const m = t.fin - minDelDia(ahora)
  const h = Math.floor(m / 60)
  return `Faltan ${h ? `${h} h ` : ""}${m % 60} min de turno`
}

/* ------------------------------------------------------------------ */
/* Eje de horas y leyenda                                              */
/* ------------------------------------------------------------------ */

function EjeHoras({ turno, ahora, conAhora = true }: { turno: Turno; ahora: number; conAhora?: boolean }) {
  const horas: number[] = []
  for (let m = turno.inicio; m <= turno.fin; m += 60) horas.push(m)
  const m = minDelDia(ahora)
  return (
    <div className="eje-horas" aria-hidden="true">
      {horas.map((h, i) => (
        <span key={h} className={`eje-hora ${i % 2 ? "eje-impar" : ""} ${i === horas.length - 1 ? "eje-ultima" : ""}`} style={{ left: `${pos(h, turno)}%` }}>
          {hhmm(h)}
        </span>
      ))}
      {conAhora && turno.dentro && (
        <span className="eje-ahora" style={{ left: `${pos(m, turno)}%` }}>
          Ahora {hhmm(m)}
        </span>
      )}
    </div>
  )
}

export function LeyendaActividades({ porPuesto = false }: { porPuesto?: boolean }) {
  return (
    <ul className="leyenda-act" aria-label="Qué significa cada color">
      {(["hecha", "curso", "pendiente", "atrasada"] as EstadoActividad[]).map((e) => (
        <li key={e}>
          <span className={`leyenda-muestra act-${e}`} aria-hidden="true">
            <Icon name={ICONO_ESTADO[e]} className="size-3" />
          </span>
          {ESTADO_ACTIVIDAD_LABEL[e]}
          {porPuesto && e === "hecha" ? " (color de su puesto)" : ""}
        </li>
      ))}
      <li className="leyenda-tipos">
        {(Object.keys(ICONO_TIPO) as TipoActividad[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <Icon name={ICONO_TIPO[t]} className="size-3.5" /> {TIPO_ACTIVIDAD_LABEL[t]}
          </span>
        ))}
      </li>
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Una barra de actividad                                              */
/* ------------------------------------------------------------------ */

function Barra({ a, turno, carril, numero, onAbrir }: { a: Actividad; turno: Turno; carril: number; numero?: number; onAbrir: (a: Actividad) => void }) {
  const left = pos(a.inicio, turno)
  const width = Math.max(pos(a.fin, turno) - left, 2.2)
  const style = { left: `${left}%`, width: `${width}%`, "--carril": carril } as CSSProperties
  return (
    <button type="button" className={`act act-${a.estado}`} style={style} onClick={() => onAbrir(a)} aria-label={`${numero ? `${numero}. ` : ""}${etiquetaAct(a)}`} title={etiquetaAct(a)}>
      {numero !== undefined && <span className="act-num">{numero}</span>}
      <Icon name={a.estado === "hecha" ? "check" : a.estado === "atrasada" ? "alert" : ICONO_TIPO[a.tipo]} className="act-icono" />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Línea de la jornada (personal)                                      */
/* ------------------------------------------------------------------ */

export function LineaJornada({ acts, ahora, onAbrir }: { acts: Actividad[]; ahora: number; onAbrir: (a: Actividad) => void }) {
  const turno = turnoEnCurso(ahora)
  const m = minDelDia(ahora)
  const lanes = carriles(acts)
  const n = Math.max(1, ...lanes.map((x) => x.carril + 1))
  const ref = useCentrarAhora()
  return (
    <div ref={ref} className="desliza" tabIndex={0} role="region" aria-label="Línea de tu jornada (desliza de lado en pantallas pequeñas)">
    <div className="linea-jornada">
      <div className="linea-extremos" aria-hidden="true">
        <span>
          <Icon name="train" className="size-3.5" /> Inicio {hhmm(turno.inicio)}
        </span>
        <span>
          Fin y entrega {hhmm(turno.fin)} <Icon name="check" className="size-3.5" />
        </span>
      </div>
      <div className="linea-pista" style={{ "--carriles": n } as CSSProperties}>
        <span className="linea-riel" aria-hidden="true" />
        {turno.dentro && <span className="linea-avance" style={{ width: `${pos(m, turno)}%` }} aria-hidden="true" />}
        <ol className="contents" aria-label={`Tu jornada de ${hhmm(turno.inicio)} a ${hhmm(turno.fin)}`}>
          {lanes.map(({ a, carril }, i) => (
            <li key={a.id} className="contents">
              <Barra a={a} turno={turno} carril={carril} numero={i + 1} onAbrir={onAbrir} />
            </li>
          ))}
        </ol>
        {turno.dentro && <span className="linea-ahora" style={{ left: `${pos(m, turno)}%` }} aria-hidden="true" />}
      </div>
      <EjeHoras turno={turno} ahora={ahora} />
    </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Gantt del equipo (jefe de estación)                                 */
/* ------------------------------------------------------------------ */

export type FilaGantt = { id: string; nombre: string; puesto: string; perfil: Perfil; acts: Actividad[]; presencia: Presencia }

export function PresenciaChip({ p }: { p: Presencia }) {
  return (
    <span className={`presencia presencia-${p.clave}`}>
      <Icon name={ICONO_PRESENCIA[p.clave]} className="size-3" />
      {p.texto}
    </span>
  )
}

export function GanttEquipo({ filas, ahora, onAbrir, onAsignar }: { filas: FilaGantt[]; ahora: number; onAbrir: (a: Actividad) => void; onAsignar: (id: string) => void }) {
  const turno = turnoEnCurso(ahora)
  const m = minDelDia(ahora)
  const ref = useCentrarAhora()
  return (
    <div ref={ref} className="gantt desliza" tabIndex={0} role="region" aria-label="Turno del equipo (desliza de lado en pantallas pequeñas)">
      <div className="gantt-cabecera">
        <span className="gantt-col-persona text-xs font-extrabold uppercase tracking-wide text-ink-muted">Persona · ahora mismo</span>
        <div className="gantt-col-tiempo">
          <EjeHoras turno={turno} ahora={ahora} />
        </div>
      </div>
      <ul className="gantt-filas">
        {filas.map((f) => {
          const lanes = carriles(f.acts)
          const n = Math.max(1, ...lanes.map((x) => x.carril + 1))
          return (
            <li key={f.id} className={`gantt-fila rol-${f.perfil}`} aria-label={`${f.nombre}, ${f.puesto}. Ahora: ${f.presencia.texto}`}>
              <div className="gantt-col-persona gantt-persona">
                <span className="relative">
                  <Avatar nombre={f.nombre} perfil={f.perfil} />
                  <span className={`presencia-punto presencia-${f.presencia.clave}`} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{f.nombre}</span>
                  <span className="block truncate text-xs text-ink-muted">{f.puesto}</span>
                  <PresenciaChip p={f.presencia} />
                  {f.presencia.detalle && <span className="block truncate text-xs text-ink-muted">{f.presencia.detalle}</span>}
                </span>
                <button type="button" className="gantt-asignar" onClick={() => onAsignar(f.id)} aria-label={`Asignar una tarea a ${f.nombre}`} title={`Asignar a ${f.nombre.split(" ")[0]}`}>
                  <Icon name="plus" size="sm" />
                </button>
              </div>
              <div className="gantt-col-tiempo">
                <div className="linea-pista gantt-pista" style={{ "--carriles": n } as CSSProperties}>
                  <span className="linea-riel" aria-hidden="true" />
                  {f.acts.length === 0 && <span className="gantt-vacio">Sin actividades asignadas</span>}
                  {lanes.map(({ a, carril }) => (
                    <Barra key={a.id} a={a} turno={turno} carril={carril} onAbrir={onAbrir} />
                  ))}
                  {turno.dentro && <span className="linea-ahora" style={{ left: `${pos(m, turno)}%` }} aria-hidden="true" />}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Reloj del turno                                                     */
/* ------------------------------------------------------------------ */

const COLOR_ESTADO: Record<EstadoActividad, string> = { hecha: "var(--rol)", curso: "#e8a317", pendiente: "#b9c3c9", atrasada: "var(--color-danger)" }

/** Conteo de actividades por estado con las mismas muestras de color que la línea. */
export function ConteoEstados({ acts }: { acts: Actividad[] }) {
  return (
    <ul className="leyenda-act" aria-label="Tus actividades por estado">
      {(["hecha", "curso", "pendiente", "atrasada"] as EstadoActividad[]).map((e) => (
        <li key={e}>
          <span className={`leyenda-muestra act-${e}`} aria-hidden="true">
            <Icon name={ICONO_ESTADO[e]} className="size-3" />
          </span>
          <span className="font-extrabold text-ink tabular-nums">{acts.filter((a) => a.estado === e).length}</span> {ESTADO_ACTIVIDAD_LABEL[e].toLowerCase()}
        </li>
      ))}
    </ul>
  )
}

/** Un reloj de 12 horas: el turno es el arco claro, cada actividad un arco de su color y las agujas marcan la hora. */
export function RelojTurno({ acts, ahora }: { acts: Actividad[]; ahora: number }) {
  const turno = turnoEnCurso(ahora)
  const R = 58
  const C = 80
  const ang = (min: number) => (((min / 60) % 12) / 12) * 2 * Math.PI - Math.PI / 2
  const punto = (min: number, r: number) => [C + r * Math.cos(ang(min)), C + r * Math.sin(ang(min))] as const
  const arco = (a: number, b: number, r: number) => {
    const [x1, y1] = punto(a, r)
    const [x2, y2] = punto(b, r)
    return `M ${x1} ${y1} A ${r} ${r} 0 ${b - a > 360 ? 1 : 0} 1 ${x2} ${y2}`
  }
  const d = new Date(ahora)
  const m = d.getHours() * 60 + d.getMinutes()
  const [hx, hy] = punto(m, R - 26)
  const minAng = (d.getMinutes() / 60) * 2 * Math.PI - Math.PI / 2
  const [mx, my] = [C + (R - 12) * Math.cos(minAng), C + (R - 12) * Math.sin(minAng)]
  const hechas = acts.filter((a) => a.estado === "hecha").length
  return (
    <figure className="reloj">
      <svg viewBox="0 0 160 160" role="img" aria-label={`Reloj: son las ${hhmm(m)}. Tu turno va de ${hhmm(turno.inicio)} a ${hhmm(turno.fin)}; ${hechas} de ${acts.length} actividades hechas. ${faltan(ahora)}.`}>
        <circle cx={C} cy={C} r={R + 14} fill="#fff" stroke="var(--color-border)" strokeWidth="2" />
        <path d={arco(turno.inicio, turno.fin, R)} fill="none" stroke="var(--rol-suave)" strokeWidth="16" />
        {acts.map((a) => (
          <path key={a.id} d={arco(a.inicio, Math.max(a.fin, a.inicio + 6), R)} fill="none" stroke={COLOR_ESTADO[a.estado]} strokeWidth="16" />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const h = i * 60
          const [x1, y1] = punto(h, R + 9)
          const [x2, y2] = punto(h, R + 13)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink-muted)" strokeWidth={i % 3 === 0 ? 2.5 : 1.2} />
        })}
        {[12, 3, 6, 9].map((h) => {
          const [tx, ty] = punto((h % 12) * 60, R - 20)
          return (
            <text key={h} x={tx} y={ty} textAnchor="middle" dominantBaseline="central" className="reloj-hora">
              {h}
            </text>
          )
        })}
        <line x1={C} y1={C} x2={mx} y2={my} stroke="var(--color-ink-muted)" strokeWidth="2" strokeLinecap="round" />
        <line x1={C} y1={C} x2={hx} y2={hy} stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
        <circle cx={C} cy={C} r="5" fill="var(--color-ink)" />
      </svg>
      <figcaption className="reloj-pie">
        <span className="block text-2xl font-extrabold tabular-nums">{hhmm(m)}</span>
        <span className="block font-extrabold">
          {hechas} de {acts.length} hechas
        </span>
        <span className="block text-xs text-ink-muted">
          Turno {hhmm(turno.inicio)}–{hhmm(turno.fin)} · {faltan(ahora).toLowerCase()}
        </span>
      </figcaption>
    </figure>
  )
}
