/**
 * Módulos de la operación en las estaciones (HU-31 a HU-37): infraestructura, mi estación,
 * rondas de revisión, mantenimiento y seguridad. Cada acción queda en la bitácora.
 */
import { useMemo, useState, type FormEvent } from "react"
import { equipoPorId, equiposDeEstacion, todosLosEquipos } from "../../data/accessibility"
import { metroLines } from "../../data/metroData"
import { alcanzaEstacion, puede } from "../../lib/admin"
import {
  asignarIncidente,
  asignarResponsable,
  avanzarIncidente,
  crearOrden,
  cumplimientoPorResponsable,
  etiquetaSlot,
  operacionDe,
  personaDeCuenta,
  personaPorId,
  personasDe,
  programaDe,
  recurrentes,
  registrarIncidente,
  registrarRonda,
  reportesPorVerificar,
  resolverOrden,
  rondasDelDia,
  saturacionProxima,
  tomarOrden,
  vencida,
  verificarEnSitio,
  ESTACIONES_PILOTO,
  ESTADO_INCIDENTE_LABEL,
  ESTADO_RONDA_LABEL,
  PUNTOS_ENCUENTRO,
  RESULTADO_LABEL,
  SLA_ORDEN,
  SLOTS,
  TIPO_INCIDENTE_LABEL,
  type EstadoIncidente,
  type EstadoRonda,
  type Incidente,
  type OrdenMantenimiento,
  type ResultadoEquipo,
  type SlotId,
  type TipoIncidente,
} from "../../lib/operacion"
import { estadoEquipo } from "../../lib/reports"
import { Icon } from "../Icon"
import type { Ctx } from "./AdminApp"
import { Encabezado, Estado, Tarjeta } from "./Modulos"

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const HORA = 3_600_000
const hora = (ts: number) => new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })
const fechaHora = (ts: number) => new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
const hace = (ms: number) => (ms < HORA ? `hace ${Math.max(1, Math.round(ms / 60_000))} min` : ms < 48 * HORA ? `hace ${(ms / HORA).toFixed(1)} h` : `hace ${Math.round(ms / (24 * HORA))} días`)
type Tono = "ok" | "warn" | "bad" | "neutral"
const TONO_RONDA: Record<EstadoRonda, Tono> = { hecha: "ok", tarde: "warn", atrasada: "bad", en_curso: "warn", programada: "neutral" }
const TONO_INCIDENTE: Record<EstadoIncidente, Tono> = { abierta: "bad", asignada: "warn", en_camino: "warn", atendida: "ok", cancelada: "neutral" }
const TONO_EQUIPO = { disponible: "ok", incierto: "warn", fuera_servicio: "bad" } as const
const TEXTO_EQUIPO = { disponible: "Funciona", incierto: "Con fallas o sin confirmar", fuera_servicio: "Fuera de servicio" } as const

