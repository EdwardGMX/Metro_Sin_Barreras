/**
 * «Mi tablero»: la vista de entrada de la consola. Cada rol ve su propia pregunta,
 * sus indicadores con meta y semáforo, sus gráficas y lo que debe atender hoy.
 */
import { useMemo, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react"
import { ACCIONES_FINALES, ORDEN_ROLES, PERMISO_LABEL, ROLES, ROLES_INCOMPATIBLES, modulosVisibles, permisosDe, type ModuloId, type RolId } from "../../lib/admin"
import { muestraRutas, tableroDe, PREGUNTAS, type Accion, type Barra, type EstadoCelda, type Grafica, type Indicador, type Tono } from "../../lib/tableros"
import { Icon } from "../Icon"
import type { Ctx } from "./AdminApp"
import { Encabezado, Tarjeta } from "./Modulos"

/* ------------------------------------------------------------------ */
/* Semáforo                                                            */
/* ------------------------------------------------------------------ */

const TONO_LABEL: Record<Tono, string> = { ok: "En meta", warn: "Atención", bad: "Crítico", neutral: "Referencia" }
const TONO_ICONO: Record<Tono, "check" | "alert" | "x" | "info"> = { ok: "check", warn: "alert", bad: "x", neutral: "info" }

function Semaforo({ tono, children }: { tono: Tono; children?: ReactNode }) {
  return (
    <span className={`kpi-status kpi-status-${tono}`}>
      <Icon name={TONO_ICONO[tono]} size="sm" />
      {children ?? TONO_LABEL[tono]}
    </span>
  )
}

function IndicadorTile({ k }: { k: Indicador }) {
  return (
    <div className="kpi-tile">
      <div className="flex items-start justify-between gap-2">
        <p className="kpi-label">{k.etiqueta}</p>
        {k.demo && <span className="demo-tag">Demostración</span>}
      </div>
      <p className="kpi-value">{k.valor}</p>
      <Semaforo tono={k.tono} />
      <p className="kpi-meta">
        <span className="font-extrabold">Meta:</span> {k.meta}
      </p>
      {k.nota && <p className="kpi-note">{k.nota}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tooltip compartido por las gráficas                                 */
/* ------------------------------------------------------------------ */

type Tip = { x: number; y: number; valor: string; etiqueta: string } | null

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip>(null)
  const desdePuntero = (e: PointerEvent<HTMLElement>, valor: string, etiqueta: string) => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, valor, etiqueta })
  }
  const desdeFoco = (e: FocusEvent<HTMLElement>, valor: string, etiqueta: string) => {
    const r = ref.current?.getBoundingClientRect()
    const m = e.currentTarget.getBoundingClientRect()
    if (r) setTip({ x: m.left + m.width / 2 - r.left, y: m.top - r.top, valor, etiqueta })
  }
  const vista = tip ? (
    <div className="chart-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <strong>{tip.valor}</strong>
      <span>{tip.etiqueta}</span>
    </div>
  ) : null
  return { ref, desdePuntero, desdeFoco, ocultar: () => setTip(null), vista }
}

/* ------------------------------------------------------------------ */
/* Gráficas                                                            */
/* ------------------------------------------------------------------ */

