/**
 * Pictogramas de las urgencias graves: un dibujo simple, en blanco sobre rojo, que se reconoce de lejos.
 * No muestran sangre ni violencia explícita.
 */
import type { ReactNode } from "react"
import { INFO_URGENCIA, type TipoUrgencia } from "../../lib/urgencias"

const S = { stroke: "#fff", strokeWidth: 3.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" }
const cabeza = (cx: number, cy: number, r = 4.5) => <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="none" />

const DIBUJOS: Record<TipoUrgencia, ReactNode> = {
  // Persona que cae hacia las vías: rieles con durmientes y flecha hacia abajo.
  persona_vias: (
    <>
      <path {...S} d="M8 7h18" strokeWidth={3} />
      {cabeza(34, 13)}
      <path {...S} d="M33 18 27 31M32 22l9-5M32 22l-9-6M27 31l-6 6M27 31l5 8" />
      <path {...S} d="M46 20v12m-3.5-3.5L46 32l3.5-3.5" strokeWidth={3} />
      <path {...S} d="M8 49h48M8 56h48" strokeWidth={3} />
      <path {...S} d="M14 46v13M24 46v13M34 46v13M44 46v13M54 46v13" strokeWidth={2.5} />
    </>
  ),
  // Silueta de una persona tendida, como un contorno de tiza.
  homicidio: (
    <>
      <circle cx="15" cy="38" r="5" {...S} strokeWidth={3} />
      <path {...S} d="M20 38h20M26 38l4-8M26 38l6 8M40 38l10-6M40 38l12 7" />
      <path {...S} d="M8 52h48" strokeWidth={2.5} strokeDasharray="4 5" />
      <path {...S} d="M32 9v9m0 5v.5" strokeWidth={4} />
    </>
  ),
  // Una persona golpea a otra; marcas de impacto.
  agresion: (
    <>
      {cabeza(17, 15)}
      <path {...S} d="M17 20v17M17 37l-5 13M17 37l5 13M17 25l12-2M17 26l-6 7" />
      <circle cx="31" cy="22.5" r="3" fill="#fff" />
      {cabeza(46, 17)}
      <path {...S} d="M46 22l2 17M48 39l-5 12M48 39l5 12M47 27l7-6M47 28l-6 3" />
      <path {...S} d="M35 13l2 3M39 10v4M43 12l-2 3" strokeWidth={2.5} />
    </>
  ),
  // Persona que corre con una bolsa.
  robo: (
    <>
      {cabeza(30, 12)}
      <path {...S} d="M29 17l-4 15M25 32l8 7-1 11M25 32l-7 9h-6M28 21l8 6M28 21l-8 6" />
      <rect x="36" y="27" width="13" height="11" rx="2" fill="#fff" />
      <path {...S} d="M39.5 27c1-4 5-4 6 0" strokeWidth={2.5} />
      <path {...S} d="M4 20h8M3 28h8M5 36h8" strokeWidth={2.5} />
    </>
  ),
  // Cruz médica con línea de pulso.
  medica: (
    <>
      <path d="M25 9h14v15h15v14H39v15H25V38H10V24h15Z" fill="#fff" />
      <path d="M12 31h9l3-7 5 14 4-11 3 4h14" fill="none" stroke="#b3261e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Flama.
  incendio: (
    <>
      <path d="M32 5c4 9 15 15 15 30a15 15 0 0 1-30 0c0-8 4-12 7-16 1 5 3 8 6 9-2-8 0-16 2-23Z" fill="#fff" />
      <path d="M32 33c3 3 7 6 7 11a7 7 0 0 1-14 0c0-5 4-7 7-11Z" fill="#b3261e" />
    </>
  ),
  // Paquete abandonado con signo de alerta.
  objeto: (
    <>
      <rect x="11" y="22" width="42" height="29" rx="4" {...S} />
      <path {...S} d="M24 22v-6h16v6" />
      <path {...S} d="M32 29v11" strokeWidth={4} />
      <circle cx="32" cy="45.5" r="2.4" fill="#fff" />
    </>
  ),
}

export function Pictograma({ tipo, size = 64, decorativo = false }: { tipo: TipoUrgencia; size?: number; decorativo?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={decorativo ? undefined : "img"} aria-hidden={decorativo || undefined} aria-label={decorativo ? undefined : INFO_URGENCIA[tipo].nombre} className="pictograma">
      <rect x="0" y="0" width="64" height="64" rx="14" fill="#b3261e" />
      {DIBUJOS[tipo]}
    </svg>
  )
}
