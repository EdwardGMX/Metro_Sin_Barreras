import { getLine, metroLines } from "../data/metroData"
import { formatoHora, franjasValidas, HORARIO, tipoDia } from "../data/saturation"
import { PERFILES, type PerfilId } from "../lib/profiles"
import type { TipoHora } from "../lib/router"
import { Icon, type IconName } from "./Icon"

export function StationSelector({
  title,
  lineId,
  station,
  onLineChange,
  onStationChange,
}: {
  title: string
  lineId: string
  station: string
  onLineChange: (lineId: string) => void
  onStationChange: (station: string) => void
}) {
  const line = getLine(lineId)
  return (
    <fieldset className="station-selector">
      <legend className="field-legend">{title}</legend>
      <div className="mb-3 flex items-center gap-2">
        <span className="selector-dot" style={{ backgroundColor: line.color }} />
        <label className="sr-only" htmlFor={`${title}-linea`}>
          Línea de {title.toLowerCase()}
        </label>
        <select id={`${title}-linea`} className="field-select" value={lineId} onChange={(e) => onLineChange(e.target.value)}>
          {metroLines.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}: {o.stations[0]} — {o.stations.at(-1)}
            </option>
          ))}
        </select>
      </div>
      <label className="field-label" htmlFor={`${title}-estacion`}>
        Estación
      </label>
      <div className="relative">
        <Icon name="location" className="field-icon text-brand" />
        <select id={`${title}-estacion`} className="field-select field-select-station" value={station} onChange={(e) => onStationChange(e.target.value)}>
          {line.stations.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}

const ICONO_PERFIL: Record<PerfilId, IconName> = {
  silla_ruedas: "wheelchair",
  baston_andadera: "walker",
  adulta_mayor: "senior",
  visual: "eye",
  perro_guia: "dog",
  auditiva: "ear",
  temporal_equipaje: "bag",
}

export function ProfilePicker({ seleccion, onChange }: { seleccion: PerfilId[]; onChange: (ids: PerfilId[]) => void }) {
  const alternar = (id: PerfilId) => onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  return (
    <fieldset>
      <legend className="mb-1 text-base font-extrabold">Tu perfil de movilidad</legend>
      <p className="mb-3 text-sm text-ink-muted">Puedes elegir más de uno. Se guarda solo en este dispositivo.</p>
      <div className="space-y-2">
        {PERFILES.map((p) => {
          const activo = seleccion.includes(p.id)
          return (
            <label key={p.id} className={`option-row ${activo ? "option-row-active" : ""}`}>
              <span className="option-icon">
                <Icon name={ICONO_PERFIL[p.id]} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{p.nombre}</span>
                <span className="block text-sm text-ink-muted">{p.descripcion}</span>
              </span>
              <input type="checkbox" className="size-6 shrink-0 accent-brand" checked={activo} onChange={() => alternar(p.id)} />
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function parseFecha(valor: string): Date {
  const [y, m, d] = valor.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function TimePicker({
  tipo,
  fecha,
  hora,
  onTipo,
  onFecha,
  onHora,
}: {
  tipo: TipoHora
  fecha: string
  hora: number
  onTipo: (t: TipoHora) => void
  onFecha: (f: string) => void
  onHora: (m: number) => void
}) {
  const hoy = new Date()
  const max = new Date()
  max.setDate(max.getDate() + 30)
  const f = parseFecha(fecha)
  const opciones = tipo === "llegar_a" ? franjasValidas(f).map((m) => m + 30) : franjasValidas(f)
  const { abre } = HORARIO[tipoDia(f)]
  const opcionesTipo: Array<[TipoHora, string]> = [
    ["salir_ahora", "Salir ahora"],
    ["salir_a", "Salir a las"],
    ["llegar_a", "Llegar a las"],
  ]
  return (
    <fieldset>
      <legend className="mb-1 text-base font-extrabold">¿Cuándo viajas?</legend>
      <p className="mb-3 text-sm text-ink-muted">La saturación se estima para la hora en que pasarías por cada estación.</p>
      <div className="segmented" role="radiogroup" aria-label="Tipo de hora">
        {opcionesTipo.map(([valor, texto]) => (
          <label key={valor} className={`segmented-option ${tipo === valor ? "segmented-active" : ""}`}>
            <input type="radio" name="tipo-hora" className="sr-only" checked={tipo === valor} onChange={() => onTipo(valor)} />
            {texto}
          </label>
        ))}
      </div>
      {tipo !== "salir_ahora" && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="report-field">
            <label className="field-label" htmlFor="viaje-fecha">Fecha</label>
            <input id="viaje-fecha" type="date" className="field-select" value={fecha} min={isoLocal(hoy)} max={isoLocal(max)} onChange={(e) => e.target.value && onFecha(e.target.value)} />
          </div>
          <div className="report-field">
            <label className="field-label" htmlFor="viaje-hora">Hora</label>
            <select id="viaje-hora" className="field-select" value={hora} onChange={(e) => onHora(Number(e.target.value))}>
              {opciones.map((m) => (
                <option key={m} value={m}>
                  {m >= 1440 ? "24:00" : formatoHora(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        Servicio ese día: {Math.floor(abre / 60)}:00 a 24:00 h. Puedes planear hasta 30 días después.
      </p>
    </fieldset>
  )
}

export { isoLocal }