function Figura({ g, children, tabla }: { g: Grafica; children: ReactNode; tabla: ReactNode }) {
  return (
    <figure className="admin-card chart-card" aria-labelledby={`fig-${g.id}`}>
      <figcaption>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={`fig-${g.id}`} className="text-base font-extrabold">
            {g.titulo}
          </h3>
          {"demo" in g && g.demo && <span className="demo-tag">Demostración</span>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{g.descripcion}</p>
      </figcaption>
      <div className="mt-4">{children}</div>
      <details className="chart-table">
        <summary>Ver los datos en tabla</summary>
        <div className="table-wrap mt-2" tabIndex={0} role="region" aria-label={`Datos de: ${g.titulo}`}>
          {tabla}
        </div>
      </details>
    </figure>
  )
}

function TablaSimple({ titulo, columnas, filas }: { titulo: string; columnas: string[]; filas: string[][] }) {
  return (
    <table className="admin-table min-w-0">
      <caption className="sr-only">{titulo}</caption>
      <thead>
        <tr>
          {columnas.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            <th scope="row">{f[0]}</th>
            {f.slice(1).map((v, j) => (
              <td key={j}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ancho = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

function BarrasHorizontales({ g }: { g: Extract<Grafica, { tipo: "barras" }> }) {
  const t = useTip()
  if (g.barras.length === 0)
    return (
      <Figura g={g} tabla={<TablaSimple titulo={g.titulo} columnas={["Elemento", "Valor"]} filas={[]} />}>
        <p className="rounded-xl bg-canvas p-4 text-sm font-semibold text-ink-muted">Sin datos por ahora.</p>
      </Figura>
    )
  return (
    <Figura g={g} tabla={<TablaSimple titulo={g.titulo} columnas={["Elemento", "Valor", "Observación"]} filas={g.barras.map((b) => [b.etiqueta, b.texto, b.marca ?? "—"])} />}>
      <div ref={t.ref} className="relative" onPointerLeave={t.ocultar}>
        {g.meta && (
          <div className="hbar-row hbar-head" aria-hidden="true">
            <span />
            <span className="hbar-track">
              <span className="hbar-meta-label" style={{ left: ancho(g.meta.valor, g.max) }}>
                {g.meta.etiqueta}
              </span>
            </span>
            <span />
          </div>
        )}
        {g.barras.map((b: Barra) => (
          <div
            key={b.etiqueta}
            className="hbar-row"
            role="img"
            tabIndex={0}
            aria-label={`${b.etiqueta}: ${b.texto}${b.marca ? `, ${b.marca}` : ""}`}
            onPointerMove={(e) => t.desdePuntero(e, b.texto, b.etiqueta)}
            onFocus={(e) => t.desdeFoco(e, b.texto, b.etiqueta)}
            onBlur={t.ocultar}
          >
            <span className="hbar-label">{b.etiqueta}</span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: ancho(b.valor, g.max) }} />
              {g.meta && <span className="hbar-meta" style={{ left: ancho(g.meta.valor, g.max) }} />}
            </span>
            <span className="hbar-value">
              {b.texto}
              {b.marca && (
                <span className="hbar-flag">
                  <Icon name="alert" size="sm" /> {b.marca}
                </span>
              )}
            </span>
          </div>
        ))}
        {t.vista}
      </div>
    </Figura>
  )
}

function redondeoAmable(x: number) {
  if (x <= 0) return 1
  const e = Math.pow(10, Math.floor(Math.log10(x)))
  const f = x / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e
}

function Columnas({ g }: { g: Extract<Grafica, { tipo: "columnas" }> }) {
  const t = useTip()
  const max = redondeoAmable(g.max)
  const ticks = [max, max / 2, 0]
  const fmt = (v: number) => (max < 1 ? v.toFixed(2) : Math.round(v).toLocaleString("es-MX"))
  const n = g.columnas.length
  const mayor = g.columnas.reduce((m, c, i) => (c.valor > g.columnas[m].valor ? i : m), 0)
  return (
    <Figura g={g} tabla={<TablaSimple titulo={g.titulo} columnas={["Periodo", "Valor"]} filas={g.columnas.map((c) => [c.etiqueta, c.texto])} />}>
      <div ref={t.ref} className="relative" onPointerLeave={t.ocultar}>
        <div className="col-chart">
          <div className="col-axis" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v}>{fmt(v)}</span>
            ))}
          </div>
          <div className="col-plot">
            {ticks.map((v) => (
              <span key={v} className="col-grid" style={{ bottom: ancho(v, max) }} aria-hidden="true" />
            ))}
            {g.meta && (
              <span className="col-meta" style={{ bottom: ancho(g.meta.valor, max) }} aria-hidden="true">
                <span>{g.meta.etiqueta}</span>
              </span>
            )}
            {g.columnas.map((c, i) => (
              <div
                key={c.etiqueta + i}
                className="col-slot"
                role="img"
                tabIndex={0}
                aria-label={`${c.etiqueta}: ${c.texto}`}
                onPointerMove={(e) => t.desdePuntero(e, c.texto, c.etiqueta)}
                onFocus={(e) => t.desdeFoco(e, c.texto, c.etiqueta)}
                onBlur={t.ocultar}
              >
                {(i === n - 1 || i === mayor) && <span className="col-cap">{c.texto.replace(/ solicitudes$/, "")}</span>}
                <span className="col-bar" style={{ height: ancho(c.valor, max) }} />
              </div>
            ))}
          </div>
          <div />
          <div className="col-labels" aria-hidden="true">
            {g.columnas.map((c, i) => (
              <span key={c.etiqueta + i}>{n <= 8 || (n - 1 - i) % 2 === 0 ? c.etiqueta : ""}</span>
            ))}
          </div>
        </div>
        {t.vista}
      </div>
    </Figura>
  )
}

const CELDA_LABEL: Record<EstadoCelda, string> = {
  ok: "Éxito",
  recuperada: "Falla recuperada",
  falla: "Falla sin recuperar",
  omitida: "Omitida (se conservó la versión vigente)",
  sin_programa: "Sin ejecución programada",
}

function Matriz({ g }: { g: Extract<Grafica, { tipo: "matriz" }> }) {
  const t = useTip()
  const n = g.columnas.length
  const presentes = new Set(g.filas.flatMap((f) => f.celdas.map((c) => c.estado)))
  const resumen = (celdas: Array<{ estado: EstadoCelda }>) =>
    (Object.keys(CELDA_LABEL) as EstadoCelda[])
      .filter((k) => k !== "sin_programa")
      .map((k) => [k, celdas.filter((c) => c.estado === k).length] as const)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${CELDA_LABEL[k].toLowerCase()}`)
      .join(", ")
  return (
    <Figura
      g={g}
      tabla={
        <TablaSimple
          titulo={g.titulo}
          columnas={["Día", ...g.filas.map((f) => f.etiqueta)]}
          filas={g.columnas
            .map((d, i) => [d, ...g.filas.map((f) => (f.celdas[i].estado === "sin_programa" ? "—" : CELDA_LABEL[f.celdas[i].estado]))])
            .filter((fila) => fila.slice(1).some((v) => v !== "—"))
            .reverse()}
        />
      }
    >
      <ul className="matrix-legend" aria-label="Simbología">
        {(Object.keys(CELDA_LABEL) as EstadoCelda[])
          .filter((k) => presentes.has(k))
          .map((k) => (
            <li key={k}>
              <span className={`matrix-cell matrix-${k}`} aria-hidden="true" />
              {CELDA_LABEL[k]}
            </li>
          ))}
      </ul>
      <div ref={t.ref} className="relative mt-3 space-y-3" onPointerLeave={t.ocultar}>
        {g.filas.map((f) => (
          <div key={f.etiqueta}>
            <p className="mb-1 text-sm font-bold">{f.etiqueta}</p>
            <div className="matrix-strip" role="img" aria-label={`${f.etiqueta}, últimos ${n} días: ${resumen(f.celdas) || "sin ejecuciones"}`}>
              {f.celdas.map((c, i) => (
                <span key={i} className={`matrix-cell matrix-${c.estado}`} onPointerMove={(e) => t.desdePuntero(e, CELDA_LABEL[c.estado], `${g.columnas[i]} · ${c.detalle}`)} />
              ))}
            </div>
          </div>
        ))}
        <div className="matrix-axis" aria-hidden="true">
          <span>{g.columnas[0]}</span>
          <span>{g.columnas[Math.floor(n / 2)]}</span>
          <span>Hoy</span>
        </div>
        {t.vista}
      </div>
    </Figura>
  )
}

function Medidores({ g }: { g: Extract<Grafica, { tipo: "medidores" }> }) {
  return (
    <Figura g={g} tabla={<TablaSimple titulo={g.titulo} columnas={["Elemento", "Avance", "Estado"]} filas={g.items.map((m) => [m.etiqueta, m.texto, TONO_LABEL[m.tono]])} />}>
      {g.items.length === 0 ? (
        <p className="rounded-xl bg-canvas p-4 text-sm font-semibold text-ink-muted">{g.vacio}</p>
      ) : (
        <ul className="space-y-4">
          {g.items.map((m) => (
            <li key={m.etiqueta}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">{m.etiqueta}</span>
                <Semaforo tono={m.tono}>{m.texto}</Semaforo>
              </div>
              <div className={`meter-track meter-${m.tono}`} role="meter" aria-valuemin={0} aria-valuemax={m.max} aria-valuenow={m.valor} aria-label={`${m.etiqueta}: ${m.texto}`}>
                <span className="meter-fill" style={{ width: ancho(m.valor, m.max) }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Figura>
  )
}

function Partes({ g }: { g: Extract<Grafica, { tipo: "partes" }> }) {
  const t = useTip()
  const total = g.partes.reduce((a, p) => a + p.valor, 0)
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)} %` : "0 %")
  return (
    <Figura g={g} tabla={<TablaSimple titulo={g.titulo} columnas={["Categoría", "Cantidad", "Porcentaje"]} filas={g.partes.map((p) => [p.etiqueta, String(p.valor), pct(p.valor)])} />}>
      <div ref={t.ref} className="relative" onPointerLeave={t.ocultar}>
        <div className="parts-bar" role="img" aria-label={g.partes.map((p) => `${p.etiqueta}: ${p.valor} (${pct(p.valor)})`).join("; ")}>
          {total === 0 ? (
            <span className="parts-empty" />
          ) : (
            g.partes
              .filter((p) => p.valor > 0)
              .map((p) => <span key={p.etiqueta} className={`parts-seg parts-${p.tono}`} style={{ flexGrow: p.valor }} onPointerMove={(e) => t.desdePuntero(e, `${p.valor} (${pct(p.valor)})`, p.etiqueta)} />)
          )}
        </div>
        {t.vista}
      </div>
      <ul className="parts-legend">
        {g.partes.map((p) => (
          <li key={p.etiqueta}>
            <span className={`parts-swatch parts-${p.tono}`} aria-hidden="true" />
            <span className="font-semibold">{p.etiqueta}</span>
            <span className="ml-auto font-extrabold">{p.valor}</span>
            <span className="w-12 text-right text-ink-muted">{pct(p.valor)}</span>
          </li>
        ))}
      </ul>
    </Figura>
  )
}

