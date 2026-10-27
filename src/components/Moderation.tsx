import { useEffect, useState } from "react"
import { leerFoto } from "../lib/evidence"

/** Miniatura de una evidencia; solo se usa en el módulo de Moderación de la consola. */
export function Foto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    void leerFoto(id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b)
        setUrl(u)
      }
    })
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  return url ? <img src={url} alt="Evidencia del reporte" className="h-24 w-32 rounded-lg object-cover" /> : <span className="text-xs text-ink-muted">Foto no disponible en este navegador</span>
}
