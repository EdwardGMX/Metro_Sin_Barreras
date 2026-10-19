import { useEffect, useRef, type ReactNode } from "react"
import type { MetroLine } from "../data/metroData"
import { Icon } from "./Icon"

export function LineBadge({ line, compact = false }: { line: MetroLine; compact?: boolean }) {
  return (
    <span
      className={compact ? "line-badge" : "line-pill"}
      style={{ backgroundColor: line.color, color: line.textColor }}
      aria-label={compact ? line.name : undefined}
    >
      {compact ? line.id : `${line.name} · ${line.stations[0]} — ${line.stations.at(-1)}`}
    </span>
  )
}

/** Diálogo modal accesible basado en <dialog> (gestiona foco y tecla Esc). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "max-w-3xl" : "max-w-xl"}`}
      aria-labelledby={`${title}-titulo`}
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="flex items-start justify-between gap-4 border-b-2 border-border px-6 py-4">
        <h2 id={`${title}-titulo`} className="text-xl font-extrabold">
          {title}
        </h2>
        <button type="button" className="icon-button -mr-2 -mt-1" onClick={onClose} aria-label="Cerrar">
          <Icon name="x" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
    </dialog>
  )
}

export function NivelBadge({ nivel }: { nivel: "baja" | "media" | "alta" }) {
  const tono = nivel === "alta" ? "status-danger" : nivel === "media" ? "status-warning" : "status-success"
  const texto = nivel === "alta" ? "Alta" : nivel === "media" ? "Media" : "Baja"
  return (
    <span className={`status-label ${tono}`}>
      <span className="status-dot" />
      Saturación {texto.toLowerCase()}
    </span>
  )
}
