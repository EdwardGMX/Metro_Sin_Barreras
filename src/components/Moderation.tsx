import { useEffect, useState } from "react"
import { equipoPorId } from "../data/accessibility"
import { borrarFotos, leerFoto } from "../lib/evidence"
import { ESTADO_REPORTADO_LABEL, moderar, type BaseDatos } from "../lib/reports"

function Foto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    void leerFoto(id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b)
        setUrl(u)
      }
    })
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  return url ? <img src={url} alt="Evidencia del reporte" className="h-24 w-32 rounded-lg object-cover" /> : <span className="text-xs text-ink-muted">Foto no disponible en este navegador</span>
}

/** Panel de moderación (rol restringido, RNF-06). En el prototipo se muestra como demostración. */
export function Moderation({ db, actualizar }: { db: BaseDatos; actualizar: (fn: (db: BaseDatos) => void) => void }) {
  const cola = db.reportes.filter((r) => r.moderacion === "pendiente")
  return (
    <section className="service-panel" aria-labelledby="moderacion-titulo">
      <div className="service-panel-header">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand">Demostración del rol de moderación</p>
          <h2 id="moderacion-titulo" className="mt-1 text-2xl font-extrabold">
            Cola de revisión y bitácora
          </h2>
        </div>
        <p className="max-w-md text-sm text-ink-muted">En la versión final, solo el equipo de moderación accede a esta vista; las personas usuarias nunca ven las fotos de otras.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-extrabold">Reportes por revisar ({cola.length})</h3>
          {cola.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No hay reportes pendientes. Llegan aquí los reportes con foto, con foto repetida o de cuentas con baja confiabilidad.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {cola.map((r) => (
                <li key={r.id} className="report-item">
                  <p className="font-extrabold">
                    {equipoPorId(r.equipmentId)?.tipo} · {r.station}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {ESTADO_REPORTADO_LABEL[r.estado]} · {r.id} · seudónimo {r.seudonimo.slice(0, 8)}…{r.motivoCuarentena && ` · ${r.motivoCuarentena}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.evidencias.map((id) => (
                      <Foto key={id} id={id} />
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="secondary-button" onClick={() => actualizar((d) => moderar(d, r.id, "aprobado", Date.now()))}>
                      Aprobar
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void borrarFotos(r.evidencias)
                        actualizar((d) => {
                          moderar(d, r.id, "rechazado", Date.now())
                          d.evidencias = d.evidencias.filter((e) => e.reporteId !== r.id)
                          const rep = d.reportes.find((x) => x.id === r.id)
                          if (rep) rep.evidencias = []
                        })
                      }}
                    >
                      Rechazar y borrar fotos
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-lg font-extrabold">Bitácora (RNF-07)</h3>
          <div className="mt-3 max-h-96 overflow-auto rounded-xl border-2 border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="p-2">Hora</th>
                  <th className="p-2">Evento</th>
                  <th className="p-2">Decisión</th>
                  <th className="p-2">Rol</th>
                </tr>
              </thead>
              <tbody>
                {db.bitacora.slice(0, 25).map((b, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap">{new Date(b.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                    <td className="p-2">
                      {b.evento}
                      <span className="block text-xs text-ink-muted">{b.objeto}</span>
                    </td>
                    <td className="p-2">{b.decision}</td>
                    <td className="p-2">{b.rol}</td>
                  </tr>
                ))}
                {db.bitacora.length === 0 && (
                  <tr>
                    <td className="p-3 text-ink-muted" colSpan={4}>
                      Aún no hay eventos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
