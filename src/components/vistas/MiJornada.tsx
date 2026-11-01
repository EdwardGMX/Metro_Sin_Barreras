/**
 * «Mi jornada»: vista de inicio de la policía auxiliar y del personal de estación.
 * Responde en segundos «¿qué hago ahora y qué sigue?»: lo urgente en grande arriba, el turno
 * completo como una sola línea de extremo a extremo con cada actividad en su hora, y el reloj
 * del turno con la aguja en la hora actual.
 */
import { useState } from "react"
import { avanzarIncidente, operacionDe, personaDeCuenta, personasDe, TIPO_INCIDENTE_LABEL, type Incidente } from "../../lib/operacion"
import { puede } from "../../lib/admin"
import { actividadesDe, ESTADO_ACTIVIDAD_LABEL, TIPO_ACTIVIDAD_LABEL, type Actividad } from "../../lib/jornada"
import { abierto, asignadoA, atrasada, avanzarTicket, horaDe, turnoEnCurso, AREAS, type Ticket } from "../../lib/servicio"
import { Icon } from "../Icon"
import type { Ctx } from "../admin/AdminApp"
import { DetalleTicket, LevantarTicket } from "./Tickets"
import { ConteoEstados, faltan, ICONO_ESTADO, ICONO_TIPO, LeyendaActividades, LineaJornada, RelojTurno } from "./Jornada"
import { Avatar, Columnas, hace, hhmm, Letrero, Prioridad, Vistazo } from "./Visual"

const DIA = 24 * 3600_000

function Acciones({ t, ctx, grande = false }: { t: Ticket; ctx: Ctx; grande?: boolean }) {
  const avanzar = (paso: "en_proceso" | "resuelto") => ctx.operar((d, e, now) => avanzarTicket(d, e, ctx.cuenta, t.id, paso, "", now))
  if (!abierto(t)) return null
  const tam = grande ? "min-h-12 flex-1 text-base" : ""
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {t.estado === "asignado" && (
        <button type="button" className={`boton-borde ${tam}`} onClick={() => avanzar("en_proceso")}>
          <Icon name="clock" size="sm" /> Empezar
        </button>
      )}
      <button type="button" className={`boton-rol ${tam}`} onClick={() => avanzar("resuelto")}>
        <Icon name="check" size="sm" /> {t.clase === "tarea" ? "Hecha" : "Resuelto"}
      </button>
    </div>
  )
}

function ApoyoAhora({ x, ctx }: { x: Incidente; ctx: Ctx }) {
  const paso = (p: "en_camino" | "atendida") => ctx.operar((d, e, now) => avanzarIncidente(d, e, ctx.cuenta, x.id, p, p === "atendida" ? "Persona acompañada" : "", now))
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-extrabold text-danger">
        <Icon name="alert" size="sm" /> Te asignaron un apoyo {hace(x.asignada ?? x.ts, ctx.ahora)}
      </p>
      <p className="mt-1 text-2xl font-extrabold leading-tight">{TIPO_INCIDENTE_LABEL[x.tipo]}</p>
      <p className="mt-1 flex items-center gap-1.5 font-bold">
        <Icon name="location" size="sm" /> {x.punto}
      </p>
      {x.detalle && <p className="instructions mt-2">{x.detalle}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {x.estado === "asignada" && (
          <button type="button" className="boton-rol min-h-12 flex-1 text-base" onClick={() => paso("en_camino")}>
            <Icon name="arrow-right" size="sm" /> Voy en camino
          </button>
        )}
        <button type="button" className={`${x.estado === "asignada" ? "boton-borde" : "boton-rol"} min-h-12 flex-1 text-base`} onClick={() => paso("atendida")}>
          <Icon name="check" size="sm" /> Ya lo atendí
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">La persona ve en su teléfono cuando vas en camino y cuando se atiende.</p>
    </div>
  )
}

