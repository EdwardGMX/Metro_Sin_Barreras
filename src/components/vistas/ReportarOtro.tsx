/**
 * Reportar otro problema de la estación (limpieza, seguridad, señalización accesible, atención
 * del personal o aglomeración). Vive en la pestaña «Reportar»; el seguimiento está en «Mi cuenta».
 * Solo opciones predefinidas, sin texto libre (RF-16), y comparte el límite diario con los
 * reportes de equipos.
 */
import { useState } from "react"
import { allStations } from "../../data/metroData"
import { LIMITE_DIARIO, type BaseDatos } from "../../lib/reports"
import { reportarServicio, servicioDe, AREAS, CATEGORIAS, LUGARES, ORDEN_CATEGORIAS, problemaPorId, type CategoriaId } from "../../lib/servicio"
import { leer } from "../../lib/storage"
import { Icon } from "../Icon"
import type { Sesion } from "../Reports"
import { ICONO_CATEGORIA } from "./Visual"

const DIA = 24 * 3600_000

export function ReportarOtro({ db, actualizar, sesion, onReportado }: { db: BaseDatos; actualizar: (fn: (db: BaseDatos) => void) => void; sesion: Sesion; onReportado?: () => void }) {
  const favoritas = leer<string[]>("msb.favoritas", ["Tacubaya", "Pantitlán"])
  const [categoria, setCategoria] = useState<CategoriaId | null>(null)
  const [problema, setProblema] = useState("")
  const [station, setStation] = useState(favoritas[0] ?? "Tacubaya")
  const [lugar, setLugar] = useState("")
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const ahora = Date.now()
  const seud = sesion.seudonimo
  const hoy = db.reportes.filter((r) => r.seudonimo === seud && ahora - r.ts < DIA).length + servicioDe(db).reportes.filter((r) => r.seudonimo === seud && ahora - r.ts < DIA).length
  const quedan = Math.max(0, LIMITE_DIARIO - hoy)
  const p = categoria ? CATEGORIAS[categoria] : null

  const enviar = () => {
    if (!categoria) return
    let r: ReturnType<typeof reportarServicio> | null = null
    actualizar((d) => {
      r = reportarServicio(d, sesion, { station, categoria, problema, lugar }, Date.now())
    })
    const res = r as ReturnType<typeof reportarServicio> | null
    if (!res) return
    setAviso({ ok: res.ok, texto: res.ok ? `${res.mensaje} Síguelo en «Mi cuenta».` : res.mensaje })
    if (res.ok) {
      setCategoria(null)
      setProblema("")
      setLugar("")
      onReportado?.()
    }
  }

  return (
    <section className="report-form rol-usuario" aria-labelledby="otro-titulo">
      <div>
        <h3 id="otro-titulo" className="text-lg font-extrabold">
          Otro problema en la estación
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Limpieza, seguridad, señalización accesible, atención del personal o aglomeración. Te {quedan === 1 ? "queda" : "quedan"} <span className="font-extrabold text-ink">{quedan}</span> de {LIMITE_DIARIO} reportes hoy. Solo eliges opciones: no escribes texto.
        </p>
      </div>

      <fieldset>
        <legend className="field-legend px-0">1. ¿Qué quieres reportar?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ORDEN_CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              className="opcion-grande"
              aria-pressed={categoria === c}
              onClick={() => {
                setCategoria(c)
                setProblema("")
                setAviso(null)
              }}
            >
              <span className="opcion-icono">
                <Icon name={ICONO_CATEGORIA[c]} />
              </span>
              <span>
                <span className="block font-extrabold">{CATEGORIAS[c].nombre}</span>
                <span className="block text-xs text-ink-muted">{CATEGORIAS[c].ayuda}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {p && (
        <fieldset>
          <legend className="field-legend px-0">2. ¿Qué pasó?</legend>
          <div className="grid gap-2">
            {p.problemas.map((x) => (
              <button key={x.id} type="button" className="opcion-grande min-h-12 font-bold" aria-pressed={problema === x.id} onClick={() => setProblema(x.id)}>
                {x.texto}
              </button>
            ))}
          </div>
          {categoria === "seguridad" && (
            <p className="callout callout-warning">
              <Icon name="alert" size="sm" className="mt-0.5" />
              Si estás en peligro ahora, usa el botón Emergencia o busca a la Policía Auxiliar de la estación.
            </p>
          )}
        </fieldset>
      )}

      {p && problema && (
        <fieldset>
          <legend className="field-legend px-0">3. ¿Dónde?</legend>
          <label htmlFor="rs-estacion" className="field-label">
            Estación
          </label>
          <select id="rs-estacion" className="field-select" value={station} onChange={(e) => setStation(e.target.value)}>
            {favoritas.length > 0 && (
              <optgroup label="Tus estaciones">
                {favoritas.map((s) => (
                  <option key={`f-${s}`} value={s}>
                    {s}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Todas">
              {allStations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="field-label mt-3">Parte de la estación</p>
          <div className="flex flex-wrap gap-2">
            {LUGARES.map((l) => (
              <button key={l} type="button" className="opcion-grande w-auto min-h-11 px-3 py-1.5 text-sm font-bold" aria-pressed={lugar === l} onClick={() => setLugar(l)}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <button type="button" className="boton-rol min-h-12 w-full" disabled={!categoria || !problema || !lugar || quedan === 0} onClick={enviar}>
        <Icon name="send" size="sm" /> Enviar reporte
      </button>
      {categoria && problema && <p className="text-xs text-ink-muted">Lo recibe la Mesa de atención del STC y lo turna a {AREAS[problemaPorId(categoria, problema)!.area].nombre}. El personal verá el problema y el lugar, nunca tu nombre.</p>}
      <div aria-live="polite">
        {aviso && (
          <p className={`callout ${aviso.ok ? "callout-success" : "callout-warning"}`}>
            <Icon name={aviso.ok ? "check" : "alert"} size="sm" className="mt-0.5" />
            {aviso.texto}
          </p>
        )}
      </div>
    </section>
  )
}
