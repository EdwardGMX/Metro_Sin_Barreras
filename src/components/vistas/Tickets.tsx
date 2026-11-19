/**
 * Tickets entre áreas: la Mesa de atención (vista de inicio de la Gerencia de Atención al Usuario),
 * el módulo «Tickets» que ve todo el personal, el detalle de un ticket y el formulario para levantarlo.
 */
import { useMemo, useState, type FormEvent } from "react"
import { allStations } from "../../data/metroData"
import { estacionesVisibles, puede, type Cuenta } from "../../lib/admin"
import { ESTACIONES_PILOTO } from "../../lib/operacion"
import {
  abierto,
  areasQueEncarga,
  asignables,
  asignarTicket,
  avanzarTicket,
  cambiarPrioridad,
  cerrarTicket,
  encargaArea,
  ESTADO_TICKET_LABEL,
  etapaTicket,
  fueraDePlazo,
  idPersonal,
  levantarTicket,
  editarTicket,
  eliminarTicket,
  plazoUsado,
  porTurnar,
  reabrirTicket,
  servicioDe,
  turnarReportes,
  vencimiento,
  AREAS,
  MAX_DESCRIPCION_TICKET,
  MAX_NOMBRE_TICKET,
  ORDEN_AREAS,
  PRIORIDAD_LABEL,
  type AreaId,
  type EstadoTicket,
  type GrupoPorTurnar,
  type Prioridad as TPrioridad,
  type Ticket,
} from "../../lib/servicio"
import { Icon } from "../Icon"
import { Dialog } from "../ui"
import type { Ctx } from "../admin/AdminApp"
import { Anillo, Avatar, Columnas, duracion, hace, hora, ICONO_AREA, ICONO_CATEGORIA, Letrero, Plazo, Prioridad, Trayecto, Vistazo, type Perfil } from "./Visual"

const MIN = 60_000
const DIA = 24 * 60 * MIN

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

export function textoPlazo(t: Ticket, now: number): string {
  if (t.resuelto) return `${t.clase === "tarea" ? "Hecha" : "Resuelto"} en ${duracion(t.resuelto - t.creado)}${fueraDePlazo(t, now) ? ", fuera de plazo" : ""}`
  const resta = vencimiento(t) - now
  return resta >= 0 ? `Quedan ${duracion(resta)}` : `Vencido hace ${duracion(-resta)}`
}

export function TicketCard({ t, now, onAbrir, mostrarEstacion = true }: { t: Ticket; now: number; onAbrir: () => void; mostrarEstacion?: boolean }) {
  const personas = t.reportes.length
  return (
    <button type="button" className="ticket-card" onClick={onAbrir}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="opcion-icono size-7 rounded-md">
            <Icon name={ICONO_AREA[t.area]} className="size-4" />
          </span>
          <span className="ticket-folio truncate">{t.id}</span>
        </span>
        <Prioridad p={t.prioridad} corto />
      </span>
      <span className="mt-1.5 block font-extrabold leading-snug">{t.asunto}</span>
      <span className="mt-0.5 block text-xs text-ink-muted">
        {mostrarEstacion && <span className="font-bold text-ink">{t.station} · </span>}
        {t.porTurnar ? "Por turnar en la Mesa" : AREAS[t.area].nombre}
        {t.lugar && ` · ${t.lugar}`}
        {t.origen === "persona_usuaria" && ` · ${personas} ${personas === 1 ? "persona usuaria" : "personas usuarias"}`}
      </span>
      <span className="mt-2 flex items-center gap-2 text-sm">
        {t.asignadoNombre ? (
          <>
            <Avatar nombre={t.asignadoNombre} />
            <span className="truncate font-bold">{t.asignadoNombre}</span>
          </>
        ) : (
          <span className="chip chip-estado-warn">
            <Icon name="user" className="size-3.5" /> Sin asignar
          </span>
        )}
      </span>
      {t.estado !== "cerrado" && (
        <span className="mt-2 block">
          <Plazo usado={t.resuelto ? Math.min(plazoUsado(t, now), 0.99) : plazoUsado(t, now)} texto={textoPlazo(t, now)} />
        </span>
      )}
    </button>
  )
}

const COLUMNAS: Array<{ estado: EstadoTicket; titulo: string; icono: "inbox" | "user" | "tool" | "check" }> = [
  { estado: "nuevo", titulo: "Sin asignar", icono: "inbox" },
  { estado: "asignado", titulo: "Asignados", icono: "user" },
  { estado: "en_proceso", titulo: "En proceso", icono: "tool" },
  { estado: "resuelto", titulo: "Resueltos, por cerrar", icono: "check" },
]

