/**
 * Gráficas del tablero de desempeño.
 *
 * Reglas (guía de visualización del equipo): marcas delgadas (columnas de 24 px como máximo,
 * extremo redondeado de 4 px y base recta), rejilla de una línea fina, color por la tarea que
 * cumple (una serie = el color del perfil; partes de un todo = 4 colores categóricos validados
 * para daltonismo; estado = semáforo con ícono y texto), información al pasar el cursor o al
 * enfocar con el teclado, y una vista en tabla para cada gráfica. El texto nunca va en el color
 * de la serie.
 */
import { useState, type ReactNode } from "react"
import { Icon, type IconName } from "../Icon"
import { ESTADO_DIA_LABEL, type Dia, type EstadoDia } from "../../lib/desempeno"

export const fechaCorta = (ts: number) => new Date(ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
export const fechaLarga = (ts: number) => {
  const s = new Date(ts).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`
export const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)} %`)

/** Tope «redondo» para el eje: 1, 2, 5 × 10ⁿ. */
function topeEje(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Posición del globo para que no se salga por los lados. */
const lado = (i: number, n: number) => (i < n * 0.15 ? "tip-izq" : i > n * 0.85 ? "tip-der" : "")

/* ------------------------------------------------------------------ */
/* Tarjeta con vista de tabla                                          */
/* ------------------------------------------------------------------ */

export function TarjetaGrafica({ titulo, subtitulo, tabla, children, accion, className = "" }: { titulo: string; subtitulo?: ReactNode; tabla?: { columnas: string[]; filas: Array<Array<string | number>> }; children: ReactNode; accion?: ReactNode; className?: string }) {
  const [verTabla, setVerTabla] = useState(false)
  const id = titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return (
    <section className={`tarjeta grafica ${className}`} aria-labelledby={`g-${id}`}>
      <div className="grafica-cabeza">
        <div className="min-w-0">
          <h3 id={`g-${id}`} className="grafica-titulo">
            {titulo}
          </h3>
          {subtitulo && <p className="grafica-sub">{subtitulo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {accion}
          {tabla && (
            <button type="button" className="boton-tabla" aria-pressed={verTabla} onClick={() => setVerTabla((v) => !v)}>
              <Icon name={verTabla ? "eye" : "list"} className="size-3.5" /> {verTabla ? "Ver gráfica" : "Ver tabla"}
            </button>
          )}
        </div>
      </div>
      {verTabla && tabla ? (
        <div className="tabla-scroll">
          <table className="tabla-datos">
            <thead>
              <tr>
                {tabla.columnas.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((f, i) => (
                <tr key={i}>
                  {f.map((x, j) => (j === 0 ? <th key={j} scope="row">{x}</th> : <td key={j}>{x}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Índice (cifra principal)                                            */
/* ------------------------------------------------------------------ */

export function CifraIndice({ valor, nivel, delta, pie, partes }: { valor: number; nivel: { etiqueta: string; tono: "ok" | "warn" | "bad" }; delta?: number; pie?: ReactNode; partes?: Array<{ nombre: string; peso: string; valor: number }> }) {
  return (
    <div className="cifra">
      <p className="cifra-etiqueta">Índice de desempeño</p>
      <p className="cifra-valor">
        {valor}
        <span className="cifra-de">/100</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip chip-estado-${nivel.tono}`}>
          <Icon name={nivel.tono === "ok" ? "star" : "alert"} className="size-3.5" /> {nivel.etiqueta}
        </span>
        {delta !== undefined && <Delta valor={delta} unidad="pts" />}
      </div>
      <div className="cifra-medidor" role="img" aria-label={`${valor} de 100. Metas: 70 por mejorar, 80 en meta, 90 sobresaliente.`}>
        <span className="cifra-relleno" style={{ width: `${valor}%` }} />
        {[70, 80, 90].map((m) => (
          <span key={m} className="cifra-marca" style={{ left: `${m}%` }} aria-hidden="true">
            <span>{m}</span>
          </span>
        ))}
      </div>
      {partes && (
        <ul className="cifra-partes">
          {partes.map((p) => (
            <li key={p.nombre}>
              <span className="min-w-0">
                {p.nombre} <span className="text-ink-muted">· {p.peso}</span>
              </span>
              <span className="cifra-parte-barra" aria-hidden="true">
                <span style={{ width: `${p.valor * 100}%` }} />
              </span>
              <span className="font-extrabold">{Math.round(p.valor * 100)}</span>
            </li>
          ))}
        </ul>
      )}
      {pie && <p className="cifra-pie">{pie}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Indicadores (valor, comparación y tendencia)                        */
/* ------------------------------------------------------------------ */

/** Cambio contra el periodo anterior. `mejor` dice si subir es bueno (true), malo (false) o neutro. */
export function Delta({ valor, unidad, mejor = true }: { valor: number; unidad: string; mejor?: boolean | null }) {
  const r = Math.round(valor * 10) / 10
  if (r === 0) return <span className="delta delta-neutro">= igual que el periodo anterior</span>
  const sube = r > 0
  const tono = mejor === null ? "neutro" : sube === mejor ? "bien" : "mal"
  return (
    <span className={`delta delta-${tono}`}>
      <span aria-hidden="true">{sube ? "▲" : "▼"}</span>
      {sube ? "+" : "−"}
      {Math.abs(r)} {unidad}
      <span className="sr-only"> contra el periodo anterior</span>
      <span aria-hidden="true" className="delta-vs">
        vs. anterior
      </span>
    </span>
  )
}

export function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null
  const w = 96
  const h = 28
  const max = Math.max(1, ...valores)
  const min = Math.min(0, ...valores)
  const x = (i: number) => 4 + (i / (valores.length - 1)) * (w - 8)
  const y = (v: number) => h - 4 - ((v - min) / (max - min || 1)) * (h - 8)
  const puntos = valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")
  const u = valores.length - 1
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={puntos} fill="none" stroke="var(--spark)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(u)} cy={y(valores[u])} r="4" fill="var(--rol)" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

export function Indicador({ icono, etiqueta, valor, sub, delta, tendencia }: { icono: IconName; etiqueta: string; valor: string; sub?: string; delta?: ReactNode; tendencia?: number[] }) {
  return (
    <div className="kpi">
      <p className="kpi-etiqueta">
        <span className="kpi-icono">
          <Icon name={icono} className="size-4" />
        </span>
        {etiqueta}
      </p>
      <p className="kpi-valor">{valor}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
      <div className="kpi-pie">
        <span>{delta}</span>
        {tendencia && <Sparkline valores={tendencia} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Columnas por día                                                    */
/* ------------------------------------------------------------------ */

export type PuntoDia = { ts: number; valor: number; nota?: string; vacio?: string }

export function ColumnasDia({ datos, unidad, alto = 120 }: { datos: PuntoDia[]; unidad: string; alto?: number }) {
  const [activa, setActiva] = useState<number | null>(null)
  const tope = topeEje(Math.max(...datos.map((d) => d.valor)))
  const n = datos.length
  const d = activa !== null ? datos[activa] : null
  return (
    <figure className="m-0">
      <div className="cols" style={{ height: alto }} onMouseLeave={() => setActiva(null)}>
        <div className="cols-rejilla" aria-hidden="true">
          {[tope, tope / 2, 0].map((t) => (
            <span key={t}>
              <em>{Number.isInteger(t) ? t : t.toFixed(1)}</em>
            </span>
          ))}
        </div>
        <div className="cols-barras" style={{ gap: n > 20 ? 2 : 4 }}>
          {datos.map((p, i) => (
            <span
              key={p.ts}
              className="col"
              tabIndex={0}
              aria-label={`${fechaLarga(p.ts)}: ${p.vacio ?? `${p.valor} ${unidad}`}${p.nota ? `, ${p.nota}` : ""}`}
              onMouseEnter={() => setActiva(i)}
              onFocus={() => setActiva(i)}
              onBlur={() => setActiva(null)}
            >
              {p.vacio ? <span className="col-vacia" /> : <span className={`col-barra ${i === activa ? "col-activa" : ""} ${i === n - 1 ? "col-hoy" : ""}`} style={{ height: `${p.valor ? Math.max(3, (p.valor / tope) * 100) : 0}%` }} />}
            </span>
          ))}
        </div>
        {d && (
          <div className={`tip ${lado(activa!, n)}`} role="tooltip" style={{ left: `calc(2rem + (100% - 2rem) * ${(activa! + 0.5) / n})` }}>
            <strong>{d.vacio ?? `${d.valor} ${unidad}`}</strong>
            {d.nota && <span>{d.nota}</span>}
            <span className="tip-fecha">{fechaLarga(d.ts)}</span>
          </div>
        )}
      </div>
      <div className="cols-eje" aria-hidden="true">
        <span>{fechaCorta(datos[0].ts)}</span>
        {n > 10 && <span>{fechaCorta(datos[Math.floor(n / 2)].ts)}</span>}
        <span>Hoy</span>
      </div>
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/* Calendario de asistencia                                            */
/* ------------------------------------------------------------------ */

const ICONO_DIA: Record<EstadoDia, IconName> = { a_tiempo: "check", retardo: "clock", falta: "x", descanso: "minus", por_iniciar: "clock" }
const ORDEN_ESTADOS: EstadoDia[] = ["a_tiempo", "retardo", "falta", "descanso"]

export function CalendarioAsistencia({ dias }: { dias: Dia[] }) {
  const [activo, setActivo] = useState<number | null>(null)
  // La semana empieza en lunes.
  const hueco = (new Date(dias[0].ts).getDay() + 6) % 7
  const d = activo !== null ? dias[activo] : null
  const conteo = (s: EstadoDia) => dias.filter((x) => x.estado === s).length
  const texto = (x: Dia) =>
    x.estado === "descanso" || x.estado === "falta" || x.estado === "por_iniciar"
      ? ESTADO_DIA_LABEL[x.estado]
      : `${ESTADO_DIA_LABEL[x.estado]}${x.retardo ? ` (${x.retardo} min)` : ""} · entrada ${hhmm(x.entrada!)}${x.salida !== undefined ? ` · salida ${hhmm(x.salida)}` : x.enCurso ? " · en turno" : ""}`
  return (
    <div>
      <div className="cal" onMouseLeave={() => setActivo(null)}>
        {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => (
          <span key={i} className="cal-dia-semana" aria-hidden="true">
            {x}
          </span>
        ))}
        {Array.from({ length: hueco }, (_, i) => (
          <span key={`h${i}`} aria-hidden="true" />
        ))}
        {dias.map((x, i) => (
          <span
            key={x.ts}
            className={`cal-celda cal-${x.estado} ${i === dias.length - 1 ? "cal-hoy" : ""} ${i === activo ? "cal-activa" : ""}`}
            tabIndex={0}
            aria-label={`${fechaLarga(x.ts)}: ${texto(x)}`}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
          >
            <span className="cal-num" aria-hidden="true">
              {new Date(x.ts).getDate()}
            </span>
            <Icon name={ICONO_DIA[x.estado]} className="cal-icono" />
          </span>
        ))}
      </div>
      <p className="cal-detalle" aria-hidden="true">
        {d ? (
          <>
            <span className="font-extrabold">{fechaLarga(d.ts)}</span> · {texto(d)}
          </>
        ) : (
          "Pasa el cursor o enfoca un día para ver la entrada y la salida."
        )}
      </p>
      <ul className="leyenda">
        {ORDEN_ESTADOS.map((s) => (
          <li key={s}>
            <span className={`leyenda-marca cal-${s}`}>
              <Icon name={ICONO_DIA[s]} className="size-2.5" />
            </span>
            {ESTADO_DIA_LABEL[s]} <span className="font-extrabold">{conteo(s)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Lista de medidores (una razón por fila contra su meta)              */
/* ------------------------------------------------------------------ */

export type FilaMedidor = { id: string; nombre: string; detalle?: ReactNode; valor: number | null; figura: string; meta?: number; extra?: ReactNode }

export function estadoMeta(valor: number | null, meta = 0.8): { tono: "ok" | "warn" | "bad" | "neutral"; texto: string; icono: IconName } {
  if (valor === null) return { tono: "neutral", texto: "Sin datos", icono: "minus" }
  if (valor >= meta) return { tono: "ok", texto: "En meta", icono: "check" }
  if (valor >= meta - 0.1) return { tono: "warn", texto: "Cerca de la meta", icono: "clock" }
  return { tono: "bad", texto: "Bajo la meta", icono: "alert" }
}

export function Medidores({ filas, onElegir, etiquetaMeta = true }: { filas: FilaMedidor[]; onElegir?: (id: string) => void; etiquetaMeta?: boolean }) {
  return (
    <ul className="medidores">
      {filas.map((f) => {
        const e = estadoMeta(f.valor, f.meta)
        const cuerpo = (
          <>
            <span className="medidor-nombre">
              <span className="font-extrabold">{f.nombre}</span>
              {f.detalle && <span className="medidor-detalle">{f.detalle}</span>}
            </span>
            <span className="medidor-barra" aria-hidden="true">
              <span className={`medidor-relleno medidor-${e.tono}`} style={{ width: `${Math.max(0, Math.min(1, f.valor ?? 0)) * 100}%` }} />
              {f.meta !== undefined && <span className="medidor-meta" style={{ left: `${f.meta * 100}%` }} />}
            </span>
            <span className="medidor-figura">
              <span className="font-extrabold">{f.figura}</span>
              {etiquetaMeta && (
                <span className={`medidor-estado medidor-estado-${e.tono}`}>
                  <Icon name={e.icono} className="size-3" />
                  {e.texto}
                </span>
              )}
            </span>
            {f.extra}
          </>
        )
        return (
          <li key={f.id}>
            {onElegir ? (
              <button type="button" className="medidor medidor-boton" onClick={() => onElegir(f.id)}>
                {cuerpo}
                <Icon name="arrow-right" className="medidor-flecha size-4" />
              </button>
            ) : (
              <div className="medidor">{cuerpo}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Barra segmentada (un todo en partes)                                */
/* ------------------------------------------------------------------ */

export type ParteTodo = { nombre: string; valor: number }

export function BarraSegmentada({ partes, unidad }: { partes: ParteTodo[]; unidad: string }) {
  const [activa, setActiva] = useState<number | null>(null)
  const total = partes.reduce((a, p) => a + p.valor, 0)
  const visibles = partes.map((p, i) => ({ ...p, i })).filter((p) => p.valor > 0)
  const share = (v: number) => (total ? v / total : 0)
  const a = activa !== null ? partes[activa] : null
  return (
    <div>
      <div className="seg" role="img" aria-label={`${partes.map((p) => `${p.nombre}: ${p.valor} ${unidad} (${pct(share(p.valor))})`).join("; ")}`} onMouseLeave={() => setActiva(null)}>
        {total === 0 ? (
          <span className="seg-vacio">Sin actividad en el periodo</span>
        ) : (
          visibles.map((p) => (
            <span
              key={p.nombre}
              className={`seg-parte seg-${p.i + 1} ${activa === p.i ? "seg-activa" : ""}`}
              style={{ flexGrow: p.valor }}
              tabIndex={0}
              aria-label={`${p.nombre}: ${p.valor} ${unidad}, ${pct(share(p.valor))}`}
              onMouseEnter={() => setActiva(p.i)}
              onFocus={() => setActiva(p.i)}
              onBlur={() => setActiva(null)}
            >
              {share(p.valor) >= 0.11 && <span className="seg-texto">{pct(share(p.valor))}</span>}
            </span>
          ))
        )}
      </div>
      <p className="cal-detalle" aria-hidden="true">
        {a ? (
          <>
            <span className="font-extrabold">{a.valor}</span> {unidad} · {a.nombre} · {pct(share(a.valor))}
          </>
        ) : (
          `${total} ${unidad} en total`
        )}
      </p>
      <ul className="leyenda">
        {partes.map((p, i) => (
          <li key={p.nombre}>
            <span className={`leyenda-rect seg-${i + 1}`} />
            {p.nombre}
          </li>
        ))}
      </ul>
    </div>
  )
}
