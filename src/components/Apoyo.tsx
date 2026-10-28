/**
 * Pedir apoyo en la estación (HU-36): la persona que se transporta lo solicita sin cuenta y
 * ve en qué va su solicitud. Le llega al jefe de la estación, que la asigna a una persona.
 */
import { useEffect, useState, type FormEvent } from "react"
import { cancelarApoyo, operacionDe, personaPorId, solicitarApoyo, validarApoyo, ESTACIONES_PILOTO, PUNTOS_ENCUENTRO, type Incidente, type TipoIncidente } from "../lib/operacion"
import type { BaseDatos } from "../lib/reports"
import { guardar, leer } from "../lib/storage"
import { Icon } from "./Icon"

const CLAVE_MIS_APOYOS = "msb.apoyo.mios"

const MOTIVOS: Array<{ id: string; texto: string; tipo: TipoIncidente }> = [
  { id: "equipo", texto: "Un elevador o salvaescaleras que necesito no funciona", tipo: "apoyo_movilidad" },
  { id: "acompanar", texto: "Necesito acompañamiento para un transbordo", tipo: "apoyo_movilidad" },
  { id: "abordar", texto: "Necesito ayuda para subir o bajar del tren", tipo: "apoyo_movilidad" },
  { id: "orientacion", texto: "Necesito orientación dentro de la estación", tipo: "apoyo_movilidad" },
  { id: "atrapada", texto: "Una persona quedó atrapada en un elevador", tipo: "persona_atrapada" },
]
const LLEGADA = ["Ya estoy en la estación", "Llego en unos 15 minutos", "Llego en unos 30 minutos"]

const PASOS: Array<{ estado: Incidente["estado"]; texto: string }> = [
  { estado: "abierta", texto: "Recibida" },
  { estado: "asignada", texto: "Asignada" },
  { estado: "en_camino", texto: "En camino" },
  { estado: "atendida", texto: "Atendida" },
]
const ORDEN: Record<Incidente["estado"], number> = { abierta: 0, asignada: 1, en_camino: 2, atendida: 3, cancelada: 3 }
const hora = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "")

