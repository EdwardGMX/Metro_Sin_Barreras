/**
 * Alarma sonora de las urgencias con Web Audio (sin archivos de audio).
 * Los navegadores solo dejan sonar después de un toque o una tecla, así que el contexto
 * de audio se desbloquea con el primer gesto en la consola.
 */
import { useEffect, useState } from "react"

let contexto: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    contexto ??= new AC()
  } catch {
    return null
  }
  return contexto
}

export function desbloquearAudio() {
  const a = audio()
  if (a && a.state === "suspended") void a.resume().catch(() => undefined)
}

/** Una ráfaga de sirena de dos tonos (≈1.4 s). */
function rafaga(a: AudioContext) {
  const t0 = a.currentTime + 0.02
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = "square"
  for (let i = 0; i < 4; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 960, t0 + i * 0.35)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03)
  gain.gain.setValueAtTime(0.16, t0 + 1.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + 1.45)
}

/**
 * Hace sonar la sirena cada 2.2 s mientras `activa` sea verdadero.
 * Devuelve `true` si el navegador bloqueó el sonido y hace falta un toque para activarlo.
 */
export function useSirena(activa: boolean): { bloqueado: boolean; activarSonido: () => void } {
  const [bloqueado, setBloqueado] = useState(false)

  useEffect(() => {
    const gesto = () => {
      desbloquearAudio()
      setBloqueado(false)
    }
    document.addEventListener("pointerdown", gesto)
    document.addEventListener("keydown", gesto)
    return () => {
      document.removeEventListener("pointerdown", gesto)
      document.removeEventListener("keydown", gesto)
    }
  }, [])

  useEffect(() => {
    if (!activa) {
      setBloqueado(false)
      return
    }
    const a = audio()
    if (!a) return
    const sonar = () => {
      if (a.state === "running") {
        rafaga(a)
        setBloqueado(false)
      } else {
        void a.resume().catch(() => undefined)
        window.setTimeout(() => setBloqueado(a.state !== "running"), 250)
      }
      try {
        navigator.vibrate?.([400, 150, 400])
      } catch {
        /* sin vibración */
      }
    }
    sonar()
    const id = window.setInterval(sonar, 2200)
    return () => window.clearInterval(id)
  }, [activa])

  const activarSonido = () => {
    const a = audio()
    if (!a) return
    void a.resume().then(() => {
      setBloqueado(false)
      rafaga(a)
    }).catch(() => undefined)
  }

  return { bloqueado, activarSonido }
}
