/**
 * Vista de inicio del jefe o jefa de estación: «¿Mi estación está bien ahora y mi equipo sabe qué hacer?»
 * Arriba, la estación de un vistazo (equipos, rondas y tareas); abajo, su equipo con las tareas
 * de cada quien y los tickets que llegan a la estación.
 */
import { useState, type FormEvent } from "react"
import { equiposDeEstacion } from "../../data/accessibility"
import { operacionDe, personasDe, rondasDelDia, ESTADO_RONDA_LABEL, reportesPorVerificar, type Persona } from "../../lib/operacion"
import { estadoEquipo } from "../../lib/reports"
import {
  abierto,
  atrasada,
  crearTarea,
  horaDe,
  servicioDe,
  turnoEnCurso,
  AREA_DE_PUESTO,
  ESTADO_TAREA_LABEL,
  TAREAS_SUGERIDAS,
  type Prioridad as TPrioridad,
  type Ticket,
} from "../../lib/servicio"
import { Icon } from "../Icon"
import { Dialog } from "../ui"
import type { Ctx } from "../admin/AdminApp"
import { DetalleTicket, LevantarTicket, TicketCard } from "./Tickets"
import { Avatar, BarraEstados, hhmm, ICONO_AREA, Letrero, Trayecto, Vistazo, type Parte } from "./Visual"

const ICONO_EQUIPO = { Elevador: "elevator", "Escalera eléctrica": "stairs", Salvaescaleras: "stairs" } as const

export function estadoTarea(t: Ticket, now: number): { texto: string; tono: "ok" | "warn" | "bad" | "neutral"; clase: Parte["clase"] } {
  if (t.estado === "resuelto" || t.estado === "cerrado") return { texto: ESTADO_TAREA_LABEL[t.estado], tono: "ok", clase: "hecha" }
  if (atrasada(t, now)) return { texto: "Atrasada", tono: "bad", clase: "atrasada" }
  if (t.estado === "en_proceso") return { texto: "En curso", tono: "warn", clase: "curso" }
  return { texto: "Pendiente", tono: "neutral", clase: "pendiente" }
}

export function partesDe(tareas: Ticket[], now: number): Parte[] {
  const c = { hecha: 0, curso: 0, pendiente: 0, atrasada: 0 }
  for (const t of tareas) c[estadoTarea(t, now).clase]++
  return [
    { etiqueta: "hechas", valor: c.hecha, clase: "hecha" },
    { etiqueta: "en curso", valor: c.curso, clase: "curso" },
    { etiqueta: "pendientes", valor: c.pendiente, clase: "pendiente" },
    { etiqueta: "atrasadas", valor: c.atrasada, clase: "atrasada" },
  ]
}

const PERFIL_PUESTO = { "Policía auxiliar": "guardia", "Personal de estación": "personal", "Personal de limpieza": "personal", "Jefe(a) de estación": "jefe" } as const

/* ------------------------------------------------------------------ */

