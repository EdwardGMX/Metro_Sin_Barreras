/**
 * «Llamar a seguridad» en Mi cuenta (RN17, propuesta): la persona usuaria con sesión de Llave CDMX
 * llama al personal de seguridad de la estación donde está. Llega a la consola como urgencia y
 * contesta el primer oficial disponible.
 *
 * Privacidad: la ubicación se usa solo en el dispositivo para encontrar la estación más cercana;
 * no se envía ni se guarda. Al sistema llegan la estación, el motivo, el lugar y, si la persona lo
 * elige, que necesita apoyo de movilidad.
 */
import { useEffect, useState } from "react"
import { allStations, stationGeo, type Point } from "../../data/metroData"
import type { BaseDatos } from "../../lib/reports"
import {
  bloqueoPorMalUso,
  colgarPersonaUsuaria,
  ESCALA_JEFATURA,
  ESTACIONES_CON_SEGURIDAD,
  INFO_URGENCIA,
  LUGARES_URGENCIA,
  llamarASeguridad,
  SIN_PRECISAR,
  ultimaLlamada,
  urgenciasDe,
  type TipoUrgencia,
  type Urgencia,
} from "../../lib/urgencias"
import { Icon } from "../Icon"
import type { Sesion } from "../Reports"
import { Dialog } from "../ui"
import { Pictograma } from "./Pictograma"
import { desbloquearAudio, useTonoLlamada } from "./sirena"

const MOTIVOS: TipoUrgencia[] = ["agresion", "robo", "acoso", "medica", "persona_vias", "incendio", "objeto", "auxilio"]
const LUGARES = [SIN_PRECISAR, ...LUGARES_URGENCIA.filter((l) => l !== "Vías")]
/** Más lejos que esto, no parece que la persona esté en el Metro. */
const CERCA_M = 1500

/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function distancia([la1, lo1]: Point, [la2, lo2]: Point): number {
  const r = (x: number) => (x * Math.PI) / 180
  const a = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a))
}

export type Cercania = { station: string; metros: number }

/** La estación más cercana de toda la red y la más cercana con seguridad en el piloto. */
export function estacionesCercanas(p: Point): { cercana: Cercania; conSeguridad: Cercania[] } {
  const todas = allStations
    .filter((s) => stationGeo[s])
    .map((s) => ({ station: s, metros: distancia(p, stationGeo[s]) }))
    .sort((a, b) => a.metros - b.metros)
  return { cercana: todas[0], conSeguridad: todas.filter((x) => ESTACIONES_CON_SEGURIDAD.includes(x.station)) }
}

export const textoDistancia = (m: number) => (m < 50 ? "menos de 50 m" : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}
const oficial = (nombre?: string) => {
  if (!nombre) return "Personal de seguridad"
  const [n, a] = nombre.split(" ")
  return `${n} ${a ? `${a[0]}.` : ""}`.trim()
}

type Geo = { estado: "inicial" } | { estado: "buscando" } | { estado: "error"; texto: string } | { estado: "listo"; cercana: Cercania; conSeguridad: Cercania[]; precision: number }
type Paso = "donde" | "motivo" | "aviso"

function useReloj(activo: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activo])
  return now
}

const llamadaEnCurso = (u?: Urgencia) => Boolean(u && u.estado === "activa" && u.llamada && u.llamada.estado !== "terminada")