export function Apoyo({
  db,
  actualizar,
  enLinea,
  preseleccion,
}: {
  db: BaseDatos
  actualizar: (fn: (d: BaseDatos) => void) => void
  enLinea: boolean
  preseleccion: { station: string; n: number } | null
}) {
  const [mios, setMios] = useState<string[]>(() => leer<string[]>(CLAVE_MIS_APOYOS, []))
  const enPiloto = (s?: string) => Boolean(s && ESTACIONES_PILOTO.includes(s))
  const [station, setStation] = useState(enPiloto(preseleccion?.station) ? preseleccion!.station : ESTACIONES_PILOTO[0])
  const [fueraDePiloto, setFueraDePiloto] = useState<string | null>(null)
  const [punto, setPunto] = useState(PUNTOS_ENCUENTRO[0])
  const [motivo, setMotivo] = useState(MOTIVOS[0].id)
  const [llegada, setLlegada] = useState(LLEGADA[0])
  const [detalle, setDetalle] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!preseleccion) return
    if (ESTACIONES_PILOTO.includes(preseleccion.station)) {
      setStation(preseleccion.station)
      setFueraDePiloto(null)
    } else setFueraDePiloto(preseleccion.station)
  }, [preseleccion])

  const op = operacionDe(db)
  const propias = mios.map((f) => op.incidentes.find((x) => x.id === f)).filter((x): x is Incidente => Boolean(x))
  const activa = propias.find((x) => x.estado !== "atendida" && x.estado !== "cancelada")
  const anteriores = propias.filter((x) => x !== activa).slice(0, 3)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const m = MOTIVOS.find((x) => x.id === motivo)!
    const datos = { station, punto, tipo: m.tipo, detalle: [m.texto, llegada, detalle.trim()].filter(Boolean).join(". ") }
    const err = validarApoyo({ ...datos, detalle: detalle.trim() })
    if (err) {
      setError(err)
      return
    }
    let folio = ""
    actualizar((d) => {
      const r = solicitarApoyo(d, datos, Date.now())
      if (r.ok) folio = r.folio
    })
    if (folio) {
      const nuevos = [folio, ...mios].slice(0, 10)
      setMios(nuevos)
      guardar(CLAVE_MIS_APOYOS, nuevos)
      setError(null)
      setDetalle("")
    }
  }

  return (
    <div id="apoyo" className="scroll-mt-24">
      <div className="report-intro">
        <span className="status-icon bg-brand-soft text-brand">
          <Icon name="people" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand">Apoyo en la estación</p>
          <h2 className="mt-1 text-2xl font-extrabold">Pide que alguien del Metro te ayude</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            Si un elevador no funciona o necesitas acompañamiento, el jefe de la estación asigna a una persona del personal o de la policía auxiliar para que vaya contigo. No necesitas cuenta. Si hay una emergencia, llama al 911.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {activa ? (
          <EstadoSolicitud x={activa} db={db} onCancelar={() => actualizar((d) => void cancelarApoyo(d, activa.id, Date.now()))} />
        ) : (
          <form className="report-form" onSubmit={enviar} noValidate aria-label="Pedir apoyo en la estación">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="apoyo-estacion">
                  Estación
                </label>
                <select id="apoyo-estacion" className="field-select" value={station} onChange={(e) => setStation(e.target.value)} aria-describedby="apoyo-piloto">
                  {ESTACIONES_PILOTO.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="apoyo-punto">
                  Dónde te encontramos
                </label>
                <select id="apoyo-punto" className="field-select" value={punto} onChange={(e) => setPunto(e.target.value)}>
                  {PUNTOS_ENCUENTRO.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <p id="apoyo-piloto" className={`mt-2 text-xs ${fueraDePiloto ? "font-bold text-warning" : "text-ink-muted"}`}>
              {fueraDePiloto ? `${fueraDePiloto} todavía no tiene este servicio. ` : ""}Durante el piloto, el apoyo funciona en {ESTACIONES_PILOTO.join(", ")}; en las demás estaciones acude a la taquilla o al personal del Metro.
            </p>
            <fieldset className="mt-4">
              <legend className="field-label">¿Qué necesitas?</legend>
              <div className="grid gap-2">
                {MOTIVOS.map((m) => (
                  <label key={m.id} className={`option-row ${motivo === m.id ? "option-row-active" : ""}`}>
                    <input type="radio" name="apoyo-motivo" checked={motivo === m.id} onChange={() => setMotivo(m.id)} />
                    <span className="text-sm font-bold">{m.texto}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="apoyo-llegada">
                  ¿Cuándo?
                </label>
                <select id="apoyo-llegada" className="field-select" value={llegada} onChange={(e) => setLlegada(e.target.value)}>
                  {LLEGADA.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="apoyo-detalle">
                  Cómo te reconocemos (opcional)
                </label>
                <input id="apoyo-detalle" className="field-select font-semibold" maxLength={160} placeholder="Ej.: silla de ruedas, chamarra roja" value={detalle} onChange={(e) => setDetalle(e.target.value)} aria-describedby="apoyo-privacidad" />
              </div>
            </div>
            <p id="apoyo-privacidad" className="mt-3 text-xs text-ink-muted">
              No pedimos tu nombre: no escribas teléfonos ni correos. Esta descripción se borra 24 horas después de que se cierre la solicitud.
            </p>
            {error && (
              <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm font-bold text-danger" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary-button mt-4 w-full sm:w-auto" disabled={!enLinea}>
              Pedir apoyo <Icon name="arrow-right" />
            </button>
            {!enLinea && <p className="mt-2 text-sm font-bold text-warning">Sin conexión: no se puede enviar la solicitud. En la estación, acude a la taquilla o al personal del Metro.</p>}
          </form>
        )}

        <div className="reports-feed">
          <h3 className="text-lg font-extrabold">Cómo funciona</h3>
          <ol className="mt-2 space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="step-number size-6 text-xs">1</span>La solicitud llega al jefe de la estación que elegiste.
            </li>
            <li className="flex gap-3">
              <span className="step-number size-6 text-xs">2</span>Asigna a una persona del personal o de la policía auxiliar; la meta es asignarla en 5 minutos.
            </li>
            <li className="flex gap-3">
              <span className="step-number size-6 text-xs">3</span>Aquí ves cuando va en camino y cuando se cierra.
            </li>
          </ol>
          {anteriores.length > 0 && (
            <>
              <h3 className="mt-5 text-lg font-extrabold">Tus solicitudes anteriores</h3>
              <ul className="mt-2 space-y-2">
                {anteriores.map((x) => (
                  <li key={x.id} className="report-item text-sm">
                    <span className="font-bold">{x.id}</span> · {x.station} · {x.estado === "cancelada" ? "Cancelada" : `Atendida a las ${hora(x.atendida)}`}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="data-note mt-4">En el prototipo, la solicitud la ve el personal en la consola (#/consola) de este mismo navegador: el jefe de estación de Tacubaya o de Pantitlán, o el jefe de seguridad para cualquier estación del piloto.</p>
        </div>
      </div>
    </div>
  )
}

function EstadoSolicitud({ x, db, onCancelar }: { x: Incidente; db: BaseDatos; onCancelar: () => void }) {
  const p = personaPorId(operacionDe(db), x.asignadoA)
  const actual = ORDEN[x.estado]
  return (
    <section className="report-form" aria-labelledby="apoyo-estado">
      <p className="text-sm font-bold uppercase tracking-widest text-brand">Tu solicitud</p>
      <h3 id="apoyo-estado" className="mt-1 text-xl font-extrabold">
        {x.id} · {x.station}
      </h3>
      <p className="text-sm text-ink-muted">
        {x.punto} · enviada a las {hora(x.ts)}
      </p>
      <ol className="mt-4 space-y-3" aria-label="Avance de la solicitud">
        {PASOS.map((paso, i) => {
          const hecho = i <= actual
          const cuando = i === 0 ? x.ts : i === 1 ? x.asignada : i === 2 ? x.enCamino : x.atendida
          return (
            <li key={paso.estado} className="flex items-center gap-3" aria-current={i === actual ? "step" : undefined}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold ${hecho ? "border-success bg-success text-white" : "border-border bg-white text-ink-muted"}`}>
                {hecho ? <Icon name="check" size="sm" /> : i + 1}
              </span>
              <span className={`text-sm ${hecho ? "font-extrabold" : "text-ink-muted"}`}>
                {paso.texto}
                {hecho && cuando ? ` · ${hora(cuando)}` : ""}
                {i === 1 && hecho && p ? ` · te atenderá ${p.puesto === "Policía auxiliar" ? "la policía auxiliar" : "el personal de la estación"}` : ""}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="callout mt-4" role="status">
        <Icon name="info" size="sm" className="mt-0.5" />
        {x.estado === "abierta" ? "Esperando que el jefe de la estación asigne a una persona." : x.estado === "asignada" ? "Ya hay una persona asignada; quédate en el punto que elegiste." : "La persona va en camino al punto que elegiste."}
      </p>
      <button type="button" className="secondary-button mt-3" onClick={onCancelar}>
        Ya no lo necesito
      </button>
    </section>
  )
}
