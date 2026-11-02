import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { equiposDeEstacion } from "./data/accessibility"
import { formatoHora, franjasValidas } from "./data/saturation"
import { borrarFotos } from "./lib/evidence"
import { combinarRestricciones, PERFILES, type PerfilId } from "./lib/profiles"
import { sembrarOperacion } from "./lib/operacion"
import { sembrarServicio } from "./lib/servicio"
import { aplicarRetencion, baseVacia, estadoEquipo, sembrarDemo, type BaseDatos } from "./lib/reports"
import { calcularRuta, sugerirHora, type ConsultaEstado, type ConsultaRuta, type EquipoRuta, type TipoHora } from "./lib/router"
import { guardar, leer } from "./lib/storage"
import { EmergencyButton } from "./components/Emergency"
import { Icon } from "./components/Icon"
import { MetroMap } from "./components/MetroMap"
import { isoLocal, parseFecha, ProfileChooser, resumenPerfiles, StationSearch, TimePicker } from "./components/Planner"
import { Apoyo } from "./components/Apoyo"
import { MiCuenta } from "./components/vistas/MiCuenta"
import { AvisoPrivacidad } from "./components/Privacy"
import { Reports, type Sesion } from "./components/Reports"
import { esValida, RouteSummary, TripPanel } from "./components/TripStatus"
import { COLOR_NIVEL } from "./components/MetroMap"
import { Dialog } from "./components/ui"

type FontScale = "normal" | "large" | "xlarge"
type Vista = "planear" | "reportar" | "apoyo" | "cuenta"
type Paso = 1 | 2 | 3 | 4

const CLAVE_DB = "msb.db.v1"
const CLAVE_PERFIL = "msb.perfil"
const CLAVE_SESION = "msb.sesion"

/** Los pasos del asistente para planear un viaje. */
const PASOS: Array<{ n: Paso; corto: string; titulo: string; ayuda: string }> = [
  { n: 1, corto: "Perfil", titulo: "¿Cómo viajas?", ayuda: "Elige uno o varios. Si eliges más de uno, aplicamos la regla más estricta de cada uno. Tu perfil se queda solo en este dispositivo y nunca se envía." },
  { n: 2, corto: "Estaciones", titulo: "¿De dónde a dónde?", ayuda: "Escribe el nombre de las estaciones o tócalas en el mapa de la red completa." },
  { n: 3, corto: "Hora", titulo: "¿Cuándo viajas?", ayuda: "La hora cambia qué tan lleno va el tren. Calculamos en franjas de 30 minutos, dentro del horario de servicio y hasta 30 días después." },
  { n: 4, corto: "Tu ruta", titulo: "Tu ruta", ayuda: "Revisa la etiqueta, las indicaciones y el estado de cada equipo antes de salir." },
]

const VISTAS: Array<{ id: Vista; texto: string; href: string }> = [
  { id: "planear", texto: "Planear ruta", href: "#planner" },
  { id: "reportar", texto: "Reportar", href: "#reportar" },
  { id: "apoyo", texto: "Pedir apoyo", href: "#apoyo" },
  { id: "cuenta", texto: "Mi cuenta", href: "#mi-cuenta" },
]

