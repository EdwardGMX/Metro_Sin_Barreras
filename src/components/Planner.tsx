import { useEffect, useId, useMemo, useRef, useState } from "react"
import { allStations, getLine, linesAtStation, normalizar } from "../data/metroData"
import { formatoHora, franjasValidas, HORARIO, tipoDia } from "../data/saturation"
import { PERFILES, type PerfilId } from "../lib/profiles"
import type { TipoHora } from "../lib/router"
import { Icon, type IconName } from "./Icon"

function LineDots({ station }: { station: string }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden="true">
      {linesAtStation(station).map((id) => {
        const l = getLine(id)
        return (
          <span key={id} className="line-dot" style={{ backgroundColor: l.color, color: l.textColor }}>
            {id}
          </span>
        )
      })}
    </span>
  )
}

/** Campo de estación con búsqueda (patrón combobox de ARIA). */
export function StationSearch({
  label,
  pin,
  value,
  onChange,
}: {
  label: string
  pin: "A" | "B"
  value: string
  onChange: (station: string) => void
}) {
  const id = useId()
  const [texto, setTexto] = useState(value)
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => setTexto(value), [value])

  const opciones = useMemo(() => {
    const q = normalizar(texto.trim())
    if (!q || texto === value) return allStations
    const empieza = allStations.filter((s) => normalizar(s).startsWith(q))
    const contiene = allStations.filter((s) => !normalizar(s).startsWith(q) && normalizar(s).includes(q))
    return [...empieza, ...contiene]
  }, [texto, value])

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" })
  }, [activo, abierto])

  const elegir = (s: string) => {
    onChange(s)
    setTexto(s)
    setAbierto(false)
  }

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="sr-only">
        {label}
      </label>
      <div className="station-field">
        <span className={`pin-dot ${pin === "A" ? "bg-brand" : "bg-ink"}`} aria-hidden="true">
          {pin}
        </span>
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && opciones[activo] ? `${id}-op-${activo}` : undefined}
          className="station-input"
          value={texto}
          placeholder={label}
          autoComplete="off"
          onFocus={(e) => {
            e.target.select()
            setActivo(Math.max(allStations.indexOf(value), 0))
          }}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
            setActivo(0)
          }}
          onClick={() => setAbierto(true)}
          onBlur={() => {
            setAbierto(false)
            setTexto(value)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              if (!abierto) setAbierto(true)
              else setActivo((a) => Math.min(a + 1, opciones.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActivo((a) => Math.max(a - 1, 0))
            } else if (e.key === "Enter") {
              if (abierto && opciones[activo]) {
                e.preventDefault()
                elegir(opciones[activo])
              }
            } else if (e.key === "Escape") {
              setAbierto(false)
              setTexto(value)
            }
          }}
        />
        <span className="hidden shrink-0 sm:flex">
          <LineDots station={value} />
        </span>
        <Icon name="search" size="sm" className="shrink-0 text-ink-muted" />
      </div>
      {abierto && (
        <ul id={`${id}-lista`} ref={listRef} role="listbox" aria-label={label} className="station-list">
          {opciones.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Sin coincidencias</li>}
          {opciones.map((s, i) => (
            <li
              key={s}
              id={`${id}-op-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === activo}
              className={`station-option ${i === activo ? "station-option-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(s)
              }}
              onMouseEnter={() => setActivo(i)}
            >
              <span className="min-w-0 flex-1 truncate">{s}</span>
              <LineDots station={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
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

/** Perfil de movilidad como lista desplegable de opciones combinables (RN7). */
export function ProfileDropdown({ seleccion, onChange }: { seleccion: PerfilId[]; onChange: (ids: PerfilId[]) => void }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const alternar = (p: PerfilId) => onChange(seleccion.includes(p) ? seleccion.filter((x) => x !== p) : [...seleccion, p])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("pointerdown", fuera)
    return () => document.removeEventListener("pointerdown", fuera)
  }, [abierto])

  const elegidos = PERFILES.filter((p) => seleccion.includes(p.id))
  const resumen = elegidos.length === 0 ? "Sin restricciones" : elegidos.length === 1 ? elegidos[0].nombre : `${elegidos[0].nombre} y ${elegidos.length - 1} más`

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          e.stopPropagation()
          setAbierto(false)
          ref.current?.querySelector("button")?.focus()
        }
      }}
    >
      <button type="button" className="profile-trigger" aria-expanded={abierto} aria-controls={`${id}-panel`} onClick={() => setAbierto((a) => !a)}>
        <span className="option-icon">
          <Icon name={elegidos[0] ? ICONO_PERFIL[elegidos[0].id] : "people"} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-xs font-bold text-ink-muted">Perfil de movilidad</span>
          <span className="block truncate font-extrabold">{resumen}</span>
        </span>
        <Icon name="chevron-down" className={`text-ink-muted transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <fieldset id={`${id}-panel`} className="profile-panel">
          <legend className="sr-only">Elige uno o más perfiles</legend>
          <p className="px-2 pb-2 text-xs text-ink-muted">Puedes elegir más de uno; se aplica la restricción más estricta. Se guarda solo en este dispositivo.</p>
          {PERFILES.map((p) => {
            const activo = seleccion.includes(p.id)
            return (
              <label key={p.id} className={`profile-option ${activo ? "profile-option-active" : ""}`}>
                <input type="checkbox" className="size-5 shrink-0 accent-brand" checked={activo} onChange={() => alternar(p.id)} />
                <Icon name={ICONO_PERFIL[p.id]} className="text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{p.nombre}</span>
                  <span className="block text-xs text-ink-muted">{p.descripcion}</span>
                </span>
              </label>
            )
          })}
          <button type="button" className="secondary-button mt-2 w-full" onClick={() => setAbierto(false)}>
            Listo
          </button>
        </fieldset>
      )}
    </div>
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
      <legend className="sr-only">¿Cuándo viajas?</legend>
      <div className="segmented" role="radiogroup" aria-label="Tipo de hora">
        {opcionesTipo.map(([valor, texto]) => (
          <label key={valor} className={`segmented-option ${tipo === valor ? "segmented-active" : ""}`}>
            <input type="radio" name="tipo-hora" className="sr-only" checked={tipo === valor} onChange={() => onTipo(valor)} />
            {texto}
          </label>
        ))}
      </div>
      {tipo !== "salir_ahora" && (
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <div className="report-field">
            <label className="sr-only" htmlFor="viaje-fecha">
              Fecha
            </label>
            <input id="viaje-fecha" type="date" className="field-select" value={fecha} min={isoLocal(hoy)} max={isoLocal(max)} onChange={(e) => e.target.value && onFecha(e.target.value)} />
          </div>
          <div className="report-field">
            <label className="sr-only" htmlFor="viaje-hora">
              Hora
            </label>
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
      <p className="mt-1.5 text-xs text-ink-muted">
        Servicio ese día: {Math.floor(abre / 60)}:00 a 24:00 h · hasta 30 días después.
      </p>
    </fieldset>
  )
}

export { isoLocal }
