import { useCallback, useEffect, useMemo, useState } from "react"
import { equiposDeEstacion } from "./data/accessibility"
import { formatoHora, franjasValidas } from "./data/saturation"
import { borrarFotos } from "./lib/evidence"
import { combinarRestricciones, PERFILES, type PerfilId } from "./lib/profiles"
import { aplicarRetencion, baseVacia, estadoEquipo, sembrarDemo, type BaseDatos } from "./lib/reports"
import { calcularRuta, sugerirHora, type ConsultaEstado, type ConsultaRuta, type EquipoRuta, type TipoHora } from "./lib/router"
import { guardar, leer } from "./lib/storage"
import { EmergencyButton } from "./components/Emergency"
import { Icon } from "./components/Icon"
import { MetroMap } from "./components/MetroMap"
import { isoLocal, parseFecha, ProfileDropdown, StationSearch, TimePicker } from "./components/Planner"
import { AvisoPrivacidad } from "./components/Privacy"
import { Reports, type Sesion } from "./components/Reports"
import { esValida, RouteSummary, TripPanel } from "./components/TripStatus"
import { COLOR_NIVEL } from "./components/MetroMap"
import { Dialog } from "./components/ui"

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

  // La ruta se recalcula al cambiar origen, destino, hora o perfil.
  useEffect(() => {
    if (enLinea && origin !== destination) buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, perfiles, tipoHora, fecha, hora, enLinea])

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

  const swapStations = () => {
    setOrigin(destination)
    setDestination(origin)
  }
  const elegirEstacion = (station: string, rol: "origen" | "destino") => {
    if (rol === "origen") {
      if (station === destination) setDestination(origin)
      setOrigin(station)
    } else {
      if (station === origin) setOrigin(destination)
      setDestination(station)
    }
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
  const reportarEstacion = (station: string) => setPreseleccion({ station, equipmentId: equiposDeEstacion(station)[0]?.id ?? "", n: Date.now() })

  const futuro = consulta ? consulta.tipoHora !== "salir_ahora" && (isoLocal(consulta.fecha) !== isoLocal(new Date()) || Math.abs(consulta.hora - minutosAhora()) > 60) : false
  const fechaTexto = consulta
    ? `${consulta.fecha.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} · ${
        consulta.tipoHora === "llegar_a" ? `llegar a las ${formatoHora(consulta.hora)}` : `salir ${consulta.tipoHora === "salir_ahora" ? "ahora" : `a las ${formatoHora(consulta.hora)}`}`
      }`
    : ""
  const valida = esValida(ruta)
  const fechaMapa = consulta?.fecha ?? new Date()
  const horaMapa = ruta && valida ? ruta.salida : (consulta?.hora ?? minutosAhora())

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

      <header className="app-header">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 lg:px-8">
          <a href="#planner" className="flex items-center gap-3 rounded-lg">
            <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-soft">
              <Icon name="route" size="lg" />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">Metro Sin Barreras</span>
              <span className="hidden text-xs font-semibold text-ink-muted sm:block">Rutas accesibles en el Metro de la CDMX</span>
            </span>
          </a>
          <nav className="flex items-center gap-4 md:gap-8" aria-label="Navegación principal">
            <a href="#planner" className="nav-link nav-link-active hidden sm:flex">
              Planear ruta
            </a>
            <a href="#reportar" className="nav-link">
              Reportar
            </a>
            <button type="button" className="nav-link hidden sm:flex" onClick={() => setAvisoAbierto(true)}>
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
        <section id="planner" className="planner-shell">
          <form
            className="planner-form"
            onSubmit={(e) => {
              e.preventDefault()
              buscar()
            }}
            aria-label="Planear viaje"
          >
            <h1 className="text-2xl font-extrabold tracking-tight">
              Planea tu viaje <span className="text-brand">sin barreras</span>
            </h1>
            <p className="mt-1 text-sm text-ink-muted">Escribe las estaciones o tócalas en el mapa. La ruta se calcula para tu perfil y la hora de tu viaje.</p>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="space-y-2">
                <StationSearch label="Estación de origen" pin="A" value={origin} onChange={(s) => elegirEstacion(s, "origen")} />
                <StationSearch label="Estación de destino" pin="B" value={destination} onChange={(s) => elegirEstacion(s, "destino")} />
              </div>
              <button type="button" onClick={swapStations} className="swap-button" aria-label="Intercambiar origen y destino" title="Intercambiar origen y destino">
                <Icon name="swap" />
              </button>
            </div>

            <div className="mt-4">
              <TimePicker tipo={tipoHora} fecha={fecha} hora={hora} onTipo={cambiarTipo} onFecha={cambiarFecha} onHora={setHora} />
            </div>
            <div className="mt-3">
              <ProfileDropdown seleccion={perfiles} onChange={setPerfiles} />
            </div>
            {!enLinea && <p className="mt-3 text-sm font-bold text-warning">Sin conexión: no se puede calcular la ruta.</p>}
            <p className="mt-3 text-xs text-ink-muted">Consultar no requiere cuenta. Tu perfil no sale de este dispositivo.</p>
          </form>

          <div className="planner-trip">
            {ruta && (
              <TripPanel
                ruta={ruta}
                sugerencia={sugerencia}
                onUsarSugerencia={() => {
                  if (!sugerencia || !consulta) return
                  setTipoHora("salir_a")
                  setFecha(isoLocal(consulta.fecha))
                  setHora(Math.round(sugerencia.salida / 30) * 30)
                }}
                onReportar={reportarEquipo}
                peticion={peticion}
                fechaTexto={fechaTexto}
                futuro={futuro}
              />
            )}
          </div>

          <div className="planner-map">
            <RouteSummary ruta={ruta} origen={origin} destino={destination} />
            <div className="relative min-h-0 flex-1">
              <MetroMap
                origen={origin}
                destino={destination}
                ruta={valida ? ruta : null}
                fecha={fechaMapa}
                hora={horaMapa}
                onElegir={elegirEstacion}
                onReportar={reportarEstacion}
              />
            </div>
            <div className="map-legend-bar">
              <span className="font-extrabold">Saturación a las {formatoHora(horaMapa)}:</span>
              {(["baja", "media", "alta"] as const).map((n) => (
                <span key={n} className="legend-item">
                  <span className="size-3 rounded-full" style={{ background: COLOR_NIVEL[n] }} />
                  {n[0].toUpperCase() + n.slice(1)}
                </span>
              ))}
              <span className="legend-item">
                <span className="legend-transfer" /> Estación de transbordo
              </span>
              {valida && ruta!.transbordos > 0 && (
                <span className="legend-item">
                  <span className="grid size-4 place-items-center rounded-full bg-ink text-white">
                    <Icon name="swap" className="size-2.5" />
                  </span>
                  Cambias de línea
                </span>
              )}
              <p id="mapa-ayuda" className="w-full text-ink-muted">
                Toca una estación para elegirla como origen o destino. Arrastra para moverte; usa la rueda, pellizca o los botones para acercar.
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-screen-2xl px-4 pb-12 lg:px-8">
          <section className="service-panel">
            <Reports db={db} actualizar={actualizar} sesion={sesion} setSesion={setSesion} preseleccion={preseleccion} onAviso={() => setAvisoAbierto(true)} />
          </section>

        </div>

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
            Prototipo académico del Equipo 1 (Licenciatura en Ciencia de Datos, ESCOM-IPN). Los datos de equipos, saturación y reportes son demostrativos; no sustituyen las indicaciones oficiales del STC. La red del prototipo incluye las 12 líneas y sus 163 estaciones; las coordenadas del mapa son aproximadas.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="secondary-button" onClick={() => setAvisoAbierto(true)}>
              Aviso de privacidad
            </button>
            <a href="#/consola" className="secondary-button">
              <Icon name="shield" size="sm" /> Consola del personal
            </a>
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
