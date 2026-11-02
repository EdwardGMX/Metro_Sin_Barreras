/**
 * Piezas compartidas de la consola y el módulo de Moderación de la Mesa de
 * atención y reportes.
 */
import { type ReactNode } from "react"
import { equipoPorId } from "../../data/accessibility"
import { auditar, rolesTexto, puede, type Cuenta } from "../../lib/admin"
import { borrarFotos } from "../../lib/evidence"
import { ESTADO_REPORTADO_LABEL, moderar } from "../../lib/reports"
import { Foto } from "../Moderation"
import type { Ctx } from "./AdminApp"

const fechaHora = (ts: number) =>
  new Date(ts).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
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


export function Estado({ tono, children }: { tono: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = tono === "ok" ? "status-success" : tono === "warn" ? "status-warning" : tono === "bad" ? "status-danger" : "bg-surface text-ink"
  return (
    <span className={`status-label ${cls}`}>
      <span className="status-dot" />
      {children}
    </span>
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

