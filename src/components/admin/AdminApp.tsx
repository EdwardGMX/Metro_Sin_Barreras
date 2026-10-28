/**
 * Consola del personal (HU-23 a HU-30). Ruta: #/consola
 * En producción es un servicio aparte en Cloud Run protegido por Identity-Aware Proxy.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  cuentaVigente,
  estadoInicial,
  iniciarSesion,
  modulosVisibles,
  rolesTexto,
  sesionValida,
  DOMINIO,
  INACTIVIDAD,
  ROLES,
  TIPO_LABEL,
  type Cuenta,
  type EstadoConsola,
  type ModuloId,
  type Resultado,
  type SesionPersonal,
} from "../../lib/admin"
import { baseVacia, sembrarDemo, type BaseDatos } from "../../lib/reports"
import { guardar, leer, borrar } from "../../lib/storage"
import { Icon } from "../Icon"
import { Bitacora, Contenidos, Cuentas, Datos, Modelos, ModeracionConsola, Plataforma, Privacidad } from "./Modulos"
import { MiTablero } from "./Tablero"

export const CLAVE_CONSOLA = "msb.consola.v1"
const CLAVE_SESION_PERSONAL = "msb.consola.sesion"
const CLAVE_DB = "msb.db.v1"

export type Ctx = {
  estado: EstadoConsola
  cuenta: Cuenta
  db: BaseDatos
  ahora: number
  ejecutar: (fn: (e: EstadoConsola, now: number) => Resultado) => Resultado
  actualizarDb: (fn: (db: BaseDatos, e: EstadoConsola, now: number) => void) => void
  ir: (m: ModuloId) => void
}

function cargarEstado(): EstadoConsola {
  const guardado = leer<EstadoConsola | null>(CLAVE_CONSOLA, null)
  return guardado && Array.isArray(guardado.cuentas) ? guardado : estadoInicial(Date.now())
}

export default function AdminApp() {
  const [estado, setEstado] = useState<EstadoConsola>(cargarEstado)
  const [db, setDb] = useState<BaseDatos>(() => sembrarDemo(leer<BaseDatos>(CLAVE_DB, baseVacia()), Date.now()))
  const [sesion, setSesion] = useState<SesionPersonal | null>(() => leer<SesionPersonal | null>(CLAVE_SESION_PERSONAL, null))
  const [modulo, setModulo] = useState<ModuloId>("inicio")
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [cerradaPorInactividad, setCerradaPorInactividad] = useState(false)

  const persistir = useCallback((e: EstadoConsola) => {
    setEstado(e)
    guardar(CLAVE_CONSOLA, e)
  }, [])

  useEffect(() => {
    document.title = "Consola del personal · Metro Sin Barreras"
    const t = window.setInterval(() => setAhora(Date.now()), 15_000)
    return () => {
      window.clearInterval(t)
      document.title = "Metro Sin Barreras"
    }
  }, [])

  const cuenta = sesion ? estado.cuentas.find((c) => c.id === sesion.cuentaId) : undefined
  const activa = Boolean(sesion && cuenta && sesionValida(sesion, ahora))

  // Cierre automático por inactividad o vigencia máxima.
  useEffect(() => {
    if (sesion && !sesionValida(sesion, ahora)) {
      const copia = structuredClone(estado)
      if (cuenta) {
        copia.auditoria.unshift({
          id: `AU-${ahora.toString(36).toUpperCase()}-${copia.auditoria.length}`,
          ts: ahora,
          actor: `${cuenta.nombre} <${cuenta.correo}>`,
          rol: rolesTexto(cuenta),
          accion: "cierre de sesión automático",
          objeto: "consola",
          resultado: "permitido",
          detalle: "inactividad",
        })
      }
      persistir(copia)
      setSesion(null)
      borrar(CLAVE_SESION_PERSONAL)
      setCerradaPorInactividad(true)
    }
  }, [ahora, sesion, cuenta, estado, persistir])

  const tocar = useCallback(() => {
    if (!sesion) return
    const s = { ...sesion, ultimaActividad: Date.now() }
    setSesion(s)
    guardar(CLAVE_SESION_PERSONAL, s)
  }, [sesion])

  const ejecutar = useCallback(
    (fn: (e: EstadoConsola, now: number) => Resultado): Resultado => {
      const copia = structuredClone(estado)
      const now = Date.now()
      const r = fn(copia, now)
      persistir(copia)
      setAviso({ ok: r.ok, texto: r.mensaje })
      tocar()
      return r
    },
    [estado, persistir, tocar],
  )

  const actualizarDb = useCallback(
    (fn: (d: BaseDatos, e: EstadoConsola, now: number) => void) => {
      const copiaDb = structuredClone(db)
      const copia = structuredClone(estado)
      const now = Date.now()
      fn(copiaDb, copia, now)
      setDb(copiaDb)
      guardar(CLAVE_DB, copiaDb)
      persistir(copia)
      tocar()
    },
    [db, estado, persistir, tocar],
  )

  const visibles = useMemo(() => (cuenta ? modulosVisibles(cuenta, ahora) : []), [cuenta, ahora])
  const ir = (m: ModuloId) => {
    setModulo(m)
    setAviso(null)
    tocar()
    window.requestAnimationFrame(() => document.getElementById("consola-contenido")?.focus())
  }

  const cerrarSesion = () => {
    if (cuenta) {
      const copia = structuredClone(estado)
      copia.auditoria.unshift({
        id: `AU-${Date.now().toString(36).toUpperCase()}-${copia.auditoria.length}`,
        ts: Date.now(),
        actor: `${cuenta.nombre} <${cuenta.correo}>`,
        rol: rolesTexto(cuenta),
        accion: "cierre de sesión",
        objeto: "consola",
        resultado: "permitido",
      })
      persistir(copia)
    }
    setSesion(null)
    borrar(CLAVE_SESION_PERSONAL)
    setModulo("inicio")
    setAviso(null)
  }

  const reiniciarDemo = () => {
    const e = estadoInicial(Date.now())
    persistir(e)
    setSesion(null)
    borrar(CLAVE_SESION_PERSONAL)
    setModulo("inicio")
    setAviso({ ok: true, texto: "Se restauraron los datos de demostración de la consola." })
  }

  if (!activa || !cuenta) {
    return (
      <LoginPersonal
        estado={estado}
        cerradaPorInactividad={cerradaPorInactividad}
        onIntento={(correo, mfaOk) => {
          const copia = structuredClone(estado)
          const r = iniciarSesion(copia, correo, mfaOk, Date.now())
          persistir(copia)
          if (r.ok) {
            setSesion(r.sesion)
            guardar(CLAVE_SESION_PERSONAL, r.sesion)
            setModulo("inicio")
            setCerradaPorInactividad(false)
            setAviso(null)
          }
          return r.ok ? null : r.mensaje
        }}
        onReiniciar={reiniciarDemo}
        aviso={aviso}
      />
    )
  }

  const ctx: Ctx = { estado, cuenta, db, ahora, ejecutar, actualizarDb, ir }
  const actual = visibles.some((m) => m.id === modulo) ? modulo : "inicio"
  const minutosRestantes = Math.max(0, Math.ceil((sesion!.ultimaActividad + INACTIVIDAD - ahora) / 60_000))

  return (
    <div className="min-h-screen bg-canvas text-ink" onKeyDown={tocar} onPointerDown={tocar}>
      <a href="#consola-contenido" className="skip-link">
        Saltar al contenido
      </a>
      <div className="admin-banner" role="note">
        Prototipo: la autenticación y los datos son de demostración. En producción la consola es un servicio aparte protegido por Identity-Aware Proxy, solo para cuentas de Cloud Identity con verificación en dos pasos.
      </div>
      <header className="app-header max-lg:static">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-2 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-ink text-white shadow-soft">
              <Icon name="shield" size="lg" />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">Consola del personal</span>
              <span className="block text-xs font-semibold text-ink-muted">Metro Sin Barreras · acceso restringido</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-left text-sm sm:text-right">
              <p className="font-extrabold">{cuenta.nombre}</p>
              <p className="text-xs text-ink-muted">
                {rolesTexto(cuenta)} · {TIPO_LABEL[cuenta.tipo]}
                {cuenta.vence ? ` · vence ${cuenta.vence}` : ""}
              </p>
              <p className="text-xs text-ink-muted">La sesión se cierra tras {minutosRestantes} min sin actividad</p>
            </div>
            <button type="button" className="secondary-button" onClick={cerrarSesion}>
              <Icon name="lock" size="sm" /> Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Módulos de la consola">
          <p className="admin-nav-title">Tus módulos</p>
          <ul className="admin-nav-list">
            {visibles.map((m) => (
              <li key={m.id}>
                <button type="button" className={`admin-nav-link ${actual === m.id ? "admin-nav-link-active" : ""}`} aria-current={actual === m.id ? "page" : undefined} onClick={() => ir(m.id)}>
                  {m.nombre}
                </button>
              </li>
            ))}
          </ul>
          <p className="admin-nav-note">Solo ves los módulos de tu rol. Cada acción queda en la bitácora de auditoría.</p>
          <a href="#planner" className="admin-nav-back">
            ← Volver a la app pública
          </a>
        </nav>

        <main id="consola-contenido" tabIndex={-1} className="admin-main">
          <div aria-live="polite" role="status" className="min-h-0">
            {aviso && (
              <p className={`callout ${aviso.ok ? "callout-success" : "callout-warning"} mb-4 mt-0`}>
                <Icon name={aviso.ok ? "check" : "alert"} size="sm" className="mt-0.5" />
                {aviso.texto}
              </p>
            )}
          </div>
          {actual === "inicio" && <MiTablero key={cuenta.id} ctx={ctx} />}
          {actual === "cuentas" && <Cuentas ctx={ctx} />}
          {actual === "plataforma" && <Plataforma ctx={ctx} />}
          {actual === "datos" && <Datos ctx={ctx} />}
          {actual === "modelos" && <Modelos ctx={ctx} />}
          {actual === "moderacion" && <ModeracionConsola ctx={ctx} />}
          {actual === "privacidad" && <Privacidad ctx={ctx} />}
          {actual === "contenidos" && <Contenidos ctx={ctx} />}
          {actual === "bitacora" && <Bitacora ctx={ctx} />}
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function LoginPersonal({
  estado,
  onIntento,
  onReiniciar,
  cerradaPorInactividad,
  aviso,
}: {
  estado: EstadoConsola
  onIntento: (correo: string, mfaOk: boolean) => string | null
  onReiniciar: () => void
  cerradaPorInactividad: boolean
  aviso: { ok: boolean; texto: string } | null
}) {
  const [correo, setCorreo] = useState("")
  const [paso, setPaso] = useState<"cuenta" | "codigo">("cuenta")
  const [codigoEsperado, setCodigoEsperado] = useState("")
  const [codigo, setCodigo] = useState("")
  const [error, setError] = useState<string | null>(null)

  const continuar = (e?: FormEvent, correoElegido?: string) => {
    e?.preventDefault()
    const c = (correoElegido ?? correo).trim()
    if (!c) {
      setError("Escribe tu correo institucional o elige una cuenta de demostración.")
      return
    }
    setCorreo(c)
    const registrada = estado.cuentas.find((x) => x.correo.toLowerCase() === c.toLowerCase())
    if (!registrada || !cuentaVigente(registrada, Date.now()).ok) {
      setError(onIntento(c, true))
      return
    }
    setCodigoEsperado(String(Math.floor(100000 + Math.random() * 900000)))
    setCodigo("")
    setError(null)
    setPaso("codigo")
  }

  const verificar = (e: FormEvent) => {
    e.preventDefault()
    const msg = onIntento(correo, codigo.replace(/\s/g, "") === codigoEsperado)
    if (msg) {
      setError(msg)
      if (!msg.includes("código")) setPaso("cuenta")
    }
  }

  const grupos: Array<[string, Cuenta[]]> = [
    ["Equipo del proyecto", estado.cuentas.filter((c) => c.tipo === "interno" && c.estado === "activa")],
    ["Especialistas externos (cuenta temporal)", estado.cuentas.filter((c) => c.tipo === "externo")],
    ["Cliente", estado.cuentas.filter((c) => c.tipo === "cliente")],
    ["Ejemplos de acceso denegado", estado.cuentas.filter((c) => c.estado === "suspendida")],
  ]

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="admin-banner" role="note">
        Prototipo: la autenticación es simulada; no se conecta con Cloud Identity ni pide contraseñas.
      </div>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.1fr] lg:px-8">
        <section aria-labelledby="login-titulo">
          <span className="grid size-12 place-items-center rounded-2xl bg-ink text-white shadow-soft">
            <Icon name="shield" size="lg" />
          </span>
          <h1 id="login-titulo" className="mt-4 text-3xl font-extrabold tracking-tight">
            Consola del personal
          </h1>
          <p className="mt-2 text-ink-muted">
            Acceso solo para las personas que operan Metro Sin Barreras. Las personas usuarias no necesitan cuenta: consultan rutas en la app pública.
          </p>
          {cerradaPorInactividad && (
            <p className="callout callout-warning" role="status">
              <Icon name="clock" size="sm" className="mt-0.5" />
              Tu sesión se cerró tras 15 minutos sin actividad.
            </p>
          )}
          {aviso && (
            <p className={`callout ${aviso.ok ? "callout-success" : "callout-warning"}`} role="status">
              {aviso.texto}
            </p>
          )}

          <div className="admin-card mt-6">
            {paso === "cuenta" ? (
              <form onSubmit={continuar} noValidate>
                <h2 className="text-lg font-extrabold">1. Cuenta institucional</h2>
                <label htmlFor="correo-personal" className="field-label mt-3">
                  Correo @{DOMINIO}
                </label>
                <input
                  id="correo-personal"
                  type="email"
                  autoComplete="username"
                  className="field-select font-semibold"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  aria-describedby={error ? "login-error" : undefined}
                />
                <button type="submit" className="primary-button mt-4 w-full">
                  Continuar con Cloud Identity
                </button>
              </form>
            ) : (
              <form onSubmit={verificar} noValidate>
                <h2 className="text-lg font-extrabold">2. Verificación en dos pasos</h2>
                <p className="mt-1 text-sm text-ink-muted">{correo}</p>
                <p className="mt-3 rounded-xl bg-brand-soft p-3 text-sm font-bold text-brand-dark">
                  Demostración: tu aplicación de autenticación mostraría el código <span className="font-mono text-base tracking-widest">{codigoEsperado}</span>
                </p>
                <label htmlFor="codigo-mfa" className="field-label mt-3">
                  Código de 6 dígitos
                </label>
                <input
                  id="codigo-mfa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  className="field-select font-mono text-lg tracking-widest"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  aria-describedby={error ? "login-error" : undefined}
                  autoFocus
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="submit" className="primary-button flex-1">
                    Verificar e ingresar
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setPaso("cuenta")}>
                    Otra cuenta
                  </button>
                </div>
              </form>
            )}
            {error && (
              <p id="login-error" className="callout callout-warning" role="alert">
                <Icon name="alert" size="sm" className="mt-0.5" />
                {error}
              </p>
            )}
          </div>
          <a href="#planner" className="mt-6 inline-block font-bold text-brand underline">
            ← Volver a la app pública
          </a>
        </section>

        <section aria-labelledby="demo-titulo" className="admin-card">
          <h2 id="demo-titulo" className="text-lg font-extrabold">
            Cuentas de demostración
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Elige una para recorrer la consola con los permisos de ese rol.</p>
          {grupos.map(([titulo, cuentas]) =>
            cuentas.length ? (
              <div key={titulo} className="mt-4">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-ink-muted">{titulo}</h3>
                <ul className="mt-2 space-y-2">
                  {cuentas.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="admin-account" onClick={() => continuar(undefined, c.correo)}>
                        <span className="font-extrabold">{c.nombre}</span>
                        <span className="text-xs text-ink-muted">
                          {c.roles.map((r) => ROLES[r].nombre).join(" · ")}
                          {c.vence ? ` · vence ${c.vence}` : ""}
                          {c.estado === "suspendida" ? " · suspendida" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                  {titulo.startsWith("Ejemplos") && (
                    <li>
                      <button type="button" className="admin-account" onClick={() => continuar(undefined, "persona.usuaria@gmail.com")}>
                        <span className="font-extrabold">persona.usuaria@gmail.com</span>
                        <span className="text-xs text-ink-muted">Cuenta no registrada: IAP la rechaza</span>
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ) : null,
          )}
          <button type="button" className="secondary-button mt-5" onClick={onReiniciar}>
            Restaurar datos de demostración
          </button>
        </section>
      </main>
    </div>
  )
}
