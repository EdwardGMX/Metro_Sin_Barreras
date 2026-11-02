/**
 * «Mi cuenta»: la vista de la persona usuaria que reporta. Responde «¿qué pasó con lo que reporté?»:
 * sus reportes en curso y solucionados como un trayecto del Metro, su identidad (Llave CDMX y
 * Tarjeta Incluyente, simuladas), sus estaciones y qué ve el personal de ella (solo un seudónimo).
 */
import { useState } from "react"
import { equipoPorId, equiposDeEstacion } from "../../data/accessibility"
import { allStations } from "../../data/metroData"
import { operacionDe, seguimientoReporte } from "../../lib/operacion"
import { estadoComunitario, estadoEquipo, registrarEvento, VERSION_AVISO, type BaseDatos, type Reporte } from "../../lib/reports"
import {
  confirmarSolucion,
  seguimientoServicio,
  servicioDe,
  AREAS,
  ETAPAS_CIUDADANAS,
  problemaPorId,
  type CategoriaId,
  type ReporteServicio,
} from "../../lib/servicio"
import { guardar, leer } from "../../lib/storage"
import { Icon } from "../Icon"
import { DialogoLlave, entrarConLlave, type Sesion } from "../Reports"
import { BarraEstados, duracion, hace, ICONO_CATEGORIA, Letrero, Trayecto, Vistazo } from "./Visual"

const CLAVE_FAVORITAS = "msb.favoritas"

type Item = {
  id: string
  tipo: "equipo" | "servicio"
  categoria: CategoriaId | "instalaciones"
  titulo: string
  donde: string
  ts: number
  etapas: string[]
  etapa: number
  mensaje: string
  solucionado: boolean
  pideConfirmacion: boolean
  tardo?: number
  area?: string
}

const ETAPAS_EQUIPO = ["Recibido", "Confirmado", "En reparación", "Reparado"]

function itemEquipo(db: BaseDatos, r: Reporte, now: number): Item {
  const eq = equipoPorId(r.equipmentId)
  const base = { id: r.id, tipo: "equipo" as const, categoria: "instalaciones" as const, titulo: `${eq?.tipo ?? "Equipo"} · ${eq?.ubicacion ?? ""}`, donde: r.station, ts: r.ts, etapas: ETAPAS_EQUIPO, pideConfirmacion: false, area: "Mantenimiento" }
  if (r.moderacion === "rechazado") return { ...base, etapa: 0, mensaje: "No pasó la revisión de moderación, así que no cuenta para el estado del equipo.", solucionado: false }
  if (r.cuarentena) return { ...base, etapa: 0, mensaje: "Está en revisión antes de contar para el estado del equipo.", solucionado: false }
  const seg = seguimientoReporte(db, r)
  if (seg?.etapa === "reparado") {
    const orden = operacionDe(db).ordenes.filter((o) => o.equipmentId === r.equipmentId && (o.resuelta ?? Infinity) >= r.ts).sort((a, b) => a.creada - b.creada)[0]
    return { ...base, etapa: 4, mensaje: `Mantenimiento lo reparó${orden?.nota ? `: ${orden.nota.charAt(0).toLowerCase()}${orden.nota.slice(1)}` : ""}.`, solucionado: true, tardo: orden?.resuelta ? orden.resuelta - r.ts : undefined }
  }
  if (seg?.etapa === "sin_falla") return { ...base, etapa: 4, mensaje: "El personal de la estación lo revisó y el equipo funcionaba.", solucionado: true }
  if (seg?.etapa === "en_reparacion") return { ...base, etapa: 2, mensaje: `${seg.texto}. Las rutas para silla de ruedas ya lo evitan.`, solucionado: false }
  if (seg?.etapa === "verificado") return { ...base, etapa: 1, mensaje: "El personal de la estación confirmó la falla y la envió a Mantenimiento.", solucionado: false }
  const com = estadoComunitario(db, r.equipmentId, now)
  if (com.estado === "confirmado") return { ...base, etapa: 1, mensaje: `Confirmado por ${com.personas} personas. El personal de la estación lo revisará.`, solucionado: false }
  return { ...base, etapa: 0, mensaje: "Contará para el estado del equipo cuando otras personas lo confirmen o lo revise el personal.", solucionado: false }
}

