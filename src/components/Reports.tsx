import { useEffect, useState, type FormEvent } from "react"
import { equipoPorId, equiposDeEstacion, todosLosEquipos } from "../data/accessibility"
import { allStations } from "../data/metroData"
import { ErrorEvidencia, guardarFoto, MAX_FOTOS, procesarFoto, type FotoProcesada } from "../lib/evidence"
import {
  confiabilidad,
  ESTADO_REPORTADO_LABEL,
  estadoComunitario,
  registrarEvento,
  registrarReporte,
  RETENCION_EVIDENCIA,
  seudonimo,
  VERSION_AVISO,
  type BaseDatos,
  type EstadoReportado,
} from "../lib/reports"
import { Icon } from "./Icon"
import { Dialog } from "./ui"

export type Sesion = { seudonimo: string; nivel: "Llave" | "Llave Verificada"; expira: number }

const CUENTAS_PRUEBA: Array<{ sub: string; nombre: string; nivel: Sesion["nivel"] }> = [
  { sub: "usuario-prueba-1", nombre: "Cuenta de prueba 1", nivel: "Llave" },
  { sub: "usuario-prueba-2", nombre: "Cuenta de prueba 2", nivel: "Llave Verificada" },
  { sub: "usuario-prueba-3", nombre: "Cuenta de prueba 3", nivel: "Llave" },
]