export function LlamarSeguridad({ db, actualizar, sesion }: { db: BaseDatos; actualizar: (fn: (db: BaseDatos) => void) => void; sesion: Sesion }) {
  const seud = sesion.seudonimo
  const ultima = ultimaLlamada(db, seud)
  const enCurso = llamadaEnCurso(ultima)
  const [abierto, setAbierto] = useState(false)
  const [llamadaId, setLlamadaId] = useState<string | null>(null)
  const [paso, setPaso] = useState<Paso>("donde")
  const [geo, setGeo] = useState<Geo>({ estado: "inicial" })
  const [station, setStation] = useState(ESTACIONES_CON_SEGURIDAD[0])
  const [motivo, setMotivo] = useState<TipoUrgencia>("auxilio")
  const [lugar, setLugar] = useState(SIN_PRECISAR)
  const [movilidad, setMovilidad] = useState(false)
  const [entiendo, setEntiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = useReloj(abierto || enCurso)
  const bloqueo = bloqueoPorMalUso(db, seud, now)
  const llamada = llamadaId ? urgenciasDe(db).find((u) => u.id === llamadaId) : undefined
  useTonoLlamada(abierto && llamada?.llamada?.estado === "sonando")

  const detectar = () => {
    if (!("geolocation" in navigator)) return setGeo({ estado: "error", texto: "Tu navegador no permite usar la ubicación. Elige la estación de la lista." })
    setGeo({ estado: "buscando" })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { cercana, conSeguridad } = estacionesCercanas([pos.coords.latitude, pos.coords.longitude])
        setGeo({ estado: "listo", cercana, conSeguridad, precision: pos.coords.accuracy })
        setStation(ESTACIONES_CON_SEGURIDAD.includes(cercana.station) ? cercana.station : conSeguridad[0].station)
      },
      (err) =>
        setGeo({
          estado: "error",
          texto: err.code === err.PERMISSION_DENIED ? "No diste permiso para usar tu ubicación. Elige la estación de la lista." : "No pudimos obtener tu ubicación. Elige la estación de la lista.",
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const abrir = () => {
    desbloquearAudio()
    setError(null)
    if (enCurso && ultima) {
      setLlamadaId(ultima.id)
      setAbierto(true)
      return
    }
    setLlamadaId(null)
    setPaso("donde")
    setMotivo("auxilio")
    setLugar(SIN_PRECISAR)
    setMovilidad(false)
    setEntiendo(false)
    setAbierto(true)
    if (geo.estado !== "listo") detectar()
  }

  const llamar = () => {
    let r: ReturnType<typeof llamarASeguridad> | null = null
    actualizar((d) => {
      r = llamarASeguridad(d, { seudonimo: seud, nivel: sesion.nivel }, { station, motivo, lugar, apoyoMovilidad: movilidad }, Date.now())
    })
    const res = r as ReturnType<typeof llamarASeguridad> | null
    if (res?.ok) setLlamadaId(res.id)
    else if (res) setError(res.mensaje)
  }
  const colgar = () => llamada && actualizar((d) => void colgarPersonaUsuaria(d, seud, llamada.id, Date.now()))

  return (
    <>
      <section className={`llamar-seguridad ${enCurso ? "llamar-activa" : ""}`} aria-labelledby="llamar-titulo">
        <span className="llamar-icono" aria-hidden="true">
          <Icon name="shield" />
        </span>
        <div className="min-w-0">
          <h2 id="llamar-titulo" className="text-lg font-extrabold leading-tight">
            {enCurso ? `Llamada con seguridad de ${ultima!.station}` : "¿Necesitas ayuda de seguridad?"}
          </h2>
          <p className="mt-1 text-sm">
            {enCurso
              ? ultima!.llamada!.estado === "en_curso"
                ? `En llamada con ${oficial(ultima!.llamada!.contestadaPor).replace(/\.$/, "")}.`
                : "Sonando en la consola de seguridad de la estación…"
              : bloqueo
                ? `Este botón está bloqueado hasta el ${new Date(bloqueo).toLocaleDateString("es-MX", { day: "numeric", month: "long" })} por mal uso.`
                : "Llama al personal de seguridad de la estación donde estás. Contesta el primer oficial disponible."}
          </p>
        </div>
        <button type="button" className="boton-llamar" onClick={abrir} disabled={Boolean(bloqueo) && !enCurso}>
          <Icon name="phone" /> {enCurso ? "Volver a la llamada" : "Llamar a seguridad"}
        </button>
        <p className="llamar-911">
          Si hay riesgo para la vida, llama al{" "}
          <a href="tel:911" className="font-extrabold underline">
            911
          </a>
          .
        </p>
      </section>

      <Dialog open={abierto} onClose={() => setAbierto(false)} title={llamada ? "Llamada a seguridad" : "Llamar a seguridad"}>
        {llamada ? (
          <PantallaLlamada u={llamada} now={now} onColgar={colgar} onCerrar={() => setAbierto(false)} />
        ) : (
          <div className="space-y-5 px-6 py-5">
            <ol className="llamar-pasos" aria-label="Pasos">
              {(["donde", "motivo", "aviso"] as Paso[]).map((p, i) => (
                <li key={p} aria-current={paso === p ? "step" : undefined} className={paso === p ? "actual" : ""}>
                  <span>{i + 1}</span> {p === "donde" ? "Estación" : p === "motivo" ? "Qué pasa" : "Confirmar"}
                </li>
              ))}
            </ol>

            {paso === "donde" && (
              <div className="space-y-4">
                <div className={`llamar-geo llamar-geo-${geo.estado}`} aria-live="polite">
                  <Icon name={geo.estado === "error" ? "alert" : "location"} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    {geo.estado === "buscando" && <p className="font-bold">Buscando la estación más cercana…</p>}
                    {geo.estado === "inicial" && <p className="font-bold">Usa tu ubicación para encontrar la estación más cercana.</p>}
                    {geo.estado === "error" && <p className="font-bold">{geo.texto}</p>}
                    {geo.estado === "listo" &&
                      (geo.cercana.metros > CERCA_M ? (
                        <p>
                          <span className="font-extrabold">No pareces estar en el Metro:</span> la estación más cercana, {geo.cercana.station}, está a {textoDistancia(geo.cercana.metros)}. Elige la estación donde estás.
                        </p>
                      ) : ESTACIONES_CON_SEGURIDAD.includes(geo.cercana.station) ? (
                        <p>
                          Estás cerca de <span className="font-extrabold">{geo.cercana.station}</span> · a {textoDistancia(geo.cercana.metros)}.
                        </p>
                      ) : (
                        <p>
                          La estación más cercana es <span className="font-extrabold">{geo.cercana.station}</span> (a {textoDistancia(geo.cercana.metros)}), pero aún no está en el piloto. Te conectamos con la más cercana que sí tiene seguridad: <span className="font-extrabold">{geo.conSeguridad[0].station}</span>.
                        </p>
                      ))}
                    {geo.estado !== "buscando" && (
                      <button type="button" className="mt-1 text-sm font-extrabold underline" onClick={detectar}>
                        {geo.estado === "listo" ? "Volver a detectar" : "Usar mi ubicación"}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label htmlFor="llamar-estacion" className="field-label">
                    Estación a la que llamas
                  </label>
                  <select id="llamar-estacion" className="field-select" value={station} onChange={(e) => setStation(e.target.value)}>
                    {(geo.estado === "listo" ? geo.conSeguridad.map((x) => x.station) : ESTACIONES_CON_SEGURIDAD).map((s) => {
                      const m = geo.estado === "listo" ? geo.conSeguridad.find((x) => x.station === s)?.metros : undefined
                      return (
                        <option key={s} value={s}>
                          {s}
                          {m !== undefined ? ` · a ${textoDistancia(m)}` : ""}
                        </option>
                      )
                    })}
                  </select>
                  <p className="mt-1 text-xs text-ink-muted">En el piloto, solo estas {ESTACIONES_CON_SEGURIDAD.length} estaciones tienen personal de seguridad conectado.</p>
                </div>
                <p className="text-xs text-ink-muted">
                  <Icon name="lock" className="mr-1 inline size-3.5" />
                  Tu ubicación se usa solo en tu teléfono para encontrar la estación; no se envía ni se guarda.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="boton-rol min-h-12 flex-1" onClick={() => setPaso("motivo")}>
                    Siguiente <Icon name="arrow-right" size="sm" />
                  </button>
                </div>
              </div>
            )}

            {paso === "motivo" && (
              <div className="space-y-4">
                <fieldset>
                  <legend className="field-label">¿Qué pasa? (opcional)</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {MOTIVOS.map((m) => (
                      <button key={m} type="button" className="opcion-grande opcion-urgencia py-2" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>
                        <Pictograma tipo={m} size={36} decorativo />
                        <span className="min-w-0 text-left text-sm font-extrabold leading-tight">{m === "auxilio" ? "Otro o prefiero decirlo" : INFO_URGENCIA[m].nombre}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="llamar-lugar" className="field-label">
                    ¿En qué parte de la estación? (opcional)
                  </label>
                  <select id="llamar-lugar" className="field-select" value={lugar} onChange={(e) => setLugar(e.target.value)}>
                    {LUGARES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1 size-5 shrink-0 accent-brand" checked={movilidad} onChange={(e) => setMovilidad(e.target.checked)} />
                  <span>
                    <span className="font-extrabold">Necesito apoyo de movilidad.</span> El oficial solo verá esto en esta llamada; no se comparte tu perfil ni tu Tarjeta Incluyente.
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="boton-borde" onClick={() => setPaso("donde")}>
                    Atrás
                  </button>
                  <button type="button" className="boton-rol min-h-12 flex-1" onClick={() => setPaso("aviso")}>
                    Siguiente <Icon name="arrow-right" size="sm" />
                  </button>
                </div>
              </div>
            )}

            {paso === "aviso" && (
              <div className="space-y-4">
                <div className="aviso-mal-uso" role="note">
                  <p className="flex items-center gap-2 text-base font-extrabold">
                    <Icon name="alert" /> Usa este botón solo en una emergencia real
                  </p>
                  <ul>
                    <li>La llamada queda ligada a tu cuenta Llave CDMX.</li>
                    <li>Si el personal la marca como mal uso 2 veces en 90 días, este botón se bloquea 30 días.</li>
                    <li>Llamar a servicios de emergencia con fines ociosos o dar falsas alarmas es una infracción de la Ley de Cultura Cívica de la Ciudad de México (art. 28, fracc. IX) y puede sancionarse con arresto o trabajo en favor de la comunidad.</li>
                  </ul>
                </div>
                <dl className="llamar-resumen">
                  <div>
                    <dt>Estación</dt>
                    <dd>{station}</dd>
                  </div>
                  <div>
                    <dt>Motivo</dt>
                    <dd>{motivo === "auxilio" ? "Lo dirás en la llamada" : INFO_URGENCIA[motivo].nombre}</dd>
                  </div>
                  <div>
                    <dt>Lugar</dt>
                    <dd>{lugar}</dd>
                  </div>
                  <div>
                    <dt>El oficial verá</dt>
                    <dd>
                      Cuenta {sesion.nivel}
                      {movilidad ? " · necesita apoyo de movilidad" : ""}. No ve tu nombre.
                    </dd>
                  </div>
                </dl>
                <label className="flex items-start gap-3 text-sm font-bold">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
                  <span>Entiendo el aviso y es una emergencia real.</span>
                </label>
                {error && (
                  <p className="callout callout-warning mt-0" role="alert">
                    <Icon name="alert" size="sm" className="mt-0.5" />
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="boton-borde" onClick={() => setPaso("motivo")}>
                    Atrás
                  </button>
                  <button type="button" className="boton-llamar min-h-14 flex-1 text-base" disabled={!entiendo} onClick={llamar}>
                    <Icon name="phone" /> Confirmar y llamar a {station}
                  </button>
                </div>
              </div>
            )}

            <p className="border-t-2 border-border pt-3 text-sm text-ink-muted">
              ¿Riesgo para la vida? Llama al{" "}
              <a href="tel:911" className="font-extrabold text-ink underline">
                911
              </a>
              .
            </p>
          </div>
        )}
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Pantalla de la llamada                                              */
/* ------------------------------------------------------------------ */

function PantallaLlamada({ u, now, onColgar, onCerrar }: { u: Urgencia; now: number; onColgar: () => void; onCerrar: () => void }) {
  const l = u.llamada!
  const [silencio, setSilencio] = useState(false)
  const [altavoz, setAltavoz] = useState(false)
  const estado = u.estado === "cancelada" ? "cancelada" : l.estado
  const texto =
    estado === "sonando"
      ? `Llamando a seguridad de ${u.station}`
      : estado === "en_curso"
        ? `Conectado con ${oficial(l.contestadaPor)}`
        : estado === "cancelada"
          ? "Cancelaste la llamada"
          : "La llamada terminó"

  return (
    <div className={`llamada llamada-${estado}`}>
      <p className="sr-only" aria-live="assertive">
        {texto}
      </p>
      <div className="llamada-centro">
        <span className="llamada-ondas" aria-hidden="true">
          <span className="llamada-avatar">{estado === "en_curso" ? oficial(l.contestadaPor).slice(0, 1) : <Icon name="shield" />}</span>
        </span>
        <p className="llamada-quien">{estado === "en_curso" ? oficial(l.contestadaPor) : `Seguridad · ${u.station}`}</p>
        <p className="llamada-estado">
          {estado === "sonando" && `Sonando… ${mmss(now - u.ts)}`}
          {estado === "en_curso" && `En llamada · ${mmss(now - (l.contestada ?? now))}`}
          {estado === "terminada" && `Duró ${mmss((l.fin ?? now) - (l.contestada ?? l.fin ?? now))}`}
          {estado === "cancelada" && "No se conectó con nadie."}
        </p>
        <p className="llamada-detalle">
          {INFO_URGENCIA[u.tipo].nombre === INFO_URGENCIA.auxilio.nombre ? "Motivo: lo dirás en la llamada" : INFO_URGENCIA[u.tipo].nombre} · {u.lugar} · {u.id}
        </p>
      </div>

      {estado === "sonando" && now - u.ts >= ESCALA_JEFATURA && (
        <p className="llamada-aviso" role="status">
          Avisamos también a la jefatura de {u.station}.
        </p>
      )}
      {estado === "sonando" && now - u.ts >= 60_000 && (
        <p className="llamada-aviso" role="status">
          ¿Nadie contesta? Llama al{" "}
          <a href="tel:911" className="font-extrabold underline">
            911
          </a>
          .
        </p>
      )}
      {estado === "terminada" && (
        <p className="llamada-aviso" role="status">
          {u.resultado === "mal_uso"
            ? "El personal marcó esta llamada como mal uso."
            : u.estado === "atendida"
              ? `Seguridad de ${u.station} cerró la llamada como atendida.`
              : `Seguridad de ${u.station} sigue al tanto${l.contestadaPor ? `: ${oficial(l.contestadaPor)} tomó tu llamada` : ""}.`}
        </p>
      )}

      {estado === "sonando" || estado === "en_curso" ? (
        <div className="llamada-controles">
          {estado === "en_curso" && (
            <>
              <button type="button" className="llamada-boton" aria-pressed={silencio} onClick={() => setSilencio((v) => !v)}>
                <Icon name={silencio ? "x" : "speaker"} />
                <span>{silencio ? "Micrófono apagado" : "Silenciar"}</span>
              </button>
              <button type="button" className="llamada-boton" aria-pressed={altavoz} onClick={() => setAltavoz((v) => !v)}>
                <Icon name="speaker" />
                <span>Altavoz</span>
              </button>
            </>
          )}
          <button type="button" className="llamada-boton llamada-colgar" onClick={onColgar}>
            <Icon name="phone" />
            <span>{estado === "sonando" ? "Cancelar" : "Colgar"}</span>
          </button>
        </div>
      ) : (
        <div className="px-6 pb-2">
          <button type="button" className="boton-rol min-h-12 w-full" onClick={onCerrar}>
            Listo
          </button>
        </div>
      )}
      <p className="llamada-pie">
        Emergencia con riesgo para la vida:{" "}
        <a href="tel:911" className="font-extrabold underline">
          911
        </a>
        .
      </p>
    </div>
  )
}