function itemServicio(db: BaseDatos, r: ReporteServicio): Item {
  const p = problemaPorId(r.categoria, r.problema)
  const seg = seguimientoServicio(db, r)
  const t = seg.ticket
  return {
    id: r.id,
    tipo: "servicio",
    categoria: r.categoria,
    titulo: p?.texto ?? "Reporte",
    donde: `${r.station} · ${r.lugar}`,
    ts: r.ts,
    etapas: ETAPAS_CIUDADANAS,
    etapa: seg.solucionado && !seg.pideConfirmacion ? 4 : seg.etapa,
    mensaje: seg.mensaje,
    solucionado: seg.solucionado,
    pideConfirmacion: seg.pideConfirmacion,
    tardo: t?.resuelto ? t.resuelto - r.ts : undefined,
    area: seg.area ? AREAS[seg.area].nombre : undefined,
  }
}

function ReporteCard({ it, now, onConfirmar }: { it: Item; now: number; onConfirmar: (resuelto: boolean) => void }) {
  return (
    <li className={`tarjeta ${it.pideConfirmacion ? "border-[var(--rol)]" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="opcion-icono">
          <Icon name={ICONO_CATEGORIA[it.categoria]} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-snug">{it.titulo}</p>
          <p className="text-sm text-ink-muted">
            {it.donde} · {hace(it.ts, now)}
          </p>
        </div>
        <span className="ticket-folio">{it.id.startsWith("R-") ? "Equipo" : it.id}</span>
      </div>
      <div className="mt-4">
        <Trayecto paradas={it.etapas} actual={it.etapa} perfil="usuario" etiqueta={`Avance de ${it.titulo}`} />
      </div>
      <p className={`mt-3 flex items-start gap-2 text-sm ${it.solucionado ? "font-bold text-success" : ""}`}>
        <Icon name={it.solucionado ? "check" : "info"} size="sm" className="mt-0.5" />
        <span>
          {it.mensaje}
          {it.tardo !== undefined && it.solucionado && !it.pideConfirmacion && ` Se resolvió en ${duracion(it.tardo)}.`}
        </span>
      </p>
      {it.pideConfirmacion && (
        <div className="mt-3 rounded-xl bg-[var(--rol-suave)] p-3">
          <p className="font-extrabold">¿Se resolvió?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="boton-rol flex-1" onClick={() => onConfirmar(true)}>
              <Icon name="check" size="sm" /> Sí, ya quedó
            </button>
            <button type="button" className="boton-borde flex-1" onClick={() => onConfirmar(false)}>
              <Icon name="refresh" size="sm" /> No, sigue igual
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

type Pestana = "curso" | "solucionados"

export function MiCuenta({
  db,
  actualizar,
  sesion,
  setSesion,
  onAviso,
}: {
  db: BaseDatos
  actualizar: (fn: (db: BaseDatos) => void) => void
  sesion: Sesion | null
  setSesion: (s: Sesion | null) => void
  onAviso: () => void
}) {
  const ahora = Date.now()
  const activa = sesion && sesion.expira > ahora ? sesion : null
  const [loginAbierto, setLoginAbierto] = useState(false)
  const [pestana, setPestana] = useState<Pestana>("curso")
  const [favoritas, setFavoritasState] = useState<string[]>(() => leer<string[]>(CLAVE_FAVORITAS, ["Tacubaya", "Pantitlán"]))
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [consiente, setConsiente] = useState(false)
  const [agregar, setAgregar] = useState("")

  const setFavoritas = (f: string[]) => {
    setFavoritasState(f)
    guardar(CLAVE_FAVORITAS, f)
  }

  if (!activa) {
    return (
      <div className="vista rol-usuario">
        <Letrero perfil="usuario" icono="user" quien="Tu cuenta con Llave CDMX" titulo="Mi cuenta" resumen="Consultar rutas no requiere cuenta. Para reportar y seguir tus reportes, inicia sesión." tono="ok" />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icono: "route" as const, titulo: "Sigue tus reportes", texto: "Ve en qué parada va cada reporte: recibido, turnado, en atención y solucionado." },
            { icono: "check" as const, titulo: "Confirma la solución", texto: "Cuando un área marca algo como resuelto, tú confirmas si de verdad quedó." },
            { icono: "star" as const, titulo: "Tus estaciones", texto: "Guarda las estaciones que usas y ve si sus elevadores y escaleras funcionan." },
          ].map((x) => (
            <div key={x.titulo} className="tarjeta flex gap-3">
              <span className="opcion-icono">
                <Icon name={x.icono} />
              </span>
              <div>
                <h2 className="font-extrabold">{x.titulo}</h2>
                <p className="mt-1 text-sm text-ink-muted">{x.texto}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="tarjeta flex flex-wrap items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            Al iniciar sesión solo guardamos un seudónimo; no guardamos tu nombre, CURP, correo ni teléfono.{" "}
            <button type="button" className="font-bold text-brand underline" onClick={onAviso}>
              Aviso de privacidad
            </button>
          </p>
          <button type="button" className="boton-rol min-h-12" onClick={() => setLoginAbierto(true)}>
            <Icon name="user" size="sm" /> Iniciar sesión con Llave CDMX
          </button>
        </div>
        <DialogoLlave
          open={loginAbierto}
          onClose={() => setLoginAbierto(false)}
          onElegir={async (c) => {
            setSesion(await entrarConLlave(c, actualizar))
            setLoginAbierto(false)
          }}
        />
      </div>
    )
  }

  const seud = activa.seudonimo
  const usuario = db.usuarios[seud]
  const items: Item[] = [...db.reportes.filter((r) => r.seudonimo === seud).map((r) => itemEquipo(db, r, ahora)), ...servicioDe(db).reportes.filter((r) => r.seudonimo === seud).map((r) => itemServicio(db, r))].sort((a, b) => b.ts - a.ts)
  const enCurso = items.filter((x) => !x.solucionado)
  const solucionados = items.filter((x) => x.solucionado).sort((a, b) => Number(b.pideConfirmacion) - Number(a.pideConfirmacion) || b.ts - a.ts)
  const porConfirmar = solucionados.filter((x) => x.pideConfirmacion).length
  const nombre = activa.nombre?.split(" ").slice(0, 2).join(" ") ?? "persona usuaria"
  const tiempos = solucionados.map((x) => x.tardo).filter((x): x is number => x !== undefined).sort((a, b) => a - b)
  const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : undefined

  const confirmar = (id: string, resuelto: boolean) => {
    let r = { ok: false, mensaje: "" }
    actualizar((d) => {
      r = confirmarSolucion(d, seud, id, resuelto, Date.now())
    })
    setAviso({ ok: r.ok, texto: r.mensaje })
    if (r.ok && !resuelto) setPestana("curso")
  }
  const verificar = () =>
    actualizar((d) => {
      const u = d.usuarios[seud]
      u.verificado = true
      u.consentimiento = { fecha: Date.now(), version: VERSION_AVISO }
      registrarEvento(d, { evento: "verificación Tarjeta Incluyente", objeto: seud.slice(0, 10), decision: "vigente (simulado), con consentimiento", rol: "sistema" }, Date.now())
    })
  const revocar = () => {
    actualizar((d) => {
      const u = d.usuarios[seud]
      u.verificado = false
      delete u.consentimiento
      registrarEvento(d, { evento: "revocación del consentimiento", objeto: seud.slice(0, 10), decision: "bandera borrada", rol: "persona usuaria" }, Date.now())
    })
    setConsiente(false)
  }
  const darseDeBaja = () => {
    actualizar((d) => {
      delete d.usuarios[seud]
      d.reportes.forEach((r) => {
        if (r.seudonimo === seud) r.seudonimo = "anonimizado"
      })
      servicioDe(d).reportes.forEach((r) => {
        if (r.seudonimo === seud) r.seudonimo = "anonimizado"
      })
      registrarEvento(d, { evento: "baja de cuenta", objeto: "seudónimo suprimido", decision: "reportes anonimizados", rol: "persona usuaria" }, Date.now())
    })
    setSesion(null)
  }

  const estadoEstacion = (s: string) => {
    const eqs = equiposDeEstacion(s).map((eq) => ({ eq, st: estadoEquipo(db, eq.id, ahora).estado }))
    return { eqs, fuera: eqs.filter((x) => x.st === "fuera_servicio"), inciertos: eqs.filter((x) => x.st === "incierto") }
  }
  const resumen = porConfirmar ? `${porConfirmar === 1 ? "Un reporte solucionado espera" : `${porConfirmar} reportes solucionados esperan`} tu confirmación` : enCurso.length ? `${enCurso.length} ${enCurso.length === 1 ? "reporte en curso" : "reportes en curso"}` : "Todo al día"

  const pestanas: Array<{ id: Pestana; texto: string; n?: number }> = [
    { id: "curso", texto: "En curso", n: enCurso.length },
    { id: "solucionados", texto: "Solucionados", n: solucionados.length },
  ]

  return (
    <div className="vista rol-usuario">
      <Letrero perfil="usuario" icono="user" quien={`Llave CDMX · ${activa.nivel}${usuario?.verificado ? " · Tarjeta Incluyente verificada" : ""}`} titulo={`Hola, ${nombre}`} resumen={resumen} tono={porConfirmar ? "warn" : "ok"}>
        {porConfirmar > 0 && pestana !== "solucionados" && (
          <button type="button" className="boton-rol" onClick={() => setPestana("solucionados")}>
            <Icon name="check" size="sm" /> Confirmar
          </button>
        )}
      </Letrero>

      <div className="vistazos">
        <Vistazo titulo="Tus reportes">
          <BarraEstados
            etiqueta="Tus reportes por etapa"
            partes={[
              { etiqueta: "solucionados", valor: solucionados.length, clase: "hecha" },
              { etiqueta: "en atención", valor: enCurso.filter((x) => x.etapa >= 1).length, clase: "curso" },
              { etiqueta: "recibidos", valor: enCurso.filter((x) => x.etapa === 0).length, clase: "pendiente" },
            ]}
          />
        </Vistazo>
        <Vistazo titulo="Tus estaciones ahora">
          <ul className="space-y-1.5">
            {favoritas.slice(0, 3).map((s) => {
              const e = estadoEstacion(s)
              const t = e.fuera.length ? "bad" : e.inciertos.length ? "warn" : "ok"
              return (
                <li key={s} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-extrabold">{s}</span>
                  <span className={`equipo-pastilla equipo-${t}`}>
                    <Icon name={t === "ok" ? "check" : t === "warn" ? "alert" : "x"} className="size-3.5" />
                    {t === "ok" ? "Todo funciona" : e.fuera.length ? `${e.fuera.length} fuera de servicio` : `${e.inciertos.length} con duda`}
                  </span>
                </li>
              )
            })}
            {favoritas.length === 0 && <li className="text-sm text-ink-muted">Agrega las estaciones que usas.</li>}
          </ul>
        </Vistazo>
        <Vistazo titulo="Tu aporte" pie={mediana !== undefined ? `La mitad se resolvió en ${duracion(mediana)} o menos.` : undefined}>
          <p>
            <span className="text-3xl font-extrabold tabular-nums">{solucionados.length}</span>{" "}
            <span className="text-sm font-bold">{solucionados.length === 1 ? "problema resuelto" : "problemas resueltos"} gracias a tus reportes</span>
          </p>
        </Vistazo>
      </div>

      <div aria-live="polite" className="min-h-0">
        {aviso && (
          <p className={`callout ${aviso.ok ? "callout-success" : "callout-warning"} mt-0`}>
            <Icon name={aviso.ok ? "check" : "alert"} size="sm" className="mt-0.5" />
            {aviso.texto}
          </p>
        )}
      </div>

      <div className="vista-dos">
        <section className="min-w-0 space-y-3" aria-label="Mis reportes">
          <div className="pestanas" role="tablist" aria-label="Mis reportes">
            {pestanas.map((x) => (
              <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} className="pestana" aria-selected={pestana === x.id} aria-controls="panel-reportes" onClick={() => setPestana(x.id)}>
                {x.texto}
                {x.n !== undefined && <span className="pestana-n">{x.n}</span>}
              </button>
            ))}
          </div>
          <div id="panel-reportes" role="tabpanel" aria-labelledby={`tab-${pestana}`}>
            {(
              <ul className="space-y-3">
                {(pestana === "curso" ? enCurso : solucionados).map((it) => (
                  <ReporteCard key={it.id} it={it} now={ahora} onConfirmar={(r) => confirmar(it.id, r)} />
                ))}
                {(pestana === "curso" ? enCurso : solucionados).length === 0 && (
                  <li className="tarjeta text-center">
                    <p className="font-extrabold">{pestana === "curso" ? "No tienes reportes en curso" : "Aún no hay reportes solucionados"}</p>
                    <p className="mt-1 text-sm text-ink-muted">Para reportar algo, usa la pestaña «Reportar».</p>
                  </li>
                )}
              </ul>
            )}

          </div>
        </section>

        <aside className="space-y-3" aria-label="Tu identidad y tus estaciones">
          <div className="credencial">
            <span className="credencial-marca" aria-hidden="true" />
            <p className="credencial-etiqueta">Llave CDMX · simulado</p>
            <p className="credencial-dato mt-1">{activa.nombre ?? "Persona usuaria"}</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-bold">
              <Icon name="shield" size="sm" /> {activa.nivel}
            </p>
            <p className="mt-2 text-xs opacity-90">Tu nombre solo se muestra en este dispositivo. Metro Sin Barreras guarda un seudónimo.</p>
          </div>

          {usuario?.verificado ? (
            <div className="credencial credencial-incluyente">
              <span className="credencial-marca" aria-hidden="true" />
              <p className="credencial-etiqueta">Tarjeta Incluyente · simulado</p>
              <p className="credencial-dato mt-1 flex items-center gap-1.5">
                <Icon name="check" size="sm" /> Vigente
              </p>
              <p className="mt-1 text-sm">Verificada el {new Date(usuario.consentimiento?.fecha ?? ahora).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}. Con tu reporte bastan 2 personas para confirmar una falla, en lugar de 3.</p>
              <button type="button" className="mt-2 text-sm font-extrabold underline" onClick={revocar}>
                Revocar mi consentimiento
              </button>
            </div>
          ) : (
            <div className="credencial credencial-vacia">
              <p className="flex items-center gap-2 font-extrabold">
                <Icon name="card" /> Tarjeta Incluyente (opcional)
              </p>
              <label className="mt-2 flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 size-5 shrink-0 accent-brand" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} />
                <span>Acepto que se verifique su vigencia. Es un dato sensible: solo se guarda que la verificación fue exitosa, no el número, y puedo revocarlo cuando quiera.</span>
              </label>
              <button type="button" className="boton-borde mt-3" disabled={!consiente} onClick={verificar}>
                Verificar (simulado)
              </button>
            </div>
          )}

          <div className="tarjeta">
            <h2 className="font-extrabold">Quién ve qué de ti</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="opcion-icono size-8 rounded-lg">
                  <Icon name="user" size="sm" />
                  <span className="sr-only">Tú</span>
                </dt>
                <dd>
                  <span className="font-bold">Tú:</span> tu nombre, tu nivel y todo tu historial.
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="opcion-icono size-8 rounded-lg">
                  <Icon name="train" size="sm" />
                  <span className="sr-only">Personal</span>
                </dt>
                <dd>
                  <span className="font-bold">Personal de la estación y áreas:</span> «una persona usuaria», el problema y el lugar.
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="opcion-icono size-8 rounded-lg">
                  <Icon name="inbox" size="sm" />
                  <span className="sr-only">Mesa</span>
                </dt>
                <dd>
                  <span className="font-bold">Moderación:</span> un seudónimo abreviado ({seud.slice(0, 6)}…), nunca tu nombre.
                </dd>
              </div>
            </dl>
          </div>

          <div className="tarjeta">
            <h2 className="font-extrabold">Tus estaciones</h2>
            <ul className="mt-2 divide-y divide-border">
              {favoritas.map((s) => {
                const e = estadoEstacion(s)
                return (
                  <li key={s} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-extrabold">
                        <Icon name="star" size="sm" className="text-[var(--rol-tinta)]" /> {s}
                      </span>
                      <button type="button" className="text-xs font-bold text-ink-muted underline" onClick={() => setFavoritas(favoritas.filter((x) => x !== s))}>
                        Quitar<span className="sr-only"> {s}</span>
                      </button>
                    </div>
                    {e.fuera.length + e.inciertos.length === 0 ? (
                      <p className="mt-0.5 text-sm text-success">Sus {e.eqs.length} elevadores y escaleras funcionan.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {[...e.fuera, ...e.inciertos].map((x) => (
                          <li key={x.eq.id} className={`flex items-start gap-1.5 ${x.st === "fuera_servicio" ? "text-danger" : "text-warning"}`}>
                            <Icon name={x.st === "fuera_servicio" ? "x" : "alert"} className="mt-0.5 size-3.5" />
                            {x.eq.tipo} · {x.eq.ubicacion}: {x.st === "fuera_servicio" ? "fuera de servicio" : "información incierta"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex gap-2">
              <label htmlFor="agregar-estacion" className="sr-only">
                Agregar estación
              </label>
              <select id="agregar-estacion" className="field-select min-h-11 flex-1 text-sm" value={agregar} onChange={(e) => setAgregar(e.target.value)}>
                <option value="">Agregar una estación…</option>
                {allStations
                  .filter((s) => !favoritas.includes(s))
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
              <button
                type="button"
                className="boton-borde"
                disabled={!agregar}
                onClick={() => {
                  setFavoritas([...favoritas, agregar])
                  setAgregar("")
                }}
              >
                Agregar
              </button>
            </div>
          </div>

          <div className="tarjeta space-y-2 text-sm">
            <a href="#planner" className="flex items-center gap-2 font-bold text-brand underline">
              <Icon name="route" size="sm" /> Planear una ruta con tu perfil
            </a>
            <a href="#apoyo" className="flex items-center gap-2 font-bold text-brand underline">
              <Icon name="people" size="sm" /> Pedir apoyo en una estación
            </a>
            <button type="button" className="flex items-center gap-2 font-bold text-brand underline" onClick={onAviso}>
              <Icon name="lock" size="sm" /> Aviso de privacidad
            </button>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button type="button" className="boton-borde" onClick={() => setSesion(null)}>
                Cerrar sesión
              </button>
              <button type="button" className="boton-borde" onClick={darseDeBaja}>
                Darme de baja
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