function VistaGrafica({ g }: { g: Grafica }) {
  switch (g.tipo) {
    case "barras":
      return <BarrasHorizontales g={g} />
    case "columnas":
      return <Columnas g={g} />
    case "matriz":
      return <Matriz g={g} />
    case "medidores":
      return <Medidores g={g} />
    case "partes":
      return <Partes g={g} />
  }
}

/* ------------------------------------------------------------------ */
/* Qué atender hoy                                                     */
/* ------------------------------------------------------------------ */

function Acciones({ acciones, visibles, ir, soloLectura }: { acciones: Accion[]; visibles: Set<ModuloId>; ir: Ctx["ir"]; soloLectura: boolean }) {
  const nombreModulo: Partial<Record<ModuloId, string>> = { cuentas: "Cuentas", plataforma: "Plataforma", datos: "Datos", modelos: "Modelos", moderacion: "Moderación", privacidad: "Privacidad", contenidos: "Contenidos", bitacora: "Bitácora" }
  return (
    <Tarjeta titulo={soloLectura ? "Hallazgos para dar seguimiento" : "Qué atender hoy"}>
      {acciones.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <Icon name="check" size="sm" /> Nada pendiente por ahora.
        </p>
      ) : (
        <ol className="space-y-2">
          {acciones.map((a, i) => (
            <li key={i} className="todo-item">
              <span className={`todo-priority todo-${a.prioridad}`}>{a.prioridad === "alta" ? "Alta" : "Media"}</span>
              <span className="min-w-48 flex-1 text-sm font-semibold">
                {a.texto}
                {a.detalle && <span className="mt-0.5 block text-xs font-normal text-ink-muted">{a.detalle}</span>}
              </span>
              {a.modulo && visibles.has(a.modulo) && (
                <button type="button" className="secondary-button min-h-9" onClick={() => ir(a.modulo!)}>
                  Abrir {nombreModulo[a.modulo]}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  )
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function MiTablero({ ctx }: { ctx: Ctx }) {
  const { cuenta, estado, db, ahora, ir } = ctx
  const roles = ORDEN_ROLES.filter((r) => cuenta.roles.includes(r))
  const [elegido, setElegido] = useState<RolId>(roles[0])
  const rol = roles.includes(elegido) ? elegido : roles[0]
  const minuto = Math.floor(ahora / 60_000)
  const dia = new Date(ahora).toDateString()
  // La muestra de rutas solo se recalcula si cambian los reportes o el día.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const muestra = useMemo(() => (roles.includes("supervision") ? muestraRutas(db, ahora) : undefined), [db, dia, roles.join()])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tablero = useMemo(() => tableroDe(rol, { estado, db, ahora, cuenta }, muestra), [rol, estado, db, minuto, cuenta, muestra])
  const visibles = new Set(modulosVisibles(cuenta, ahora).map((m) => m.id))
  const permisos = permisosDe(cuenta, ahora)
  const soloLectura = rol === "supervision"

  return (
    <>
      <Encabezado eyebrow={`Mi tablero · ${ROLES[rol].nombre}`} titulo={`Hola, ${cuenta.nombre.split(" ")[0]}`}>
        {ROLES[rol].descripcion} Este tablero solo muestra lo que tu función necesita; las personas usuarias no tienen cuenta aquí.
      </Encabezado>

      {cuenta.tipo === "externo" && (
        <p className="callout callout-warning mt-0 mb-4">
          <Icon name="clock" size="sm" className="mt-0.5" />
          Cuenta de especialista externo: vence el {cuenta.vence}. Puedes consultar y proponer; las acciones finales las ejecuta una persona del equipo.
        </p>
      )}

      {roles.length > 1 && (
        <div className="role-switch" role="group" aria-label="Elegir el tablero de uno de tus roles">
          {roles.map((r) => (
            <button key={r} type="button" className={`role-switch-btn ${r === rol ? "role-switch-active" : ""}`} aria-pressed={r === rol} onClick={() => setElegido(r)}>
              {ROLES[r].nombre}
            </button>
          ))}
        </div>
      )}

      <p className="tablero-pregunta">
        <Icon name="search" size="md" className="mt-0.5 shrink-0" />
        <span>
          <span className="block text-xs font-extrabold uppercase tracking-widest text-brand">La pregunta de tu tablero</span>
          {tablero.pregunta}
        </span>
      </p>

      <section aria-label="Indicadores clave" className="kpi-grid">
        {tablero.indicadores.map((k) => (
          <IndicadorTile key={k.id} k={k} />
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          {tablero.graficas.map((g) => (
            <VistaGrafica key={g.id} g={g} />
          ))}
        </div>
        <div className="content-start">
          <Acciones acciones={tablero.acciones} visibles={visibles} ir={ir} soloLectura={soloLectura} />
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Los valores marcados como «Demostración» vienen, en producción, de Cloud Monitoring, de la facturación de Google Cloud o del pipeline de entrenamiento. Los demás se calculan con los datos de este prototipo.
      </p>

      <div className="mt-5 space-y-3">
        <details className="admin-details">
          <summary>Qué puedes y qué no puedes hacer con tu cuenta</summary>
          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            {roles.map((r) => (
              <div key={r}>
                <h3 className="font-extrabold">{ROLES[r].nombre}</h3>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  <ul className="space-y-1.5 text-sm" aria-label="Puedes">
                    {ROLES[r].permisos
                      .filter((p) => permisos.has(p))
                      .map((p) => (
                        <li key={p} className="flex gap-2">
                          <Icon name="check" size="sm" className="mt-0.5 shrink-0 text-success" />
                          {PERMISO_LABEL[p]}
                        </li>
                      ))}
                  </ul>
                  <ul className="space-y-1.5 text-sm" aria-label="No puedes">
                    {[...ROLES[r].noPuede, ...(cuenta.tipo === "externo" ? ROLES[r].permisos.filter((p) => ACCIONES_FINALES.includes(p)).map((p) => PERMISO_LABEL[p]) : [])].map((x) => (
                      <li key={x} className="flex gap-2">
                        <Icon name="x" size="sm" className="mt-0.5 shrink-0 text-danger" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="admin-details">
          <summary>Quién tiene acceso a la consola</summary>
          <p className="mt-3 mb-3 text-sm text-ink-muted">Solo siete roles, pensados para la operación después de la entrega. Una persona puede tener más de un rol si no son incompatibles.</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Roles de la consola">
            <table className="admin-table">
              <caption className="sr-only">Roles de la consola, quién los ocupa en el piloto y después de la entrega</caption>
              <thead>
                <tr>
                  <th scope="col">Rol</th>
                  <th scope="col">En el piloto</th>
                  <th scope="col">Después de la entrega</th>
                  <th scope="col">Su tablero responde</th>
                </tr>
              </thead>
              <tbody>
                {ORDEN_ROLES.map((r) => (
                  <tr key={r} className={cuenta.roles.includes(r) ? "bg-brand-soft" : undefined}>
                    <th scope="row">{ROLES[r].nombre}</th>
                    <td>{ROLES[r].piloto}</td>
                    <td>{ROLES[r].operacion}</td>
                    <td>{PREGUNTAS[r]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            No tienen cuenta: las personas usuarias y acompañantes, el personal de estaciones (usa la app pública), la persona investigadora UX y la intérprete de Lengua de Señas Mexicana. Incompatibles:{" "}
            {ROLES_INCOMPATIBLES.map(([a, b]) => `${ROLES[a].nombre} con ${ROLES[b].nombre}`).join("; ")}.
          </p>
        </details>
      </div>
    </>
  )
}