/** Tablero por estado: lo más urgente (vencido, prioridad alta) arriba en cada columna. */
export function TableroTickets({ tickets, now, onAbrir }: { tickets: Ticket[]; now: number; onAbrir: (id: string) => void }) {
  const peso = (t: Ticket) => (fueraDePlazo(t, now) ? 0 : 1) * 10 + (t.prioridad === "alta" ? 0 : t.prioridad === "media" ? 1 : 2)
  return (
    <div className="tablero-cols">
      {COLUMNAS.map((c) => {
        const lista = tickets.filter((t) => t.estado === c.estado).sort((a, b) => peso(a) - peso(b) || vencimiento(a) - vencimiento(b))
        return (
          <section key={c.estado} className="tablero-col" aria-label={`${c.titulo}: ${lista.length}`}>
            <h3 className="tablero-col-titulo">
              <span className="flex items-center gap-1.5">
                <Icon name={c.icono} size="sm" /> {c.titulo}
              </span>
              <span className="pestana-n">{lista.length}</span>
            </h3>
            {lista.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-border p-3 text-center text-sm text-ink-muted">Nada aquí</p>
            ) : (
              lista.map((t) => <TicketCard key={t.id} t={t} now={now} onAbrir={() => onAbrir(t.id)} />)
            )}
          </section>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Detalle                                                             */
/* ------------------------------------------------------------------ */

export function DetalleTicket({ ctx, id, onClose, perfil }: { ctx: Ctx; id: string | null; onClose: () => void; perfil: Perfil }) {
  const { db, cuenta, ahora, operar } = ctx
  const t = id ? servicioDe(db).tickets.find((x) => x.id === id) : undefined
  const [quien, setQuien] = useState("")
  const [nota, setNota] = useState("")
  if (!t) return <Dialog open={false} onClose={onClose} title="Ticket">{null}</Dialog>
  const tarea = t.clase === "tarea"
  const gestiona = puede(cuenta, "tickets.gestionar", ahora)
  const encarga = tarea ? puede(cuenta, "tareas.asignar", ahora) && (cuenta.estaciones ?? []).includes(t.station) : encargaArea(cuenta, t.area, t.station, ahora)
  const propio = t.asignadoA !== undefined && t.asignadoA === idPersonal(db, cuenta)
  const candidatos = asignables(db, t.area, t.station)
  const elegido = quien || t.asignadoA || candidatos[0]?.id || ""
  const etapas = tarea ? ["Asignada", "En curso", "Hecha"] : ["Sin asignar", "Asignado", "En proceso", "Resuelto", "Cerrado"]
  const etapa = tarea ? Math.max(0, etapaTicket(t) - 1) : etapaTicket(t)
  const accion = (fn: Parameters<Ctx["operar"]>[0]) => {
    const r = operar(fn)
    if (r.ok) setNota("")
  }

  return (
    <Dialog open={Boolean(t)} onClose={onClose} title={`${tarea ? "Tarea" : "Ticket"} ${t.id}`} wide>
      <div className={`rol-${perfil} space-y-5`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${t.porTurnar ? "chip-estado-warn" : ""}`}>
              <Icon name={t.porTurnar ? "inbox" : ICONO_AREA[t.area]} className="size-3.5" /> {t.porTurnar ? "Por turnar en la Mesa" : AREAS[t.area].nombre}
            </span>
            <span className="chip">
              <Icon name="location" className="size-3.5" /> {t.station}
              {t.lugar && ` · ${t.lugar}`}
            </span>
            <Prioridad p={t.prioridad} />
          </div>
          <p className="mt-2 text-xl font-extrabold">{t.asunto}</p>
          {t.detalle && <p className="instructions mt-2">{t.detalle}</p>}
          <p className="mt-2 text-sm text-ink-muted">
            {t.origen === "persona_usuaria" ? `Lo reportaron ${t.reportes.length} ${t.reportes.length === 1 ? "persona usuaria" : "personas usuarias"} (sin datos personales) y lo turnó ${t.creadoPor}` : `Lo levantó ${t.creadoPor}`} {hace(t.creado, ahora)}.
          </p>
        </div>

        <Trayecto paradas={etapas} actual={t.estado === "cerrado" || (tarea && t.estado === "resuelto") ? etapas.length : etapa} perfil={perfil} alerta={abierto(t) && fueraDePlazo(t, ahora)} etiqueta={`Avance de ${t.id}`} />
        {t.estado !== "cerrado" && (
          <div className="max-w-xs">
            <Plazo usado={plazoUsado(t, ahora)} texto={textoPlazo(t, ahora)} />
          </div>
        )}

        {!tarea && gestiona && <GestionMesa key={t.id} ctx={ctx} t={t} onEliminado={onClose} />}

        {t.estado !== "cerrado" && (encarga || propio) && !t.porTurnar && (
          <div className="tarjeta-suave space-y-4">
            {encarga && abierto(t) && (
              <div>
                <label htmlFor="asignar-a" className="field-label">
                  {t.asignadoA ? "Reasignar a" : "Asignar a"}
                </label>
                <div className="flex flex-wrap gap-2">
                  <select id="asignar-a" className="field-select max-w-sm flex-1" value={elegido} onChange={(e) => setQuien(e.target.value)}>
                    {candidatos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} · {p.puesto}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="boton-rol" disabled={!elegido || elegido === t.asignadoA} onClick={() => accion((d, e, now) => asignarTicket(d, e, cuenta, t.id, elegido, now))}>
                    <Icon name="user" size="sm" /> Asignar
                  </button>
                </div>
              </div>
            )}
            {encarga && !gestiona && !tarea && abierto(t) && (
              <fieldset>
                <legend className="field-label">Prioridad</legend>
                <div className="flex flex-wrap gap-2">
                  {(["alta", "media", "baja"] as TPrioridad[]).map((p) => (
                    <button key={p} type="button" className="opcion-grande w-auto min-h-11 px-3 py-1 text-sm font-bold" aria-pressed={t.prioridad === p} onClick={() => accion((d, e, now) => cambiarPrioridad(d, e, cuenta, t.id, p, now))}>
                      {PRIORIDAD_LABEL[p]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {(t.estado === "asignado" || t.estado === "en_proceso") && (propio || encarga) && (
              <div>
                <label htmlFor="nota-ticket" className="field-label">
                  Nota al terminar (opcional)
                </label>
                <input id="nota-ticket" className="field-select" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se hizo" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.estado === "asignado" && (
                    <button type="button" className="boton-borde" onClick={() => accion((d, e, now) => avanzarTicket(d, e, cuenta, t.id, "en_proceso", "", now))}>
                      <Icon name="clock" size="sm" /> Empezar
                    </button>
                  )}
                  <button type="button" className="boton-rol" onClick={() => accion((d, e, now) => avanzarTicket(d, e, cuenta, t.id, "resuelto", nota, now))}>
                    <Icon name="check" size="sm" /> {tarea ? "Marcar como hecha" : "Marcar como resuelto"}
                  </button>
                </div>
              </div>
            )}
            {t.estado === "resuelto" && !tarea && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="boton-rol" onClick={() => accion((d, e, now) => cerrarTicket(d, e, cuenta, t.id, now))}>
                  <Icon name="check" size="sm" /> Revisé y cierro
                </button>
                <button type="button" className="boton-borde" onClick={() => accion((d, e, now) => reabrirTicket(d, e, cuenta, t.id, now))}>
                  <Icon name="refresh" size="sm" /> No quedó, reabrir
                </button>
                <p className="w-full text-xs text-ink-muted">Quien lo resolvió no lo cierra: lo revisa otra persona. Si lo reportaron personas usuarias, también pueden confirmarlo desde su cuenta.</p>
              </div>
            )}
          </div>
        )}
        {!encarga && !propio && t.estado !== "cerrado" && <p className="text-sm text-ink-muted">Puedes seguir su avance. Lo asigna y actualiza {tarea ? "la jefatura de estación" : `la Mesa de atención o quien encarga ${AREAS[t.area].nombre}`}.</p>}

        <div>
          <h3 className="font-extrabold">Historial</h3>
          <ol className="mt-2 space-y-2 border-l-4 border-border pl-4">
            {[...t.historial].reverse().map((h, i) => (
              <li key={i} className="text-sm">
                <span className="font-bold">{h.texto}</span>
                <span className="block text-xs text-ink-muted">
                  {h.por} · {new Date(h.ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} {hora(h.ts)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Dialog>
  )
}

/** Lo que solo hace la Mesa de atención con un ticket: modificarlo o eliminarlo. */
function GestionMesa({ ctx, t, onEliminado }: { ctx: Ctx; t: Ticket; onEliminado: () => void }) {
  const { cuenta, operar } = ctx
  const [editando, setEditando] = useState(Boolean(t.porTurnar))
  const [confirmar, setConfirmar] = useState(false)
  const [nombre, setNombre] = useState(t.asunto)
  const [descripcion, setDescripcion] = useState(t.detalle ?? "")
  const [urgencia, setUrgencia] = useState<TPrioridad>(t.prioridad)
  const [area, setArea] = useState<AreaId>(t.area)
  const [error, setError] = useState<string | null>(null)
  const cerrado = t.estado === "cerrado"
  const deUsuarios = t.origen === "persona_usuaria"

  const guardar = (e: FormEvent) => {
    e.preventDefault()
    const r = operar((d, est, now) => editarTicket(d, est, cuenta, t.id, { asunto: nombre, detalle: descripcion, prioridad: urgencia, area }, now))
    if (r.ok) {
      setEditando(false)
      setError(null)
    } else setError(r.mensaje)
  }
  const eliminar = () => {
    const r = operar((d, est, now) => eliminarTicket(d, est, cuenta, t.id, now))
    if (r.ok) onEliminado()
  }

  return (
    <div className={`tarjeta-suave space-y-3 ${t.porTurnar ? "border-2 border-[var(--rol)]" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-extrabold">{t.porTurnar ? "Elige el departamento de este ticket" : "Mesa de atención"}</p>
        <div className="flex flex-wrap gap-2">
          {!cerrado && !editando && (
            <button type="button" className="boton-borde" onClick={() => setEditando(true)}>
              <Icon name="clipboard" size="sm" /> Modificar
            </button>
          )}
          {!confirmar && (
            <button type="button" className="boton-borde boton-borde-urgencia" onClick={() => setConfirmar(true)}>
              <Icon name="x" size="sm" /> Eliminar
            </button>
          )}
        </div>
      </div>

      {confirmar && (
        <div className="callout callout-urgencia mt-0 flex-col" role="alert">
          <p>
            ¿Eliminar {t.id}? Desaparece de todas las bandejas
            {deUsuarios ? " y los reportes de personas usuarias que lo originaron se dan de baja" : ""}. La eliminación queda en la bitácora.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="boton-urgencia" onClick={eliminar}>
              <Icon name="x" size="sm" /> Sí, eliminar
            </button>
            <button type="button" className="boton-borde" onClick={() => setConfirmar(false)}>
              No, conservarlo
            </button>
          </div>
        </div>
      )}

      {editando && !cerrado && (
        <form className="space-y-3" onSubmit={guardar} noValidate>
          <div>
            <label htmlFor={`editar-nombre-${t.id}`} className="field-label">
              Nombre del ticket
            </label>
            <input id={`editar-nombre-${t.id}`} className="field-select" maxLength={MAX_NOMBRE_TICKET} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`editar-desc-${t.id}`} className="field-label">
              Descripción{deUsuarios ? " (opcional)" : ""}
            </label>
            <textarea id={`editar-desc-${t.id}`} className="report-textarea min-h-20 w-full" maxLength={MAX_DESCRIPCION_TICKET} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset>
              <legend className="field-label">Urgencia</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["alta", "media", "baja"] as TPrioridad[]).map((p) => (
                  <button key={p} type="button" className="opcion-grande justify-center px-1 py-1.5 text-xs font-bold" aria-pressed={urgencia === p} onClick={() => setUrgencia(p)}>
                    {PRIORIDAD_LABEL[p]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`editar-area-${t.id}`} className="field-label">
                Departamento
              </label>
              <select id={`editar-area-${t.id}`} className="field-select" value={area} onChange={(e) => setArea(e.target.value as AreaId)}>
                {ORDEN_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREAS[a].nombre}
                  </option>
                ))}
              </select>
              {area !== t.area && t.asignadoNombre && <p className="mt-1 text-xs text-ink-muted">Al cambiar de departamento se quita la asignación a {t.asignadoNombre}.</p>}
            </div>
          </div>
          {error && (
            <p className="callout callout-warning mt-0" role="alert">
              <Icon name="alert" size="sm" className="mt-0.5" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="boton-rol" disabled={!nombre.trim()}>
              <Icon name="check" size="sm" /> Guardar cambios
            </button>
            {!t.porTurnar && (
              <button
                type="button"
                className="boton-borde"
                onClick={() => {
                  setEditando(false)
                  setNombre(t.asunto)
                  setDescripcion(t.detalle ?? "")
                  setUrgencia(t.prioridad)
                  setArea(t.area)
                  setError(null)
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Levantar ticket                                                     */
/* ------------------------------------------------------------------ */

export function estacionesDeCuenta(c: Cuenta): string[] {
  if (c.estaciones?.length) return c.estaciones
  const visibles = estacionesVisibles(c, allStations)
  const piloto = ESTACIONES_PILOTO.filter((s) => visibles.includes(s))
  return [...piloto, ...visibles.filter((s) => !piloto.includes(s))]
}

export function LevantarTicket({ ctx, open, onClose, perfil }: { ctx: Ctx; open: boolean; onClose: () => void; perfil: Perfil }) {
  const { cuenta, operar } = ctx
  const estaciones = estacionesDeCuenta(cuenta)
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [prioridad, setPrioridad] = useState<TPrioridad>("media")
  const [station, setStation] = useState(estaciones[0] ?? "Tacubaya")
  const [area, setArea] = useState<AreaId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reiniciar = () => {
    setArea(null)
    setNombre("")
    setDescripcion("")
    setPrioridad("media")
    setError(null)
  }
  const cerrar = () => {
    reiniciar()
    onClose()
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!area) return setError("Elige el departamento que debe atenderlo.")
    const r = operar((d, est, now) => levantarTicket(d, est, cuenta, { station, asunto: nombre, detalle: descripcion, prioridad, area }, now))
    if (r.ok) cerrar()
    else setError(r.mensaje)
  }

  return (
    <Dialog open={open} onClose={cerrar} title="Levantar un ticket" wide>
      <form className={`rol-${perfil} space-y-5`} onSubmit={enviar} noValidate>
        <div>
          <label htmlFor="ticket-nombre" className="field-label">
            Nombre del ticket
          </label>
          <input id="ticket-nombre" className="field-select" maxLength={MAX_NOMBRE_TICKET} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" aria-describedby="ticket-nombre-ayuda" />
          <p id="ticket-nombre-ayuda" className="mt-1 text-xs text-ink-muted">
            Un título corto. {nombre.length}/{MAX_NOMBRE_TICKET}
          </p>
        </div>

        <div>
          <label htmlFor="ticket-descripcion" className="field-label">
            Descripción
          </label>
          <textarea id="ticket-descripcion" className="report-textarea min-h-28 w-full" maxLength={MAX_DESCRIPCION_TICKET} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-describedby="ticket-descripcion-ayuda" />
          <p id="ticket-descripcion-ayuda" className="mt-1 text-xs text-ink-muted">
            Qué pasa y en qué parte de la estación. No escribas nombres ni datos de personas usuarias. {descripcion.length}/{MAX_DESCRIPCION_TICKET}
          </p>
        </div>

        <fieldset>
          <legend className="field-label">Urgencia</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["alta", "media", "baja"] as TPrioridad[]).map((p) => (
              <button key={p} type="button" className="opcion-grande justify-center py-2 text-sm font-bold" aria-pressed={prioridad === p} onClick={() => setPrioridad(p)}>
                <Prioridad p={p} />
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-muted">Plazos: alta 4 h, media 24 h, baja 72 h.</p>
        </fieldset>

        <fieldset>
          <legend className="field-label">Departamento que lo atiende</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ORDEN_AREAS.map((a) => (
              <button key={a} type="button" className="opcion-grande py-2" aria-pressed={area === a} onClick={() => setArea(a)}>
                <span className="opcion-icono size-9">
                  <Icon name={ICONO_AREA[a]} size="sm" />
                </span>
                <span className="min-w-0">
                  <span className="block font-extrabold">{AREAS[a].nombre}</span>
                  <span className="block truncate text-xs text-ink-muted">{AREAS[a].unidad.split(" (")[0]}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {estaciones.length > 1 && (
          <div>
            <label htmlFor="ticket-estacion" className="field-label">
              Estación
            </label>
            <select id="ticket-estacion" className="field-select" value={station} onChange={(e) => setStation(e.target.value)}>
              {estaciones.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <p className="text-sm text-ink-muted">Llega directo al departamento que elijas. La Mesa de atención ve todos los tickets y puede corregirlos.</p>

        {error && (
          <p className="callout callout-warning mt-0" role="alert">
            <Icon name="alert" size="sm" className="mt-0.5" />
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="boton-rol min-h-12 flex-1" disabled={!area || !nombre.trim() || !descripcion.trim()}>
            <Icon name="send" size="sm" /> Levantar ticket
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Mesa de atención (inicio de la Gerencia de Atención al Usuario)     */
/* ------------------------------------------------------------------ */

function GrupoCard({ g, ctx }: { g: GrupoPorTurnar; ctx: Ctx }) {
  const [area, setArea] = useState<AreaId>(g.problema.area)
  const [cambiar, setCambiar] = useState(false)
  const personas = new Set(g.reportes.map((r) => r.seudonimo)).size
  return (
    <li className="tarjeta flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="opcion-icono">
          <Icon name={ICONO_CATEGORIA[g.categoria]} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-snug">{g.problema.texto}</p>
          <p className="text-sm text-ink-muted">
            {g.station} · {g.lugar}
          </p>
        </div>
        <Prioridad p={g.prioridad} />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1 font-bold">
          <Icon name="people" size="sm" /> {personas} {personas === 1 ? "persona" : "personas"}
        </span>
        {g.verificadas > 0 && (
          <span className="inline-flex items-center gap-1 font-bold">
            <Icon name="card" size="sm" /> {g.verificadas} con Tarjeta Incluyente
          </span>
        )}
        <span className="text-ink-muted">desde {hace(g.desde, ctx.ahora)}</span>
      </p>
      {cambiar && (
        <label className="text-sm">
          <span className="field-label mb-1">Turnar a</span>
          <select className="field-select" value={area} onChange={(e) => setArea(e.target.value as AreaId)}>
            {ORDEN_AREAS.map((a) => (
              <option key={a} value={a}>
                {AREAS[a].nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button type="button" className="boton-rol flex-1" onClick={() => ctx.operar((d, e, now) => turnarReportes(d, e, ctx.cuenta, g.reportes.map((r) => r.id), area, g.prioridad, now))}>
          <Icon name={ICONO_AREA[area]} size="sm" /> Turnar a {AREAS[area].nombre}
        </button>
        {!cambiar && (
          <button type="button" className="boton-borde" onClick={() => setCambiar(true)}>
            Otra área
          </button>
        )}
      </div>
    </li>
  )
}

const AREA_CORTA: Record<AreaId, string> = { estacion: "Estación", limpieza: "Limpieza", seguridad: "Seguridad", mantenimiento: "Mantenimiento", atencion: "Atención", sistemas: "Sistemas" }

function abiertosPorArea(tickets: Ticket[]) {
  return ORDEN_AREAS.map((a) => ({ area: a, n: tickets.filter((t) => t.area === a && abierto(t)).length }))
}

function cerradosPorDia(tickets: Ticket[], now: number) {
  const dias: Array<{ etiqueta: string; valor: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DIA)
    d.setHours(0, 0, 0, 0)
    const ini = d.getTime()
    const fin = ini + DIA
    dias.push({
      etiqueta: i === 0 ? "hoy" : d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" }),
      valor: tickets.filter((t) => (t.cerrado ?? t.resuelto ?? 0) >= ini && (t.cerrado ?? t.resuelto ?? 0) < fin).length,
    })
  }
  return dias
}

export function MesaAtencion({ ctx }: { ctx: Ctx }) {
  const { db, cuenta, ahora } = ctx
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [levantar, setLevantar] = useState(false)
  const [filtroArea, setFiltroArea] = useState<AreaId | "todas">("todas")
  const [filtroEst, setFiltroEst] = useState("todas")
  const [vista, setVista] = useState<"usuarios" | "personal">("usuarios")
  const sv = servicioDe(db)
  const tickets = sv.tickets.filter((t) => t.clase === "ticket")
  const grupos = porTurnar(db, ahora)
  const abiertos = tickets.filter(abierto)
  const enPlazo = abiertos.filter((t) => !fueraDePlazo(t, ahora)).length
  const vencidos = abiertos.length - enPlazo
  const porArea = abiertosPorArea(tickets)
  const maxArea = Math.max(1, ...porArea.map((x) => x.n))
  const origen = vista === "usuarios" ? "persona_usuaria" : "personal"
  const visibles = tickets.filter((t) => t.origen === origen && t.estado !== "cerrado" && (filtroArea === "todas" || t.area === filtroArea) && (filtroEst === "todas" || t.station === filtroEst))
  const nUsuarios = grupos.length + tickets.filter((t) => t.origen === "persona_usuaria" && t.estado !== "cerrado").length
  const nPersonal = tickets.filter((t) => t.origen === "personal" && t.estado !== "cerrado").length
  const estaciones = [...new Set(tickets.filter((t) => t.estado !== "cerrado").map((t) => t.station))].sort()
  const ticketsPorTurnar = tickets.filter((t) => t.porTurnar && abierto(t)).length
  const pendientes = grupos.length + vencidos + ticketsPorTurnar
  const resumen =
    pendientes === 0
      ? "Todo turnado y en plazo"
      : [
          grupos.length ? `${grupos.length} ${grupos.length === 1 ? "reporte nuevo" : "reportes nuevos"} por turnar` : "",
          ticketsPorTurnar ? `${ticketsPorTurnar} ${ticketsPorTurnar === 1 ? "ticket del personal" : "tickets del personal"} por turnar` : "",
          vencidos ? `${vencidos} ${vencidos === 1 ? "ticket vencido" : "tickets vencidos"}` : ""].filter(Boolean).join(" · ")

  return (
    <div className="vista rol-mesa">
      <Letrero perfil="mesa" icono="inbox" quien={`${cuenta.nombre} · Gerencia de Atención al Usuario`} titulo="Mesa de atención" resumen={resumen} tono={vencidos ? "bad" : grupos.length || ticketsPorTurnar ? "warn" : "ok"}>
        <button type="button" className="boton-rol" onClick={() => setLevantar(true)}>
          <Icon name="plus" size="sm" /> Levantar ticket
        </button>
      </Letrero>

      <div className="vistazos">
        <Vistazo titulo="¿Vamos en plazo?" pie={vencidos ? `${vencidos} fuera de plazo: aparecen primero en cada columna.` : "Ningún ticket abierto está vencido."}>
          <div className="flex items-center gap-4">
            <Anillo valor={enPlazo} max={Math.max(1, abiertos.length)} centro={`${abiertos.length ? Math.round((enPlazo / abiertos.length) * 100) : 100} %`} tono={vencidos === 0 ? "ok" : vencidos / Math.max(1, abiertos.length) > 0.25 ? "bad" : "warn"} />
            <p className="text-sm">
              <span className="block text-2xl font-extrabold tabular-nums">
                {enPlazo} de {abiertos.length}
              </span>
              tickets abiertos están en plazo
            </p>
          </div>
        </Vistazo>
        <Vistazo titulo="Abiertos por área">
          <ul className="space-y-1.5" aria-label="Tickets abiertos por área">
            {porArea.map((x) => (
              <li key={x.area} className="grid grid-cols-[1.25rem_7.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-sm">
                <Icon name={ICONO_AREA[x.area]} size="sm" className="text-ink-muted" />
                <span className="truncate font-bold">{AREA_CORTA[x.area]}</span>
                <span className="block h-3 rounded-r" style={{ width: `${(x.n / maxArea) * 100}%`, minWidth: x.n ? 6 : 2, background: x.n ? "var(--chart-1)" : "var(--chart-track)" }} aria-hidden="true" />
                <span className="text-right font-extrabold tabular-nums">{x.n}</span>
              </li>
            ))}
          </ul>
        </Vistazo>
        <Vistazo titulo="Resueltos en 7 días">
          <Columnas datos={cerradosPorDia(tickets, ahora)} etiqueta="Tickets resueltos por día" unidad="resueltos" />
        </Vistazo>
      </div>

      <div className="pestanas" role="tablist" aria-label="Qué reportes ver">
        <button type="button" role="tab" className="pestana" aria-selected={vista === "usuarios"} aria-controls="mesa-panel" onClick={() => setVista("usuarios")}>
          <Icon name="people" size="sm" /> De personas usuarias <span className="pestana-n">{nUsuarios}</span>
        </button>
        <button type="button" role="tab" className="pestana" aria-selected={vista === "personal"} aria-controls="mesa-panel" onClick={() => setVista("personal")}>
          <Icon name="user" size="sm" /> Del personal <span className="pestana-n">{nPersonal}</span>
        </button>
      </div>

      <div id="mesa-panel" role="tabpanel" className="space-y-5">
        {vista === "usuarios" && (
          <section aria-labelledby="por-turnar" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="por-turnar" className="seccion-titulo flex items-center gap-2">
                <Icon name="inbox" /> Reportes de personas usuarias por turnar
              </h2>
              <p className="text-sm text-ink-muted">Los reportes iguales se agrupan; con 3 personas o más sube la prioridad.</p>
            </div>
            {grupos.length === 0 ? (
              <p className="tarjeta text-center font-bold text-success">
                <Icon name="check" className="mr-1 inline" /> No hay reportes por turnar.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {grupos.map((g) => (
                  <GrupoCard key={g.clave} g={g} ctx={ctx} />
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="tickets-titulo" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="tickets-titulo" className="seccion-titulo flex items-center gap-2">
                <Icon name="ticket" /> {vista === "usuarios" ? "Tickets de reportes de personas usuarias" : "Tickets que levantó el personal"}
              </h2>
              <p className="text-sm text-ink-muted">Abre un ticket para modificar su nombre, descripción, urgencia o departamento, o para eliminarlo.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="filtro-area">
                Departamento
              </label>
              <select id="filtro-area" className="field-select min-h-11 w-auto text-sm" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value as AreaId | "todas")}>
                <option value="todas">Todos los departamentos</option>
                {ORDEN_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREAS[a].nombre}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="filtro-estacion">
                Estación
              </label>
              <select id="filtro-estacion" className="field-select min-h-11 w-auto text-sm" value={filtroEst} onChange={(e) => setFiltroEst(e.target.value)}>
                <option value="todas">Todas las estaciones</option>
                {estaciones.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <TableroTickets tickets={visibles} now={ahora} onAbrir={setAbiertoId} />
        </section>
      </div>

      <DetalleTicket key={abiertoId ?? "ninguno"} ctx={ctx} id={abiertoId} onClose={() => setAbiertoId(null)} perfil="mesa" />
      <LevantarTicket ctx={ctx} open={levantar} onClose={() => setLevantar(false)} perfil="mesa" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Módulo «Tickets» para todo el personal                              */
/* ------------------------------------------------------------------ */

type Pestana = "area" | "mios" | "levantados"

export function ModuloTickets({ ctx }: { ctx: Ctx }) {
  const { db, cuenta, ahora } = ctx
  const areas = areasQueEncarga(cuenta, ahora)
  const atiende = puede(cuenta, "tickets.atender", ahora)
  const yo = idPersonal(db, cuenta)
  const tickets = servicioDe(db).tickets.filter((t) => t.clase === "ticket")
  const deArea = useMemo(
    () => tickets.filter((t) => t.estado !== "cerrado" && areas.includes(t.area) && encargaArea(cuenta, t.area, t.station, ahora)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, cuenta, ahora],
  )
  const mios = tickets.filter((t) => t.asignadoA === yo && t.estado !== "cerrado")
  const levantados = tickets.filter((t) => t.creadoPorCuenta === cuenta.id)
  const opciones: Array<{ id: Pestana; texto: string; n: number }> = [
    ...(areas.length ? [{ id: "area" as const, texto: areas.length === ORDEN_AREAS.length ? "Todas las áreas" : `De ${areas.map((a) => AREAS[a].nombre).join(" y ")}`, n: deArea.length }] : []),
    ...(atiende ? [{ id: "mios" as const, texto: "Asignados a mí", n: mios.length }] : []),
    { id: "levantados", texto: "Levantados por mí", n: levantados.length },
  ]
  const [pestana, setPestana] = useState<Pestana>(opciones[0].id)
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [levantar, setLevantar] = useState(false)
  const perfil: Perfil = cuenta.roles.includes("moderacion") ? "mesa" : cuenta.roles.includes("jefe_estacion") ? "jefe" : cuenta.roles.includes("personal_seguridad") ? "guardia" : cuenta.roles.includes("personal_estacion") ? "personal" : "mant"
  const lista = pestana === "area" ? deArea : pestana === "mios" ? mios : levantados

  return (
    <div className={`vista rol-${perfil}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" id="vista-titulo" tabIndex={-1}>
            Tickets
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Cualquier persona del personal levanta un ticket con su nombre, descripción y urgencia. La Mesa de atención lo turna al área, lo asigna quien encarga esa área, y quien lo resuelve no lo cierra.
          </p>
        </div>
        <button type="button" className="boton-rol" onClick={() => setLevantar(true)}>
          <Icon name="plus" size="sm" /> Levantar ticket
        </button>
      </div>

      <div className="pestanas" role="tablist" aria-label="Qué tickets ver">
        {opciones.map((o) => (
          <button key={o.id} type="button" role="tab" className="pestana" aria-selected={pestana === o.id} aria-controls="tickets-panel" onClick={() => setPestana(o.id)}>
            {o.texto} <span className="pestana-n">{o.n}</span>
          </button>
        ))}
      </div>

      <div id="tickets-panel" role="tabpanel">
        {pestana === "area" ? (
          <TableroTickets tickets={lista} now={ahora} onAbrir={setAbiertoId} />
        ) : lista.length === 0 ? (
          <p className="tarjeta text-center text-ink-muted">{pestana === "mios" ? "No tienes tickets asignados." : "Aún no levantas tickets. Usa «Levantar ticket» cuando otra área deba atender algo."}</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((t) => (
              <div key={t.id}>
                <TicketCard t={t} now={ahora} onAbrir={() => setAbiertoId(t.id)} />
                <p className="mt-1 px-1 text-xs font-bold text-ink-muted">{ESTADO_TICKET_LABEL[t.estado]}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <DetalleTicket key={abiertoId ?? "ninguno"} ctx={ctx} id={abiertoId} onClose={() => setAbiertoId(null)} perfil={perfil} />
      <LevantarTicket ctx={ctx} open={levantar} onClose={() => setLevantar(false)} perfil={perfil} />
    </div>
  )
}

