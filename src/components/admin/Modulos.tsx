import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { equipoPorId } from "../../data/accessibility"
import { allStations } from "../../data/metroData"
import {
  altaCuenta,
  auditar,
  bitacoraCsv,
  calidadHomologacion,
  cambiarEstadoCuenta,
  cambiarRoles,
  decidirContenido,
  diasHabiles,
  evaluarPublicacion,
  proponerContenido,
  publicarModelo,
  puede,
  recertificar,
  reintentarEjecucion,
  resolverExcepcion,
  responderArco,
  revertirDespliegue,
  revertirModelo,
  revisarTerminologia,
  rolesTexto,
  sugerirEstacion,
  sumaPerfilHorario,
  DOMINIO,
  F1_MINIMO,
  ORDEN_ROLES,
  PLAZO_ARCO,
  REFERENCIA,
  ROLES,
  ROLES_DE_ESTACION,
  TIPO_LABEL,
  type Cuenta,
  type RolId,
  type TipoCuenta,
} from "../../lib/admin"
import { borrarFotos } from "../../lib/evidence"
import { aplicarRetencion, ESTADO_REPORTADO_LABEL, moderar, VERSION_AVISO } from "../../lib/reports"
import { Icon } from "../Icon"
import { Foto } from "../Moderation"
import type { Ctx } from "./AdminApp"

/* ------------------------------------------------------------------ */
/* Utilidades de presentación                                          */
/* ------------------------------------------------------------------ */

const fechaHora = (ts: number) =>
  new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
const fecha = (ts: number) => new Date(ts).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
const pct = (n: number) => `${(n * 100).toFixed(1)} %`
const actorDe = (c: Cuenta) => ({ actor: `${c.nombre} <${c.correo}>`, rol: rolesTexto(c) })

export function Encabezado({ eyebrow, titulo, children }: { eyebrow: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-bold uppercase tracking-widest text-brand">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{titulo}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm text-ink-muted">{children}</div>}
    </div>
  )
}

