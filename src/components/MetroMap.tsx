import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react"
import { allStations, getLine, linesAtStation, metroLines, networkBounds, stationXY, type Point } from "../data/metroData"
import { formatoHora, NIVEL_LABEL, saturacion, type Nivel } from "../data/saturation"
import type { ResultadoRuta } from "../lib/router"
import { Icon } from "./Icon"
import { LineBadge } from "./ui"

export const COLOR_NIVEL: Record<Nivel, string> = { baja: "#22955f", media: "#d99a00", alta: "#d23b3b" }

type Vista = { cx: number; cy: number; k: number }
type Caja = { minX: number; maxX: number; minY: number; maxY: number }

const TERMINALES = new Set(metroLines.flatMap((l) => [l.stations[0], l.stations.at(-1)!]))
const reducirMovimiento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

function cajaDe(puntos: Point[], minimo = 500): Caja {
  const xs = puntos.map((p) => p[0])
  const ys = puntos.map((p) => p[1])
  let { minX, maxX, minY, maxY } = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  if (maxX - minX < minimo) [minX, maxX] = [(minX + maxX) / 2 - minimo / 2, (minX + maxX) / 2 + minimo / 2]
  if (maxY - minY < minimo) [minY, maxY] = [(minY + maxY) / 2 - minimo / 2, (minY + maxY) / 2 + minimo / 2]
  return { minX, maxX, minY, maxY }
}

function ajustar(c: Caja, w: number, h: number, margen = 36): Vista {
  const k = Math.min((w - margen * 2) / (c.maxX - c.minX), (h - margen * 2) / (c.maxY - c.minY))
  return { cx: (c.minX + c.maxX) / 2, cy: (c.minY + c.maxY) / 2, k: Math.max(k, 0.01) }
}

/**
 * Mapa interactivo de la red (arrastrar, acercar con rueda, pellizco o botones).
 * Tocar una estación permite elegirla como origen o destino. Su equivalente
 * accesible por teclado son los campos del planificador y las indicaciones en
 * texto (RIE-01).
 */
