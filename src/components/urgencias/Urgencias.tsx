/**
 * Urgencias graves en la consola (RN15): botón para activarlas, alerta con sonido y color para el
 * personal de la estación, y la vista de solo ubicación para la Mesa de atención.
 */
import { useEffect, useState, type FormEvent } from "react"
import {
  activarUrgencia,
  atenderUrgencia,
  CIERRAN,
  colgarOficial,
  CONTESTAN,
  contestarLlamada,
  debeSonar,
  ESCALA_JEFATURA,
  marcarMalUso,
  INFO_URGENCIA,
  LUGARES_URGENCIA,
  marcarEnterado,
  puedeActivar,
  TIPOS_URGENCIA,
  ubicacionesParaMesa,
  urgenciasVisibles,
  type TipoUrgencia,
  type Urgencia,
} from "../../lib/urgencias"
import { Icon } from "../Icon"
import { Dialog } from "../ui"
import type { Ctx } from "../admin/AdminApp"
import { estacionesDeCuenta } from "../vistas/Tickets"
import { hace, hora } from "../vistas/Visual"
import { Pictograma } from "./Pictograma"
import { useSirena } from "./sirena"

/* ------------------------------------------------------------------ */
/* Botón y formulario                                                  */
/* ------------------------------------------------------------------ */

export function BotonUrgencia({ ctx }: { ctx: Ctx }) {
  const [abierto, setAbierto] = useState(false)
  if (!puedeActivar(ctx.cuenta)) return null
  return (
    <>
      <button type="button" className="boton-urgencia" onClick={() => setAbierto(true)}>
        <Icon name="alert" size="sm" /> Urgencia
      </button>
      <DialogoUrgencia ctx={ctx} open={abierto} onClose={() => setAbierto(false)} />
    </>
  )
}

