import { useState } from "react"
import { Icon } from "./Icon"
import { Dialog } from "./ui"

/**
 * Botón de emergencia (RF-15). El contenido va dentro de la aplicación y el
 * service worker lo guarda en caché, por lo que se puede abrir sin conexión.
 * CONTENIDO DE EJEMPLO: en producción se sustituye por las indicaciones
 * oficiales del STC, con su fuente y fecha (CA-15.2).
 */
const PASOS = [
  "Si tú u otra persona están en peligro inmediato, llama al 911.",
  "Pide apoyo al personal del Metro o a la policía de la estación; puedes identificarlos por su uniforme.",
  "Si quedas dentro de un elevador detenido, usa el botón de alarma o el interfón del elevador y espera instrucciones. No intentes abrir las puertas.",
  "Dentro del tren, usa el dispositivo de emergencia del vagón solo ante una emergencia real.",
  "Nunca bajes a las vías. Si algo cae a las vías, avisa al personal.",
]

export function EmergencyButton() {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" className="emergency-button" onClick={() => setAbierto(true)}>
        <Icon name="phone" /> Emergencia
      </button>
      <Dialog open={abierto} onClose={() => setAbierto(false)} title="Qué hacer en una emergencia">
        <p className="mb-4 rounded-xl bg-warning-soft p-3 text-sm font-bold text-warning">
          Disponible sin conexión. Contenido de ejemplo del prototipo: en la versión final se muestran las indicaciones oficiales del STC.
        </p>
        <ol className="space-y-3">
          {PASOS.map((p, i) => (
            <li key={p} className="flex gap-3 text-base leading-relaxed">
              <span className="step-number">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        <a href="tel:911" className="primary-button mt-6 w-full">
          <Icon name="phone" /> Llamar al 911
        </a>
        <p className="mt-4 text-xs text-ink-muted">Fuente: contenido de ejemplo del equipo, pendiente de sustituir por la fuente oficial del STC. Actualizado: octubre de 2026.</p>
      </Dialog>
    </>
  )
}
