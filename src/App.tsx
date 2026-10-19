import { useCallback, useEffect, useMemo, useState } from "react"
import { getLine } from "./data/metroData"
import { formatoHora, franjasValidas } from "./data/saturation"
import { borrarFotos } from "./lib/evidence"
import { combinarRestricciones, PERFILES, type PerfilId } from "./lib/profiles"
import { aplicarRetencion, baseVacia, estadoEquipo, sembrarDemo, type BaseDatos } from "./lib/reports"
import { calcularRuta, sugerirHora, type ConsultaEstado, type ConsultaRuta, type EquipoRuta, type TipoHora } from "./lib/router"
import { guardar, leer } from "./lib/storage"
import { EmergencyButton } from "./components/Emergency"
import { Icon } from "./components/Icon"
import { MetroMap } from "./components/MetroMap"
import { Moderation } from "./components/Moderation"
import { isoLocal, parseFecha, ProfilePicker, StationSelector, TimePicker } from "./components/Planner"
import { AvisoPrivacidad } from "./components/Privacy"
import { Reports, type Sesion } from "./components/Reports"
import { RouteLabel, TripStatus } from "./components/TripStatus"
import { Dialog, LineBadge } from "./components/ui"

type FontScale = "normal" | "large" | "xlarge"
const CLAVE_DB = "msb.db.v1"
const CLAVE_PERFIL = "msb.perfil"
const CLAVE_SESION = "msb.sesion"

const minutosAhora = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function siguienteFranja(fecha: Date): number {
  const validas = franjasValidas(fecha)
  return validas.find((m) => m >= minutosAhora()) ?? validas[0]
}

