import { useState } from "react"
import { CONTENIDO_EJEMPLO, type ContenidoEmergencia, type EstadoConsola } from "../lib/admin"
import { leer } from "../lib/storage"
import { Icon } from "./Icon"
import { Dialog } from "./ui"

/**
 * Botón de emergencia (RF-15). El contenido va dentro de la aplicación y el
 * service worker lo guarda en caché, por lo que se puede abrir sin conexión.
 * El texto lo publica la consola del personal: lo propone Accesibilidad y
 * contenidos y lo aprueba Gobernanza (HU-28, RN9), con su fuente y fecha (CA-15.1).
 */
function contenidoPublicado(): ContenidoEmergencia {
  return leer<EstadoConsola | null>("msb.consola.v1", null)?.contenido?.publicado ?? CONTENIDO_EJEMPLO
}

export function EmergencyButton() {
  const [abierto, setAbierto] = useState(false)
  const [contenido, setContenido] = useState<ContenidoEmergencia>(contenidoPublicado)
  return (
    <>
      <button
        type="button"
        className="emergency-button"
        onClick={() => {
          setContenido(contenidoPublicado())
          setAbierto(true)
        }}
      >
        <Icon name="phone" /> Emergencia
      </button>
      <Dialog open={abierto} onClose={() => setAbierto(false)} title="Qué hacer en una emergencia">
        <p className={`mb-4 rounded-xl p-3 text-sm font-bold ${contenido.ejemplo ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
          Disponible sin conexión.{" "}
          {contenido.ejemplo
            ? "Contenido de ejemplo del prototipo: en la versión final se muestran las indicaciones oficiales del STC."
            : "Indicaciones oficiales del STC, revisadas por Gobernanza de datos."}
        </p>
        <ol className="space-y-3">
          {contenido.pasos.map((p, i) => (
            <li key={i} className="flex gap-3 text-base leading-relaxed">
              <span className="step-number">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        <a href="tel:911" className="primary-button mt-6 w-full">
          <Icon name="phone" /> Llamar al 911
        </a>
        <p className="mt-4 text-xs text-ink-muted">
          Fuente: {contenido.fuente} Actualizado: {contenido.actualizado} (versión {contenido.version}).
        </p>
      </Dialog>
    </>
  )
}
