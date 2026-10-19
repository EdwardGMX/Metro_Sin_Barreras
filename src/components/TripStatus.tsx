import { getLine } from "../data/metroData"
import { etiquetaFranja, formatoHora, franja } from "../data/saturation"
import type { EquipoRuta, ResultadoRuta } from "../lib/router"
import { Icon } from "./Icon"
import { LineBadge, NivelBadge } from "./ui"

const ESTADO_EQUIPO = {
  disponible: { texto: "Disponible", tono: "status-success" },
  incierto: { texto: "Incierto", tono: "status-warning" },
  fuera_servicio: { texto: "Fuera de servicio", tono: "status-danger" },
} as const

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

export function TripStatus({
  ruta,
  sugerencia,
  onUsarSugerencia,
  onReportar,
  peticion,
  fechaTexto,
  futuro,
}: {
  ruta: ResultadoRuta
  sugerencia: ResultadoRuta | null
  onUsarSugerencia: () => void
  onReportar: (eq: EquipoRuta) => void
  peticion: object
  fechaTexto: string
  futuro: boolean
}) {
  const valida = ruta.estado === "accesible" || ruta.estado === "accesible_con_apoyo"
  return (
    <section className="service-panel" aria-labelledby="service-status-title">
      <div className="service-panel-header">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand">Consulta</p>
          <h2 id="service-status-title" className="mt-1 text-2xl font-extrabold">
            Estado de tu viaje
          </h2>
        </div>
        <p className="rounded-full bg-surface px-4 py-2 text-sm font-bold">{fechaTexto}</p>
      </div>

      {!valida ? (
        <div className="rounded-2xl border-2 border-danger bg-danger-soft p-5 text-danger" role="alert">
          <p className="text-lg font-extrabold">{ruta.estado === "sin_ruta" ? "No existe una ruta posible" : "Hora fuera de servicio"}</p>
          <p className="mt-1 font-semibold">{ruta.mensaje}</p>
        </div>
      ) : (
        <>
          {ruta.estado === "accesible_con_apoyo" && (
            <p className="mb-5 rounded-2xl border-2 border-warning bg-warning-soft p-4 font-semibold text-warning" role="status">
              Algún equipo de esta ruta tiene información incierta (por ejemplo, un reporte de falla sin confirmar). La ruta es posible, pero conviene pedir apoyo al personal de la estación.
            </p>
          )}
          {futuro && (
            <p className="mb-5 rounded-2xl border-2 border-border bg-surface p-4 text-sm font-semibold">
              Planeas viajar otro día u otra hora: el estado de los equipos es el último conocido y puede cambiar. Revísalo antes de salir.
            </p>
          )}
          <div className="grid gap-5 lg:grid-cols-3">
            <article className="status-card">
              <div className="status-card-title">
                <span className="status-icon bg-brand-soft text-brand">
                  <Icon name="people" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-muted">Saturación estimada</p>
                  <h3 className="text-xl font-extrabold">Por estación y hora</h3>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {ruta.estaciones.map((e) => (
                  <li key={`${e.station}-${e.line}-${e.llegada}`} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="block font-bold">{e.station}</span>
                      <span className="text-xs text-ink-muted">
                        Llegas ≈ {formatoHora(e.llegada)} · franja {etiquetaFranja(franja(e.llegada))}
                      </span>
                    </span>
                    <NivelBadge nivel={e.nivel} />
                  </li>
                ))}
              </ul>
              {sugerencia && (
                <div className="mt-3 rounded-xl bg-success-soft p-3 text-sm">
                  <p className="font-bold text-success">Sugerencia: con salida a las {formatoHora(sugerencia.salida)} encontrarías menos saturación.</p>
                  <button type="button" className="mt-2 font-extrabold text-brand underline" onClick={onUsarSugerencia}>
                    Usar esa hora
                  </button>
                </div>
              )}
              <p className="data-note">
                Estimación por franja de 30 minutos con un perfil horario ilustrativo; no es un conteo en tiempo real. En la versión final usa el modelo de saturación y el perfil de la EOD 2017.
              </p>
            </article>

            <article className="status-card">
              <div className="status-card-title">
                <span className="status-icon bg-brand-soft text-brand">
                  <Icon name="route" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-muted">Indicaciones paso a paso</p>
                  <h3 className="text-xl font-extrabold">
                    {ruta.transbordos === 0 ? "Ruta directa" : `${ruta.transbordos} ${ruta.transbordos === 1 ? "transbordo" : "transbordos"}`}
                  </h3>
                </div>
              </div>
              <ol className="space-y-2.5">
                {ruta.pasos.map((p, i) => (
                  <li key={i} className={`transfer-step ${p.incierto ? "ring-2 ring-warning" : ""}`}>
                    <span className="step-number">{i + 1}</span>
                    <p>{p.texto}</p>
                  </li>
                ))}
              </ol>
              {ruta.penalizados.length > 0 && (
                <p className="mt-3 text-sm text-ink-muted">No se encontró alternativa para: {ruta.penalizados.join("; ")}.</p>
              )}
              <p className="data-note">
                Salida {formatoHora(ruta.salida)} · llegada ≈ {formatoHora(ruta.llegada)}. Tiempo referencial calculado con promedios por tramo y transbordo.
              </p>
            </article>

            <article className="status-card">
              <div className="status-card-title">
                <span className="status-icon bg-success-soft text-success">
                  <Icon name="elevator" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-muted">Equipos que necesitas</p>
                  <h3 className="text-xl font-extrabold">{ruta.equipos.length === 0 ? "Ninguno" : `${ruta.equipos.length} en tu ruta`}</h3>
                </div>
              </div>
              {ruta.equipos.length === 0 ? (
                <p className="text-sm text-ink-muted">Tu ruta usa accesos a nivel o escaleras fijas compatibles con tu perfil.</p>
              ) : (
                <ul className="space-y-3">
                  {ruta.equipos.map((eq) => (
                    <li key={eq.id} className="rounded-xl bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span>
                          <span className="block font-bold">
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
                      <p className="mt-1 text-xs text-ink-muted">{eq.fuente}</p>
                      <button type="button" className="mt-1 text-sm font-extrabold text-brand underline" onClick={() => onReportar(eq)}>
                        Reportar este equipo
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="data-note">Inventario demostrativo. El estado oficial del STC no cambia por los reportes de la comunidad.</p>
            </article>
          </div>
        </>
      )}

      <details className="mt-6 rounded-2xl border-2 border-border bg-canvas p-4">
        <summary className="cursor-pointer font-extrabold">
          <Icon name="shield" size="sm" className="mr-2 inline text-brand" />
          ¿Qué datos se enviaron para calcular la ruta?
        </summary>
        <p className="mt-3 text-sm text-ink-muted">
          Solo origen, destino, restricciones codificadas y hora. Nunca se envía tu perfil ni el tipo de discapacidad, y no se necesita cuenta (RN3). En este prototipo la API se simula dentro del navegador.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">POST /api/v1/ruta{"\n"}{JSON.stringify(peticion, null, 2)}</pre>
      </details>
    </section>
  )
}

export function lineasRuta(ruta: ResultadoRuta) {
  return ruta.lineIds.map((id) => <LineBadge key={id} line={getLine(id)} compact />)
}