export function MetroMap({
  origen,
  destino,
  ruta,
  fecha,
  hora,
  onElegir,
  onReportar,
}: {
  origen: string
  destino: string
  ruta: ResultadoRuta | null
  fecha: Date
  hora: number
  onElegir: (station: string, rol: "origen" | "destino") => void
  onReportar: (station: string) => void
}) {
  const contRef = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState({ w: 800, h: 600 })
  const [vista, setVista] = useState<Vista | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const anim = useRef<number | null>(null)
  const punteros = useRef(new Map<number, { x: number; y: number }>())
  const gesto = useRef<{ x: number; y: number; v: Vista; dist?: number; movido: boolean; station?: string | null } | null>(null)
  const vistaRef = useRef<Vista | null>(null)
  vistaRef.current = vista

  const kRed = useMemo(() => ajustar(networkBounds, tam.w, tam.h).k, [tam])
  const z = vista ? vista.k / kRed : 1

  // Tamaño del contenedor.
  useLayoutEffect(() => {
    const el = contRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setTam({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const irA = useCallback((destinoVista: Vista) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    const inicio = vistaRef.current
    if (!inicio || reducirMovimiento()) {
      setVista(destinoVista)
      return
    }
    const t0 = performance.now()
    const paso = (t: number) => {
      const p = Math.min((t - t0) / 380, 1)
      const e = 1 - (1 - p) ** 3
      setVista({
        cx: inicio.cx + (destinoVista.cx - inicio.cx) * e,
        cy: inicio.cy + (destinoVista.cy - inicio.cy) * e,
        k: inicio.k * (destinoVista.k / inicio.k) ** e,
      })
      if (p < 1) anim.current = requestAnimationFrame(paso)
    }
    anim.current = requestAnimationFrame(paso)
  }, [])

  const puntosRuta = useMemo(() => (ruta ? ruta.estaciones.map((e) => stationXY[e.station]) : []), [ruta])
  const claveRuta = ruta ? `${ruta.estaciones[0]?.station}|${ruta.estaciones.at(-1)?.station}|${ruta.lineIds.join(",")}` : `${origen}|${destino}`

  const verRed = useCallback(() => irA(ajustar(networkBounds, tam.w, tam.h)), [irA, tam])
  const verRuta = useCallback(() => {
    const pts = puntosRuta.length ? puntosRuta : [stationXY[origen], stationXY[destino]]
    irA(ajustar(cajaDe(pts), tam.w, tam.h, 72))
  }, [irA, puntosRuta, origen, destino, tam])

  // Vista inicial y encuadre de la ruta cuando cambia.
  useEffect(() => {
    if (!vista) setVista(ajustar(networkBounds, tam.w, tam.h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tam])
  const movidoPorUsuario = useRef(false)
  useEffect(() => {
    movidoPorUsuario.current = false
    verRuta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveRuta])
  // Si cambia el tamaño del mapa y la persona no lo ha movido, se vuelve a encuadrar.
  useEffect(() => {
    if (!movidoPorUsuario.current) verRuta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tam])

  const zoomEn = useCallback(
    (factor: number, mx?: number, my?: number) => {
      movidoPorUsuario.current = true
      setVista((v) => {
        if (!v) return v
        const k = Math.min(Math.max(v.k * factor, kRed * 0.8), kRed * 8)
        const px = mx ?? tam.w / 2
        const py = my ?? tam.h / 2
        const ux = v.cx + (px - tam.w / 2) / v.k
        const uy = v.cy + (py - tam.h / 2) / v.k
        return { k, cx: ux - (px - tam.w / 2) / k, cy: uy - (py - tam.h / 2) / k }
      })
    },
    [kRed, tam],
  )

  // Rueda del ratón (listener no pasivo para evitar que la página se desplace).
  useEffect(() => {
    const el = contRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      movidoPorUsuario.current = true
      const r = el.getBoundingClientRect()
      zoomEn(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomEn])

  const local = (e: RPointerEvent) => {
    const r = contRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!vista) return
    if (anim.current) cancelAnimationFrame(anim.current)
    movidoPorUsuario.current = true
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    punteros.current.set(e.pointerId, local(e))
    const ps = [...punteros.current.values()]
    if (ps.length === 1) gesto.current = { ...ps[0], v: vista, movido: false, station: (e.target as Element).closest?.("[data-station]")?.getAttribute("data-station") }
    if (ps.length === 2) {
      const cx = (ps[0].x + ps[1].x) / 2
      const cy = (ps[0].y + ps[1].y) / 2
      gesto.current = { x: cx, y: cy, v: vista, dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), movido: true }
    }
  }
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!punteros.current.has(e.pointerId) || !gesto.current) return
    punteros.current.set(e.pointerId, local(e))
    const ps = [...punteros.current.values()]
    const g = gesto.current
    if (ps.length === 1) {
      const dx = ps[0].x - g.x
      const dy = ps[0].y - g.y
      if (Math.hypot(dx, dy) > 5) g.movido = true
      if (g.movido) setVista({ ...g.v, cx: g.v.cx - dx / g.v.k, cy: g.v.cy - dy / g.v.k })
    } else if (ps.length === 2 && g.dist) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)
      const k = Math.min(Math.max(g.v.k * (d / g.dist), kRed * 0.8), kRed * 8)
      const mx = (ps[0].x + ps[1].x) / 2
      const my = (ps[0].y + ps[1].y) / 2
      const ux = g.v.cx + (g.x - tam.w / 2) / g.v.k
      const uy = g.v.cy + (g.y - tam.h / 2) / g.v.k
      setVista({ k, cx: ux - (mx - tam.w / 2) / k, cy: uy - (my - tam.h / 2) / k })
    }
  }
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesto.current
    const eraClic = punteros.current.size === 1 && g && !g.movido
    punteros.current.delete(e.pointerId)
    if (punteros.current.size === 0) gesto.current = null
    else if (punteros.current.size === 1 && vista) {
      const [p] = [...punteros.current.values()]
      gesto.current = { ...p, v: vista, movido: true }
    }
    if (eraClic) setSel(g.station ?? null)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!vista) return
    const paso = 60 / vista.k
    const acciones: Record<string, () => void> = {
      ArrowLeft: () => setVista({ ...vista, cx: vista.cx - paso }),
      ArrowRight: () => setVista({ ...vista, cx: vista.cx + paso }),
      ArrowUp: () => setVista({ ...vista, cy: vista.cy - paso }),
      ArrowDown: () => setVista({ ...vista, cy: vista.cy + paso }),
      "+": () => zoomEn(1.4),
      "=": () => zoomEn(1.4),
      "-": () => zoomEn(1 / 1.4),
      "0": verRed,
      Escape: () => setSel(null),
    }
    const fn = acciones[e.key]
    if (fn) {
      movidoPorUsuario.current = true
      e.preventDefault()
      fn()
    }
  }

  // Datos por estación.
  const enRuta = useMemo(() => new Map(ruta?.estaciones.map((e) => [e.station, e]) ?? []), [ruta])
  const cambios = useMemo(() => new Set(ruta?.cambios.map((c) => c.station) ?? []), [ruta])
  const lineasRuta = new Set(ruta?.lineIds ?? [])
  const niveles = useMemo(() => {
    const m = new Map<string, Nivel>()
    for (const s of allStations) m.set(s, enRuta.get(s)?.nivel ?? saturacion(s, fecha, hora).nivel)
    return m
  }, [enRuta, fecha, hora])

  if (!vista) return <div ref={contRef} className="map-canvas" />

  const px = (n: number) => n / vista.k
  const s = Math.min(1 + (z - 1) * 0.22, 2.1)
  const viewBox = `${vista.cx - tam.w / 2 / vista.k} ${vista.cy - tam.h / 2 / vista.k} ${tam.w / vista.k} ${tam.h / vista.k}`
  const aPantalla = (p: Point) => ({ x: (p[0] - vista.cx) * vista.k + tam.w / 2, y: (p[1] - vista.cy) * vista.k + tam.h / 2 })

  const mostrarEtiqueta = (st: string) =>
    st === origen ||
    st === destino ||
    cambios.has(st) ||
    st === hover ||
    st === sel ||
    (ruta ? (enRuta.has(st) && z >= 2.2) || z >= 4.5 : z >= 3.2 || (z >= 1.8 && linesAtStation(st).length > 1) || (z >= 1.2 && TERMINALES.has(st)))

  const tamFuente = 12.5 * Math.min(1 + (z - 1) * 0.06, 1.25)
  const prioridad = (st: string) =>
    st === origen || st === destino || st === sel || st === hover ? 0 : cambios.has(st) ? 1 : enRuta.has(st) ? 2 : linesAtStation(st).length > 1 ? 3 : TERMINALES.has(st) ? 4 : 5
  const etiquetas: Array<{ st: string; fuerte: boolean; x: number; y: number; f: number }> = []
  {
    const cajas: Array<[number, number, number, number]> = []
    for (const st of allStations.filter(mostrarEtiqueta).sort((a, b) => prioridad(a) - prioridad(b))) {
      const fuerte = prioridad(st) <= 1
      const f = fuerte ? tamFuente + 1.5 : tamFuente - 1
      const dx = st === origen || st === destino ? 18 : 11
      const p = aPantalla(stationXY[st])
      const caja: [number, number, number, number] = [p.x + dx - 2, p.y - f * 0.75, p.x + dx + st.length * f * 0.56 + 2, p.y + f * 0.45]
      const choca = cajas.some((c) => caja[0] < c[2] && caja[2] > c[0] && caja[1] < c[3] && caja[3] > c[1])
      if (choca && prioridad(st) > 0) continue
      cajas.push(caja)
      etiquetas.push({ st, fuerte, x: stationXY[st][0] + px(dx), y: stationXY[st][1] + px(4), f })
    }
  }
  const selInfo = sel ? { p: aPantalla(stationXY[sel]), lineas: linesAtStation(sel), nivel: niveles.get(sel)!, llegada: enRuta.get(sel)?.llegada } : null

  return (
    <div
      ref={contRef}
      className="map-canvas"
      tabIndex={0}
      role="region"
      aria-label="Mapa interactivo de la red del Metro"
      aria-describedby="mapa-ayuda"
      onKeyDown={onKeyDown}
    >
      <svg
        viewBox={viewBox}
        className="absolute inset-0 h-full w-full touch-none select-none"
        role="img"
        aria-label={
          ruta
            ? `Mapa con la ruta de ${origen} a ${destino} por las líneas ${ruta.lineIds.join(", ")}. Las indicaciones en texto están en el panel del viaje.`
            : `Mapa de la red del Metro. Origen ${origen}, destino ${destino}.`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
      >
        {/* Líneas */}
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          {metroLines.map((l) => (
            <polyline
              key={l.id}
              points={l.stations.map((st) => stationXY[st].join(",")).join(" ")}
              stroke={l.color}
              strokeWidth={px(4 + Math.min(z, 4) * 0.7)}
              opacity={ruta ? (lineasRuta.has(l.id) ? 0.5 : 0.22) : 0.95}
            />
          ))}
        </g>

        {/* Ruta */}
        {ruta && puntosRuta.length > 1 && (
          <g strokeLinecap="round" strokeLinejoin="round" fill="none">
            <polyline points={puntosRuta.map((p) => p.join(",")).join(" ")} stroke="var(--map-casing)" strokeWidth={px(16 + z)} />
            {ruta.estaciones.slice(1).map((e, i) => {
              const a = stationXY[ruta.estaciones[i].station]
              const b = stationXY[e.station]
              return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={getLine(e.line).color} strokeWidth={px(10 + z * 0.6)} />
            })}
          </g>
        )}

        {/* Estaciones */}
        <g>
          {allStations.map((st) => {
            const [x, y] = stationXY[st]
            const transbordo = linesAtStation(st).length > 1
            const color = COLOR_NIVEL[niveles.get(st)!]
            const atenuada = ruta && !enRuta.has(st) && st !== origen && st !== destino
            return (
              <g
                key={st}
                data-station={st}
                className="map-station"
                opacity={atenuada ? 0.5 : 1}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(st)}
                onPointerLeave={() => setHover((h) => (h === st ? null : h))}
              >
                <circle cx={x} cy={y} r={px(14)} fill="transparent" />
                {transbordo ? (
                  <>
                    <circle cx={x} cy={y} r={px(7.5 * s)} fill="var(--map-bg-station)" stroke="var(--color-ink)" strokeWidth={px(2.4)} />
                    <circle cx={x} cy={y} r={px(4.2 * s)} fill={color} />
                  </>
                ) : (
                  <circle cx={x} cy={y} r={px(4.6 * s)} fill={color} stroke="var(--map-bg-station)" strokeWidth={px(1.6)} />
                )}
                {(st === hover || st === sel) && <circle cx={x} cy={y} r={px(13 * s)} fill="none" stroke="var(--color-brand)" strokeWidth={px(2.5)} />}
              </g>
            )
          })}
        </g>

        {/* Transbordos de la ruta */}
        {ruta?.cambios.map((c) => {
          const [x, y] = stationXY[c.station]
          const r = px(12 * Math.min(s, 1.5))
          return (
            <g key={`cambio-${c.station}`} pointerEvents="none">
              <circle cx={x} cy={y} r={r} fill="var(--color-ink)" stroke="var(--map-bg-station)" strokeWidth={px(2.5)} />
              <path
                d={`M${x - r * 0.45} ${y - r * 0.22}h${r * 0.9}l-${r * 0.28} -${r * 0.28}M${x + r * 0.45} ${y + r * 0.22}h-${r * 0.9}l${r * 0.28} ${r * 0.28}`}
                stroke="white"
                strokeWidth={px(2)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}

        {/* Origen y destino */}
        {[
          { st: origen, letra: "A", fill: "var(--color-brand)" },
          { st: destino, letra: "B", fill: "var(--color-ink)" },
        ].map(({ st, letra, fill }) => {
          const [x, y] = stationXY[st]
          const r = px(13 * Math.min(s, 1.5))
          return (
            <g key={`pin-${letra}`} pointerEvents="none">
              <path d={`M${x} ${y} l${-r * 0.75} ${-r * 1.3} a${r} ${r} 0 1 1 ${r * 1.5} 0 Z`} fill={fill} stroke="white" strokeWidth={px(2)} />
              <text x={x} y={y - r * 1.95} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={px(13)} fontWeight={800}>
                {letra}
              </text>
            </g>
          )
        })}

        {/* Etiquetas (se omiten las que se encimarían) */}
        <g className="map-labels" pointerEvents="none">
          {etiquetas.map(({ st, fuerte, x, y, f }) => (
            <text key={`t-${st}`} x={x} y={y} fontSize={px(f)} fontWeight={fuerte ? 800 : 600} strokeWidth={px(4)} className={fuerte ? "" : "map-label-muted"}>
              {st}
            </text>
          ))}
        </g>
      </svg>

      {/* Controles */}
      <div className="map-controls" role="group" aria-label="Controles del mapa">
        <button type="button" className="map-control" onClick={() => zoomEn(1.5)} aria-label="Acercar">
          <Icon name="plus" size="sm" />
        </button>
        <button type="button" className="map-control" onClick={() => zoomEn(1 / 1.5)} aria-label="Alejar">
          <Icon name="minus" size="sm" />
        </button>
        <button type="button" className="map-control" onClick={verRuta} aria-label="Centrar en mi ruta" title="Centrar en mi ruta">
          <Icon name="route" size="sm" />
        </button>
        <button type="button" className="map-control" onClick={verRed} aria-label="Ver toda la red" title="Ver toda la red">
          <Icon name="expand" size="sm" />
        </button>
      </div>

      {/* Ficha de la estación elegida */}
      {sel && selInfo && (
        <div
          className="station-popover"
          role="dialog"
          aria-label={`Estación ${sel}`}
          style={{
            left: Math.min(Math.max(selInfo.p.x - 140, 8), tam.w - 288),
            ...(selInfo.p.y > 210 ? { bottom: tam.h - selInfo.p.y + 16 } : { top: selInfo.p.y + 16 }),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-extrabold leading-tight">{sel}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selInfo.lineas.map((id) => (
                  <LineBadge key={id} line={getLine(id)} compact />
                ))}
              </div>
            </div>
            <button type="button" className="-mr-1 -mt-1 grid size-8 place-items-center rounded-lg hover:bg-surface" onClick={() => setSel(null)} aria-label="Cerrar">
              <Icon name="x" size="sm" />
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <span className="size-2.5 rounded-full" style={{ background: COLOR_NIVEL[selInfo.nivel] }} />
            Saturación {NIVEL_LABEL[selInfo.nivel].toLowerCase()} a las {formatoHora(selInfo.llegada ?? hora)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="popover-button"
              disabled={sel === origen}
              onClick={() => {
                onElegir(sel, "origen")
                setSel(null)
              }}
            >
              <span className="pin-dot bg-brand">A</span> Salir de aquí
            </button>
            <button
              type="button"
              className="popover-button"
              disabled={sel === destino}
              onClick={() => {
                onElegir(sel, "destino")
                setSel(null)
              }}
            >
              <span className="pin-dot bg-ink">B</span> Llegar aquí
            </button>
          </div>
          <button
            type="button"
            className="mt-2 w-full text-left text-xs font-extrabold text-brand underline"
            onClick={() => {
              onReportar(sel)
              setSel(null)
            }}
          >
            Reportar un equipo de esta estación
          </button>
        </div>
      )}
    </div>
  )
}