export default function App() {
  const [originLineId, setOriginLineId] = useState("3")
  const [destinationLineId, setDestinationLineId] = useState("1")
  const [origin, setOrigin] = useState("Universidad")
  const [destination, setDestination] = useState("Pantitlán")
  const [perfiles, setPerfiles] = useState<PerfilId[]>(() => leer<PerfilId[]>(CLAVE_PERFIL, ["silla_ruedas"]))
  const [tipoHora, setTipoHora] = useState<TipoHora>("salir_ahora")
  const [fecha, setFecha] = useState(() => isoLocal(new Date()))
  const [hora, setHora] = useState(() => siguienteFranja(new Date()))
  const [fontScale, setFontScale] = useState<FontScale>("normal")
  const [highContrast, setHighContrast] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [db, setDb] = useState<BaseDatos>(() => sembrarDemo(leer<BaseDatos>(CLAVE_DB, baseVacia()), Date.now()))
  const [sesion, setSesionState] = useState<Sesion | null>(() => leer<Sesion | null>(CLAVE_SESION, null))
  const [consulta, setConsulta] = useState<ConsultaRuta | null>(null)
  const [preseleccion, setPreseleccion] = useState<{ station: string; equipmentId: string; n: number } | null>(null)
  const [avisoAbierto, setAvisoAbierto] = useState(false)
  const [verModeracion, setVerModeracion] = useState(false)
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const [reloj, setReloj] = useState(() => Date.now())

  const actualizar = useCallback(
    (fn: (d: BaseDatos) => void) => {
      const copia = structuredClone(db)
      fn(copia)
      setDb(copia)
      guardar(CLAVE_DB, copia)
    },
    [db],
  )
  const setSesion = (s: Sesion | null) => {
    setSesionState(s)
    guardar(CLAVE_SESION, s)
  }

  useEffect(() => guardar(CLAVE_PERFIL, perfiles), [perfiles])

  // Retención automática (RD-12): evidencias de más de 90 días y reportes de más de 12 meses.
  useEffect(() => {
    const copia = structuredClone(db)
    const vencidas = aplicarRetencion(copia, Date.now())
    void borrarFotos(vencidas)
    setDb(copia)
    guardar(CLAVE_DB, copia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const on = () => setEnLinea(true)
    const off = () => setEnLinea(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    const t = window.setInterval(() => setReloj(Date.now()), 60_000)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
      window.clearInterval(t)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.remove("ui-font-large", "ui-font-xlarge")
    if (fontScale === "large") document.documentElement.classList.add("ui-font-large")
    if (fontScale === "xlarge") document.documentElement.classList.add("ui-font-xlarge")
  }, [fontScale])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  const estado: ConsultaEstado = useCallback((id: string) => estadoEquipo(db, id, reloj), [db, reloj])

  const construirConsulta = (override?: Partial<ConsultaRuta>): ConsultaRuta => {
    const ahora = tipoHora === "salir_ahora"
    return {
      origen: origin,
      destino: destination,
      restricciones: combinarRestricciones(perfiles),
      fecha: ahora ? new Date() : parseFecha(fecha),
      hora: ahora ? minutosAhora() : hora,
      tipoHora,
      ...override,
    }
  }

  const buscar = (override?: Partial<ConsultaRuta>) => setConsulta(construirConsulta(override))

  // Primera consulta al abrir la aplicación.
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ruta = useMemo(() => (consulta ? calcularRuta(consulta, estado) : null), [consulta, estado])
  const sugerencia = useMemo(
    () => (consulta && ruta && perfiles.some((p) => PERFILES.find((x) => x.id === p)?.restricciones.peso_saturacion === "alto") ? sugerirHora(consulta, ruta, estado) : null),
    [consulta, ruta, estado, perfiles],
  )

  const peticion = consulta
    ? {
        origen: consulta.origen,
        destino: consulta.destino,
        restricciones: consulta.restricciones,
        fecha: isoLocal(consulta.fecha),
        hora: formatoHora(consulta.hora),
        tipo_hora: consulta.tipoHora,
      }
    : {}

  const toggleReader = () => {
    if (!("speechSynthesis" in window)) return
    if (isReading) {
      window.speechSynthesis.cancel()
      setIsReading(false)
      return
    }
    const content = document.querySelector("main")?.textContent
    if (!content) return
    const u = new SpeechSynthesisUtterance(content)
    u.lang = "es-MX"
    u.rate = 0.9
    u.onend = () => setIsReading(false)
    u.onerror = () => setIsReading(false)
    window.speechSynthesis.speak(u)
    setIsReading(true)
  }

  const changeOriginLine = (lineId: string) => {
    setOriginLineId(lineId)
    setOrigin(getLine(lineId).stations[0])
  }
  const changeDestinationLine = (lineId: string) => {
    const line = getLine(lineId)
    setDestinationLineId(lineId)
    setDestination(line.stations.at(-1) ?? line.stations[0])
  }
  const swapStations = () => {
    setOriginLineId(destinationLineId)
    setDestinationLineId(originLineId)
    setOrigin(destination)
    setDestination(origin)
  }
  const cambiarTipo = (t: TipoHora) => {
    setTipoHora(t)
    const f = parseFecha(fecha)
    const opciones = t === "llegar_a" ? franjasValidas(f).map((m) => m + 30) : franjasValidas(f)
    if (!opciones.includes(hora)) setHora(opciones.find((m) => m >= minutosAhora()) ?? opciones[0])
  }
  const cambiarFecha = (f: string) => {
    setFecha(f)
    const opciones = franjasValidas(parseFecha(f))
    if (!opciones.includes(hora) && tipoHora !== "llegar_a") setHora(opciones[0])
  }
  const reportarEquipo = (eq: EquipoRuta) => setPreseleccion({ station: eq.station, equipmentId: eq.id, n: Date.now() })

  const futuro = consulta ? consulta.tipoHora !== "salir_ahora" && (isoLocal(consulta.fecha) !== isoLocal(new Date()) || Math.abs(consulta.hora - minutosAhora()) > 60) : false
  const fechaTexto = consulta
    ? `${consulta.fecha.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} · ${
        consulta.tipoHora === "llegar_a" ? `llegar a las ${formatoHora(consulta.hora)}` : `salir ${consulta.tipoHora === "salir_ahora" ? "ahora" : `a las ${formatoHora(consulta.hora)}`}`
      }`
    : ""
  const valida = ruta && (ruta.estado === "accesible" || ruta.estado === "accesible_con_apoyo")

  return (
    <div className={`min-h-screen bg-canvas text-ink ${highContrast ? "high-contrast" : ""}`}>
      <a href="#planner" className="skip-link">
        Saltar al planificador
      </a>
      <div className="accessibility-bar" role="region" aria-label="Herramientas de accesibilidad">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-5 py-2 lg:px-10">
          <p className="text-xs font-bold">Personaliza la visualización</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="hidden text-xs font-semibold sm:inline">Tamaño de texto</span>
            <div className="font-controls" role="group" aria-label="Cambiar tamaño del texto">
              {(["normal", "large", "xlarge"] as FontScale[]).map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={`font-button ${["", "text-base", "text-lg"][i]} ${fontScale === s ? "font-button-active" : ""}`}
                  onClick={() => setFontScale(s)}
                  aria-label={["Texto normal", "Texto grande", "Texto extra grande"][i]}
                  aria-pressed={fontScale === s}
                >
                  A
                </button>
              ))}
            </div>
            <button type="button" className={`contrast-button ${highContrast ? "contrast-button-active" : ""}`} onClick={() => setHighContrast(!highContrast)} aria-pressed={highContrast}>
              <Icon name="contrast" size="sm" /> Alto contraste
            </button>
            <button type="button" className={`reader-button ${isReading ? "reader-button-active" : ""}`} onClick={toggleReader} aria-pressed={isReading}>
              <Icon name="speaker" size="sm" />
              {isReading ? "Detener lectura" : "Leer página"}
            </button>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-18 max-w-screen-2xl items-center justify-between gap-4 px-5 py-3 lg:px-10">
          <a href="#planner" className="flex items-center gap-3 rounded-lg">
            <span className="grid size-11 place-items-center rounded-xl bg-brand text-white shadow-soft">
              <Icon name="route" size="lg" />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">Metro Sin Barreras</span>
              <span className="hidden text-xs font-semibold text-ink-muted sm:block">Rutas accesibles en el Metro de la CDMX</span>
            </span>
          </a>
          <nav className="flex items-center gap-4 md:gap-8" aria-label="Navegación principal">
            <a href="#planner" className="nav-link nav-link-active hidden sm:block">
              Planear ruta
            </a>
            <a href="#reportar" className="nav-link">
              Reportar
            </a>
            <button type="button" className="nav-link hidden sm:block" onClick={() => setAvisoAbierto(true)}>
              Privacidad
            </button>
          </nav>
        </div>
      </header>

      {!enLinea && (
        <div className="bg-warning-soft px-5 py-3 text-center text-sm font-bold text-warning" role="status">
          Sin conexión: la consulta de rutas y el envío de reportes no están disponibles. El botón de emergencia sí funciona.
        </div>
      )}

      <main>
        <section id="planner" className="mx-auto max-w-screen-2xl px-5 pb-12 pt-10 lg:px-10 lg:pt-14">
          <div className="mb-8 max-w-3xl">
            <div className="eyebrow">
              <Icon name="people" size="sm" /> Movilidad para todas las personas
            </div>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Llega a tu destino con <span className="text-brand">menos barreras</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Elige tu origen y destino, tu perfil de movilidad y la hora de tu viaje. Te diremos antes de salir si la ruta es accesible y cuánta aglomeración esperar.
            </p>
          </div>

          <div className="grid overflow-hidden rounded-3xl border-2 border-border bg-white shadow-card xl:grid-cols-[460px_1fr]">
            <form
              className="z-10 border-b-2 border-border p-5 sm:p-7 xl:border-b-0 xl:border-r-2"
              onSubmit={(e) => {
                e.preventDefault()
                buscar()
              }}
              aria-label="Planear viaje"
            >
              <div className="mb-6">
                <p className="text-sm font-bold uppercase tracking-widest text-brand">Tu viaje</p>
                <h2 className="mt-1 text-2xl font-extrabold">Origen y destino</h2>
              </div>
              <div className="space-y-4">
                <StationSelector title="Origen" lineId={originLineId} station={origin} onLineChange={changeOriginLine} onStationChange={setOrigin} />
                <button type="button" onClick={swapStations} className="swap-button-new" aria-label="Intercambiar origen y destino">
                  <Icon name="swap" size="sm" /> Intercambiar
                </button>
                <StationSelector title="Destino" lineId={destinationLineId} station={destination} onLineChange={changeDestinationLine} onStationChange={setDestination} />
              </div>
              <div className="mt-7 border-t-2 border-border pt-6">
                <TimePicker tipo={tipoHora} fecha={fecha} hora={hora} onTipo={cambiarTipo} onFecha={cambiarFecha} onHora={setHora} />
              </div>
              <div id="perfil" className="mt-7 border-t-2 border-border pt-6">
                <ProfilePicker seleccion={perfiles} onChange={setPerfiles} />
              </div>
              <button type="submit" className="primary-button mt-7 w-full" disabled={!enLinea}>
                Buscar ruta accesible <Icon name="arrow-right" />
              </button>
              <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">Consultar no requiere cuenta. Tu perfil no sale de este dispositivo.</p>
            </form>

            <div className="relative h-[560px] overflow-hidden bg-map sm:h-[640px] xl:sticky xl:top-[72px] xl:self-start" aria-live="polite">
              <div className="absolute inset-0 map-grid" />
              <MetroMap origen={origin} destino={destination} origenLinea={originLineId} destinoLinea={destinationLineId} ruta={valida ? ruta : null} />
              <div className="absolute left-5 top-5 flex flex-wrap items-center gap-2">
                {ruta && <RouteLabel ruta={ruta} />}
                {valida && <span className="map-chip bg-white">{ruta!.lineIds.map((id) => `L${id}`).join(" → ")}</span>}
              </div>
              {ruta && (
                <div className="route-summary">
                  <div className="flex items-center gap-3 border-b-2 border-border px-5 py-4">
                    <span className={`grid size-11 place-items-center rounded-xl ${valida ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                      <Icon name={valida ? "route" : "alert"} />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{consulta?.origen} → {consulta?.destino}</p>
                      <h3 className="font-extrabold">{valida ? `Salida ${formatoHora(ruta.salida)} · llegada ≈ ${formatoHora(ruta.llegada)}` : ruta.estado === "sin_ruta" ? "Sin ruta posible para tu perfil" : "Fuera del horario de servicio"}</h3>
                    </div>
                  </div>
                  {valida ? (
                    <>
                      <div className="grid grid-cols-3 divide-x-2 divide-border px-2 py-4 text-center">
                        <div>
                          <Icon name="clock" size="sm" className="mx-auto mb-1 text-brand" />
                          <strong className="block text-lg">{ruta.duracion} min</strong>
                          <span className="text-xs text-ink-muted">tiempo aprox.</span>
                        </div>
                        <div>
                          <Icon name="route" size="sm" className="mx-auto mb-1 text-brand" />
                          <strong className="block text-lg">{ruta.transbordos}</strong>
                          <span className="text-xs text-ink-muted">transbordos</span>
                        </div>
                        <div>
                          <Icon name="elevator" size="sm" className="mx-auto mb-1 text-brand" />
                          <strong className="block text-lg">{ruta.equipos.length}</strong>
                          <span className="text-xs text-ink-muted">equipos</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 bg-surface px-5 py-3 text-sm font-semibold">
                        {ruta.lineIds.map((id, i) => (
                          <span key={id} className="contents">
                            {i > 0 && <Icon name="arrow-right" size="sm" className="text-ink-muted" />}
                            <LineBadge line={getLine(id)} compact />
                          </span>
                        ))}
                        <span className="ml-1">Detalle abajo, en “Estado de tu viaje”.</span>
                      </div>
                    </>
                  ) : (
                    <p className="px-5 py-4 text-sm font-semibold">{ruta.mensaje}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {ruta && (
            <TripStatus
              ruta={ruta}
              sugerencia={sugerencia}
              onUsarSugerencia={() => {
                if (!sugerencia || !consulta) return
                setTipoHora("salir_a")
                setFecha(isoLocal(consulta.fecha))
                const m = Math.round(sugerencia.salida / 30) * 30
                setHora(m)
                buscar({ tipoHora: "salir_a", hora: sugerencia.salida, fecha: consulta.fecha })
              }}
              onReportar={reportarEquipo}
              peticion={peticion}
              fechaTexto={fechaTexto}
              futuro={futuro}
            />
          )}

          <section className="service-panel">
            <Reports db={db} actualizar={actualizar} sesion={sesion} setSesion={setSesion} preseleccion={preseleccion} onAviso={() => setAvisoAbierto(true)} />
          </section>

          {verModeracion && <Moderation db={db} actualizar={actualizar} />}
        </section>

        <section id="ayuda" className="border-t-2 border-border bg-white">
          <div className="mx-auto grid max-w-screen-2xl gap-8 px-5 py-10 md:grid-cols-4 lg:px-10">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand">Cómo leer el resultado</p>
              <h2 className="mt-2 text-2xl font-extrabold">Información clara antes de salir</h2>
            </div>
            <div className="info-item">
              <span className="info-number">01</span>
              <div>
                <h3 className="font-extrabold">Accesible</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">Todos los accesos y transbordos de la ruta son compatibles con tu perfil y sus equipos funcionan según la información más reciente.</p>
              </div>
            </div>
            <div className="info-item">
              <span className="info-number">02</span>
              <div>
                <h3 className="font-extrabold">Accesible con apoyo</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">Algún equipo tiene información incierta. La ruta es posible, pero conviene pedir apoyo al personal de la estación.</p>
              </div>
            </div>
            <div className="info-item">
              <span className="info-number">03</span>
              <div>
                <h3 className="font-extrabold">Saturación estimada</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">Es una estimación por franja de 30 minutos, no un conteo en tiempo real. Úsala para elegir a qué hora viajar.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-border bg-canvas">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-5 pb-28 pt-6 text-sm text-ink-muted lg:px-10">
          <p className="max-w-3xl">
            Prototipo académico del Equipo 1 (Licenciatura en Ciencia de Datos, ESCOM-IPN). Los datos de equipos, saturación y reportes son demostrativos; no sustituyen las indicaciones oficiales del STC. La red del prototipo incluye las 12 líneas con sus estaciones principales.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="secondary-button" onClick={() => setAvisoAbierto(true)}>
              Aviso de privacidad
            </button>
            <button type="button" className="secondary-button" onClick={() => setVerModeracion((v) => !v)} aria-pressed={verModeracion}>
              {verModeracion ? "Ocultar" : "Ver"} panel de moderación (demostración)
            </button>
          </div>
        </div>
      </footer>

      <EmergencyButton />
      <Dialog open={avisoAbierto} onClose={() => setAvisoAbierto(false)} title="Aviso de privacidad simplificado" wide>
        <AvisoPrivacidad />
      </Dialog>
    </div>
  )
}