/** La pestaña que indica el enlace (#reportar, #apoyo o #planner); otros anclajes no cambian de pestaña. */
const vistaDeHash = (actual: Vista = "planear"): Vista => {
  const h = window.location.hash
  if (h.startsWith("#reportar")) return "reportar"
  if (h.startsWith("#apoyo")) return "apoyo"
  if (h.startsWith("#mi-cuenta")) return "cuenta"
  if (h === "" || h === "#" || h.startsWith("#planner")) return "planear"
  return actual
}

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
  const [db, setDb] = useState<BaseDatos>(() => sembrarServicio(sembrarOperacion(sembrarDemo(leer<BaseDatos>(CLAVE_DB, baseVacia()), Date.now()), Date.now()), Date.now()))
  const [sesion, setSesionState] = useState<Sesion | null>(() => leer<Sesion | null>(CLAVE_SESION, null))
  const [consulta, setConsulta] = useState<ConsultaRuta | null>(null)
  const [preseleccion, setPreseleccion] = useState<{ station: string; equipmentId: string; n: number } | null>(null)
  const [apoyoEn, setApoyoEn] = useState<{ station: string; n: number } | null>(null)
  const [avisoAbierto, setAvisoAbierto] = useState(false)
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const [reloj, setReloj] = useState(() => Date.now())
  const [vista, setVista] = useState<Vista>(() => vistaDeHash())
  const [paso, setPaso] = useState<Paso>(1)
  const [mapaAbierto, setMapaAbierto] = useState(false)
  const tituloPaso = useRef<HTMLHeadingElement>(null)
  const primerRender = useRef(true)

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
    const hash = () => setVista((v) => vistaDeHash(v))
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    window.addEventListener("hashchange", hash)
    const t = window.setInterval(() => setReloj(Date.now()), 60_000)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
      window.removeEventListener("hashchange", hash)
      window.clearInterval(t)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.remove("ui-font-large", "ui-font-xlarge")
    if (fontScale === "large") document.documentElement.classList.add("ui-font-large")
    if (fontScale === "xlarge") document.documentElement.classList.add("ui-font-xlarge")
  }, [fontScale])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  // Al cambiar de paso, el foco va al título del paso para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false
      return
    }
    tituloPaso.current?.focus()
  }, [paso])

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

  const irA = (v: Vista) => {
    const destino = VISTAS.find((x) => x.id === v)!.href
    if (window.location.hash !== destino) window.location.hash = destino
    setVista(v)
    window.scrollTo(0, 0)
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
  const reportarEquipo = (eq: EquipoRuta) => {
    setPreseleccion({ station: eq.station, equipmentId: eq.id, n: Date.now() })
    irA("reportar")
  }
  const reportarEstacion = (station: string) => {
    setPreseleccion({ station, equipmentId: equiposDeEstacion(station)[0]?.id ?? "", n: Date.now() })
    irA("reportar")
  }

  const avanzar = () => {
    if (paso === 3) buscar()
    if (paso === 4) {
      setPaso(1)
      setMapaAbierto(false)
      return
    }
    setPaso((paso + 1) as Paso)
  }

  const futuro = consulta ? consulta.tipoHora !== "salir_ahora" && (isoLocal(consulta.fecha) !== isoLocal(new Date()) || Math.abs(consulta.hora - minutosAhora()) > 60) : false
  const cuandoTexto = tipoHora === "salir_ahora" ? "Salir ahora" : `${tipoHora === "llegar_a" ? "Llegar" : "Salir"} el ${parseFecha(fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} a las ${formatoHora(hora)}`
  const fechaTexto = consulta
    ? `${consulta.fecha.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} · ${
        consulta.tipoHora === "llegar_a" ? `llegar a las ${formatoHora(consulta.hora)}` : `salir ${consulta.tipoHora === "salir_ahora" ? "ahora" : `a las ${formatoHora(consulta.hora)}`}`
      }`
    : ""
  const valida = esValida(ruta)
  const fechaMapa = consulta?.fecha ?? new Date()
  const horaMapa = ruta && valida ? ruta.salida : (consulta?.hora ?? minutosAhora())
  const pasoActual = PASOS[paso - 1]
  const mapaVisibleEnMovil = paso === 4 || (paso === 2 && mapaAbierto)
  const textoSiguiente = paso === 3 ? "Ver mi ruta" : paso === 4 ? "Planear otro viaje" : "Siguiente"
  const bloqueado = paso === 3 && !enLinea

  return (
    <div className={`min-h-screen bg-canvas text-ink ${highContrast ? "high-contrast" : ""}`}>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
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
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-4 px-4 lg:px-8">
          <a href="#planner" className="flex min-h-16 items-center gap-3 rounded-lg" onClick={() => setPaso(1)}>
            <span className="grid size-10 place-items-center rounded-lg bg-brand text-white shadow-soft">
              <Icon name="route" size="lg" />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">Metro Sin Barreras</span>
              <span className="hidden text-xs font-semibold text-ink-muted sm:block">Rutas accesibles en el Metro de la CDMX, sin crear cuenta</span>
            </span>
          </a>
          <button type="button" className="nav-link hidden md:flex" onClick={() => setAvisoAbierto(true)}>
            Aviso de privacidad
          </button>
        </div>
        <nav className="mx-auto max-w-screen-2xl px-4 pb-3 lg:px-8" aria-label="Secciones">
          <ul className="app-tabs">
            {VISTAS.map((v) => (
              <li key={v.id}>
                <a href={v.href} className={`app-tab ${vista === v.id ? "app-tab-active" : ""}`} aria-current={vista === v.id ? "page" : undefined} onClick={() => setVista(v.id)}>
                  {v.texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {!enLinea && (
        <div className="bg-warning-soft px-5 py-3 text-center text-sm font-bold text-warning" role="status">
          Sin conexión: la consulta de rutas y el envío de reportes no están disponibles. El botón de emergencia sí funciona.
        </div>
      )}

      <main id="contenido" tabIndex={-1} className="outline-none">
        {vista === "planear" && (
          <>
            <section id="planner" className="wizard-shell" aria-labelledby="paso-titulo">
              <div className="wizard-col">
                <ol className="wizard-steps" aria-label="Pasos para planear tu viaje">
                  {PASOS.map((p) => {
                    const hecho = p.n < paso
                    const actual = p.n === paso
                    return (
                      <li key={p.n}>
                        <button
                          type="button"
                          className={`wizard-step ${actual ? "wizard-step-current" : hecho ? "wizard-step-done" : ""}`}
                          aria-current={actual ? "step" : undefined}
                          disabled={!hecho}
                          onClick={() => setPaso(p.n)}
                        >
                          <span className="wizard-step-dot" aria-hidden="true">
                            {hecho ? <Icon name="check" size="sm" /> : p.n}
                          </span>
                          <span className="wizard-step-label">
                            <span className="sr-only">Paso {p.n}: </span>
                            {p.corto}
                            {hecho && <span className="sr-only"> (listo, puedes volver)</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>

                <div className="wizard-card">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                    Paso {paso} de {PASOS.length}
                  </p>
                  <h1 id="paso-titulo" ref={tituloPaso} tabIndex={-1} className="mt-1 text-2xl font-extrabold tracking-tight outline-none">
                    {paso === 4 ? `${origin} → ${destination}` : pasoActual.titulo}
                  </h1>
                  <p className="instructions mt-3">{pasoActual.ayuda}</p>

                  <div className="mt-4">
                    {paso === 1 && <ProfileChooser seleccion={perfiles} onChange={setPerfiles} />}

                    {paso === 2 && (
                      <>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="space-y-2">
                            <StationSearch label="Estación de origen" pin="A" value={origin} onChange={(s) => elegirEstacion(s, "origen")} />
                            <StationSearch label="Estación de destino" pin="B" value={destination} onChange={(s) => elegirEstacion(s, "destino")} />
                          </div>
                          <button type="button" onClick={swapStations} className="swap-button" aria-label="Intercambiar origen y destino" title="Intercambiar origen y destino">
                            <Icon name="swap" />
                          </button>
                        </div>
                        <button type="button" className="secondary-button mt-3 w-full lg:hidden" aria-expanded={mapaAbierto} aria-controls="mapa-red" onClick={() => setMapaAbierto(!mapaAbierto)}>
                          <Icon name="location" size="sm" /> {mapaAbierto ? "Ocultar el mapa" : "Elegir en el mapa"}
                        </button>
                        <p className="mt-2 hidden text-sm text-ink-muted lg:block">También puedes tocar una estación en el mapa de la derecha.</p>
                      </>
                    )}

                    {paso === 3 && (
                      <>
                        <TimePicker tipo={tipoHora} fecha={fecha} hora={hora} onTipo={cambiarTipo} onFecha={cambiarFecha} onHora={setHora} />
                        {!enLinea && <p className="mt-3 text-sm font-bold text-warning">Sin conexión: no se puede calcular la ruta.</p>}
                      </>
                    )}

                    {paso === 4 && (
                      <>
                        <dl className="trip-summary">
                          {[
                            { dt: "Perfil", dd: resumenPerfiles(perfiles), paso: 1 as Paso },
                            { dt: "Estaciones", dd: `${origin} → ${destination}`, paso: 2 as Paso },
                            { dt: "Hora", dd: cuandoTexto, paso: 3 as Paso },
                          ].map((x) => (
                            <div key={x.dt} className="trip-summary-row">
                              <dt>{x.dt}</dt>
                              <dd>{x.dd}</dd>
                              <dd>
                                <button type="button" className="text-sm font-bold text-brand underline" onClick={() => setPaso(x.paso)}>
                                  Cambiar<span className="sr-only"> {x.dt.toLowerCase()}</span>
                                </button>
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {ruta ? (
                          <div className="mt-4 space-y-3">
                            <div className="overflow-hidden rounded-lg border-2 border-border">
                              <RouteSummary ruta={ruta} origen={origin} destino={destination} />
                            </div>
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
                              onPedirApoyo={(station) => {
                                setApoyoEn({ station, n: Date.now() })
                                irA("apoyo")
                              }}
                              peticion={peticion}
                              fechaTexto={fechaTexto}
                              futuro={futuro}
                            />
                          </div>
                        ) : (
                          <p className="callout callout-warning" role="status">
                            <Icon name="alert" size="sm" className="mt-0.5" />
                            {enLinea ? "Calculando tu ruta…" : "Sin conexión: no se puede calcular la ruta."}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="wizard-actions">
                    {paso > 1 && paso < 4 && (
                      <button type="button" className="secondary-button min-h-12 flex-1" onClick={() => setPaso((paso - 1) as Paso)}>
                        Atrás
                      </button>
                    )}
                    <button type="button" className="primary-button min-h-12 flex-[2]" onClick={avanzar} disabled={bloqueado}>
                      {textoSiguiente}
                      {paso < 4 && <Icon name="arrow-right" size="sm" />}
                    </button>
                  </div>
                  {paso === 1 && <p className="mt-3 text-xs text-ink-muted">Consultar no requiere cuenta.</p>}
                </div>
              </div>

              <div id="mapa-red" className={`wizard-map ${mapaVisibleEnMovil ? "wizard-map-visible" : ""}`}>
                <div className="map-title-bar">
                  <h2 className="text-sm font-extrabold">{paso === 4 ? "Tu ruta en el mapa" : "Mapa de la red"}</h2>
                  <p className="text-xs text-ink-muted">12 líneas y 163 estaciones · toca una estación para elegirla</p>
                </div>
                <div className="relative min-h-0 flex-1">
                  <MetroMap
                    origen={origin}
                    destino={destination}
                    ruta={valida && paso === 4 ? ruta : null}
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
                  {valida && paso === 4 && ruta!.transbordos > 0 && (
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
          </>
        )}

        {vista === "reportar" && (
          <div className="mx-auto max-w-screen-xl px-4 pb-12 lg:px-8">
            <section className="service-panel">
              <Reports db={db} actualizar={actualizar} sesion={sesion} setSesion={setSesion} preseleccion={preseleccion} onAviso={() => setAvisoAbierto(true)} />
            </section>
          </div>
        )}

        {vista === "cuenta" && (
          <div className="mx-auto max-w-screen-2xl px-4 py-6 pb-12 lg:px-8">
            <MiCuenta db={db} actualizar={actualizar} sesion={sesion} setSesion={setSesion} onAviso={() => setAvisoAbierto(true)} onReportarEquipo={reportarEstacion} />
          </div>
        )}

        {vista === "apoyo" && (
          <div className="mx-auto max-w-screen-xl px-4 pb-12 lg:px-8">
            <section className="service-panel">
              <Apoyo db={db} actualizar={actualizar} enLinea={enLinea} preseleccion={apoyoEn} />
            </section>
          </div>
        )}
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
