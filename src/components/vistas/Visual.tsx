/**
 * Piezas visuales compartidas por las vistas de cada perfil.
 * El motivo común es la línea del Metro: el encabezado de cada vista es una estación sobre la
 * línea del color del perfil, y el avance de un reporte, un ticket o una jornada se dibuja como
 * un trayecto con paradas. El estado siempre lleva ícono y texto, nunca solo color.
 */
import { useState, type ReactNode } from "react"
import type { AreaId, CategoriaId } from "../../lib/servicio"
import { Icon, type IconName } from "../Icon"

export type Perfil = "usuario" | "jefe" | "guardia" | "personal" | "mesa"

export const ICONO_AREA: Record<AreaId, IconName> = {
  estacion: "train",
  limpieza: "broom",
  seguridad: "shield",
  mantenimiento: "tool",
  atencion: "chat",
  sistemas: "monitor",
}
export const ICONO_CATEGORIA: Record<CategoriaId | "instalaciones", IconName> = {
  instalaciones: "elevator",
  limpieza: "broom",
  seguridad: "shield",
  senalizacion: "sign",
  trato: "chat",
  aglomeracion: "people",
}

export const hora = (ts: number) => new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function hace(ts: number, now: number): string {
  const min = Math.max(0, Math.round((now - ts) / 60_000))
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? "día" : "días"}`
}

/** Duración corta: «45 min», «3 h», «2 días». */
export function duracion(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} días`
}

export const iniciales = (nombre: string) =>
  nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase()

/** Encabezado de cada vista: una estación sobre la línea del color del perfil («estás aquí»). */
export function Letrero({ perfil, icono, quien, titulo, resumen, tono = "ok", children }: { perfil: Perfil; icono: IconName; quien: string; titulo: string; resumen: string; tono?: "ok" | "warn" | "bad"; children?: ReactNode }) {
  return (
    <header className={`letrero rol-${perfil}`}>
      <span className="letrero-estacion" aria-hidden="true">
        <Icon name={icono} size="lg" />
      </span>
      <div className="min-w-0">
        <p className="letrero-quien">{quien}</p>
        <h1 className="letrero-titulo" id="vista-titulo" tabIndex={-1}>
          {titulo}
        </h1>
        <p className={`letrero-resumen letrero-${tono}`}>
          <Icon name={tono === "ok" ? "check" : "alert"} size="sm" />
          {resumen}
        </p>
      </div>
      {children && <div className="letrero-acciones">{children}</div>}
    </header>
  )
}

/** Panel corto de «de un vistazo». */
export function Vistazo({ titulo, children, pie }: { titulo: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <section className="vistazo" aria-label={titulo}>
      <h2 className="vistazo-titulo">{titulo}</h2>
      <div className="vistazo-cuerpo">{children}</div>
      {pie && <p className="vistazo-pie">{pie}</p>}
    </section>
  )
}