function AsignarTarea({ ctx, station, open, onClose, persona: inicial }: { ctx: Ctx; station: string; open: boolean; onClose: () => void; persona?: Persona }) {
  const { db, cuenta, ahora, operar } = ctx
  const equipo = personasDe(operacionDe(db), station).filter((p) => p.puesto !== "Jefe(a) de estación")
  const turno = turnoEnCurso(ahora)
  const minAhora = new Date(ahora).getHours() * 60 + new Date(ahora).getMinutes()
  const desde = Math.max(turno.inicio, Math.ceil(minAhora / 15) * 15)
  const horas: number[] = []
  for (let m = Math.min(desde, turno.fin - 15); m < turno.fin; m += 15) horas.push(m)
  const [personaId, setPersonaId] = useState(inicial?.id ?? "")
  const [asunto, setAsunto] = useState("")
  const [otro, setOtro] = useState(false)
  const [hora, setHora] = useState(horas[0] ?? desde)
  const [prioridad, setPrioridad] = useState<TPrioridad>("media")
  const [detalle, setDetalle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const persona = equipo.find((p) => p.id === personaId)
  const sugeridas = persona ? (TAREAS_SUGERIDAS[AREA_DE_PUESTO[persona.puesto]] ?? []) : []

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const r = operar((d, est, now) => crearTarea(d, est, cuenta, { station, personaId, asunto, detalle, hora, prioridad }, now))
    if (r.ok) onClose()
    else setError(r.mensaje)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Asignar una tarea" wide>
      <form className="rol-jefe space-y-5" onSubmit={enviar} noValidate>
        <fieldset>
          <legend className="field-legend px-0">¿A quién?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {equipo.map((p) => (
              <button
                key={p.id}
                type="button"
                className="opcion-grande"
                aria-pressed={personaId === p.id}
                onClick={() => {
                  setPersonaId(p.id)
                  setAsunto("")
                  setOtro(false)
                }}
              >
                <Avatar nombre={p.nombre} perfil={PERFIL_PUESTO[p.puesto]} />
                <span className="min-w-0">
                  <span className="block font-extrabold">{p.nombre}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-muted">
                    <Icon name={ICONO_AREA[AREA_DE_PUESTO[p.puesto]]} className="size-3.5" /> {p.puesto}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Para Mantenimiento, Sistemas u otra área, levanta un ticket: no dependen de la estación.</p>
        </fieldset>

        {persona && (
          <>
            <fieldset>
              <legend className="field-legend px-0">¿Qué debe hacer?</legend>
              <div className="flex flex-wrap gap-2">
                {sugeridas.map((x) => (
                  <button key={x} type="button" className="opcion-grande w-auto min-h-11 px-3 py-1.5 text-sm font-bold" aria-pressed={!otro && asunto === x} onClick={() => (setOtro(false), setAsunto(x))}>
                    {x}
                  </button>
                ))}
                <button type="button" className="opcion-grande w-auto min-h-11 px-3 py-1.5 text-sm font-bold" aria-pressed={otro} onClick={() => (setOtro(true), setAsunto(""))}>
                  Otra tarea
                </button>
              </div>
              {otro && (
                <>
                  <label htmlFor="tarea-otra" className="field-label mt-3">
                    Escribe la tarea (80 caracteres)
                  </label>
                  <input id="tarea-otra" className="field-select" maxLength={80} value={asunto} onChange={(e) => setAsunto(e.target.value)} />
                </>
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tarea-hora" className="field-label">
                  ¿A qué hora?
                </label>
                <select id="tarea-hora" className="field-select" value={hora} onChange={(e) => setHora(Number(e.target.value))}>
                  {horas.map((m) => (
                    <option key={m} value={m}>
                      {hhmm(m)}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className="field-label">Prioridad</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(["alta", "media", "baja"] as TPrioridad[]).map((p) => (
                    <button key={p} type="button" className="opcion-grande min-h-12 justify-center px-1 py-1 text-sm font-bold" aria-pressed={prioridad === p} onClick={() => setPrioridad(p)}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div>
              <label htmlFor="tarea-detalle" className="field-label">
                Indicaciones (opcional)
              </label>
              <textarea id="tarea-detalle" className="report-textarea min-h-20 w-full" maxLength={200} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
            </div>
          </>
        )}
        {error && (
          <p className="callout callout-warning mt-0" role="alert">
            <Icon name="alert" size="sm" className="mt-0.5" />
            {error}
          </p>
        )}
        <button type="submit" className="boton-rol min-h-12 w-full" disabled={!persona || !asunto.trim()}>
          <Icon name="send" size="sm" /> Asignar tarea{persona ? ` a ${persona.nombre.split(" ")[0]}` : ""}
        </button>
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function TareaFila({ t, now, onAbrir }: { t: Ticket; now: number; onAbrir: () => void }) {
  const e = estadoTarea(t, now)
  return (
    <li className="tarea-fila">
      <span className="tarea-hora">{hhmm(horaDe(t))}</span>
      <button type="button" className="min-w-0 text-left" onClick={onAbrir}>
        <span className={`block text-sm font-bold leading-snug ${e.clase === "hecha" ? "text-ink-muted line-through decoration-1" : ""}`}>
          {t.clase === "ticket" && <Icon name="ticket" className="mr-1 inline size-3.5" />}
          {t.asunto}
        </span>
        <span className={`chip mt-1 chip-estado-${e.tono}`}>
          <Icon name={e.clase === "hecha" ? "check" : e.clase === "atrasada" ? "alert" : e.clase === "curso" ? "clock" : "minus"} className="size-3" />
          {e.texto}
        </span>
      </button>
    </li>
  )
}

export function VistaJefe({ ctx }: { ctx: Ctx }) {
  const { db, cuenta, ahora, ir } = ctx
  const station = cuenta.estaciones?.[0] ?? "Tacubaya"
  const op = operacionDe(db)
  const turno = turnoEnCurso(ahora)
  const [asignarA, setAsignarA] = useState<Persona | null | undefined>(undefined)
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [levantar, setLevantar] = useState(false)

  const equipos = equiposDeEstacion(station).map((eq) => ({ eq, st: estadoEquipo(db, eq.id, ahora) }))
  const fuera = equipos.filter((x) => x.st.estado !== "disponible")
  const rondas = rondasDelDia(op, station, ahora, ahora)
  const siguiente = rondas.findIndex((r) => r.estado !== "hecha" && r.estado !== "tarde")
  const rondaAtrasada = rondas.some((r) => r.estado === "atrasada")
  const equipo = personasDe(op, station).filter((p) => p.puesto !== "Jefe(a) de estación")
  const sv = servicioDe(db)
  const hoy = new Date(ahora).toDateString()
  const tareasHoy = sv.tickets.filter((t) => t.clase === "tarea" && t.station === station && new Date(t.creado).toDateString() === hoy)
  const partes = partesDe(tareasHoy, ahora)
  const atrasadas = partes.find((p) => p.clase === "atrasada")!.valor
  const ticketsEstacion = sv.tickets.filter((t) => t.clase === "ticket" && t.station === station && t.estado !== "cerrado")
  const porVerificar = reportesPorVerificar(db, [station], ahora).length
  const apoyos = op.incidentes.filter((x) => x.station === station && (x.estado === "abierta" || x.estado === "asignada" || x.estado === "en_camino"))
  const sinAsignar = apoyos.filter((x) => x.estado === "abierta").length

  const avisos = [
    fuera.filter((x) => x.st.estado === "fuera_servicio").length ? `${fuera.filter((x) => x.st.estado === "fuera_servicio").length} ${fuera.filter((x) => x.st.estado === "fuera_servicio").length === 1 ? "equipo fuera de servicio" : "equipos fuera de servicio"}` : "",
    sinAsignar ? `${sinAsignar} ${sinAsignar === 1 ? "apoyo sin asignar" : "apoyos sin asignar"}` : "",
    atrasadas ? `${atrasadas} ${atrasadas === 1 ? "tarea atrasada" : "tareas atrasadas"}` : "",
  ].filter(Boolean)
  const tono = sinAsignar || fuera.some((x) => x.st.estado === "fuera_servicio") ? "bad" : avisos.length ? "warn" : "ok"

  return (
    <div className="vista rol-jefe">
      <Letrero perfil="jefe" icono="train" quien={`${cuenta.nombre} · Jefatura de estación · turno ${turno.nombre.toLowerCase()} ${hhmm(turno.inicio)}–${hhmm(turno.fin)}`} titulo={station} resumen={avisos.length ? avisos.join(" · ") : "Todo en orden en tu estación"} tono={tono}>
        <button type="button" className="boton-rol" onClick={() => setAsignarA(null)}>
          <Icon name="clipboard" size="sm" /> Asignar tarea
        </button>
        <button type="button" className="boton-borde" onClick={() => setLevantar(true)}>
          <Icon name="ticket" size="sm" /> Levantar ticket
        </button>
      </Letrero>

      <div className="vistazos">
        <Vistazo titulo="Equipos de la estación" pie={fuera.length ? fuera.map((x) => `${x.eq.tipo} · ${x.eq.ubicacion}: ${x.st.estado === "fuera_servicio" ? "fuera de servicio" : "con información incierta"}`).join(". ") : "Todos funcionan según la información más reciente."}>
          <ul className="flex flex-wrap gap-1.5" aria-label={`${equipos.length - fuera.length} de ${equipos.length} equipos funcionan`}>
            {equipos.map(({ eq, st }) => {
              const t = st.estado === "disponible" ? "ok" : st.estado === "incierto" ? "warn" : "bad"
              return (
                <li key={eq.id} className={`equipo-pastilla equipo-${t}`} title={`${eq.tipo} · ${eq.ubicacion}`}>
                  <Icon name={ICONO_EQUIPO[eq.tipo]} className="size-4" />
                  <Icon name={t === "ok" ? "check" : t === "warn" ? "alert" : "x"} className="size-3" />
                  <span className="sr-only">
                    {eq.tipo} {eq.ubicacion}: {t === "ok" ? "funciona" : t === "warn" ? "incierto" : "fuera de servicio"}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-sm">
            <span className="text-xl font-extrabold tabular-nums">
              {equipos.length - fuera.length} de {equipos.length}
            </span>{" "}
            funcionan
          </p>
        </Vistazo>
        <Vistazo titulo="Rondas de revisión de hoy" pie={siguiente === -1 ? "Todas las rondas de hoy se hicieron." : `${rondaAtrasada ? "Hay una ronda atrasada. " : ""}Sigue la de las ${rondas[siguiente].hora}${rondas[siguiente].responsable ? ` con ${rondas[siguiente].responsable!.nombre.split(" ")[0]}` : ""}: ${ESTADO_RONDA_LABEL[rondas[siguiente].estado].toLowerCase()}.`}>
          <Trayecto paradas={rondas.map((r) => (r.slot === "apertura" ? "Apertura" : r.slot))} actual={siguiente === -1 ? rondas.length : siguiente} perfil="jefe" alerta={rondas[siguiente]?.estado === "atrasada"} etiqueta="Rondas de hoy" compacto />
        </Vistazo>
        <Vistazo titulo="Tareas de tu equipo hoy">
          <BarraEstados partes={partes} etiqueta="Tareas de hoy" />
        </Vistazo>
      </div>

      <div className="vista-dos">
        <section aria-labelledby="mi-equipo" className="space-y-3">
          <h2 id="mi-equipo" className="seccion-titulo flex items-center gap-2">
            <Icon name="people" /> Tu equipo en este turno
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {equipo.map((p) => {
              const suyas = sv.tickets.filter((t) => t.asignadoA === p.id && ((t.clase === "tarea" && new Date(t.creado).toDateString() === hoy) || (t.clase === "ticket" && abierto(t)))).sort((a, b) => horaDe(a) - horaDe(b))
              const hechas = suyas.filter((t) => !abierto(t)).length
              const area = AREA_DE_PUESTO[p.puesto]
              return (
                <article key={p.id} className={`persona-col rol-${PERFIL_PUESTO[p.puesto]}`} aria-label={`${p.nombre}, ${p.puesto}`}>
                  <header className="flex items-center gap-3">
                    <Avatar nombre={p.nombre} perfil={PERFIL_PUESTO[p.puesto]} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-extrabold">{p.nombre}</h3>
                      <p className="flex items-center gap-1 text-xs text-ink-muted">
                        <Icon name={ICONO_AREA[area]} className="size-3.5" /> {p.puesto}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums" aria-label={`${hechas} de ${suyas.length} hechas`}>
                      {hechas}/{suyas.length}
                    </span>
                  </header>
                  <ul className="mt-2">
                    {suyas.map((t) => (
                      <TareaFila key={t.id} t={t} now={ahora} onAbrir={() => setAbiertoId(t.id)} />
                    ))}
                  </ul>
                  <button type="button" className="boton-borde mt-2 w-full" onClick={() => setAsignarA(p)}>
                    <Icon name="plus" size="sm" /> Asignar a {p.nombre.split(" ")[0]}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="space-y-3" aria-label="Lo que llega a tu estación">
          <h2 className="seccion-titulo flex items-center gap-2">
            <Icon name="ticket" /> Tickets de tu estación
          </h2>
          {ticketsEstacion.length === 0 ? (
            <p className="tarjeta text-sm text-ink-muted">No hay tickets abiertos en {station}.</p>
          ) : (
            <div>
              {ticketsEstacion.map((t) => (
                <TicketCard key={t.id} t={t} now={ahora} mostrarEstacion={false} onAbrir={() => setAbiertoId(t.id)} />
              ))}
            </div>
          )}
          <div className="tarjeta space-y-2">
            <h3 className="font-extrabold">También en tu estación</h3>
            <button type="button" className="opcion-grande" onClick={() => ir("estacion")}>
              <span className="opcion-icono">
                <Icon name="people" />
              </span>
              <span className="flex-1">
                <span className="block font-extrabold">
                  {apoyos.length} {apoyos.length === 1 ? "apoyo en curso" : "apoyos en curso"}
                </span>
                <span className="block text-xs text-ink-muted">{sinAsignar ? `${sinAsignar} sin asignar: asígnalos en Mi estación` : "Todos tienen a alguien asignado"}</span>
              </span>
              <Icon name="arrow-right" size="sm" />
            </button>
            <button type="button" className="opcion-grande" onClick={() => ir("estacion")}>
              <span className="opcion-icono">
                <Icon name="eye" />
              </span>
              <span className="flex-1">
                <span className="block font-extrabold">
                  {porVerificar} {porVerificar === 1 ? "reporte de equipo por verificar" : "reportes de equipos por verificar"}
                </span>
                <span className="block text-xs text-ink-muted">Confírmalos en sitio antes de enviarlos a Mantenimiento</span>
              </span>
              <Icon name="arrow-right" size="sm" />
            </button>
          </div>
        </aside>
      </div>

      {asignarA !== undefined && <AsignarTarea key={asignarA?.id ?? "nueva"} ctx={ctx} station={station} open onClose={() => setAsignarA(undefined)} persona={asignarA ?? undefined} />}
      <DetalleTicket key={abiertoId ?? "ninguno"} ctx={ctx} id={abiertoId} onClose={() => setAbiertoId(null)} perfil="jefe" />
      <LevantarTicket ctx={ctx} open={levantar} onClose={() => setLevantar(false)} perfil="jefe" />
    </div>
  )
}

