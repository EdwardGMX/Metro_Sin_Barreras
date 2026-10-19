import { getLine, metroLines, pointForStation } from "../data/metroData"
import type { ResultadoRuta } from "../lib/router"

/** Mapa esquemático. Su equivalente textual son las indicaciones paso a paso (RIE-01). */
export function MetroMap({
  origen,
  destino,
  origenLinea,
  destinoLinea,
  ruta,
}: {
  origen: string
  destino: string
  origenLinea: string
  destinoLinea: string
  ruta: ResultadoRuta | null
}) {
  const activas = ruta && ruta.lineIds.length ? ruta.lineIds : [origenLinea, destinoLinea]
  const puntos = ruta?.estaciones.map((e) => pointForStation(getLine(e.line), e.station)) ?? []
  const pOrigen = pointForStation(getLine(ruta?.estaciones[0]?.line ?? origenLinea), origen)
  const pDestino = pointForStation(getLine(ruta?.estaciones.at(-1)?.line ?? destinoLinea), destino)
  const transbordos = new Set(
    (ruta?.pasos ?? []).filter((p) => p.tipo === "transbordo").map((p) => p.texto.split(",")[0].replace("En ", "")),
  )

  return (
    <svg viewBox="0 0 760 470" className="absolute inset-0 h-full w-full" role="img" aria-label={`Mapa esquemático de ${origen} a ${destino}. Las indicaciones en texto están en “Estado de tu viaje”.`}>
      {metroLines.map((line) => {
        const active = activas.includes(line.id)
        return (
          <g key={line.id} className={active ? "metro-line metro-line-active" : "metro-line"}>
            <polyline points={line.points.map((p) => p.join(",")).join(" ")} stroke={line.color} />
          </g>
        )
      })}
      {puntos.length > 1 && (
        <>
          <polyline points={puntos.map((p) => p.join(",")).join(" ")} className="dynamic-route-outline" />
          <polyline points={puntos.map((p) => p.join(",")).join(" ")} className="dynamic-route" />
        </>
      )}
      {ruta?.estaciones
        .filter((e) => transbordos.has(e.station))
        .map((e) => {
          const [x, y] = pointForStation(getLine(e.line), e.station)
          return <circle key={`${e.station}-${e.line}`} cx={x} cy={y} r="7" className="station-halo" />
        })}
      {[
        { p: pOrigen, nombre: origen, dy: -14, color: getLine(origenLinea).color },
        { p: pDestino, nombre: destino, dy: 26, color: getLine(destinoLinea).color },
      ].map(({ p, nombre, dy, color }) => (
        <g className="selected-station" key={nombre + dy}>
          <circle cx={p[0]} cy={p[1]} r="15" className="station-halo" />
          <circle cx={p[0]} cy={p[1]} r="8" fill={color} />
          <text x={Math.min(p[0] + 15, 640)} y={p[1] + dy}>
            {nombre}
          </text>
        </g>
      ))}
    </svg>
  )
}