/** Avance como un trayecto del Metro: paradas hechas, la actual y las que faltan. */
export function Trayecto({ paradas, actual, perfil, alerta, etiqueta, compacto = false }: { paradas: string[]; actual: number; perfil: Perfil; alerta?: boolean; etiqueta: string; compacto?: boolean }) {
  return (
    <ol className={`trayecto rol-${perfil} ${compacto ? "trayecto-compacto" : ""}`} style={{ gridTemplateColumns: `repeat(${paradas.length}, minmax(0, 1fr))` }} aria-label={etiqueta}>
      {paradas.map((p, i) => {
        const estado = i < actual ? "hecha" : i === actual ? "actual" : "pendiente"
        return (
          <li key={p} className={`parada parada-${estado} ${estado === "actual" && alerta ? "parada-alerta" : ""}`} aria-current={estado === "actual" ? "step" : undefined}>
            <span className="parada-punto" aria-hidden="true">
              {estado === "hecha" && <Icon name="check" className="size-3" />}
              {estado === "actual" && alerta && <Icon name="alert" className="size-3" />}
            </span>
            <span className="parada-texto">
              {p}
              <span className="sr-only">{estado === "hecha" ? " (hecho)" : estado === "actual" ? " (etapa actual)" : " (pendiente)"}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Anillo de avance con el valor al centro. */
export function Anillo({ valor, max, centro, debajo, tono = "neutral", tam = 84 }: { valor: number; max: number; centro: string; debajo?: string; tono?: "ok" | "warn" | "bad" | "neutral"; tam?: number }) {
  const r = 15.5
  const c = 2 * Math.PI * r
  const f = max > 0 ? Math.max(0, Math.min(1, valor / max)) : 0
  const color = tono === "ok" ? "var(--st-good)" : tono === "warn" ? "var(--st-warn)" : tono === "bad" ? "var(--st-bad)" : "var(--chart-1)"
  return (
    <figure className="anillo m-0" role="img" aria-label={`${centro}${debajo ? `, ${debajo}` : ""}`}>
      <svg viewBox="0 0 36 36" width={tam} height={tam} aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--chart-track)" strokeWidth="4" />
        {f > 0 && <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${f * c} ${c}`} transform="rotate(-90 18 18)" />}
      </svg>
      <figcaption className="anillo-centro" aria-hidden="true">
        <span className="anillo-valor">{centro}</span>
      </figcaption>
      {debajo && (
        <span className="anillo-debajo" aria-hidden="true">
          {debajo}
        </span>
      )}
    </figure>
  )
}

export type Parte = { etiqueta: string; valor: number; clase: "hecha" | "curso" | "pendiente" | "atrasada" }
const ICONO_PARTE: Record<Parte["clase"], IconName> = { hecha: "check", curso: "clock", pendiente: "minus", atrasada: "alert" }

/** Barra apilada por estado con leyenda (ícono, texto y número). */
export function BarraEstados({ partes, etiqueta }: { partes: Parte[]; etiqueta: string }) {
  const total = partes.reduce((a, p) => a + p.valor, 0)
  return (
    <div>
      <div className="barra-estados" role="img" aria-label={`${etiqueta}: ${partes.map((p) => `${p.valor} ${p.etiqueta.toLowerCase()}`).join(", ")}`}>
        {total === 0 ? <span className="barra-vacia" /> : partes.filter((p) => p.valor > 0).map((p) => <span key={p.etiqueta} className={`barra-seg barra-${p.clase}`} style={{ flexGrow: p.valor }} />)}
      </div>
      <ul className="barra-leyenda" aria-hidden="true">
        {partes.map((p) => (
          <li key={p.etiqueta}>
            <span className={`barra-marca barra-${p.clase}`}>
              <Icon name={ICONO_PARTE[p.clase]} className="size-2.5" />
            </span>
            <span className="font-extrabold tabular-nums">{p.valor}</span> {p.etiqueta}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Columnas de una sola serie (por ejemplo, tickets cerrados por día) con resaltado al pasar el cursor. */
export function Columnas({ datos, etiqueta, unidad }: { datos: Array<{ etiqueta: string; valor: number }>; etiqueta: string; unidad: string }) {
  const [activa, setActiva] = useState<number | null>(null)
  const max = Math.max(1, ...datos.map((d) => d.valor))
  const ultima = datos.length - 1
  const mostrar = activa ?? ultima
  return (
    <figure className="m-0">
      <div className="mini-cols" role="img" aria-label={`${etiqueta}: ${datos.map((d) => `${d.etiqueta} ${d.valor}`).join(", ")}`} onMouseLeave={() => setActiva(null)}>
        {datos.map((d, i) => (
          <span key={d.etiqueta + i} className="mini-col" onMouseEnter={() => setActiva(i)}>
            <span className={`mini-col-barra ${i === mostrar ? "mini-col-activa" : ""}`} style={{ height: `${Math.max(4, (d.valor / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="mini-cols-ejes" aria-hidden="true">
        <span>{datos[0]?.etiqueta}</span>
        <span>{datos[ultima]?.etiqueta}</span>
      </div>
      <figcaption className="mt-1 text-sm" aria-live="polite">
        <span className="font-extrabold tabular-nums">{datos[mostrar]?.valor}</span> {unidad} · {datos[mostrar]?.etiqueta}
      </figcaption>
    </figure>
  )
}

/** Plazo usado de un ticket: barra que se llena y cambia de estado (ícono y texto) al acercarse al límite. */
export function Plazo({ usado, texto }: { usado: number; texto: string }) {
  const tono = usado >= 1 ? "bad" : usado >= 0.75 ? "warn" : "ok"
  return (
    <div className={`plazo plazo-${tono}`}>
      <span className="plazo-barra" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(4, usado * 100))}%` }} />
      </span>
      <span className="plazo-texto">
        <Icon name={tono === "bad" ? "alert" : "clock"} className="size-3.5" />
        {texto}
      </span>
    </div>
  )
}

export function Avatar({ nombre, perfil }: { nombre: string; perfil?: Perfil }) {
  return (
    <span className={`avatar ${perfil ? `rol-${perfil}` : ""}`} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  )
}

export function Prioridad({ p, corto = false }: { p: "alta" | "media" | "baja"; corto?: boolean }) {
  return (
    <span className={`prio prio-${p}`}>
      <span className="prio-barras" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {corto ? (
        <>
          <span className="sr-only">Prioridad </span>
          {p[0].toUpperCase() + p.slice(1)}
        </>
      ) : (
        `Prioridad ${p}`
      )}
    </span>
  )
}