export function Reports({
  db,
  actualizar,
  sesion,
  setSesion,
  preseleccion,
  onAviso,
}: {
  db: BaseDatos
  actualizar: (fn: (db: BaseDatos) => void) => void
  sesion: Sesion | null
  setSesion: (s: Sesion | null) => void
  preseleccion: { station: string; equipmentId: string; n: number } | null
  onAviso: () => void
}) {
  const [loginAbierto, setLoginAbierto] = useState(false)
  const [station, setStation] = useState("Tacubaya")
  const [equipmentId, setEquipmentId] = useState(equiposDeEstacion("Tacubaya")[0]?.id ?? "")
  const [estado, setEstado] = useState<EstadoReportado>("no_funciona")
  const [fotos, setFotos] = useState<FotoProcesada[]>([])
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [consiente, setConsiente] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const ahora = Date.now()
  const activa = sesion && sesion.expira > ahora ? sesion : null
  const usuario = activa ? db.usuarios[activa.seudonimo] : undefined

  useEffect(() => {
    if (!preseleccion) return
    setStation(preseleccion.station)
    setEquipmentId(preseleccion.equipmentId)
    setMensaje(null)
    document.getElementById("reportar")?.scrollIntoView({ behavior: "smooth" })
  }, [preseleccion])

  const equipos = equiposDeEstacion(station)

  const iniciarSesion = async (cuenta: (typeof CUENTAS_PRUEBA)[number]) => {
    // Solo se conservan el seudónimo y el nivel; el identificador original se descarta (RF-19).
    const seud = await seudonimo(cuenta.sub)
    actualizar((d) => {
      if (!d.usuarios[seud]) d.usuarios[seud] = { seudonimo: seud, nivel: cuenta.nivel, verificado: false, alta: Date.now() }
      registrarEvento(d, { evento: "inicio de sesión", objeto: seud.slice(0, 10), decision: `nivel ${cuenta.nivel}`, rol: "sistema" }, Date.now())
    })
    setSesion({ seudonimo: seud, nivel: cuenta.nivel, expira: Date.now() + 60 * 60_000 })
    setLoginAbierto(false)
  }

  const verificar = () => {
    if (!activa || !consiente) return
    actualizar((d) => {
      const u = d.usuarios[activa.seudonimo]
      u.verificado = true
      u.consentimiento = { fecha: Date.now(), version: VERSION_AVISO }
      registrarEvento(d, { evento: "verificación Tarjeta Incluyente", objeto: activa.seudonimo.slice(0, 10), decision: "vigente (simulado), con consentimiento", rol: "sistema" }, Date.now())
    })
  }

  const revocar = () => {
    if (!activa) return
    actualizar((d) => {
      const u = d.usuarios[activa.seudonimo]
      u.verificado = false
      delete u.consentimiento
      registrarEvento(d, { evento: "revocación del consentimiento", objeto: activa.seudonimo.slice(0, 10), decision: "bandera borrada", rol: "persona usuaria" }, Date.now())
    })
    setConsiente(false)
  }

  const darseDeBaja = () => {
    if (!activa) return
    actualizar((d) => {
      delete d.usuarios[activa.seudonimo]
      d.reportes.forEach((r) => {
        if (r.seudonimo === activa.seudonimo) r.seudonimo = "anonimizado"
      })
      registrarEvento(d, { evento: "baja de cuenta", objeto: "seudónimo suprimido", decision: "reportes anonimizados", rol: "persona usuaria" }, Date.now())
    })
    setSesion(null)
    setMensaje({ ok: true, texto: "Tu cuenta se dio de baja. Tus reportes se conservan sin tu seudónimo." })
  }

  const elegirFotos = async (archivos: FileList | null) => {
    if (!archivos) return
    setMensaje(null)
    setProcesando(true)
    const nuevas: FotoProcesada[] = []
    for (const archivo of Array.from(archivos).slice(0, MAX_FOTOS - fotos.length)) {
      try {
        nuevas.push(await procesarFoto(archivo))
      } catch (e) {
        const texto = e instanceof ErrorEvidencia ? e.message : "No pudimos leer esa imagen. Intenta con otra foto JPEG o WebP."
        setMensaje({ ok: false, texto })
      }
    }
    if (archivos.length > MAX_FOTOS - fotos.length) setMensaje({ ok: false, texto: `Puedes adjuntar como máximo ${MAX_FOTOS} fotos por reporte.` })
    setFotos((f) => [...f, ...nuevas])
    setProcesando(false)
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    let resultado: ReturnType<typeof registrarReporte> | null = null
    const copia = structuredClone(db)
    resultado = registrarReporte(copia, activa, { station, equipmentId, estado, hashesFotos: fotos.map((f) => f.sha256) }, Date.now())
    if (resultado.ok) {
      const reporte = copia.reportes[0]
      for (const [i, f] of fotos.entries()) {
        const id = `${reporte.id}-F${i + 1}`
        await guardarFoto(id, f.blob)
        copia.evidencias.push({
          id,
          reporteId: reporte.id,
          formato: f.formato,
          bytes: f.bytes,
          ancho: f.ancho,
          alto: f.alto,
          sha256: f.sha256,
          borrarEn: Date.now() + RETENCION_EVIDENCIA,
          repetida: reporte.motivoCuarentena === "Foto repetida de otro reporte",
        })
        reporte.evidencias.push(id)
      }
      setFotos([])
    }
    actualizar((d) => Object.assign(d, copia))
    setMensaje({ ok: resultado.ok, texto: `${resultado.mensaje} (HTTP ${resultado.codigo})` })
  }

  const misReportes = activa ? db.reportes.filter((r) => r.seudonimo === activa.seudonimo).slice(0, 6) : []
  const comunitarios = todosLosEquipos
    .map((eq) => ({ eq, com: estadoComunitario(db, eq.id, ahora) }))
    .filter((x) => x.com.estado === "incierto" || x.com.estado === "confirmado")

  const estadoReporte = (id: string) => {
    const r = db.reportes.find((x) => x.id === id)!
    if (r.moderacion === "rechazado") return { texto: "Rechazado en moderación", tono: "status-danger" }
    if (r.cuarentena) return { texto: "En revisión", tono: "status-warning" }
    const com = estadoComunitario(db, r.equipmentId, ahora)
    if (com.estado === "confirmado") return { texto: "Confirmado por la comunidad", tono: "status-danger" }
    if (com.estado === "restablecido") return { texto: "Funciona de nuevo", tono: "status-success" }
    if (com.estado === "incierto") return { texto: "En validación comunitaria", tono: "status-warning" }
    return { texto: "Recibido", tono: "status-success" }
  }

  return (
    <div id="reportar" className="scroll-mt-24">
      <div className="report-intro">
        <span className="status-icon bg-brand-soft text-brand">
          <Icon name="people" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand">Comunidad</p>
          <h2 className="mt-1 text-2xl font-extrabold">Reportar un equipo fuera de servicio</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
            Para evitar reportes falsos, reportar requiere iniciar sesión con Llave CDMX. Un reporte no cambia el estado del equipo por sí solo: se marca “incierto” y se confirma cuando 3 personas distintas reportan la misma falla en 6 horas (2 si una tiene la Tarjeta Incluyente verificada).
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <div className="space-y-5">
          {!activa ? (
            <div className="report-form">
              <div className="flex items-start gap-3">
                <span className="status-icon bg-surface text-brand">
                  <Icon name="lock" />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold">Inicia sesión para reportar</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Consultar rutas no requiere cuenta. Al iniciar sesión solo guardamos un seudónimo; no guardamos tu nombre, CURP, correo ni teléfono.{" "}
                    <button type="button" className="font-bold text-brand underline" onClick={onAviso}>
                      Aviso de privacidad
                    </button>
                  </p>
                </div>
              </div>
              <button type="button" className="primary-button w-full" onClick={() => setLoginAbierto(true)}>
                <Icon name="user" /> Iniciar sesión con Llave CDMX
              </button>
              <p className="text-xs text-ink-muted">En este prototipo el inicio de sesión es simulado: no se conecta con Llave CDMX ni pide contraseñas.</p>
            </div>
          ) : (
            <div className="report-form">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-ink-muted">Mi cuenta</p>
                  <p className="font-extrabold">
                    Seudónimo {activa.seudonimo.slice(0, 10)}… · {activa.nivel}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Sesión válida hasta las {new Date(activa.expira).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })} · confiabilidad{" "}
                    {Math.round(confiabilidad(db, activa.seudonimo) * 100)} %
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="secondary-button" onClick={() => setSesion(null)}>
                    Cerrar sesión
                  </button>
                  <button type="button" className="secondary-button" onClick={darseDeBaja}>
                    Darme de baja
                  </button>
                </div>
              </div>
              <div className="rounded-xl border-2 border-border bg-white p-4">
                <h3 className="font-extrabold">Verificación con Tarjeta Incluyente (opcional)</h3>
                {usuario?.verificado ? (
                  <>
                    <p className="mt-1 text-sm text-success">
                      <Icon name="shield" size="sm" className="mr-1 inline" />
                      Verificada (simulado) el {new Date(usuario.consentimiento!.fecha).toLocaleDateString("es-MX")}. Tus reportes tienen más peso en la validación.
                    </p>
                    <button type="button" className="mt-2 text-sm font-extrabold text-brand underline" onClick={revocar}>
                      Revocar mi consentimiento
                    </button>
                  </>
                ) : (
                  <>
                    <label className="mt-2 flex items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-brand" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} />
                      <span>
                        Acepto de forma expresa que se verifique la vigencia de mi Tarjeta Incluyente. Entiendo que este dato revela una condición de discapacidad (dato personal sensible), que solo se guardará que la verificación fue exitosa —no el número de la tarjeta— y que puedo revocar mi consentimiento en cualquier momento.
                      </span>
                    </label>
                    <button type="button" className="secondary-button mt-3" disabled={!consiente} onClick={verificar}>
                      Verificar (simulado)
                    </button>
                  </>
                )}
              </div>

              <form className="space-y-5" onSubmit={enviar}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="report-field">
                    <label className="field-label" htmlFor="reporte-estacion">Estación</label>
                    <select
                      id="reporte-estacion"
                      className="field-select"
                      value={station}
                      onChange={(e) => {
                        setStation(e.target.value)
                        setEquipmentId(equiposDeEstacion(e.target.value)[0]?.id ?? "")
                      }}
                    >
                      {allStations.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="report-field">
                    <label className="field-label" htmlFor="reporte-equipo">Equipo</label>
                    <select id="reporte-equipo" className="field-select" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} disabled={equipos.length === 0}>
                      {equipos.length === 0 && <option value="">Esta estación no tiene equipos registrados</option>}
                      {equipos.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.tipo} · {eq.ubicacion}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <fieldset>
                  <legend className="field-label">¿Qué observaste?</legend>
                  <div className="report-status-options">
                    {(Object.keys(ESTADO_REPORTADO_LABEL) as EstadoReportado[]).map((k) => (
                      <label key={k} className={`report-radio ${estado === k ? (k === "funciona" ? "report-radio-success report-radio-active" : "report-radio-danger report-radio-active") : ""}`}>
                        <input type="radio" name="estado" checked={estado === k} onChange={() => setEstado(k)} />
                        {ESTADO_REPORTADO_LABEL[k]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <span className="field-label">Foto como evidencia (opcional)</span>
                  <label className={`secondary-button inline-flex ${fotos.length >= MAX_FOTOS ? "pointer-events-none opacity-50" : ""}`}>
                    <Icon name="camera" /> {procesando ? "Procesando…" : "Adjuntar foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/webp"
                      capture="environment"
                      multiple
                      className="sr-only"
                      disabled={fotos.length >= MAX_FOTOS}
                      onChange={(e) => {
                        void elegirFotos(e.target.files)
                        e.target.value = ""
                      }}
                    />
                  </label>
                  <p className="mt-2 text-xs text-ink-muted">
                    Hasta 2 fotos JPEG o WebP. Se reducen a 1280 px y 1 MB, se les quita la ubicación y otros metadatos, solo las ve el equipo de moderación y se borran a los 90 días. No fotografíes personas.
                  </p>
                  {fotos.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-3">
                      {fotos.map((f, i) => (
                        <li key={f.sha256} className="w-36 rounded-xl border-2 border-border bg-white p-2 text-xs">
                          <img src={f.url} alt={`Foto adjunta ${i + 1}`} className="h-20 w-full rounded-lg object-cover" />
                          <p className="mt-1 font-bold">
                            {f.formato} · {(f.bytes / 1024).toFixed(0)} KB
                          </p>
                          <p className="text-ink-muted">
                            {f.ancho}×{f.alto} px · sin EXIF
                          </p>
                          <button type="button" className="font-bold text-danger underline" onClick={() => setFotos((x) => x.filter((_, j) => j !== i))}>
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button type="submit" className="primary-button w-full sm:w-auto" disabled={!equipmentId || procesando}>
                  Enviar reporte <Icon name="arrow-right" />
                </button>
              </form>
            </div>
          )}
          <p aria-live="polite" className={mensaje ? `rounded-xl p-3 text-sm font-bold ${mensaje.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}` : "sr-only"}>
            {mensaje?.texto}
          </p>
        </div>

        <div className="reports-feed">
          {activa && (
            <div className="mb-5">
              <h3 className="text-lg font-extrabold">Tus reportes</h3>
              {misReportes.length === 0 ? (
                <p className="text-sm text-ink-muted">Todavía no has enviado reportes.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {misReportes.map((r) => {
                    const st = estadoReporte(r.id)
                    const eq = equipoPorId(r.equipmentId)
                    return (
                      <li key={r.id} className="report-item">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-extrabold">
                              {eq?.tipo} · {r.station}
                            </p>
                            <p className="text-sm text-ink-muted">
                              {ESTADO_REPORTADO_LABEL[r.estado]} · {new Date(r.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })} h
                              {r.evidencias.length > 0 && ` · ${r.evidencias.length} foto(s)`}
                            </p>
                          </div>
                          <span className={`status-label ${st.tono}`}>
                            <span className="status-dot" />
                            {st.texto}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
          <h3 className="text-lg font-extrabold">Estado comunitario de los equipos</h3>
          <p className="text-sm text-ink-muted">Equipos con reportes vigentes de la comunidad (incluye ejemplos del prototipo).</p>
          {comunitarios.length === 0 ? (
            <div className="empty-reports mt-3">
              <p className="font-extrabold">Sin reportes vigentes</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {comunitarios.map(({ eq, com }) => (
                <li key={eq.id} className="report-item">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold">
                        {eq.tipo} · {eq.station}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {eq.ubicacion} · {com.personas} {com.personas === 1 ? "persona" : "personas"}
                        {com.venceEn && ` · vence ${new Date(com.venceEn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })} h`}
                      </p>
                    </div>
                    <span className={`status-label ${com.estado === "confirmado" ? "status-danger" : "status-warning"}`}>
                      <span className="status-dot" />
                      {com.estado === "confirmado" ? "Fuera de servicio (comunidad)" : "Incierto"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="data-note mt-4">Los reportes no modifican el estado oficial del STC. Un equipo confirmado deja de usarse en las rutas para silla de ruedas; uno incierto se marca “Accesible con apoyo”.</p>
        </div>
      </div>

      <Dialog open={loginAbierto} onClose={() => setLoginAbierto(false)} title="Proveedor de identidad (simulación)">
        <p className="text-sm leading-relaxed">
          En la versión final, este botón te lleva a Llave CDMX, el servicio de identidad digital del Gobierno de la Ciudad de México, que devuelve a Metro Sin Barreras solo un identificador y el nivel de tu cuenta. La integración real requiere la autorización de la ADIP, por eso en el prototipo se usa un proveedor simulado con cuentas de prueba.
        </p>
        <p className="mt-3 rounded-xl bg-warning-soft p-3 text-sm font-bold text-warning">No escribas aquí tu contraseña real de Llave CDMX: esta pantalla no la pide ni la necesita.</p>
        <ul className="mt-4 space-y-2">
          {CUENTAS_PRUEBA.map((c) => (
            <li key={c.sub}>
              <button type="button" className="option-row w-full text-left" onClick={() => void iniciarSesion(c)}>
                <span className="option-icon">
                  <Icon name="user" />
                </span>
                <span className="flex-1">
                  <span className="block font-bold">{c.nombre}</span>
                  <span className="block text-sm text-ink-muted">Nivel: {c.nivel}</span>
                </span>
                <Icon name="arrow-right" />
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}
