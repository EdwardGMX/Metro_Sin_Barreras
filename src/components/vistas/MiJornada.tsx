/**
 * «Mi jornada»: vista de inicio de la policía auxiliar y del personal de estación.
 * Responde en segundos «¿qué hago ahora y qué sigue?»: lo urgente en grande arriba y el turno
 * completo como una línea del Metro, con cada tarea como una parada a su hora.
 */
import { useState } from "react"
import { avanzarIncidente, operacionDe, personaDeCuenta, personasDe, TIPO_INCIDENTE_LABEL, type Incidente } from "../../lib/operacion"
import { abierto, asignadoA, atrasada, avanzarTicket, horaDe, turnoEnCurso, AREAS, type Ticket } from "../../lib/servicio"
import { Icon } from "../Icon"
import type { Ctx } from "../admin/AdminApp"
import { DetalleTicket, LevantarTicket } from "./Tickets"
import { estadoTarea, partesDe } from "./VistaJefe"
import { Anillo, Avatar, BarraEstados, Columnas, hace, hhmm, ICONO_AREA, Letrero, Prioridad, Vistazo } from "./Visual"

const DIA = 24 * 3600_000

type Item = { clave: string; min: number; tipo: "inicio" | "fin" | "tarea"; t?: Ticket }

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
  const partes = partesDe(mios, ahora)
  const hechas = partes.find((p) => p.clase === "hecha")!.valor
  const atrasadas = mios.filter((t) => atrasada(t, ahora))
  const minAhora = new Date(ahora).getHours() * 60 + new Date(ahora).getMinutes()
  const foco: Ticket | undefined = atrasadas[0] ?? mios.find((t) => t.estado === "en_proceso") ?? mios.find((t) => abierto(t))
  const jefe = personasDe(op, yo.station).find((p) => p.puesto === "Jefe(a) de estación")

  const items: Item[] = [
    { clave: "inicio", min: turno.inicio, tipo: "inicio" as const },
    // Un ticket asignado antes del turno aparece al inicio del turno.
    ...mios.map((t) => ({ clave: t.id, min: t.clase === "ticket" ? Math.max(horaDe(t), turno.inicio) : horaDe(t), tipo: "tarea" as const, t })),
    { clave: "fin", min: turno.fin, tipo: "fin" as const },
  ].sort((a, b) => a.min - b.min || (a.tipo === "inicio" ? -1 : b.tipo === "inicio" ? 1 : 0))
  const posAhora = turno.dentro ? items.findIndex((x) => x.min > minAhora) : -1

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
      ? `${atrasadas.length === 1 ? "Una tarea atrasada" : `${atrasadas.length} tareas atrasadas`} · ${hechas} de ${mios.length} hechas`
      : `${hechas} de ${mios.length} hechas · turno ${turno.nombre.toLowerCase()} ${hhmm(turno.inicio)}–${hhmm(turno.fin)}`

  return (
    <div className={`vista rol-${perfil}`}>
      <Letrero perfil={perfil} icono={guardia ? "shield" : "user"} quien={`${yo.puesto} · ${yo.station}`} titulo={`${cuenta.nombre.split(" ")[0]}, tu jornada`} resumen={resumen} tono={apoyos.length || atrasadas.length ? "bad" : "ok"}>
        <button type="button" className="boton-borde" onClick={() => setLevantar(true)}>
          <Icon name="ticket" size="sm" /> Levantar ticket
        </button>
      </Letrero>

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

          <section aria-labelledby="jornada-titulo" className="tarjeta">
            <h2 id="jornada-titulo" className="seccion-titulo">
              Tu turno, parada por parada
            </h2>
            <ol className="jornada mt-3">
              {items.map((it, i) => {
                const t = it.t
                const est = t ? estadoTarea(t, ahora) : null
                const pasado = it.min <= minAhora
                const clase = t ? (est!.clase === "hecha" ? "jornada-hecha" : est!.clase === "atrasada" ? "jornada-atrasada" : it.min > minAhora && est!.clase === "pendiente" ? "jornada-futuro" : "") : pasado ? "jornada-hecha" : "jornada-futuro"
                return (
                  <li key={it.clave} className={`jornada-item ${clase} ${t && foco?.id === t.id && !apoyos.length ? "jornada-ahora" : ""}`}>
                    {i === posAhora && (
                      <span className="jornada-marca-ahora">
                        <span>Ahora {hhmm(minAhora)}</span>
                      </span>
                    )}
                    <span className="jornada-hora">{hhmm(it.min)}</span>
                    <span className="jornada-punto" aria-hidden="true">
                      {(clase === "jornada-hecha" || clase === "jornada-atrasada") && <Icon name={clase === "jornada-hecha" ? "check" : "alert"} className="size-3" />}
                    </span>
                    <div className="jornada-cuerpo">
                      {!t ? (
                        <p className="pt-1 font-extrabold text-ink-muted">{it.tipo === "inicio" ? "Inicio de turno" : "Fin de turno y entrega"}</p>
                      ) : (
                        <>
                          <button type="button" className="text-left" onClick={() => setAbiertoId(t.id)}>
                            <span className={`block font-extrabold leading-snug ${est!.clase === "hecha" ? "text-ink-muted line-through decoration-1" : ""}`}>{t.asunto}</span>
                          </button>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`chip chip-estado-${est!.tono}`}>
                              <Icon name={est!.clase === "hecha" ? "check" : est!.clase === "atrasada" ? "alert" : est!.clase === "curso" ? "clock" : "minus"} className="size-3" />
                              {est!.texto}
                            </span>
                            {t.clase === "ticket" && (
                              <span className="chip">
                                <Icon name="ticket" className="size-3" /> {t.id} · <Icon name={ICONO_AREA[t.area]} className="size-3" /> {AREAS[t.area].nombre}
                              </span>
                            )}
                            {t.prioridad === "alta" && abierto(t) && <Prioridad p="alta" />}
                          </span>
                          {t.detalle && abierto(t) && <p className="mt-1.5 text-sm text-ink-muted">{t.detalle}</p>}
                          {/* Los botones solo aparecen en lo que toca ahora; lo demás se abre al tocarlo. */}
                          {(foco?.id !== t.id || apoyos.length > 0) && (t.estado === "en_proceso" || (abierto(t) && it.min <= minAhora + 30)) && <Acciones t={t} ctx={ctx} />}
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-3" aria-label="Tu avance">
          <Vistazo titulo="Tu avance de hoy">
            <div className="flex items-center gap-4">
              <Anillo valor={hechas} max={Math.max(1, mios.length)} centro={`${hechas}/${mios.length}`} tono={atrasadas.length ? "warn" : "ok"} />
              <div className="min-w-0 flex-1">
                <BarraEstados partes={partes} etiqueta="Tus tareas de hoy" />
              </div>
            </div>
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