export function Tarjeta({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="admin-card" aria-label={titulo}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

function Kpi({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: "ok" | "warn" | "bad" }) {
  const color = tono === "ok" ? "text-success" : tono === "warn" ? "text-warning" : tono === "bad" ? "text-danger" : "text-ink"
  return (
    <div className="admin-kpi">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-ink-muted">{nota}</p>}
    </div>
  )
}

export function Estado({ tono, children }: { tono: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = tono === "ok" ? "status-success" : tono === "warn" ? "status-warning" : tono === "bad" ? "status-danger" : "bg-surface text-ink"
  return (
    <span className={`status-label ${cls}`}>
      <span className="status-dot" />
      {children}
    </span>
  )
}

function SoloLectura({ texto }: { texto: string }) {
  return (
    <p className="callout mt-0 mb-4">
      <Icon name="eye" size="sm" className="mt-0.5" />
      {texto}
    </p>
  )
}

function Demo({ texto }: { texto: string }) {
  return <p className="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-xs font-bold text-warning">{texto}</p>
}

/* ------------------------------------------------------------------ */
/* Cuentas y roles (Administración de la plataforma)                   */
/* ------------------------------------------------------------------ */

export function Cuentas({ ctx }: { ctx: Ctx }) {
  const { estado, cuenta, ahora, ejecutar } = ctx
  const gestiona = puede(cuenta, "cuentas.gestionar", ahora)
  const [editando, setEditando] = useState<string | null>(null)
  const [rolesEdit, setRolesEdit] = useState<RolId[]>([])
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const [suspendiendo, setSuspendiendo] = useState<string | null>(null)
  const pendientes = estado.revocaciones.filter((r) => r.estado === "pendiente")

  return (
    <>
      <Encabezado eyebrow="Administración de la plataforma" titulo="Cuentas y roles">
        Cada cuenta es institucional (@{DOMINIO}, Cloud Identity) y entra con verificación en dos pasos. Las cuentas externas vencen con su contrato.
      </Encabezado>
      {!gestiona && <SoloLectura texto="Consulta de solo lectura para recertificar accesos. Las altas, bajas y cambios de rol los hace Administración de la plataforma." />}

      {gestiona && pendientes.length > 0 && (
        <div className="mb-5">
          <Tarjeta titulo={`Solicitudes de revocación (${pendientes.length})`}>
            <ul className="space-y-3">
              {pendientes.map((r) => {
                const c = estado.cuentas.find((x) => x.id === r.cuentaId)
                return (
                  <li key={r.id} className="report-item">
                    <p className="font-extrabold">{c?.nombre}</p>
                    <p className="text-sm text-ink-muted">
                      Solicitada por {r.solicitadaPor} el {fechaHora(r.ts)}: {r.motivo}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="secondary-button" onClick={() => ejecutar((e, now) => cambiarEstadoCuenta(e, cuenta, r.cuentaId, "suspendida", `Revocación solicitada por Gobernanza: ${r.motivo}`, now))}>
                        Suspender cuenta
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          ejecutar((e, now) => {
                            const s = e.revocaciones.find((x) => x.id === r.id)
                            if (s) s.estado = "rechazada"
                            auditar(e, { ...actorDe(cuenta), accion: "revocación rechazada", objeto: c?.correo ?? r.cuentaId, resultado: "permitido" }, now)
                            return { ok: true, mensaje: "Solicitud rechazada; queda registrada en la bitácora." }
                          })
                        }
                      >
                        Rechazar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Tarjeta>
        </div>
      )}

      <Tarjeta titulo={`Cuentas del personal (${estado.cuentas.length})`}>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento">
          <table className="admin-table">
            <caption className="sr-only">Cuentas del personal con sus roles y estado</caption>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Tipo</th>
                <th scope="col">Roles</th>
                <th scope="col">Estado</th>
                <th scope="col">Último acceso</th>
                {gestiona && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {estado.cuentas.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    {c.nombre}
                    <span className="block text-xs font-normal text-ink-muted">{c.correo}</span>
                    <span className="block text-xs font-normal text-ink-muted">{c.puesto}</span>
                  </th>
                  <td>
                    {TIPO_LABEL[c.tipo]}
                    {c.vence && <span className="block text-xs text-ink-muted">vence {c.vence}</span>}
                  </td>
                  <td>
                    {editando === c.id ? (
                      <fieldset>
                        <legend className="sr-only">Roles de {c.nombre}</legend>
                        {ORDEN_ROLES.map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={rolesEdit.includes(r)}
                              onChange={(ev) => setRolesEdit(ev.target.checked ? [...rolesEdit, r] : rolesEdit.filter((x) => x !== r))}
                            />
                            {ROLES[r].nombre}
                          </label>
                        ))}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="secondary-button min-h-9"
                            onClick={() => {
                              const r = ejecutar((e, now) => cambiarRoles(e, cuenta, c.id, rolesEdit, now))
                              if (r.ok) setEditando(null)
                            }}
                          >
                            Guardar
                          </button>
                          <button type="button" className="secondary-button min-h-9" onClick={() => setEditando(null)}>
                            Cancelar
                          </button>
                        </div>
                      </fieldset>
                    ) : (
                      c.roles.map((r) => ROLES[r].nombre).join(", ")
                    )}
                  </td>
                  <td>
                    {c.estado === "activa" ? <Estado tono="ok">Activa</Estado> : <Estado tono="bad">Suspendida</Estado>}
                    {c.motivoSuspension && <span className="mt-1 block text-xs text-ink-muted">{c.motivoSuspension}</span>}
                  </td>
                  <td className="whitespace-nowrap">{c.ultimoAcceso ? fechaHora(c.ultimoAcceso) : "—"}</td>
                  {gestiona && (
                    <td>
                      {c.id === cuenta.id ? (
                        <span className="text-xs text-ink-muted">Tu cuenta (no editable por ti)</span>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            className="secondary-button min-h-9"
                            onClick={() => {
                              setEditando(c.id)
                              setRolesEdit(c.roles)
                            }}
                          >
                            Cambiar roles
                          </button>
                          {c.estado === "activa" ? (
                            suspendiendo === c.id ? (
                              <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold" htmlFor={`motivo-${c.id}`}>
                                  Motivo de la suspensión
                                </label>
                                <input
                                  id={`motivo-${c.id}`}
                                  className="field-select min-h-9 text-sm font-semibold"
                                  value={motivo[c.id] ?? ""}
                                  onChange={(ev) => setMotivo({ ...motivo, [c.id]: ev.target.value })}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="secondary-button min-h-9"
                                  onClick={() => {
                                    const r = ejecutar((e, now) => cambiarEstadoCuenta(e, cuenta, c.id, "suspendida", motivo[c.id] ?? "", now))
                                    if (r.ok) setSuspendiendo(null)
                                  }}
                                >
                                  Confirmar suspensión
                                </button>
                                <button type="button" className="secondary-button min-h-9" onClick={() => setSuspendiendo(null)}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button type="button" className="secondary-button min-h-9" onClick={() => setSuspendiendo(c.id)}>
                                Suspender…
                              </button>
                            )
                          ) : (
                            <button type="button" className="secondary-button min-h-9" onClick={() => ejecutar((e, now) => cambiarEstadoCuenta(e, cuenta, c.id, "activa", "", now))}>
                              Reactivar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {gestiona && (
        <div className="mt-5">
          <AltaCuenta ctx={ctx} />
        </div>
      )}
    </>
  )
}

function AltaCuenta({ ctx }: { ctx: Ctx }) {
  const { cuenta, ejecutar } = ctx
  const [nombre, setNombre] = useState("")
  const [usuario, setUsuario] = useState("")
  const [puesto, setPuesto] = useState("")
  const [tipo, setTipo] = useState<TipoCuenta>("interno")
  const [vence, setVence] = useState("")
  const [roles, setRoles] = useState<RolId[]>([])
  const [estacion, setEstacion] = useState("")
  const deEstacion = roles.some((r) => ROLES_DE_ESTACION.includes(r))

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    const r = ejecutar((e, now) =>
      altaCuenta(
        e,
        cuenta,
        { nombre, correo: `${usuario.trim()}@${DOMINIO}`, puesto, roles, tipo, vence: tipo === "externo" ? vence : undefined, estaciones: deEstacion && estacion ? [estacion] : undefined },
        now,
      ),
    )
    if (r.ok) {
      setNombre("")
      setUsuario("")
      setPuesto("")
      setRoles([])
      setVence("")
    }
  }

  return (
    <Tarjeta titulo="Alta de cuenta">
      <form onSubmit={enviar} className="grid gap-4 md:grid-cols-2" noValidate>
        <div>
          <label className="field-label" htmlFor="alta-nombre">
            Nombre de la persona
          </label>
          <input id="alta-nombre" className="field-select font-semibold" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="alta-usuario">
            Usuario institucional
          </label>
          <div className="flex items-center gap-2">
            <input id="alta-usuario" className="field-select font-semibold" value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-describedby="alta-dominio" />
            <span id="alta-dominio" className="whitespace-nowrap text-sm font-bold text-ink-muted">
              @{DOMINIO}
            </span>
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="alta-puesto">
            Función
          </label>
          <input id="alta-puesto" className="field-select font-semibold" value={puesto} onChange={(e) => setPuesto(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="alta-tipo">
              Tipo de cuenta
            </label>
            <select id="alta-tipo" className="field-select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)}>
              {(Object.keys(TIPO_LABEL) as TipoCuenta[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {tipo === "externo" && (
            <div>
              <label className="field-label" htmlFor="alta-vence">
                Vence (fin del contrato)
              </label>
              <input id="alta-vence" type="date" className="field-select" value={vence} onChange={(e) => setVence(e.target.value)} />
            </div>
          )}
        </div>
        <fieldset className="md:col-span-2">
          <legend className="field-label">Roles</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ORDEN_ROLES.map((r) => (
              <label key={r} className={`option-row ${roles.includes(r) ? "option-row-active" : ""}`}>
                <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />
                <span>
                  <span className="block text-sm font-extrabold">{ROLES[r].nombre}</span>
                  <span className="block text-xs text-ink-muted">{ROLES[r].descripcion}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">La consola rechaza combinaciones incompatibles (RN9) y las cuentas externas sin vencimiento.</p>
        </fieldset>
        {deEstacion && (
          <div>
            <label className="field-label" htmlFor="alta-estacion">
              Estación asignada
            </label>
            <select id="alta-estacion" className="field-select" value={estacion} onChange={(e) => setEstacion(e.target.value)}>
              <option value="">Elige la estación</option>
              {allStations.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <div className="md:col-span-2">
          <button type="submit" className="primary-button">
            Dar de alta
          </button>
        </div>
      </form>
    </Tarjeta>
  )
}

/* ------------------------------------------------------------------ */
/* Plataforma                                                          */
/* ------------------------------------------------------------------ */

const SERVICIOS = [
  ["API pública de ruteo y reportes", "Cloud Run · us-central1 · sin cuenta para consultar", "Operando"],
  ["Consola del personal", "Cloud Run con Identity-Aware Proxy", "Operando"],
  ["Trabajos por lotes", "Cloud Run Jobs + Cloud Scheduler (4 trabajos)", "Operando"],
  ["Datos operativos", "Firestore (modo nativo)", "Operando"],
  ["Datos analíticos y evidencias", "Cloud Storage con versionado; depósito privado de evidencias", "Operando"],
  ["Secretos", "Secret Manager (clave del seudónimo, firma de tokens)", "Operando"],
] as const

export function Plataforma({ ctx }: { ctx: Ctx }) {
  const { estado, cuenta, ahora, ejecutar } = ctx
  const opera = puede(cuenta, "plataforma.operar", ahora)
  const servicios = [...new Set(estado.despliegues.map((d) => d.servicio))]
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  return (
    <>
      <Encabezado eyebrow="Administración de la plataforma" titulo="Plataforma">
        Estado de los servicios, revisiones desplegadas y costo. Esta vista no muestra secretos ni datos de personas.
      </Encabezado>
      <Demo texto="Estados y revisiones de demostración. En producción se leen de Cloud Monitoring y de las revisiones de Cloud Run." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SERVICIOS.map(([n, d, s]) => (
          <div key={n} className="admin-kpi">
            <div className="flex items-start justify-between gap-2">
              <p className="font-extrabold">{n}</p>
              <Estado tono="ok">{s}</Estado>
            </div>
            <p className="mt-1 text-xs text-ink-muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {servicios.map((s) => (
          <Tarjeta key={s} titulo={s}>
            <ul className="space-y-2">
              {estado.despliegues
                .filter((d) => d.servicio === s)
                .map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-3 text-sm">
                    <span>
                      <span className="font-mono font-bold">{d.id}</span> · {d.nota}
                      <span className="block text-xs text-ink-muted">{fechaHora(d.ts)}</span>
                    </span>
                    {d.estado === "vigente" ? <Estado tono="ok">Vigente</Estado> : <Estado tono="neutral">Anterior</Estado>}
                  </li>
                ))}
            </ul>
            {opera && (
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`rev-${s}`}>
                  Motivo de la reversión de {s}
                </label>
                <input id={`rev-${s}`} className="field-select min-h-11 flex-1 text-sm font-semibold" placeholder="Motivo de la reversión" value={motivo[s] ?? ""} onChange={(e) => setMotivo({ ...motivo, [s]: e.target.value })} />
                <button type="button" className="secondary-button" onClick={() => ejecutar((e, now) => revertirDespliegue(e, cuenta, s, motivo[s] ?? "", now))}>
                  Revertir a la anterior
                </button>
              </div>
            )}
          </Tarjeta>
        ))}
      </div>
      <div className="mt-5">
        <Tarjeta titulo="Costo mensual estimado del piloto">
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi etiqueta="Sin instancia mínima" valor="USD 0.45" nota="Niveles gratuitos + zona de Cloud DNS" tono="ok" />
            <Kpi etiqueta="Con instancia mínima" valor="USD 10.17" nota="Evita el arranque en frío (RNF-01)" />
            <Kpi etiqueta="Alerta de presupuesto" valor="USD 15" nota="Aviso por correo al rebasarla (RD-07)" />
          </div>
          <p className="mt-3 text-xs text-ink-muted">La consola agrega solo el dominio institucional (USD 20 al año) y su zona de Cloud DNS (USD 0.20 al mes): IAP en Cloud Run no tiene cargo adicional y Cloud Identity Free incluye 50 cuentas con verificación en dos pasos.</p>
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export function Datos({ ctx }: { ctx: Ctx }) {
  const { estado, cuenta, ahora, ejecutar } = ctx
  const opera = puede(cuenta, "datos.operar", ahora)
  const calidad = calidadHomologacion(estado)
  const sumas = sumaPerfilHorario()
  const [eleccion, setEleccion] = useState<Record<string, string>>({})
  return (
    <>
      <Encabezado eyebrow="Ingeniería de datos" titulo="Datos">
        Ingesta de afluencia, captura diaria del inventario y calidad de los datos (ISO 25012). Ninguna fuente contiene datos personales.
      </Encabezado>
      {!opera && <SoloLectura texto="Consulta de solo lectura. Reintentar ejecuciones y resolver excepciones corresponde a Ingeniería de datos." />}
      <Demo texto="Ejecuciones y nombres de demostración, con los casos reales detectados en el inventario del STC (nombres abreviados y registros sin línea)." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Homologación automática" valor={pct(calidad.automatica)} tono={calidad.automatica >= 0.95 ? "ok" : "bad"} nota="Umbral ≥ 95 % (RNF-11)" />
        <Kpi etiqueta="Tras revisión manual" valor={pct(calidad.final)} tono={calidad.final === 1 ? "ok" : "warn"} nota={`Meta 100 %; ${calidad.pendientes} pendientes`} />
        <Kpi etiqueta="Atípicos en entrenamiento" valor="0" tono="ok" nota="Pandemia y cierres de líneas excluidos" />
        <Kpi etiqueta="Capturas con marca de tiempo" valor="100 %" tono="ok" nota="0 sobrescrituras del histórico" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo="Trabajos programados">
          <ul className="space-y-3">
            {[...estado.ejecuciones]
              .sort((a, b) => b.ts - a.ts)
              .map((x) => (
                <li key={x.id} className="report-item">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-extrabold">{x.trabajo}</p>
                    <Estado tono={x.resultado === "éxito" ? "ok" : "bad"}>{x.resultado === "éxito" ? "Éxito" : "Falla"}</Estado>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {x.programa} · {fechaHora(x.ts)}
                  </p>
                  <p className="mt-1 text-sm">{x.detalle}</p>
                  {opera && x.resultado === "falla" && !estado.ejecuciones.some((y) => y.trabajo === x.trabajo && y.ts > x.ts) && (
                    <button type="button" className="secondary-button mt-2 min-h-9" onClick={() => ejecutar((e, now) => reintentarEjecucion(e, cuenta, x.id, now))}>
                      Reintentar con el esquema corregido
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </Tarjeta>

        <Tarjeta titulo={`Excepciones de homologación (${calidad.pendientes} pendientes)`}>
          <p className="mb-3 text-sm text-ink-muted">Nombres que no coincidieron automáticamente entre afluencia, inventario y red (CA-04.2). Se conserva el dato original.</p>
          <ul className="space-y-3">
            {estado.excepciones.map((x) => {
              const sug = sugerirEstacion(x.original).station
              const valor = eleccion[x.id] ?? sug
              return (
                <li key={x.id} className="report-item">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-mono font-bold">«{x.original}»</p>
                    {x.estado === "resuelta" ? <Estado tono="ok">→ {x.station}</Estado> : <Estado tono="warn">Pendiente</Estado>}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {x.fuente} · {x.detalle}
                    {x.resueltaPor ? ` · resolvió ${x.resueltaPor}` : ""}
                  </p>
                  {x.estado === "pendiente" && opera && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-48 flex-1">
                        <label className="field-label mb-1 text-xs" htmlFor={`exc-${x.id}`}>
                          Estación del catálogo (sugerida: {sug})
                        </label>
                        <select id={`exc-${x.id}`} className="field-select min-h-10 text-sm" value={valor} onChange={(e) => setEleccion({ ...eleccion, [x.id]: e.target.value })}>
                          {allStations.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="secondary-button min-h-10" onClick={() => ejecutar((e, now) => resolverExcepcion(e, cuenta, x.id, valor, now))}>
                        Confirmar
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
        <Tarjeta titulo="Perfil horario (RNF-22)">
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento">
            <table className="admin-table">
              <caption className="sr-only">Suma de las fracciones del perfil horario por tipo de día</caption>
              <thead>
                <tr>
                  <th scope="col">Tipo de día</th>
                  <th scope="col">Suma de fracciones</th>
                  <th scope="col">Criterio 1 ± 0.001</th>
                  <th scope="col">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(sumas).map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k.replace("_", " ")}</th>
                    <td className="font-mono">{v.toFixed(4)}</td>
                    <td>{Math.abs(v - 1) <= 0.001 ? <Estado tono="ok">Cumple</Estado> : <Estado tono="bad">No cumple</Estado>}</td>
                    <td>Perfil ilustrativo (en producción: EOD 2017 o STC)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Modelos                                                             */
/* ------------------------------------------------------------------ */

export function Modelos({ ctx }: { ctx: Ctx }) {
  const { estado, cuenta, ahora, ejecutar } = ctx
  const publica = puede(cuenta, "modelos.publicar", ahora)
  const vigente = estado.modelos.find((m) => m.estado === "vigente")
  const candidatos = estado.modelos.filter((m) => m.estado === "candidato")
  const [motivo, setMotivo] = useState("")
  return (
    <>
      <Encabezado eyebrow="Ciencia de datos e IA" titulo="Modelos de saturación">
        Un modelo nuevo se publica solo si tiene F1 macro ≥ {F1_MINIMO}, supera por 0.02 a la referencia y al vigente, y no reduce el recall de la clase alta (HU-09).
      </Encabezado>
      {!publica && <SoloLectura texto="Consulta de solo lectura. Publicar y revertir corresponde a Ciencia de datos e IA." />}
      <Demo texto="Métricas de demostración: el entrenamiento real ocurre en el Sprint 2 (HU-08). La regla de publicación sí es la que aplicará la API." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Vigente" valor={vigente?.id ?? "—"} nota={vigente?.algoritmo} />
        <Kpi etiqueta="F1 macro vigente" valor={vigente ? vigente.f1Macro.toFixed(2) : "—"} tono="ok" />
        <Kpi etiqueta="Recall clase alta" valor={vigente ? vigente.recallAlta.toFixed(2) : "—"} />
        <Kpi etiqueta="Referencia" valor={REFERENCIA.f1Macro.toFixed(2)} nota={REFERENCIA.nombre} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo="Candidatos">
          {candidatos.length === 0 && <p className="text-sm text-ink-muted">No hay candidatos.</p>}
          <ul className="space-y-3">
            {candidatos.map((m) => {
              const ev = evaluarPublicacion(m, vigente)
              return (
                <li key={m.id} className="report-item">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-mono font-bold">{m.id}</p>
                    {ev.ok ? <Estado tono="ok">Cumple la regla</Estado> : <Estado tono="bad">No cumple</Estado>}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {m.algoritmo} · F1 macro {m.f1Macro.toFixed(2)} · recall alta {m.recallAlta.toFixed(2)} · exactitud {m.exactitud.toFixed(2)}
                  </p>
                  {!ev.ok && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-danger">
                      {ev.motivos.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                  {publica && (
                    <button type="button" className="secondary-button mt-2 min-h-9" disabled={!ev.ok} onClick={() => ejecutar((e, now) => publicarModelo(e, cuenta, m.id, now))}>
                      Publicar como vigente
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {publica && (
            <div className="mt-4 border-t-2 border-border pt-4">
              <label className="field-label" htmlFor="motivo-reversion">
                Revertir al modelo anterior
              </label>
              <div className="flex flex-wrap gap-2">
                <input id="motivo-reversion" className="field-select min-h-11 flex-1 text-sm font-semibold" placeholder="Motivo (por ejemplo, degradación en la Línea A)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <button type="button" className="secondary-button" onClick={() => ejecutar((e, now) => revertirModelo(e, cuenta, motivo, now))}>
                  Revertir
                </button>
              </div>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="F1 por línea del modelo vigente (revisión de sesgos)">
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento">
            <table className="admin-table">
              <caption className="sr-only">F1 macro por línea del modelo vigente</caption>
              <thead>
                <tr>
                  <th scope="col">Línea</th>
                  <th scope="col">F1</th>
                  <th scope="col">Revisión</th>
                </tr>
              </thead>
              <tbody>
                {vigente &&
                  Object.entries(vigente.f1PorLinea).map(([l, v]) => (
                    <tr key={l}>
                      <th scope="row">Línea {l}</th>
                      <td className="font-mono">{v.toFixed(2)}</td>
                      <td>{v < F1_MINIMO ? <Estado tono="warn">Revisar</Estado> : <Estado tono="ok">Sin alerta</Estado>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Las líneas con menos historia o con cierres prolongados (A, 12) se vigilan aparte, como pide la reflexión ética del rol.</p>
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Moderación                                                          */
/* ------------------------------------------------------------------ */

export function ModeracionConsola({ ctx }: { ctx: Ctx }) {
  const { db, cuenta, ahora, actualizarDb } = ctx
  const decide = puede(cuenta, "moderacion.decidir", ahora)
  const cola = db.reportes.filter((r) => r.moderacion === "pendiente")
  const decidir = (id: string, evidencias: string[], decision: "aprobado" | "rechazado") => {
    if (decision === "rechazado") void borrarFotos(evidencias)
    actualizarDb((d, e, now) => {
      moderar(d, id, decision, now)
      if (decision === "rechazado") {
        d.evidencias = d.evidencias.filter((x) => x.reporteId !== id)
        const rep = d.reportes.find((x) => x.id === id)
        if (rep) rep.evidencias = []
      }
      auditar(e, { ...actorDe(cuenta), accion: `moderación: ${decision}`, objeto: id, resultado: "permitido" }, now)
    })
  }
  return (
    <>
      <Encabezado eyebrow="Moderación de reportes" titulo="Cola de revisión">
        Llegan aquí los reportes con foto, con foto repetida o de cuentas con baja confiabilidad. Las fotos solo se ven en este módulo y se borran a los 90 días.
      </Encabezado>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Tarjeta titulo={`Reportes por revisar (${cola.length})`}>
          {cola.length === 0 ? (
            <p className="text-sm text-ink-muted">No hay reportes pendientes.</p>
          ) : (
            <ul className="space-y-3">
              {cola.map((r) => (
                <li key={r.id} className="report-item">
                  <p className="font-extrabold">
                    {equipoPorId(r.equipmentId)?.tipo} · {r.station}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {ESTADO_REPORTADO_LABEL[r.estado]} · {r.id} · seudónimo {r.seudonimo.slice(0, 6)}… · {fechaHora(r.ts)}
                  </p>
                  {r.motivoCuarentena && <p className="mt-1 text-sm font-bold text-warning">{r.motivoCuarentena}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.evidencias.length ? r.evidencias.map((id) => <Foto key={id} id={id} />) : <span className="text-xs text-ink-muted">Sin foto adjunta</span>}
                  </div>
                  {decide && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="secondary-button" onClick={() => decidir(r.id, r.evidencias, "aprobado")}>
                        Aprobar
                      </button>
                      <button type="button" className="secondary-button" onClick={() => decidir(r.id, r.evidencias, "rechazado")}>
                        Rechazar y borrar fotos
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Eventos del sistema de reportes">
          <ul className="max-h-[28rem] space-y-2 overflow-auto">
            {db.bitacora.slice(0, 20).map((b, i) => (
              <li key={i} className="rounded-xl bg-canvas p-2 text-sm">
                <span className="font-bold">{b.evento}</span> · {b.decision}
                <span className="block text-xs text-ink-muted">
                  {fechaHora(b.ts)} · {b.objeto}
                </span>
              </li>
            ))}
            {db.bitacora.length === 0 && <li className="text-sm text-ink-muted">Aún no hay eventos.</li>}
          </ul>
        </Tarjeta>
      </div>
      <p className="mt-4 text-xs text-ink-muted">Moderar no cambia el estado oficial del STC: un reporte aprobado solo cuenta para la validación comunitaria (RN5).</p>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Privacidad                                                          */
/* ------------------------------------------------------------------ */

export function Privacidad({ ctx }: { ctx: Ctx }) {
  const { estado, db, cuenta, ahora, ejecutar, actualizarDb } = ctx
  const arco = puede(cuenta, "privacidad.arco", ahora)
  const retencion = puede(cuenta, "privacidad.retencion", ahora)
  const recert = puede(cuenta, "accesos.recertificar", ahora)
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const usuarios = Object.values(db.usuarios)
  const verificados = usuarios.filter((u) => u.verificado)
  const evidenciasPorBorrar = db.evidencias.filter((x) => x.borrarEn > ahora).length
  const proxima = db.evidencias.map((x) => x.borrarEn).sort((a, b) => a - b)[0]

  return (
    <>
      <Encabezado eyebrow="Gobernanza y protección de datos" titulo="Privacidad">
        Solicitudes ARCO, consentimientos, retención y recertificación de accesos (LFPDPPP, 2025). Este módulo no muestra fotos ni el perfil de movilidad, que nunca sale del dispositivo.
      </Encabezado>
      {(!arco || !retencion) && <SoloLectura texto="Cuenta de consulta: puedes revisar y emitir recomendaciones; las respuestas y la retención las ejecuta el Oficial de Gobernanza." />}

      <Tarjeta titulo="Solicitudes ARCO">
        <p className="mb-3 text-sm text-ink-muted">Plazo para comunicar la respuesta: {PLAZO_ARCO} días hábiles desde la recepción; si procede, se hace efectiva en los 15 días hábiles siguientes (art. 31).</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla con desplazamiento">
          <table className="admin-table">
            <caption className="sr-only">Solicitudes de derechos ARCO</caption>
            <thead>
              <tr>
                <th scope="col">Folio</th>
                <th scope="col">Derecho</th>
                <th scope="col">Titular (seudónimo)</th>
                <th scope="col">Recibida</th>
                <th scope="col">Días hábiles</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {estado.arco.map((s) => {
                const dias = diasHabiles(s.recibida, s.respondida ?? ahora)
                return (
                  <tr key={s.id}>
                    <th scope="row">{s.id}</th>
                    <td>{s.tipo}</td>
                    <td className="font-mono">{s.seudonimo.slice(0, 6)}…</td>
                    <td>{fecha(s.recibida)}</td>
                    <td>
                      {s.estado === "pendiente" ? (
                        <Estado tono={dias >= 15 ? "bad" : dias >= 10 ? "warn" : "ok"}>
                          {dias} de {PLAZO_ARCO}
                        </Estado>
                      ) : (
                        `${dias}`
                      )}
                    </td>
                    <td>
                      {s.estado === "pendiente" ? (
                        arco ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="secondary-button min-h-9" onClick={() => ejecutar((e, now) => responderArco(e, cuenta, s.id, "procedente", now))}>
                              Procedente
                            </button>
                            <button type="button" className="secondary-button min-h-9" onClick={() => ejecutar((e, now) => responderArco(e, cuenta, s.id, "improcedente", now))}>
                              Improcedente
                            </button>
                          </div>
                        ) : (
                          <Estado tono="warn">Pendiente</Estado>
                        )
                      ) : (
                        <span className="text-sm">
                          {s.estado === "procedente" ? "Procedente" : "Improcedente"}
                          <span className="block text-xs text-ink-muted">
                            {s.respondidaPor} · {s.respondida ? fecha(s.respondida) : ""}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo="Consentimientos y retención">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi etiqueta="Cuentas que reportan" valor={String(usuarios.length)} nota="Solo seudónimo y nivel de cuenta" />
            <Kpi etiqueta="Tarjeta Incluyente verificada" valor={String(verificados.length)} nota={`Con consentimiento expreso (aviso ${VERSION_AVISO})`} />
            <Kpi etiqueta="Fotos por borrar" valor={String(evidenciasPorBorrar)} nota={proxima ? `Próximo borrado: ${fecha(proxima)}` : "Sin fotos almacenadas"} />
            <Kpi etiqueta="Bitácora de auditoría" valor={`${estado.auditoria.length} eventos`} nota="Se conserva 12 meses" />
          </div>
          {retencion && (
            <button
              type="button"
              className="secondary-button mt-4"
              onClick={() =>
                actualizarDb((d, e, now) => {
                  const vencidas = aplicarRetencion(d, now)
                  void borrarFotos(vencidas)
                  auditar(e, { ...actorDe(cuenta), accion: "ejecución de retención", objeto: "evidencias y reportes", resultado: "permitido", detalle: `${vencidas.length} fotos vencidas borradas; reportes de más de 12 meses anonimizados` }, now)
                })
              }
            >
              Ejecutar retención ahora
            </button>
          )}
          <p className="mt-3 text-xs text-ink-muted">En producción la retención es automática (reglas de ciclo de vida y TTL, RD-12); el botón sirve para auditarla.</p>
        </Tarjeta>

        <Tarjeta titulo="Recertificación de accesos">
          <p className="mb-3 text-sm text-ink-muted">Cada mes se confirma que cada cuenta sigue necesitando su acceso. Gobernanza no suspende cuentas: solicita la revocación a Administración (RN9).</p>
          <ul className="space-y-3">
            {estado.cuentas
              .filter((c) => c.id !== cuenta.id)
              .map((c) => {
                const ultima = estado.recertificaciones.find((r) => r.cuentaId === c.id)
                return (
                  <li key={c.id} className="report-item">
                    <p className="font-extrabold">{c.nombre}</p>
                    <p className="text-xs text-ink-muted">
                      {rolesTexto(c)} · {TIPO_LABEL[c.tipo]} · {c.estado === "activa" ? "activa" : "suspendida"}
                      {ultima ? ` · última recertificación: ${ultima.decision} (${fecha(ultima.ts)})` : " · sin recertificar este mes"}
                    </p>
                    {recert && c.estado === "activa" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="secondary-button min-h-9" onClick={() => ejecutar((e, now) => recertificar(e, cuenta, c.id, "mantener", "", now))}>
                          Mantener acceso
                        </button>
                        <label className="sr-only" htmlFor={`rv-${c.id}`}>
                          Motivo para revocar el acceso de {c.nombre}
                        </label>
                        <input id={`rv-${c.id}`} className="field-select min-h-9 flex-1 text-sm font-semibold" placeholder="Motivo para revocar" value={motivo[c.id] ?? ""} onChange={(e) => setMotivo({ ...motivo, [c.id]: e.target.value })} />
                        <button type="button" className="secondary-button min-h-9" onClick={() => ejecutar((e, now) => recertificar(e, cuenta, c.id, "revocar", motivo[c.id] ?? "", now))}>
                          Solicitar revocación
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
          </ul>
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Contenidos                                                          */
/* ------------------------------------------------------------------ */

export function Contenidos({ ctx }: { ctx: Ctx }) {
  const { estado, cuenta, ahora, ejecutar } = ctx
  const propone = puede(cuenta, "contenidos.proponer", ahora)
  const aprueba = puede(cuenta, "contenidos.aprobar", ahora)
  const pub = estado.contenido.publicado
  const b = estado.contenido.borrador
  const base = b?.estado === "devuelto" ? b : pub
  const [texto, setTexto] = useState(base.pasos.join("\n"))
  const [fuente, setFuente] = useState(base.fuente)
  const [obs, setObs] = useState("")
  useEffect(() => {
    setTexto(base.pasos.join("\n"))
    setFuente(base.fuente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub.version, b?.estado])
  const terminos = revisarTerminologia([texto])

  return (
    <>
      <Encabezado eyebrow="Accesibilidad y contenidos" titulo="Contenido de emergencia">
        Lo que muestra el botón de emergencia de la app, también sin conexión. Cada cambio lo propone Accesibilidad y contenidos y lo aprueba Gobernanza (doble control, RN9).
      </Encabezado>
      <div className="grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo={`Publicado · versión ${pub.version}`} accion={pub.ejemplo ? <Estado tono="warn">Contenido de ejemplo</Estado> : <Estado tono="ok">Fuente oficial</Estado>}>
          <ol className="space-y-2">
            {pub.pasos.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="step-number size-6 text-xs">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-ink-muted">
            Fuente: {pub.fuente} Actualizado: {pub.actualizado}
            {pub.aprobadoPor ? ` · aprobó ${pub.aprobadoPor}` : ""}
          </p>
        </Tarjeta>

        {b && b.estado === "en_revision" ? (
          <Tarjeta titulo="Propuesta en revisión" accion={<Estado tono="warn">Espera aprobación</Estado>}>
            <p className="text-xs text-ink-muted">
              Propuso {b.propuestoPor} · {fechaHora(b.ts)}
            </p>
            <ol className="mt-3 space-y-2">
              {b.pasos.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="step-number size-6 text-xs">{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-ink-muted">Fuente: {b.fuente}</p>
            {aprueba && (
              <div className="mt-4 space-y-2 border-t-2 border-border pt-4">
                <button type="button" className="primary-button w-full" onClick={() => ejecutar((e, now) => decidirContenido(e, cuenta, "aprobar", "", now))}>
                  Aprobar y publicar
                </button>
                <label className="field-label" htmlFor="obs-contenido">
                  Observaciones para devolver
                </label>
                <textarea id="obs-contenido" className="report-textarea w-full" value={obs} onChange={(e) => setObs(e.target.value)} />
                <button type="button" className="secondary-button" onClick={() => ejecutar((e, now) => decidirContenido(e, cuenta, "devolver", obs, now))}>
                  Devolver con observaciones
                </button>
              </div>
            )}
            {!aprueba && <p className="mt-3 text-sm font-bold text-ink-muted">Gobernanza revisará la vigencia de la fuente antes de publicar.</p>}
          </Tarjeta>
        ) : propone ? (
          <Tarjeta titulo={b?.estado === "devuelto" ? "Corregir propuesta devuelta" : "Proponer cambio"}>
            {b?.estado === "devuelto" && (
              <p className="callout callout-warning mt-0 mb-3">
                <Icon name="alert" size="sm" className="mt-0.5" />
                Observaciones de Gobernanza: {b.observaciones}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                ejecutar((est, now) => proponerContenido(est, cuenta, texto.split("\n"), fuente, now))
              }}
              noValidate
            >
              <label className="field-label" htmlFor="pasos-contenido">
                Pasos (uno por línea)
              </label>
              <textarea id="pasos-contenido" className="report-textarea min-h-56 w-full" value={texto} onChange={(e) => setTexto(e.target.value)} aria-describedby="terminos-estado" />
              <p id="terminos-estado" className={`mt-1 text-sm font-bold ${terminos.length ? "text-danger" : "text-success"}`}>
                {terminos.length ? `Términos a evitar (RNF-23): ${terminos.join(", ")}` : "Sin términos de la lista a evitar (RNF-23)."}
              </p>
              <label className="field-label mt-3" htmlFor="fuente-contenido">
                Fuente oficial y fecha de consulta
              </label>
              <input id="fuente-contenido" className="field-select font-semibold" value={fuente} onChange={(e) => setFuente(e.target.value)} />
              <button type="submit" className="primary-button mt-4 w-full">
                Enviar a aprobación
              </button>
            </form>
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Sin propuestas en revisión">
            <p className="text-sm text-ink-muted">Cuando Accesibilidad y contenidos envíe una propuesta, aparecerá aquí para su aprobación.</p>
          </Tarjeta>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Bitácora de auditoría                                               */
/* ------------------------------------------------------------------ */

export function Bitacora({ ctx }: { ctx: Ctx }) {
  const { estado } = ctx
  const [filtro, setFiltro] = useState<"todos" | "permitido" | "denegado">("todos")
  const [busca, setBusca] = useState("")
  const eventos = estado.auditoria.filter(
    (x) => (filtro === "todos" || x.resultado === filtro) && `${x.actor} ${x.accion} ${x.objeto} ${x.detalle ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
  )
  const exportar = () => {
    const blob = new Blob([bitacoraCsv(eventos)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "bitacora_auditoria_consola.csv"
    a.click()
    URL.revokeObjectURL(url)
  }
  const denegados = estado.auditoria.filter((x) => x.resultado === "denegado").length
  return (
    <>
      <Encabezado eyebrow="Gobernanza y protección de datos" titulo="Bitácora de auditoría">
        Registro de solo lectura de cada inicio de sesión y cada acción del personal, incluidos los intentos negados. Nadie puede editarlo ni borrarlo; se conserva 12 meses (RNF-24).
      </Encabezado>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Kpi etiqueta="Eventos" valor={String(estado.auditoria.length)} />
        <Kpi etiqueta="Accesos o acciones negadas" valor={String(denegados)} tono={denegados ? "warn" : "ok"} />
        <Kpi etiqueta="Cuentas activas" valor={String(estado.cuentas.filter((c) => c.estado === "activa").length)} />
      </div>
      <Tarjeta
        titulo="Eventos"
        accion={
          <button type="button" className="secondary-button min-h-9" onClick={exportar}>
            Exportar CSV
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-3">
          <div>
            <label className="field-label mb-1" htmlFor="filtro-resultado">
              Resultado
            </label>
            <select id="filtro-resultado" className="field-select min-h-10" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">Todos</option>
              <option value="permitido">Permitidos</option>
              <option value="denegado">Negados</option>
            </select>
          </div>
          <div className="min-w-56 flex-1">
            <label className="field-label mb-1" htmlFor="buscar-bitacora">
              Buscar
            </label>
            <input id="buscar-bitacora" className="field-select min-h-10 font-semibold" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="table-wrap max-h-[36rem]" tabIndex={0} role="region" aria-label="Tabla con desplazamiento">
          <table className="admin-table">
            <caption className="sr-only">Bitácora de auditoría de la consola</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Persona y rol</th>
                <th scope="col">Acción</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((x) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap">{fechaHora(x.ts)}</td>
                  <td>
                    {x.actor}
                    <span className="block text-xs text-ink-muted">{x.rol}</span>
                  </td>
                  <td>
                    {x.accion}
                    <span className="block text-xs text-ink-muted">
                      {x.objeto}
                      {x.detalle ? ` · ${x.detalle}` : ""}
                    </span>
                  </td>
                  <td>{x.resultado === "permitido" ? <Estado tono="ok">Permitido</Estado> : <Estado tono="bad">Negado</Estado>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </>
  )
}

