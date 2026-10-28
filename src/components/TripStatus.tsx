import { useRef, useState } from "react"
import { getLine } from "../data/metroData"
import { formatoHora, NIVEL_LABEL } from "../data/saturation"
import type { EquipoRuta, PasoRuta, ResultadoRuta } from "../lib/router"
import { Icon, type IconName } from "./Icon"
import { COLOR_NIVEL } from "./MetroMap"
import { LineBadge } from "./ui"

const ESTADO_EQUIPO = {
  disponible: { texto: "Disponible", tono: "status-success" },
  incierto: { texto: "Incierto", tono: "status-warning" },
  fuera_servicio: { texto: "Fuera de servicio", tono: "status-danger" },
} as const

const ICONO_PASO: Record<PasoRuta["tipo"], IconName> = { acceso: "elevator", tramo: "train", transbordo: "swap", salida: "location" }

export function RouteLabel({ ruta }: { ruta: ResultadoRuta }) {
  if (ruta.estado === "accesible")
    return (
      <span className="route-label route-label-ok">
        <Icon name="check" size="sm" /> Accesible
      </span>
    )
  if (ruta.estado === "accesible_con_apoyo")
    return (
      <span className="route-label route-label-warn">
        <Icon name="alert" size="sm" /> Accesible con apoyo
      </span>
    )
  return (
    <span className="route-label route-label-bad">
      <Icon name="x" size="sm" /> {ruta.estado === "sin_ruta" ? "Sin ruta posible" : "Fuera de horario"}
    </span>
  )
}

export const esValida = (r: ResultadoRuta | null) => !!r && (r.estado === "accesible" || r.estado === "accesible_con_apoyo")

/** Resumen del viaje en una franja sobre el mapa (no lo tapa). */
export function RouteSummary({ ruta, origen, destino }: { ruta: ResultadoRuta | null; origen: string; destino: string }) {
  if (!ruta) return null
  const valida = esValida(ruta)
  return (
    <div className="route-bar" aria-live="polite">
      <RouteLabel ruta={ruta} />
      <p className="hidden min-w-0 truncate text-sm font-bold md:block">
        {origen} <span className="text-ink-muted">→</span> {destino}
      </p>
      {valida ? (
        <dl className="route-metrics">
          <div>
            <dt>Salida</dt>
            <dd>{formatoHora(ruta.salida)}</dd>
          </div>
          <div>
            <dt>Llegada</dt>
            <dd>≈ {formatoHora(ruta.llegada)}</dd>
          </div>
          <div>
            <dt>Tiempo</dt>
            <dd>{ruta.duracion} min</dd>
          </div>
          <div>
            <dt>Transbordos</dt>
            <dd>{ruta.transbordos}</dd>
          </div>
          <div>
            <dt>Equipos</dt>
            <dd>{ruta.equipos.length}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="sr-only">Líneas</dt>
            <dd className="flex items-center gap-1">
              {ruta.lineIds.map((id, i) => (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <Icon name="arrow-right" size="sm" className="text-ink-muted" />}
                  <LineBadge line={getLine(id)} compact />
                </span>
              ))}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm font-semibold text-danger">{ruta.estado === "sin_ruta" ? "No hay ruta compatible con tu perfil." : "Hora fuera del horario de servicio."}</p>
      )}
    </div>
  )
}

type Pestaña = "pasos" | "saturacion" | "equipos"