export function MiJornada({ ctx }: { ctx: Ctx }) {
  const { db, cuenta, ahora } = ctx
  const op = operacionDe(db)
  const yo = personaDeCuenta(op, cuenta)
  const guardia = cuenta.roles.includes("personal_seguridad")
  const perfil = guardia ? "guardia" : "personal"
  const turno = turnoEnCurso(ahora)
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [levantar, setLevantar] = useState(false)

  const mios = asignadoA(db, yo.id, ahora)
  const apoyos = op.incidentes.filter((x) => x.asignadoA === yo.id && (x.estado === "asignada" || x.estado === "en_camino")).sort((a, b) => a.ts - b.ts)
  const atrasadas = mios.filter((t) => atrasada(t, ahora))
  const minAhora = new Date(ahora).getHours() * 60 + new Date(ahora).getMinutes()
  const foco: Ticket | undefined = atrasadas[0] ?? mios.find((t) => t.estado === "en_proceso") ?? mios.find((t) => abierto(t))
  const jefe = personasDe(op, yo.station).find((p) => p.puesto === "Jefe(a) de estación")

  const acts = actividadesDe(db, yo, ahora)
  const actsHechas = acts.filter((a) => a.estado === "hecha").length
  const puedeRondas = puede(cuenta, "rondas.registrar", ahora)
  const abrir = (a: Actividad) => {
    if (a.ticket) setAbiertoId(a.ticket.id)
    else if (a.tipo === "ronda" && puedeRondas) ctx.ir("rondas")
    else document.getElementById("ahora-titulo")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const semana: Array<{ etiqueta: string; valor: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(ahora - i * DIA)
    d.setHours(0, 0, 0, 0)
    const ini = d.getTime()
    semana.push({
      etiqueta: i === 0 ? "hoy" : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" }),
      valor: op.incidentes.filter((x) => x.asignadoA === yo.id && x.atendida && x.atendida >= ini && x.atendida < ini + DIA).length,
    })
  }

  const resumen = apoyos.length
    ? `${apoyos.length === 1 ? "Un apoyo te espera" : `${apoyos.length} apoyos te esperan`}`
    : atrasadas.length
      ? `${atrasadas.length === 1 ? "Una tarea atrasada" : `${atrasadas.length} tareas atrasadas`} · ${actsHechas} de ${acts.length} actividades hechas`
      : `${actsHechas} de ${acts.length} actividades hechas · turno ${turno.nombre.toLowerCase()} ${hhmm(turno.inicio)}–${hhmm(turno.fin)}`

  return (
    <div className={`vista rol-${perfil}`}>
      <Letrero perfil={perfil} icono={guardia ? "shield" : "user"} quien={`${yo.puesto} · ${yo.station}`} titulo={`${cuenta.nombre.split(" ")[0]}, tu jornada`} resumen={resumen} tono={apoyos.length || atrasadas.length ? "bad" : "ok"}>
        <button type="button" className="boton-borde" onClick={() => setLevantar(true)}>
          <Icon name="ticket" size="sm" /> Levantar ticket
        </button>
      </Letrero>

      <section aria-labelledby="jornada-titulo" className="tarjeta">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="jornada-titulo" className="seccion-titulo">
            Tu jornada en una línea
          </h2>
          <p className="text-sm font-bold text-ink-muted">{faltan(ahora)}</p>
        </div>
        <LineaJornada acts={acts} ahora={ahora} onAbrir={abrir} />
        <LeyendaActividades />
      </section>

      <div className="vista-dos">
        <div className="space-y-4">
          <section className={`tarjeta border-[var(--rol)] bg-[var(--rol-suave)]`} aria-labelledby="ahora-titulo">
            <h2 id="ahora-titulo" className="text-sm font-extrabold text-[var(--rol-tinta)]">
              {apoyos.length ? "Lo urgente" : turno.dentro ? "Ahora" : "Tu turno"}
            </h2>
            {apoyos.length ? (
              <div className="mt-1">
                <ApoyoAhora x={apoyos[0]} ctx={ctx} />
              </div>
            ) : foco ? (
              <div className="mt-1">
                <p className={`flex items-center gap-2 text-sm font-extrabold ${atrasada(foco, ahora) ? "text-danger" : "text-ink-muted"}`}>
                  <Icon name={atrasada(foco, ahora) ? "alert" : "clock"} size="sm" />
                  {atrasada(foco, ahora) ? `Atrasada: tocaba a las ${hhmm(horaDe(foco))}` : foco.estado === "en_proceso" ? "La estás haciendo" : `A las ${hhmm(horaDe(foco))}`}
                </p>
                <p className="mt-1 text-2xl font-extrabold leading-tight">{foco.asunto}</p>
                {foco.detalle && <p className="instructions mt-2">{foco.detalle}</p>}
                <p className="mt-2 text-sm text-ink-muted">
                  {foco.clase === "tarea" ? `Te la asignó ${foco.creadoPor}` : `Ticket ${foco.id} de ${AREAS[foco.area].nombre}, levantado por ${foco.creadoPor}`}
                  {foco.lugar ? ` · ${foco.lugar}` : ""}
                </p>
                <Acciones t={foco} ctx={ctx} grande />
              </div>
            ) : (
              <p className="mt-1 text-xl font-extrabold">{turno.dentro ? "No tienes pendientes. Buen trabajo." : `Tu turno ${turno.nombre.toLowerCase()} es de ${hhmm(turno.inicio)} a ${hhmm(turno.fin)}.`}</p>
            )}
          </section>

          <section aria-labelledby="agenda-titulo" className="tarjeta">
            <h2 id="agenda-titulo" className="seccion-titulo">
              Tus actividades, una por una
            </h2>
            <ol className="agenda" aria-label="Tus actividades, en orden">
              {acts.map((a, i) => {
                const t = a.ticket
                const cerca = a.inicio <= minAhora + 30
                return (
                  <li key={a.id} className={`agenda-item act-borde-${a.estado} ${foco && t && foco.id === t.id && !apoyos.length ? "agenda-foco" : ""}`}>
                    <span className="agenda-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-xs font-extrabold text-ink-muted">
                        <span className="tabular-nums">
                          {hhmm(a.inicio)}–{hhmm(a.fin)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icon name={ICONO_TIPO[a.tipo]} className="size-3.5" /> {TIPO_ACTIVIDAD_LABEL[a.tipo]}
                          {t?.clase === "ticket" ? ` ${t.id} · ${AREAS[t.area].nombre}` : ""}
                        </span>
                      </p>
                      <button type="button" className="text-left" onClick={() => abrir(a)}>
                        <span className={`block font-extrabold leading-snug ${a.estado === "hecha" ? "text-ink-muted line-through decoration-1" : ""}`}>{a.titulo}</span>
                      </button>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`chip chip-act-${a.estado}`}>
                          <Icon name={ICONO_ESTADO[a.estado]} className="size-3" />
                          {ESTADO_ACTIVIDAD_LABEL[a.estado]}
                        </span>
                        {a.alta && a.estado !== "hecha" && a.tipo !== "apoyo" && <Prioridad p="alta" />}
                      </span>
                      {/* Los botones solo aparecen en lo que toca ahora; lo demás se abre al tocarlo. */}
                      {t && (foco?.id !== t.id || apoyos.length > 0) && (t.estado === "en_proceso" || (abierto(t) && cerca)) && <Acciones t={t} ctx={ctx} />}
                      {a.tipo === "ronda" && a.estado !== "hecha" && cerca && puedeRondas && (
                        <button type="button" className="boton-borde mt-2" onClick={() => ctx.ir("rondas")}>
                          <Icon name="eye" size="sm" /> Registrar la ronda
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
              {acts.length === 0 && <li className="text-sm text-ink-muted">No tienes actividades en este turno.</li>}
            </ol>
          </section>
        </div>

        <aside className="space-y-3" aria-label="Tu avance">
          <Vistazo titulo="Tu turno en el reloj">
            <RelojTurno acts={acts} ahora={ahora} />
            <ConteoEstados acts={acts} />
          </Vistazo>
          <Vistazo titulo={guardia ? "Personas que acompañaste" : "Apoyos que atendiste"}>
            <Columnas datos={semana} etiqueta="Apoyos atendidos por día, últimos 7 días" unidad="atendidos" />
          </Vistazo>
          {jefe && (
            <div className="tarjeta flex items-center gap-3">
              <Avatar nombre={jefe.nombre} perfil="jefe" />
              <p className="text-sm">
                <span className="block font-extrabold">{jefe.nombre}</span>
                <span className="text-ink-muted">Jefatura de {yo.station}: te asigna las tareas del turno.</span>
              </p>
            </div>
          )}
          <div className="tarjeta">
            <h3 className="font-extrabold">¿Algo que deba atender otra área?</h3>
            <p className="mt-1 text-sm text-ink-muted">Una luminaria apagada, basura o la app que no responde: levanta un ticket y la Mesa lo turna.</p>
            <button type="button" className="boton-rol mt-3 w-full" onClick={() => setLevantar(true)}>
              <Icon name="plus" size="sm" /> Levantar ticket
            </button>
          </div>
        </aside>
      </div>

      <DetalleTicket key={abiertoId ?? "ninguno"} ctx={ctx} id={abiertoId} onClose={() => setAbiertoId(null)} perfil={perfil} />
      <LevantarTicket ctx={ctx} open={levantar} onClose={() => setLevantar(false)} perfil={perfil} />
    </div>
  )
}