function SelectorEstacion({ estaciones, valor, onChange }: { estaciones: string[]; valor: string; onChange: (s: string) => void }) {
  if (estaciones.length <= 1) return null
  return (
    <div className="mb-5 max-w-xs">
      <label className="field-label" htmlFor="sel-estacion">
        Estación
      </label>
      <select id="sel-estacion" className="field-select" value={valor} onChange={(e) => onChange(e.target.value)}>
        {estaciones.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  )
}

const estacionesDe = (ctx: Ctx) => (ctx.cuenta.estaciones?.length ? ctx.cuenta.estaciones : ESTACIONES_PILOTO)

/* ------------------------------------------------------------------ */
/* Infraestructura (vista de administrador)                            */
/* ------------------------------------------------------------------ */

export function Infraestructura({ ctx }: { ctx: Ctx }) {
  const { db, ahora } = ctx
  const op = operacionDe(db)
  const [linea, setLinea] = useState("todas")
  const equipos = useMemo(() => todosLosEquipos.map((eq) => ({ eq, ...estadoEquipo(db, eq.id, ahora) })), [db, ahora])
  const enLinea = (station: string) => linea === "todas" || metroLines.find((l) => l.id === linea)?.stations.includes(station)
  const conFalla = equipos.filter((x) => x.estado !== "disponible" && enLinea(x.eq.station))
  const porVerificar = reportesPorVerificar(db, null, ahora)
  const resp = cumplimientoPorResponsable(op, ESTACIONES_PILOTO, 7, ahora)
  const rec = recurrentes(op, 30, ahora)

  return (
    <>
      <Encabezado eyebrow="Administración de la operación" titulo="Estado de la infraestructura">
        Elevadores, salvaescaleras y escaleras eléctricas de toda la red, con lo que reportan el personal de las estaciones, mantenimiento y las personas usuarias. No muestra datos de personas.
      </Encabezado>

      <Tarjeta titulo="Estaciones del piloto">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Estaciones del piloto">
          <table className="admin-table">
            <caption className="sr-only">Estado de equipos, rondas, órdenes y reportes por estación del piloto</caption>
            <thead>
              <tr>
                <th scope="col">Estación</th>
                <th scope="col">Equipos funcionando</th>
                <th scope="col">Rondas de hoy</th>
                <th scope="col">Órdenes abiertas</th>
                <th scope="col">Reportes sin verificar</th>
                <th scope="col">Apoyos abiertos</th>
              </tr>
            </thead>
            <tbody>
              {ESTACIONES_PILOTO.map((s) => {
                const eqs = equipos.filter((x) => x.eq.station === s)
                const ok = eqs.filter((x) => x.estado === "disponible").length
                const rondas = rondasDelDia(op, s, ahora, ahora)
                const atrasadas = rondas.filter((r) => r.estado === "atrasada").length
                const hechas = rondas.filter((r) => r.registro).length
                const ordenes = op.ordenes.filter((o) => o.station === s && o.estado !== "resuelta")
                const pv = porVerificar.filter((p) => p.station === s).length
                const apoyos = op.incidentes.filter((x) => x.station === s && x.estado !== "atendida" && x.estado !== "cancelada").length
                return (
                  <tr key={s}>
                    <th scope="row">{s}</th>
                    <td>
                      <Estado tono={ok === eqs.length ? "ok" : eqs.some((x) => x.estado === "fuera_servicio") ? "bad" : "warn"}>
                        {ok} de {eqs.length}
                      </Estado>
                    </td>
                    <td>
                      <Estado tono={atrasadas ? "bad" : "ok"}>
                        {hechas} de {SLOTS.length}
                        {atrasadas ? ` · ${atrasadas} atrasada` : ""}
                      </Estado>
                    </td>
                    <td>{ordenes.length ? ordenes.map((o) => `${o.id} (${o.estado === "en_atencion" ? "en atención" : "sin tomar"})`).join(", ") : "—"}</td>
                    <td>{pv ? <Estado tono="warn">{pv}</Estado> : "0"}</td>
                    <td>{apoyos ? <Estado tono="warn">{apoyos}</Estado> : "0"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="mt-5">
        <Tarjeta
          titulo={`Equipos con falla (${conFalla.length})`}
          accion={
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-linea" className="text-sm font-bold">
                Línea
              </label>
              <select id="filtro-linea" className="field-select min-h-10 w-auto" value={linea} onChange={(e) => setLinea(e.target.value)}>
                <option value="todas">Todas</option>
                {metroLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    Línea {l.id}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {conFalla.length === 0 ? (
            <p className="text-sm text-ink-muted">Todos los equipos funcionan.</p>
          ) : (
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Equipos con falla">
              <table className="admin-table">
                <caption className="sr-only">Equipos fuera de servicio o con fallas, con su fuente</caption>
                <thead>
                  <tr>
                    <th scope="col">Equipo</th>
                    <th scope="col">Estación</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {conFalla.map((x) => (
                    <tr key={x.eq.id}>
                      <th scope="row">
                        {x.eq.tipo}
                        <span className="block text-xs font-normal text-ink-muted">{x.eq.ubicacion}</span>
                      </th>
                      <td>{x.eq.station}</td>
                      <td>
                        <Estado tono={TONO_EQUIPO[x.estado]}>{TEXTO_EQUIPO[x.estado]}</Estado>
                      </td>
                      <td className="text-sm">{x.fuente}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Quién da las rondas (últimos 7 días)">
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Cumplimiento por responsable">
            <table className="admin-table">
              <caption className="sr-only">Rondas asignadas y cumplidas por persona responsable</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Estación</th>
                  <th scope="col">A tiempo</th>
                  <th scope="col">Fuera de tiempo</th>
                  <th scope="col">Sin registrar</th>
                </tr>
              </thead>
              <tbody>
                {resp.map((f) => (
                  <tr key={f.persona.id}>
                    <th scope="row">
                      {f.persona.nombre}
                      <span className="block text-xs font-normal text-ink-muted">{f.persona.puesto}</span>
                    </th>
                    <td>{f.persona.station}</td>
                    <td>
                      <Estado tono={f.aTiempo / f.programadas >= 0.95 ? "ok" : "warn"}>
                        {f.aTiempo} de {f.programadas}
                      </Estado>
                    </td>
                    <td>{f.tarde}</td>
                    <td>{f.omitidas ? <Estado tono="bad">{f.omitidas}</Estado> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-muted">El programa de rondas y sus responsables se cambia en «Rondas de revisión».</p>
        </Tarjeta>
        <Tarjeta titulo="Fallas recurrentes (30 días)">
          {rec.length === 0 ? (
            <p className="text-sm text-ink-muted">Ningún equipo con tres o más órdenes.</p>
          ) : (
            <ul className="space-y-2">
              {rec.map((x) => {
                const eq = equipoPorId(x.equipmentId)
                const ords = op.ordenes.filter((o) => o.equipmentId === x.equipmentId)
                return (
                  <li key={x.equipmentId} className="report-item">
                    <p className="font-extrabold">
                      {eq?.tipo} · {eq?.station}
                    </p>
                    <p className="text-sm text-ink-muted">{eq?.ubicacion}</p>
                    <p className="mt-1 text-sm">
                      {x.n} órdenes: {ords.map((o) => `${o.id}${o.nota ? ` (${o.nota.toLowerCase()})` : ""}`).join("; ")}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-muted">Tres o más órdenes en 30 días piden un análisis de causa con mantenimiento, no solo otra reparación.</p>
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Rondas de revisión                                                  */
/* ------------------------------------------------------------------ */

export function Rondas({ ctx }: { ctx: Ctx }) {
  const { db, ahora, cuenta, operar } = ctx
  const op = operacionDe(db)
  const estaciones = estacionesDe(ctx)
  const [station, setStation] = useState(estaciones[0])
  const [abierta, setAbierta] = useState<SlotId | null>(null)
  const registra = puede(cuenta, "rondas.registrar", ahora) && alcanzaEstacion(cuenta, station)
  const programa = puede(cuenta, "rondas.programar", ahora) && alcanzaEstacion(cuenta, station)
  const esJefe = cuenta.roles.includes("jefe_estacion")
  const yo = personaDeCuenta(op, cuenta)
  const hoy = rondasDelDia(op, station, ahora, ahora)
  const prog = programaDe(op, station)
  const candidatos = personasDe(op, station).filter((p) => p.puesto !== "Policía auxiliar")
  const recientes = op.rondas.filter((r) => r.station === station).slice(0, 8)

  return (
    <>
      <Encabezado eyebrow={esJefe ? "Jefe(a) de estación" : registra ? "Personal de estación" : "Administración de la operación"} titulo={`Rondas de revisión · ${station}`}>
        Cinco rondas al día: antes de abrir y a las 9:00, 13:00, 17:00 y 21:00. Quien la da revisa cada elevador, salvaescaleras y escalera eléctrica; una falla crea la orden de mantenimiento y las rutas dejan de usar el equipo. Se registra dentro de 45 minutos de su hora (RN10).
      </Encabezado>
      <SelectorEstacion estaciones={estaciones} valor={station} onChange={setStation} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Rondas de hoy">
          <ul className="space-y-3">
            {hoy.map((r) => {
              const mia = r.responsable?.id === yo.id
              const puedeRegistrar = registra && !r.registro && (esJefe || mia) && (r.estado !== "programada" || r.ts - ahora <= 30 * 60_000)
              return (
                <li key={r.slot} className="report-item">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold">{r.hora}</p>
                      <p className="text-sm text-ink-muted">
                        Responsable: {r.responsable?.nombre ?? "sin asignar"} ({r.responsable?.puesto.toLowerCase() ?? "—"}){mia ? " · tú" : ""}
                      </p>
                      {r.registro && (
                        <p className="mt-1 text-sm">
                          Registró {r.registro.porNombre} a las {hora(r.registro.ts)}:{" "}
                          {Object.values(r.registro.resultados).every((x) => x === "funciona")
                            ? "todos los equipos funcionan"
                            : Object.entries(r.registro.resultados)
                                .filter(([, v]) => v !== "funciona")
                                .map(([id, v]) => `${equipoPorId(id)?.tipo} (${equipoPorId(id)?.ubicacion.toLowerCase()}): ${RESULTADO_LABEL[v].toLowerCase()}`)
                                .join("; ")}
                          {r.registro.observaciones ? ` · «${r.registro.observaciones}»` : ""}
                        </p>
                      )}
                    </div>
                    <Estado tono={TONO_RONDA[r.estado]}>{ESTADO_RONDA_LABEL[r.estado]}</Estado>
                  </div>
                  {puedeRegistrar && abierta !== r.slot && (
                    <button type="button" className="primary-button mt-3 min-h-10" onClick={() => setAbierta(r.slot)}>
                      Registrar ronda{mia ? "" : " (cubrir)"}
                    </button>
                  )}
                  {abierta === r.slot && <FormRonda ctx={ctx} station={station} slot={r.slot} onListo={() => setAbierta(null)} />}
                </li>
              )
            })}
          </ul>
        </Tarjeta>

        <div className="grid content-start gap-5">
          <Tarjeta titulo="Programa: quién da cada ronda">
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Programa de rondas">
              <table className="admin-table min-w-0">
                <caption className="sr-only">Responsable de cada ronda en {station}</caption>
                <thead>
                  <tr>
                    <th scope="col">Ronda</th>
                    <th scope="col">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((slot) => (
                    <tr key={slot}>
                      <th scope="row">{etiquetaSlot(slot, new Date(ahora))}</th>
                      <td>
                        {programa ? (
                          <>
                            <label className="sr-only" htmlFor={`resp-${slot}`}>
                              Responsable de la ronda {slot}
                            </label>
                            <select
                              id={`resp-${slot}`}
                              className="field-select min-h-10 text-sm"
                              value={prog?.responsables[slot] ?? ""}
                              onChange={(e) => operar((d, est, now) => asignarResponsable(d, est, cuenta, station, slot, e.target.value, now))}
                            >
                              {candidatos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre} · {p.puesto === "Jefe(a) de estación" ? "jefe(a)" : "personal"}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          `${personaPorId(op, prog?.responsables[slot])?.nombre ?? "—"}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              {programa ? "Cada cambio queda en la bitácora. El personal solo registra sus rondas; el jefe de estación puede cubrir cualquiera." : "Lo define el jefe de estación o la administración de la operación."}
            </p>
          </Tarjeta>

          <Tarjeta titulo="Registros recientes">
            <ul className="space-y-2">
              {recientes.map((r) => {
                const fallas = Object.values(r.resultados).filter((x) => x !== "funciona").length
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-2.5 text-sm">
                    <span>
                      <span className="font-bold">{fechaHora(r.ts)}</span> · {r.porNombre}
                    </span>
                    <Estado tono={fallas ? "warn" : "ok"}>{fallas ? `${fallas} con falla` : "Todo funciona"}</Estado>
                  </li>
                )
              })}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </>
  )
}

function FormRonda({ ctx, station, slot, onListo }: { ctx: Ctx; station: string; slot: SlotId; onListo: () => void }) {
  const { db, ahora, cuenta, operar } = ctx
  const equipos = equiposDeEstacion(station)
  const op = operacionDe(db)
  const reportados = new Set(reportesPorVerificar(db, [station], ahora).map((p) => p.equipmentId))
  // Se precarga solo lo que sabe el personal (órdenes abiertas), no lo que dicen los reportes: se revisa en sitio.
  const [res, setRes] = useState<Record<string, ResultadoEquipo>>(() =>
    Object.fromEntries(equipos.map((eq) => [eq.id, op.ordenes.find((o) => o.equipmentId === eq.id && o.estado !== "resuelta")?.gravedad ?? "funciona"])),
  )
  const [obs, setObs] = useState("")
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const r = operar((d, est, now) => registrarRonda(d, est, cuenta, station, slot, res, obs, now))
    if (r.ok) onListo()
  }
  return (
    <form onSubmit={enviar} className="mt-3 space-y-3 border-t-2 border-border pt-3" noValidate>
      <p className="text-sm text-ink-muted">Revisa cada equipo en sitio. Los que tienen orden abierta aparecen con su falla; cambia lo que encuentres distinto.</p>
      {equipos.map((eq) => (
        <fieldset key={eq.id} className="rounded-xl border-2 border-border p-3">
          <legend className="px-1 text-sm font-extrabold">
            {eq.tipo} · {eq.ubicacion}
          </legend>
          {reportados.has(eq.id) && <p className="mb-2 text-xs font-bold text-warning">Hay reportes de personas usuarias sobre este equipo: revísalo con atención.</p>}
          <div className="flex flex-wrap gap-2">
            {(["funciona", "con_fallas", "fuera_servicio"] as ResultadoEquipo[]).map((v) => (
              <label key={v} className={`option-row min-h-10 flex-1 py-1.5 ${res[eq.id] === v ? "option-row-active" : ""}`}>
                <input type="radio" name={`r-${eq.id}`} checked={res[eq.id] === v} onChange={() => setRes({ ...res, [eq.id]: v })} />
                <span className="text-sm font-bold">{RESULTADO_LABEL[v]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="field-label" htmlFor={`obs-${slot}`}>
        Observaciones (opcional)
      </label>
      <textarea id={`obs-${slot}`} className="report-textarea w-full" value={obs} onChange={(e) => setObs(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="primary-button">
          Guardar ronda
        </button>
        <button type="button" className="secondary-button" onClick={onListo}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Mi estación (jefe y personal de estación)                           */
/* ------------------------------------------------------------------ */

export function MiEstacion({ ctx }: { ctx: Ctx }) {
  const { db, ahora, cuenta, operar } = ctx
  const op = operacionDe(db)
  const estaciones = estacionesDe(ctx)
  const [station, setStation] = useState(estaciones[0])
  const esJefe = cuenta.roles.includes("jefe_estacion")
  const equipos = equiposDeEstacion(station).map((eq) => ({ eq, ...estadoEquipo(db, eq.id, ahora) }))
  const porVerificar = reportesPorVerificar(db, [station], ahora)
  const abiertos = op.incidentes.filter((x) => x.station === station && x.estado !== "atendida" && x.estado !== "cancelada")
  const cerrados = op.incidentes.filter((x) => x.station === station && x.estado === "atendida" && ahora - (x.atendida ?? 0) < 24 * HORA).slice(0, 5)

  return (
    <>
      <Encabezado eyebrow={esJefe ? "Jefe(a) de estación" : "Personal de estación"} titulo={`Mi estación · ${station}`}>
        Solicitudes de apoyo, reportes de personas usuarias por verificar y el estado de cada equipo. Lo que confirmes aquí cambia de inmediato las rutas que calcula la app.
      </Encabezado>
      <SelectorEstacion estaciones={estaciones} valor={station} onChange={setStation} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo={`Solicitudes de apoyo e incidentes (${abiertos.length})`}>
          {abiertos.length === 0 ? <p className="text-sm text-ink-muted">Nada abierto en este momento.</p> : null}
          <ul className="space-y-3">
            {abiertos.map((x) => (
              <IncidenteItem key={x.id} ctx={ctx} x={x} puedeAsignar={esJefe} />
            ))}
          </ul>
          <NuevoIncidente ctx={ctx} station={station} />
          {cerrados.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-extrabold text-brand underline">Atendidos en las últimas 24 h ({cerrados.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {cerrados.map((x) => (
                  <li key={x.id} className="rounded-xl bg-canvas p-2.5">
                    <span className="font-bold">{x.id}</span> · {TIPO_INCIDENTE_LABEL[x.tipo]} · {personaPorId(op, x.asignadoA)?.nombre ?? "—"} · {Math.round(((x.atendida ?? 0) - x.ts) / 60_000)} min
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Tarjeta>

        <Tarjeta titulo={`Reportes de personas usuarias por verificar (${porVerificar.length})`}>
          <p className="mb-3 text-sm text-ink-muted">Reportes de falla de las últimas 24 h que nadie del personal ha revisado. No se muestra quién reportó.</p>
          {porVerificar.length === 0 && <p className="text-sm text-ink-muted">Nada pendiente.</p>}
          <ul className="space-y-3">
            {porVerificar.map((p) => {
              const eq = equipoPorId(p.equipmentId)
              return (
                <li key={p.equipmentId} className="report-item">
                  <p className="font-extrabold">{eq?.tipo}</p>
                  <p className="text-sm text-ink-muted">
                    {eq?.ubicacion} · {p.reportes.length} {p.reportes.length === 1 ? "reporte" : "reportes"} · el primero {hace(ahora - p.desde)}
                  </p>
                  {puede(cuenta, "reportes.verificar", ahora) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="secondary-button min-h-10" onClick={() => operar((d, e, now) => verificarEnSitio(d, e, cuenta, p.equipmentId, "confirmada", now))}>
                        Confirmo la falla
                      </button>
                      <button type="button" className="secondary-button min-h-10" onClick={() => operar((d, e, now) => verificarEnSitio(d, e, cuenta, p.equipmentId, "sin_falla", now))}>
                        Funciona: no hay falla
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Tarjeta>
      </div>

      <div className="mt-5">
        <Tarjeta titulo="Equipos de la estación">
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Equipos de la estación">
            <table className="admin-table">
              <caption className="sr-only">Estado de los equipos de {station}</caption>
              <thead>
                <tr>
                  <th scope="col">Equipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {equipos.map((x) => (
                  <tr key={x.eq.id}>
                    <th scope="row">
                      {x.eq.tipo}
                      <span className="block text-xs font-normal text-ink-muted">{x.eq.ubicacion}</span>
                    </th>
                    <td>
                      <Estado tono={TONO_EQUIPO[x.estado]}>{TEXTO_EQUIPO[x.estado]}</Estado>
                    </td>
                    <td className="text-sm">{x.fuente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {puede(cuenta, "ordenes.crear", ahora) && <NuevaOrden ctx={ctx} station={station} />}
        </Tarjeta>
      </div>
    </>
  )
}

function IncidenteItem({ ctx, x, puedeAsignar }: { ctx: Ctx; x: Incidente; puedeAsignar: boolean }) {
  const { db, ahora, cuenta, operar } = ctx
  const op = operacionDe(db)
  const yo = personaDeCuenta(op, cuenta)
  const ORDEN_PUESTO = { "Personal de estación": 0, "Policía auxiliar": 1, "Jefe(a) de estación": 2 } as const
  const candidatos = personasDe(op, x.station)
    .filter((p) => !cuenta.roles.includes("jefe_seguridad") || p.puesto === "Policía auxiliar")
    .sort((a, b) => ORDEN_PUESTO[a.puesto] - ORDEN_PUESTO[b.puesto])
  const [quien, setQuien] = useState(x.asignadoA ?? candidatos[0]?.id ?? "")
  const [cierre, setCierre] = useState("")
  const asignado = personaPorId(op, x.asignadoA)
  const mio = x.asignadoA === yo.id || (cuenta.roles.includes("jefe_estacion") && x.asignadoA !== undefined)
  const atiende = puede(cuenta, "incidentes.atender", ahora) && (mio || cuenta.roles.includes("jefe_estacion"))
  return (
    <li className="report-item">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-extrabold">
          {x.id} · {TIPO_INCIDENTE_LABEL[x.tipo]}
        </p>
        <Estado tono={TONO_INCIDENTE[x.estado]}>{ESTADO_INCIDENTE_LABEL[x.estado]}</Estado>
      </div>
      <p className="text-sm text-ink-muted">
        {x.station} · {x.punto} · {x.origen === "persona_usuaria" ? "pedido desde la app" : `registró ${x.registradoPor ?? "el personal"}`} {hace(ahora - x.ts)}
      </p>
      {x.detalle && <p className="mt-1 text-sm">«{x.detalle}»</p>}
      {asignado && (
        <p className="mt-1 text-sm font-semibold">
          Asignado a {asignado.nombre} ({asignado.puesto.toLowerCase()}){x.enCamino ? ` · en camino desde las ${hora(x.enCamino)}` : ""}
        </p>
      )}
      {puedeAsignar && puede(cuenta, "incidentes.asignar", ahora) && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="field-label mb-1 text-xs" htmlFor={`asig-${x.id}`}>
              {x.asignadoA ? "Reasignar a" : "Asignar a"}
            </label>
            <select id={`asig-${x.id}`} className="field-select min-h-10 text-sm" value={quien} onChange={(e) => setQuien(e.target.value)}>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {p.puesto.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="secondary-button min-h-10" onClick={() => operar((d, e, now) => asignarIncidente(d, e, cuenta, x.id, quien, now))}>
            Asignar
          </button>
        </div>
      )}
      {atiende && (x.estado === "asignada" || x.estado === "en_camino" || (x.estado === "abierta" && cuenta.roles.includes("jefe_estacion"))) && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {x.estado !== "en_camino" && (
            <button type="button" className="secondary-button min-h-10" onClick={() => operar((d, e, now) => avanzarIncidente(d, e, cuenta, x.id, "en_camino", "", now))}>
              Voy en camino
            </button>
          )}
          <label className="sr-only" htmlFor={`cierre-${x.id}`}>
            Cómo se atendió {x.id}
          </label>
          <input id={`cierre-${x.id}`} className="field-select min-h-10 flex-1 text-sm font-semibold" placeholder="Cómo se atendió (opcional)" value={cierre} onChange={(e) => setCierre(e.target.value)} />
          <button type="button" className="secondary-button min-h-10" onClick={() => operar((d, e, now) => avanzarIncidente(d, e, cuenta, x.id, "atendida", cierre, now))}>
            Atendida
          </button>
        </div>
      )}
    </li>
  )
}

function NuevoIncidente({ ctx, station }: { ctx: Ctx; station: string }) {
  const { cuenta, operar } = ctx
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoIncidente>("persona_atrapada")
  const [punto, setPunto] = useState(PUNTOS_ENCUENTRO[0])
  const [detalle, setDetalle] = useState("")
  if (!abierto)
    return (
      <button type="button" className="secondary-button mt-4" onClick={() => setAbierto(true)}>
        <Icon name="plus" size="sm" /> Registrar incidente
      </button>
    )
  return (
    <form
      className="mt-4 grid gap-3 border-t-2 border-border pt-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const r = operar((d, est, now) => registrarIncidente(d, est, cuenta, station, tipo, punto, detalle, now))
        if (r.ok) {
          setAbierto(false)
          setDetalle("")
        }
      }}
      noValidate
    >
      <div>
        <label className="field-label" htmlFor="inc-tipo">
          Tipo
        </label>
        <select id="inc-tipo" className="field-select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidente)}>
          {(Object.keys(TIPO_INCIDENTE_LABEL) as TipoIncidente[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_INCIDENTE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="inc-punto">
          Dónde
        </label>
        <select id="inc-punto" className="field-select" value={punto} onChange={(e) => setPunto(e.target.value)}>
          {PUNTOS_ENCUENTRO.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="inc-detalle">
          Detalle
        </label>
        <input id="inc-detalle" className="field-select font-semibold" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="primary-button">
          Registrar
        </button>
        <button type="button" className="secondary-button" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function NuevaOrden({ ctx, station }: { ctx: Ctx; station: string }) {
  const { cuenta, operar } = ctx
  const equipos = equiposDeEstacion(station)
  const [eq, setEq] = useState(equipos[0]?.id ?? "")
  const [gravedad, setGravedad] = useState<"fuera_servicio" | "con_fallas">("fuera_servicio")
  const [detalle, setDetalle] = useState("")
  return (
    <form
      className="mt-4 grid gap-3 border-t-2 border-border pt-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        const r = operar((d, est, now) => crearOrden(d, est, cuenta, eq, gravedad, detalle, now))
        if (r.ok) setDetalle("")
      }}
      noValidate
    >
      <div>
        <label className="field-label" htmlFor="ord-eq">
          Enviar a mantenimiento
        </label>
        <select id="ord-eq" className="field-select" value={eq} onChange={(e) => setEq(e.target.value)}>
          {equipos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.tipo} · {x.ubicacion}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="ord-grav">
          Gravedad
        </label>
        <select id="ord-grav" className="field-select" value={gravedad} onChange={(e) => setGravedad(e.target.value as typeof gravedad)}>
          <option value="fuera_servicio">Fuera de servicio</option>
          <option value="con_fallas">Funciona con fallas</option>
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="ord-det">
          Qué falla
        </label>
        <input id="ord-det" className="field-select font-semibold" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
      </div>
      <button type="submit" className="secondary-button">
        Enviar
      </button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Mantenimiento                                                       */
/* ------------------------------------------------------------------ */

export function Mantenimiento({ ctx }: { ctx: Ctx }) {
  const { db, ahora, cuenta, operar } = ctx
  const op = operacionDe(db)
  const atiende = puede(cuenta, "ordenes.atender", ahora)
  const [filtro, setFiltro] = useState<"abiertas" | "resueltas">("abiertas")
  const [nota, setNota] = useState<Record<string, string>>({})
  const lista = op.ordenes
    .filter((o) => (filtro === "abiertas" ? o.estado !== "resuelta" : o.estado === "resuelta" && ahora - (o.resuelta ?? 0) <= 30 * 24 * HORA))
    .sort((a, b) => (filtro === "abiertas" ? (a.prioridad === b.prioridad ? a.creada - b.creada : a.prioridad === "alta" ? -1 : 1) : (b.resuelta ?? 0) - (a.resuelta ?? 0)))

  const plazo = (o: OrdenMantenimiento) => {
    const limite = o.creada + SLA_ORDEN[o.prioridad]
    if (o.estado === "resuelta") return vencida(o, ahora) ? <Estado tono="bad">Fuera de plazo</Estado> : <Estado tono="ok">En plazo</Estado>
    return ahora > limite ? <Estado tono="bad">Vencida {hace(ahora - limite).replace("hace ", "hace ")}</Estado> : <Estado tono="neutral">Vence en {((limite - ahora) / HORA).toFixed(1)} h</Estado>
  }

  return (
    <>
      <Encabezado eyebrow={atiende ? "Mantenimiento electromecánico" : "Administración de la operación"} titulo="Órdenes de mantenimiento">
        Se crean solas cuando una ronda o una verificación en sitio encuentra una falla, o las envía el jefe de estación. Prioridad alta para elevadores y salvaescaleras (24 h); media para escaleras eléctricas (72 h). Al cerrar, el personal de la estación confirma la reparación en su siguiente ronda: quien repara no la confirma (RN9).
      </Encabezado>
      {!atiende && (
        <p className="callout mt-0 mb-4">
          <Icon name="eye" size="sm" className="mt-0.5" />
          Consulta de solo lectura: tomar y cerrar órdenes corresponde a mantenimiento.
        </p>
      )}
      <div className="role-switch" role="group" aria-label="Filtrar órdenes">
        {(["abiertas", "resueltas"] as const).map((f) => (
          <button key={f} type="button" className={`role-switch-btn ${filtro === f ? "role-switch-active" : ""}`} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {f === "abiertas" ? `Abiertas (${op.ordenes.filter((o) => o.estado !== "resuelta").length})` : "Cerradas (30 días)"}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 xl:grid-cols-2">
        {lista.map((o) => {
          const eq = equipoPorId(o.equipmentId)
          return (
            <li key={o.id} className="admin-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-extrabold">
                    {o.id} · {eq?.tipo}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {o.station} · {eq?.ubicacion}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Estado tono={o.prioridad === "alta" ? "bad" : "warn"}>Prioridad {o.prioridad}</Estado>
                  <Estado tono={o.estado === "resuelta" ? "ok" : o.estado === "en_atencion" ? "warn" : "neutral"}>{o.estado === "resuelta" ? "Resuelta" : o.estado === "en_atencion" ? "En atención" : "Sin tomar"}</Estado>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {RESULTADO_LABEL[o.gravedad]} · {o.detalle}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Creada {fechaHora(o.creada)} por {o.creadaPor} ({o.origen === "ronda" ? "ronda de revisión" : o.origen === "verificacion" ? "verificación de reportes" : "jefe de estación"})
                {o.atiende ? ` · atiende ${o.atiende}` : ""}
                {o.resuelta ? ` · cerrada ${fechaHora(o.resuelta)} (${((o.resuelta - o.creada) / HORA).toFixed(1)} h)` : ""}
              </p>
              {o.nota && <p className="mt-1 text-sm font-semibold">Reparación: {o.nota}</p>}
              <div className="mt-2">{plazo(o)}</div>
              {atiende && o.estado === "abierta" && (
                <button type="button" className="primary-button mt-3 min-h-10" onClick={() => operar((d, e, now) => tomarOrden(d, e, cuenta, o.id, now))}>
                  Tomar orden
                </button>
              )}
              {atiende && o.estado === "en_atencion" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor={`nota-${o.id}`}>
                    Reparación realizada en {o.id}
                  </label>
                  <input id={`nota-${o.id}`} className="field-select min-h-10 flex-1 text-sm font-semibold" placeholder="Qué se reparó" value={nota[o.id] ?? ""} onChange={(e) => setNota({ ...nota, [o.id]: e.target.value })} />
                  <button type="button" className="secondary-button min-h-10" onClick={() => operar((d, e, now) => resolverOrden(d, e, cuenta, o.id, nota[o.id] ?? "", now))}>
                    Cerrar orden
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {lista.length === 0 && <p className="text-sm text-ink-muted">No hay órdenes en esta vista.</p>}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Seguridad y apoyo                                                   */
/* ------------------------------------------------------------------ */

export function Seguridad({ ctx }: { ctx: Ctx }) {
  const { db, ahora, cuenta } = ctx
  const op = operacionDe(db)
  const jefe = cuenta.roles.includes("jefe_seguridad")
  const yo = personaDeCuenta(op, cuenta)
  const visibles = op.incidentes.filter((x) => alcanzaEstacion(cuenta, x.station))
  const abiertos = visibles.filter((x) => x.estado !== "atendida" && x.estado !== "cancelada").sort((a, b) => (a.estado === "abierta" ? -1 : 0) - (b.estado === "abierta" ? -1 : 0) || a.ts - b.ts)
  const mios = abiertos.filter((x) => x.asignadoA === yo.id)
  const otros = jefe ? abiertos : abiertos.filter((x) => x.asignadoA !== yo.id)
  const sat = saturacionProxima(ahora, jefe ? ESTACIONES_PILOTO : cuenta.estaciones ?? ESTACIONES_PILOTO)
  const recientes = visibles.filter((x) => x.estado === "atendida" && ahora - (x.atendida ?? 0) < 24 * HORA)

  return (
    <>
      <Encabezado eyebrow={jefe ? "Jefe(a) de seguridad" : "Personal de seguridad"} titulo="Seguridad y apoyo">
        Incidentes y solicitudes de apoyo de personas con movilidad limitada. {jefe ? "Asigna al personal de seguridad de cada estación y anticipa dónde hará falta por la saturación." : "Atiende lo que tienes asignado; marca cuando vas en camino y cuando terminas."}
      </Encabezado>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          {!jefe && (
            <Tarjeta titulo={`Tus asignaciones (${mios.length})`}>
              {mios.length === 0 && <p className="text-sm text-ink-muted">No tienes asignaciones activas.</p>}
              <ul className="space-y-3">
                {mios.map((x) => (
                  <IncidenteItem key={x.id} ctx={ctx} x={x} puedeAsignar={false} />
                ))}
              </ul>
            </Tarjeta>
          )}
          <Tarjeta titulo={jefe ? `Abiertos en las estaciones del piloto (${abiertos.length})` : `Otros abiertos en tu estación (${otros.length})`}>
            {otros.length === 0 && <p className="text-sm text-ink-muted">Nada abierto.</p>}
            <ul className="space-y-3">
              {otros.map((x) => (
                <IncidenteItem key={x.id} ctx={ctx} x={x} puedeAsignar={jefe} />
              ))}
            </ul>
          </Tarjeta>
        </div>
        <div className="grid content-start gap-5">
          <Tarjeta titulo="Saturación esperada en la próxima hora">
            <ul className="space-y-2">
              {sat.map((s) => (
                <li key={s.station} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-2.5 text-sm">
                  <span className="font-bold">{s.station}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink-muted">{s.afluencia.toLocaleString("es-MX")} personas / 30 min</span>
                    <Estado tono={s.nivel === "alta" ? "bad" : s.nivel === "media" ? "warn" : "ok"}>{s.nivel === "alta" ? "Alta" : s.nivel === "media" ? "Media" : "Baja"}</Estado>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">Estimación del perfil horario (demostración). Con saturación alta conviene personal en andenes y transbordos para acompañar a personas con movilidad limitada.</p>
          </Tarjeta>
          <Tarjeta titulo={`Atendidos en las últimas 24 h (${recientes.length})`}>
            <ul className="space-y-2 text-sm">
              {recientes.slice(0, 8).map((x) => (
                <li key={x.id} className="rounded-xl bg-canvas p-2.5">
                  <span className="font-bold">{x.id}</span> · {x.station} · {TIPO_INCIDENTE_LABEL[x.tipo]}
                  <span className="block text-xs text-ink-muted">
                    {personaPorId(op, x.asignadoA)?.nombre ?? "—"} · asignado en {Math.round(((x.asignada ?? x.ts) - x.ts) / 60_000)} min · cerrado en {Math.round(((x.atendida ?? x.ts) - x.ts) / 60_000)} min
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