/** Detalle del viaje en el panel lateral: indicaciones, saturación y equipos. */
export function TripPanel({
  ruta,
  sugerencia,
  onUsarSugerencia,
  onReportar,
  onPedirApoyo,
  peticion,
  fechaTexto,
  futuro,
}: {
  ruta: ResultadoRuta
  sugerencia: ResultadoRuta | null
  onUsarSugerencia: () => void
  onReportar: (eq: EquipoRuta) => void
  onPedirApoyo?: (station: string) => void
  peticion: object
  fechaTexto: string
  futuro: boolean
}) {
  const [tab, setTab] = useState<Pestaña>("pasos")
  const tabsRef = useRef<HTMLDivElement>(null)
  const valida = esValida(ruta)
  const pestañas: Array<[Pestaña, string]> = [
    ["pasos", "Indicaciones"],
    ["saturacion", "Saturación"],
    ["equipos", `Equipos (${ruta.equipos.length})`],
  ]

  return (
    <section className="trip-panel" aria-labelledby="viaje-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="viaje-titulo" className="text-lg font-extrabold">
          Tu viaje
        </h2>
        <p className="text-xs font-bold text-ink-muted first-letter:uppercase">{fechaTexto}</p>
      </div>

      {!valida ? (
        <div className="mt-3 rounded-2xl border-2 border-danger bg-danger-soft p-4 text-danger" role="alert">
          <p className="font-extrabold">{ruta.estado === "sin_ruta" ? "No existe una ruta posible" : "Hora fuera de servicio"}</p>
          <p className="mt-1 text-sm font-semibold">{ruta.mensaje}</p>
        </div>
      ) : (
        <>
          {ruta.estado === "accesible_con_apoyo" && (
            <div className="callout callout-warning" role="status">
              <Icon name="alert" size="sm" className="mt-0.5" />
              <div>
                Algún equipo de esta ruta tiene información incierta. La ruta es posible, pero conviene pedir apoyo al personal de la estación.
                {onPedirApoyo && (() => {
                  const st = ruta.equipos.find((e) => e.estado !== "disponible")?.station
                  return st ? (
                    <button type="button" className="mt-2 block font-extrabold underline" onClick={() => onPedirApoyo(st)}>
                      Pedir apoyo en {st}
                    </button>
                  ) : null
                })()}
              </div>
            </div>
          )}
          {futuro && (
            <p className="callout">
              <Icon name="info" size="sm" className="mt-0.5" />
              Planeas viajar otro día u hora: el estado de los equipos es el último conocido y puede cambiar.
            </p>
          )}
          {sugerencia && (
            <div className="callout callout-success">
              <Icon name="clock" size="sm" className="mt-0.5" />
              <div>
                <p>Si sales a las {formatoHora(sugerencia.salida)} encontrarías menos saturación.</p>
                <button type="button" className="mt-1 font-extrabold underline" onClick={onUsarSugerencia}>
                  Usar esa hora
                </button>
              </div>
            </div>
          )}

          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Detalle del viaje"
            className="tabs"
            onKeyDown={(e) => {
              const i = pestañas.findIndex(([p]) => p === tab)
              const n = e.key === "ArrowRight" ? (i + 1) % 3 : e.key === "ArrowLeft" ? (i + 2) % 3 : -1
              if (n < 0) return
              setTab(pestañas[n][0])
              tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus()
            }}
          >
            {pestañas.map(([p, texto]) => (
              <button
                key={p}
                type="button"
                role="tab"
                id={`tab-${p}`}
                aria-selected={tab === p}
                aria-controls={`panel-${p}`}
                tabIndex={tab === p ? 0 : -1}
                className={`tab ${tab === p ? "tab-active" : ""}`}
                onClick={() => setTab(p)}
              >
                {texto}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-3">
            {tab === "pasos" && (
              <>
                <ol className="timeline">
                  {ruta.pasos.map((p, i) => (
                    <li key={i} className={`timeline-step ${p.incierto ? "timeline-step-warn" : ""}`}>
                      <span className={`timeline-icon ${p.tipo === "transbordo" ? "bg-ink text-white" : "bg-brand-soft text-brand"}`}>
                        <Icon name={ICONO_PASO[p.tipo]} size="sm" />
                      </span>
                      <p className="text-sm leading-relaxed">{p.texto}</p>
                    </li>
                  ))}
                </ol>
                {ruta.penalizados.length > 0 && <p className="mt-2 text-xs text-ink-muted">No se encontró alternativa para: {ruta.penalizados.join("; ")}.</p>}
                <p className="data-note">Tiempo referencial con promedios por tramo y transbordo.</p>
              </>
            )}

            {tab === "saturacion" && (
              <>
                <ul className="divide-y divide-border">
                  {ruta.estaciones.map((e, i) => (
                    <li key={`${e.station}-${i}`} className="flex items-center gap-3 py-1.5">
                      <span className="w-11 shrink-0 text-xs font-bold tabular-nums text-ink-muted">{formatoHora(e.llegada)}</span>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: getLine(e.line).color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.station}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                        <span className="size-2.5 rounded-full" style={{ background: COLOR_NIVEL[e.nivel] }} aria-hidden="true" />
                        {NIVEL_LABEL[e.nivel]}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="data-note">Estimación por franja de 30 minutos con un perfil horario ilustrativo; no es un conteo en tiempo real.</p>
              </>
            )}

            {tab === "equipos" && (
              <>
                {ruta.equipos.length === 0 ? (
                  <p className="text-sm text-ink-muted">Tu ruta usa accesos a nivel o escaleras fijas compatibles con tu perfil.</p>
                ) : (
                  <ul className="space-y-2">
                    {ruta.equipos.map((eq) => (
                      <li key={eq.id} className="rounded-xl border-2 border-border bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">
                              {eq.tipo} · {eq.station}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {eq.ubicacion} · {eq.id}
                            </span>
                          </span>
                          <span className={`status-label ${ESTADO_EQUIPO[eq.estado].tono}`}>
                            <span className="status-dot" />
                            {ESTADO_EQUIPO[eq.estado].texto}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-ink-muted">{eq.fuente}</span>
                          <button type="button" className="text-xs font-extrabold text-brand underline" onClick={() => onReportar(eq)}>
                            Reportar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="data-note">Inventario demostrativo. El estado oficial del STC no cambia por los reportes de la comunidad.</p>
              </>
            )}
          </div>
        </>
      )}

      <details className="mt-4 rounded-xl border-2 border-border bg-canvas p-3 text-sm">
        <summary className="cursor-pointer font-extrabold">
          <Icon name="shield" size="sm" className="mr-1.5 inline text-brand" />
          ¿Qué datos se enviaron?
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          Solo origen, destino, restricciones codificadas y hora. Nunca se envía tu perfil ni el tipo de discapacidad, y no se necesita cuenta (RN3). En este prototipo la API se simula dentro del navegador.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-white">POST /api/v1/ruta{"\n"}{JSON.stringify(peticion, null, 2)}</pre>
      </details>
    </section>
  )
}