function DialogoUrgencia({ ctx, open, onClose }: { ctx: Ctx; open: boolean; onClose: () => void }) {
  const estaciones = estacionesDeCuenta(ctx.cuenta)
  const [tipo, setTipo] = useState<TipoUrgencia | null>(null)
  const [lugar, setLugar] = useState("")
  const [station, setStation] = useState(estaciones[0] ?? "Tacubaya")
  const [error, setError] = useState<string | null>(null)

  const cerrar = () => {
    setTipo(null)
    setLugar("")
    setError(null)
    onClose()
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!tipo) return setError("Elige qué pasó.")
    if (!lugar) return setError("Elige dónde pasó.")
    const r = ctx.operar((d, est, now) => activarUrgencia(d, est, ctx.cuenta, { station, tipo, lugar }, now))
    if (r.ok) cerrar()
    else setError(r.mensaje)
  }

  return (
    <Dialog open={open} onClose={cerrar} title="Activar una urgencia" wide>
      <form className="space-y-5" onSubmit={enviar} noValidate>
        <p className="callout callout-urgencia mt-0">
          <Icon name="phone" size="sm" className="mt-0.5" />
          <span>
            Si hay riesgo para la vida, llama primero al <a href="tel:911" className="underline">911</a>. Esta alerta avisa al personal de la estación; no sustituye al 911 ni a los protocolos del STC.
          </span>
        </p>

        <fieldset>
          <legend className="field-legend px-0">1. ¿Qué pasó?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPOS_URGENCIA.map((t) => (
              <button
                key={t.id}
                type="button"
                className="opcion-grande opcion-urgencia"
                aria-pressed={tipo === t.id}
                onClick={() => {
                  setTipo(t.id)
                  if (!lugar || lugar === "Vías" || t.id === "persona_vias") setLugar(t.lugar)
                  setError(null)
                }}
              >
                <Pictograma tipo={t.id} size={48} decorativo />
                <span className="min-w-0 text-left">
                  <span className="block font-extrabold">{t.nombre}</span>
                  <span className="block text-xs text-ink-muted">{t.ayuda}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="field-legend px-0">2. ¿Dónde?</legend>
          <div className="flex flex-wrap gap-2">
            {LUGARES_URGENCIA.map((l) => (
              <button key={l} type="button" className="opcion-grande opcion-urgencia w-auto min-h-11 px-3 py-1.5 text-sm font-bold" aria-pressed={lugar === l} onClick={() => setLugar(l)}>
                {l}
              </button>
            ))}
          </div>
          {estaciones.length > 1 ? (
            <div className="mt-3">
              <label htmlFor="urgencia-estacion" className="field-label">
                Estación
              </label>
              <select id="urgencia-estacion" className="field-select max-w-sm" value={station} onChange={(e) => setStation(e.target.value)}>
                {estaciones.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              Estación: <span className="font-bold text-ink">{station}</span>
            </p>
          )}
        </fieldset>

        {error && (
          <p className="callout callout-warning mt-0" role="alert">
            <Icon name="alert" size="sm" className="mt-0.5" />
            {error}
          </p>
        )}
        <button type="submit" className="boton-urgencia min-h-14 w-full text-base" disabled={!tipo || !lugar}>
          <Icon name="alert" /> Activar alerta en {station}
        </button>
        <p className="text-xs text-ink-muted">Suena la alarma para la jefatura, el personal de estación y el de seguridad de {station}. La Mesa de atención solo ve dónde sucedió. Queda en la bitácora.</p>
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Alertas                                                             */
/* ------------------------------------------------------------------ */

const mmss = (ms: number) => {
  const x = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`
}

function useSegundero(activo: boolean) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    setT(Date.now())
    const id = window.setInterval(() => setT(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activo])
  return t
}

function TarjetaUrgencia({ u, ctx, suena }: { u: Urgencia; ctx: Ctx; suena: boolean }) {
  const info = INFO_URGENCIA[u.tipo]
  const { cuenta, ahora, operar } = ctx
  const cierra = cuenta.roles.some((r) => CIERRAN.includes(r)) && (cuenta.estaciones ?? []).includes(u.station)
  const deLaEstacion = (cuenta.estaciones ?? []).includes(u.station)
  const activa = u.estado === "activa"
  const deUsuaria = u.origen === "usuaria"
  const l = u.llamada
  const contesta = deLaEstacion && cuenta.roles.some((r) => CONTESTAN.includes(r))
  const mia = l?.contestadaPorCuenta === cuenta.id
  const t = useSegundero(Boolean(activa && l && l.estado !== "terminada"))
  const now = Math.max(t, ahora)
  const [confirmarMalUso, setConfirmarMalUso] = useState(false)
  const etiqueta = !activa ? (u.estado === "cancelada" ? "Cancelada por la persona" : u.resultado === "mal_uso" ? "Marcada como mal uso" : "Atendida") : deUsuaria ? (l?.estado === "sonando" ? "Llamada entrante" : l?.estado === "en_curso" ? "En llamada" : "Llamada terminada") : "Urgencia activa"
  return (
    <li className={`urgencia-tarjeta ${activa ? "urgencia-activa" : "urgencia-cerrada"} ${suena ? "urgencia-suena" : ""}`}>
      <Pictograma tipo={u.tipo} size={88} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="urgencia-etiqueta">
            {etiqueta} · {u.id}
          </span>
          {deUsuaria && (
            <span className="chip">
              <Icon name="user" className="size-3.5" /> Persona usuaria · {u.llaveVerificada ? "Llave Verificada" : "Llave"}
            </span>
          )}
          {u.apoyoMovilidad && (
            <span className="chip chip-estado-warn">
              <Icon name="wheelchair" className="size-3.5" /> Necesita apoyo de movilidad
            </span>
          )}
        </p>
        <p className="mt-1 text-2xl font-extrabold leading-tight">{deUsuaria && u.tipo === "auxilio" ? "Pide ayuda de seguridad" : info.nombre}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-base font-bold">
          <Icon name="location" size="sm" /> {u.station} · {u.lugar}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {hora(u.ts)} ({hace(u.ts, ahora)}) · {deUsuaria ? "llamó desde Mi cuenta (no ves su nombre)" : `la activó ${u.activadaPor}`}
          {u.atendidaPor && ` · la cerró ${u.atendidaPor} a las ${hora(u.atendida!)}`}
        </p>

        {deUsuaria && l && activa && (
          <div className={`llamada-barra llamada-barra-${l.estado}`} role="status">
            <Icon name="phone" size="sm" />
            {l.estado === "sonando" && (
              <span>
                Sonando · <span className="tabular-nums">{mmss(now - u.ts)}</span>
                {now - u.ts >= ESCALA_JEFATURA ? " · avisamos también a la jefatura" : ""}
              </span>
            )}
            {l.estado === "en_curso" && (
              <span>
                {mia ? "Estás en llamada" : `La contestó ${l.contestadaPor}`} · <span className="tabular-nums">{mmss(now - (l.contestada ?? now))}</span>
              </span>
            )}
            {l.estado === "terminada" && (
              <span>
                Llamada terminada ({l.colgo === "usuaria" ? "colgó la persona" : "colgó el oficial"}) · duró {mmss((l.fin ?? now) - (l.contestada ?? l.fin ?? now))}
              </span>
            )}
          </div>
        )}

        {activa && (
          <div className="mt-3 flex flex-wrap gap-2">
            {deUsuaria && l?.estado === "sonando" && contesta && (
              <button type="button" className="boton-contestar" onClick={() => operar((d, e, n) => contestarLlamada(d, e, cuenta, u.id, n))}>
                <Icon name="phone" size="sm" /> Contestar llamada
              </button>
            )}
            {deUsuaria && l?.estado === "en_curso" && mia && (
              <button type="button" className="boton-colgar" onClick={() => operar((d, e, n) => colgarOficial(d, e, cuenta, u.id, n))}>
                <Icon name="phone" size="sm" /> Colgar
              </button>
            )}
            {!deUsuaria && deLaEstacion && !u.enterados.includes(cuenta.id) && (
              <button type="button" className="boton-urgencia" onClick={() => operar((d) => marcarEnterado(d, cuenta, u.id))}>
                <Icon name="check" size="sm" /> Enterado, voy
              </button>
            )}
            {cierra && (!deUsuaria || l?.estado !== "sonando") && (
              <button type="button" className="boton-borde boton-borde-urgencia" onClick={() => operar((d, e, now) => atenderUrgencia(d, e, cuenta, u.id, now))}>
                <Icon name="shield" size="sm" /> Cerrar como atendida
              </button>
            )}
            {cierra && deUsuaria && l?.estado !== "sonando" && !confirmarMalUso && (
              <button type="button" className="boton-borde" onClick={() => setConfirmarMalUso(true)}>
                <Icon name="alert" size="sm" /> Marcar mal uso
              </button>
            )}
            <a href="tel:911" className="boton-borde boton-borde-urgencia">
              <Icon name="phone" size="sm" /> Llamar al 911
            </a>
          </div>
        )}
        {confirmarMalUso && activa && (
          <div className="callout callout-urgencia mt-3 flex-col" role="alert">
            <p>¿Marcar {u.id} como mal uso? Cuenta para esta persona: con 2 marcas en 90 días se le bloquea el botón 30 días. Queda en la bitácora.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="boton-urgencia" onClick={() => operar((d, e, now) => marcarMalUso(d, e, cuenta, u.id, now))}>
                Sí, fue mal uso
              </button>
              <button type="button" className="boton-borde" onClick={() => setConfirmarMalUso(false)}>
                No
              </button>
            </div>
          </div>
        )}
        {activa && !deLaEstacion && <p className="mt-2 text-sm font-bold">Avisamos al personal de {u.station}. La cierra su jefatura o su personal de seguridad.</p>}
      </div>
    </li>
  )
}

/**
 * Se muestra en todas las vistas de la consola. Para el personal de la estación, la alerta
 * completa con sirena y borde parpadeante; para la Mesa, solo dónde sucedió.
 */
export function PanelUrgencias({ ctx }: { ctx: Ctx }) {
  const { db, cuenta, ahora } = ctx
  const visibles = urgenciasVisibles(db, cuenta, ahora)
  const sonando = debeSonar(db, cuenta, ahora)
  const ubicaciones = ubicacionesParaMesa(db, cuenta, ahora)
  const { bloqueado, activarSonido } = useSirena(sonando.length > 0)

  // Marco rojo alrededor de la pantalla y título que parpadea mientras suena.
  useEffect(() => {
    if (sonando.length === 0) return
    document.documentElement.classList.add("urgencia-en-curso")
    const original = document.title
    let alterna = false
    const id = window.setInterval(() => {
      alterna = !alterna
      document.title = alterna ? `⚠ URGENCIA en ${sonando[0].station}` : original
    }, 1000)
    return () => {
      window.clearInterval(id)
      document.title = original
      document.documentElement.classList.remove("urgencia-en-curso")
    }
  }, [sonando.length, sonando[0]?.station]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando llega una alerta nueva, la pantalla se desplaza hasta ella (en el celular queda bajo el menú).
  const nueva = sonando[0]?.id
  useEffect(() => {
    if (nueva) document.getElementById("urgencias-titulo")?.parentElement?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [nueva])

  if (visibles.length === 0 && ubicaciones.length === 0) return null

  return (
    <section aria-labelledby="urgencias-titulo" className="mb-5 scroll-mt-4 space-y-3">
      <h2 id="urgencias-titulo" className="sr-only">
        Urgencias
      </h2>
      {sonando.length > 0 && (
        <p className="sr-only" role="alert">
          {sonando[0].origen === "usuaria" ? `Llamada entrante de una persona usuaria en ${sonando[0].station}` : `Urgencia: ${INFO_URGENCIA[sonando[0].tipo].nombre} en ${sonando[0].station}`}, {sonando[0].lugar}.
        </p>
      )}
      {bloqueado && (
        <button type="button" className="boton-urgencia w-full" onClick={activarSonido}>
          <Icon name="speaker" size="sm" /> El navegador bloqueó la alarma: toca aquí para activar el sonido
        </button>
      )}
      {visibles.length > 0 && (
        <ul className="space-y-3">
          {visibles.map((u) => (
            <TarjetaUrgencia key={u.id} u={u} ctx={ctx} suena={sonando.some((s) => s.id === u.id)} />
          ))}
        </ul>
      )}
      {ubicaciones.length > 0 && (
        <div className="urgencia-mesa">
          <p className="flex items-center gap-2 font-extrabold">
            <Icon name="alert" /> {ubicaciones.length === 1 ? "Urgencia en curso" : `${ubicaciones.length} urgencias en curso`}
          </p>
          <ul className="mt-2 space-y-1">
            {ubicaciones.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                <Icon name="location" size="sm" />
                <span className="font-extrabold">{u.station}</span> · {u.lugar}
                <span className="text-ink-muted">
                  · {hora(u.ts)} ({hace(u.ts, ahora)})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">La atiende el personal de la estación. Por privacidad, la Mesa solo ve dónde sucedió.</p>
        </div>
      )}
    </section>
  )
}
