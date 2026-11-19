/**
 * Tablero de desempeño del personal (RN16). Un módulo por perfil:
 * - Personal de estación y de seguridad: «Mi desempeño», solo el propio.
 * - Jefe(a) de estación: el de cada persona de su estación.
 * - Mantenimiento: el de su equipo técnico.
 * - Mesa de atención: el de todo el personal de la red, por estación.
 */
import { useEffect, useMemo, useState } from "react"
import { gerenciasDeEstacion, ROLES } from "../../lib/admin"
import {
  alcanceTablero,
  capacitacion,
  CENTRALES,
  empleadoDeCuenta,
  empleados,
  empleadosVisibles,
  eventosDe,
  fichaDe,
  historial,
  insignias,
  lugarDe,
  METRICAS,
  METRICAS_DE,
  nivel,
  periodos,
  racha,
  registrarConsulta,
  type Dia,
  type Empleado,
  type MetricaId,
  type Resumen,
  type TipoAlcance,
  type TipoEvento,
} from "../../lib/desempeno"
import { actividadesDe, presenciaDe } from "../../lib/jornada"
import { ESTACIONES_PILOTO } from "../../lib/operacion"
import { abierto, asignadoA, PRIORIDAD_LABEL } from "../../lib/servicio"
import { Icon, type IconName } from "../Icon"
import type { Ctx } from "../admin/AdminApp"
import { LineaJornada, PresenciaChip, RelojTurno, ConteoEstados } from "../vistas/Jornada"
import { DetalleTicket } from "../vistas/Tickets"
import { Avatar, hace, Letrero, type Perfil } from "../vistas/Visual"
import {
  BarraSegmentada,
  CalendarioAsistencia,
  CifraIndice,
  ColumnasDia,
  Delta,
  fechaCorta,
  Indicador,
  Medidores,
  pct,
  TarjetaGrafica,
  type FilaMedidor,
} from "./Graficas"

export const ICONO_METRICA: Record<MetricaId, IconName> = {
  tareas: "clipboard",
  apoyos: "wheelchair",
  rondas: "elevator",
  tickets: "ticket",
  verificaciones: "eye",
  asignadas: "people",
  levantados: "send",
  ordenes: "tool",
  turnados: "inbox",
  cerrados: "check",
}
const ICONO_EVENTO: Record<TipoEvento, IconName> = { ...ICONO_METRICA, urgencia: "alert", acceso: "lock" }
const ICONO_PERFIL: Record<Perfil, IconName> = { usuario: "user", jefe: "train", personal: "user", guardia: "shield", mesa: "inbox", mant: "tool", limpieza: "broom", sistemas: "monitor" }

type Periodo = 7 | 14 | 30
const PERIODOS: Periodo[] = [7, 14, 30]

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const total = (r: Resumen) => Object.values(r.metricas).reduce((a, m) => a + (m?.n ?? 0), 0)
/** Proporción a tiempo de todas las actividades con meta. */
function aTiempo(r: Resumen): number | null {
  let n = 0
  let ok = 0
  for (const [id, m] of Object.entries(r.metricas) as Array<[MetricaId, Resumen["metricas"][MetricaId]]>) {
    if (!m || !METRICAS[id].calidad) continue
    n += m.n
    ok += m.ok
  }
  return n ? ok / n : null
}
const actividadDia = (d: Dia) => Object.values(d.m).reduce((a, v) => a + (v?.n ?? 0), 0)

/* ------------------------------------------------------------------ */
/* Módulo                                                              */
/* ------------------------------------------------------------------ */

type Datos = { emp: Empleado; h: Dia[] }

export function ModuloTablero({ ctx }: { ctx: Ctx }) {
  const { db, estado, cuenta, ahora } = ctx
  const alcance = alcanceTablero(cuenta)
  const minuto = Math.floor(ahora / 60_000)
  const lista = useMemo(() => empleados(db, estado.cuentas), [db, estado.cuentas])
  const visibles = useMemo(() => empleadosVisibles(lista, cuenta), [lista, cuenta])
  const datos = useMemo<Datos[]>(() => visibles.map((emp) => ({ emp, h: historial(db, emp, minuto * 60_000) })), [db, visibles, minuto])
  const yo = empleadoDeCuenta(lista, cuenta)
  const [elegido, setElegido] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>(30)

  const abrir = (id: string) => {
    const emp = visibles.find((x) => x.id === id)
    if (!emp) return
    if (emp.cuentaId !== cuenta.id) ctx.actualizarDb((_d, e, now) => registrarConsulta(e, cuenta, emp, now))
    setElegido(id)
    window.requestAnimationFrame(() => document.getElementById("vista-titulo")?.focus())
  }

  if (alcance === "propio") {
    const mio = datos[0]
    if (!mio || !yo) return <p className="tarjeta">No encontramos tu ficha de personal.</p>
    return <PerfilEmpleado ctx={ctx} d={mio} periodo={periodo} setPeriodo={setPeriodo} propio />
  }
  const sel = datos.find((x) => x.emp.id === elegido)
  if (sel)
    return (
      <PerfilEmpleado
        ctx={ctx}
        d={sel}
        periodo={periodo}
        setPeriodo={setPeriodo}
        propio={sel.emp.id === yo?.id}
        onVolver={() => {
          setElegido(null)
          window.requestAnimationFrame(() => document.getElementById("vista-titulo")?.focus())
        }}
      />
    )
  return <Equipo ctx={ctx} datos={datos} alcance={alcance} periodo={periodo} setPeriodo={setPeriodo} onAbrir={abrir} yoId={yo?.id} />
}

function SelectorPeriodo({ periodo, setPeriodo }: { periodo: Periodo; setPeriodo: (p: Periodo) => void }) {
  return (
    <div className="segmentado" role="group" aria-label="Periodo">
      {PERIODOS.map((p) => (
        <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}>
          {p === 7 ? "7 días" : p === 14 ? "14 días" : "30 días"}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tablero de una persona                                              */
/* ------------------------------------------------------------------ */

function PerfilEmpleado({ ctx, d, periodo, setPeriodo, propio, onVolver }: { ctx: Ctx; d: Datos; periodo: Periodo; setPeriodo: (p: Periodo) => void; propio: boolean; onVolver?: () => void }) {
  const { db, estado, ahora } = ctx
  const { emp, h } = d
  const perfil = emp.perfil as Perfil
  const ficha = fichaDe(emp, ahora)
  const cuentaEmp = estado.cuentas.find((c) => c.id === emp.cuentaId)
  const { actual, anterior } = periodos(h, periodo, emp.perfil)
  const niv = nivel(actual.indice)
  const metricas = METRICAS_DE[emp.perfil]
  const dias = actual.dias
  const [ticketId, setTicketId] = useState<string | null>(null)
  const acts = emp.plantilla ? actividadesDe(db, emp.plantilla, ahora) : []
  const presencia = emp.plantilla ? presenciaDe(acts, ahora) : null
  const pendientes = !emp.plantilla ? asignadoA(db, emp.id, ahora).filter(abierto) : []
  const eventos = eventosDe(db, emp, estado.auditoria)
  const logros = insignias(actual, h)
  const cursos = capacitacion(emp, ahora)
  const gerencias = emp.station ? gerenciasDeEstacion(emp.station).map((g) => g.nombre) : []
  const nombreCorto = emp.nombre.split(" ")[0]
  const rach = racha(h)

  const filasMeta: FilaMedidor[] = [
    { id: "asistencia", nombre: "Asistencia", detalle: `${actual.laborables - actual.faltas} de ${actual.laborables} días laborables`, valor: actual.asistencia, figura: pct(actual.asistencia), meta: 0.95 },
    { id: "puntualidad", nombre: "Puntualidad", detalle: `${actual.retardos} ${actual.retardos === 1 ? "retardo" : "retardos"} en el periodo`, valor: actual.puntualidad, figura: pct(actual.puntualidad), meta: 0.9 },
    ...metricas
      .filter((m) => METRICAS[m].calidad)
      .map((m) => {
        const x = actual.metricas[m]!
        return { id: m, nombre: `${METRICAS[m].corto} ${METRICAS[m].calidad}`, detalle: `${x.ok} de ${x.n} ${METRICAS[m].unidad}`, valor: x.tasa, figura: pct(x.tasa), meta: METRICAS[m].meta }
      }),
  ]

  return (
    <div className={`vista rol-${perfil}`}>
      {onVolver && (
        <button type="button" className="volver" onClick={onVolver}>
          <Icon name="arrow-right" className="size-4 rotate-180" /> Volver al equipo
        </button>
      )}

      {/* Credencial */}
      <header className={`gafete rol-${perfil}`}>
        <div className="gafete-franja" aria-hidden="true" />
        <div className="gafete-foto">
          <span className="gafete-avatar" aria-hidden="true">
            {emp.nombre
              .split(" ")
              .slice(0, 2)
              .map((x) => x[0])
              .join("")}
          </span>
          <span className="gafete-icono" aria-hidden="true">
            <Icon name={ICONO_PERFIL[perfil]} className="size-4" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="gafete-eyebrow">{propio ? "Tu tablero de desempeño" : "Tablero de desempeño"}</p>
          <h1 id="vista-titulo" tabIndex={-1} className="gafete-nombre">
            {emp.nombre}
          </h1>
          <p className="gafete-puesto">
            {emp.puesto} · {lugarDe(emp)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {presencia && <PresenciaChip p={presencia} />}
            <span className="chip">
              <Icon name="card" className="size-3.5" /> {ficha.numero}
            </span>
            <span className="chip">
              <Icon name="clock" className="size-3.5" /> Turno {ficha.turno.toLowerCase()} · {ficha.horario}
            </span>
            <span className="chip">
              <Icon name="calendar" className="size-3.5" /> Descansa {ficha.descansoTexto}
            </span>
            <span className="chip">
              <Icon name="star" className="size-3.5" /> {ficha.antiguedad} {ficha.antiguedad === 1 ? "año" : "años"} en el STC
            </span>
          </div>
        </div>
        <dl className="gafete-datos">
          <div>
            <dt>Correo institucional</dt>
            <dd>{cuentaEmp?.correo ?? "Sin cuenta en la consola"}</dd>
          </div>
          <div>
            <dt>{emp.station ? "Depende de" : "Unidad"}</dt>
            <dd>{gerencias.length ? gerencias.join(" · ") : emp.area === "mantenimiento" ? "Subdirección General de Mantenimiento" : emp.area === "atencion" ? "Gerencia de Atención al Usuario" : "Gerencia de Organización y Sistemas"}</dd>
          </div>
          <div>
            <dt>Rol en la consola</dt>
            <dd>{cuentaEmp ? cuentaEmp.roles.map((r) => ROLES[r].nombre).join(" · ") : "—"}</dd>
          </div>
          <div>
            <dt>Último acceso</dt>
            <dd>{cuentaEmp?.ultimoAcceso ? hace(cuentaEmp.ultimoAcceso, ahora) : "—"}</dd>
          </div>
        </dl>
      </header>

      <div className="filtros">
        <SelectorPeriodo periodo={periodo} setPeriodo={setPeriodo} />
        <p className="text-sm text-ink-muted">
          Del {fechaCorta(dias[0].ts)} a hoy · comparado con los {periodo} días anteriores
        </p>
      </div>

      {/* Cifra principal e indicadores */}
      <div className="tablero-cabeza">
        <CifraIndice
          valor={actual.indice}
          nivel={niv}
          delta={actual.indice - anterior.indice}
          pie={rach >= 3 ? `${rach} días seguidos llegando a tiempo.` : undefined}
          partes={[
            { nombre: "Asistencia y puntualidad", peso: "25 %", valor: actual.presencia },
            { nombre: "Metas de sus actividades", peso: "75 %", valor: actual.calidad },
          ]}
        />
        <div className="kpis">
          <Indicador icono="calendar" etiqueta="Asistencia" valor={pct(actual.asistencia)} sub={`${actual.faltas} ${actual.faltas === 1 ? "falta" : "faltas"} · ${actual.descansos} descansos`} delta={<Delta valor={(actual.asistencia - anterior.asistencia) * 100} unidad="pts" />} />
          <Indicador
            icono="clock"
            etiqueta="Puntualidad"
            valor={pct(actual.puntualidad)}
            sub={`${actual.retardos} ${actual.retardos === 1 ? "retardo" : "retardos"}`}
            delta={<Delta valor={(actual.puntualidad - anterior.puntualidad) * 100} unidad="pts" />}
          />
          <Indicador icono="train" etiqueta="Horas trabajadas" valor={`${Math.round(actual.horas)} h`} sub={`${actual.aTiempo + actual.retardos ? (actual.horas / (actual.aTiempo + actual.retardos)).toFixed(1) : "0"} h por día`} delta={<Delta valor={actual.horas - anterior.horas} unidad="h" mejor={null} />} />
          {metricas.map((m) => {
            const x = actual.metricas[m]!
            const y = anterior.metricas[m]!
            const extra = m === "apoyos" && actual.atencionProm !== null ? ` · ${Math.round(actual.atencionProm)} min promedio` : m === "tickets" && actual.resolucionProm !== null ? ` · ${actual.resolucionProm.toFixed(1)} h promedio` : ""
            return (
              <Indicador
                key={m}
                icono={ICONO_METRICA[m]}
                etiqueta={METRICAS[m].nombre}
                valor={String(x.n)}
                sub={`${METRICAS[m].calidad ? `${pct(x.tasa)} ${METRICAS[m].calidad}` : METRICAS[m].unidad}${extra}`}
                delta={<Delta valor={x.n - y.n} unidad="" mejor={null} />}
                tendencia={dias.map((dd) => dd.m[m]?.n ?? 0)}
              />
            )
          })}
        </div>
      </div>

      {/* Hoy */}
      {emp.plantilla ? (
        <section className="tarjeta" aria-labelledby="hoy-titulo">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="hoy-titulo" className="seccion-titulo">
              {propio ? "Tu jornada de hoy" : `La jornada de hoy de ${nombreCorto}`}
            </h2>
            <ConteoEstados acts={acts} />
          </div>
          <div className="hoy-grid">
            <LineaJornada acts={acts} ahora={ahora} onAbrir={(a) => a.ticket && setTicketId(a.ticket.id)} />
            <RelojTurno acts={acts} ahora={ahora} />
          </div>
        </section>
      ) : (
        <section className="tarjeta" aria-labelledby="hoy-titulo">
          <h2 id="hoy-titulo" className="seccion-titulo">
            Lo que tiene abierto hoy
          </h2>
          {pendientes.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No tiene tickets abiertos.</p>
          ) : (
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {pendientes.map((t) => (
                <li key={t.id}>
                  <button type="button" className="evento evento-boton w-full" onClick={() => setTicketId(t.id)}>
                    <span className="evento-icono">
                      <Icon name="ticket" className="size-4" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block font-extrabold">{t.asunto}</span>
                      <span className="block text-xs text-ink-muted">
                        {t.id} · {t.station} · Prioridad {PRIORIDAD_LABEL[t.prioridad].toLowerCase()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Actividad por día: una gráfica por tipo de actividad */}
      <h2 className="seccion-titulo mt-6">Actividad por día</h2>
      <div className={`multiples multiples-${Math.min(metricas.length, 4)}`}>
        {metricas.map((m) => {
          const x = actual.metricas[m]!
          return (
            <TarjetaGrafica
              key={m}
              titulo={METRICAS[m].nombre}
              subtitulo={
                <>
                  <span className="font-extrabold text-ink">{x.n}</span> {METRICAS[m].unidad}
                  {METRICAS[m].calidad ? ` · ${pct(x.tasa)} ${METRICAS[m].calidad}` : ""}
                </>
              }
              tabla={{ columnas: ["Día", METRICAS[m].unidad[0].toUpperCase() + METRICAS[m].unidad.slice(1), ...(METRICAS[m].calidad ? [METRICAS[m].calidad!] : [])], filas: dias.map((dd) => [fechaCorta(dd.ts), dd.m[m]?.n ?? 0, ...(METRICAS[m].calidad ? [dd.m[m]?.ok ?? 0] : [])]) }}
            >
              <ColumnasDia
                datos={dias.map((dd) => ({
                  ts: dd.ts,
                  valor: dd.m[m]?.n ?? 0,
                  vacio: dd.estado === "descanso" ? "Descanso" : dd.estado === "falta" ? "Falta" : undefined,
                  nota: METRICAS[m].calidad && dd.m[m]?.n ? `${dd.m[m]!.ok} ${METRICAS[m].calidad}` : undefined,
                }))}
                unidad={METRICAS[m].unidad}
                alto={110}
              />
            </TarjetaGrafica>
          )
        })}
      </div>

      <div className="tablero-dos">
        <TarjetaGrafica
          titulo="Asistencia"
          subtitulo={`${actual.aTiempo} a tiempo · ${actual.retardos} retardos · ${actual.faltas} faltas`}
          tabla={{ columnas: ["Día", "Asistencia", "Entrada", "Salida"], filas: dias.map((x) => [fechaCorta(x.ts), x.estado.replace("_", " "), x.entrada !== undefined ? `${String(Math.floor(x.entrada / 60)).padStart(2, "0")}:${String(x.entrada % 60).padStart(2, "0")}` : "—", x.salida !== undefined ? `${String(Math.floor(x.salida / 60)).padStart(2, "0")}:${String(x.salida % 60).padStart(2, "0")}` : "—"]) }}
        >
          <CalendarioAsistencia dias={dias} />
        </TarjetaGrafica>
        <TarjetaGrafica titulo="Cumplimiento de metas" subtitulo="La línea vertical marca la meta de cada actividad." tabla={{ columnas: ["Meta", "Resultado", "Meta"], filas: filasMeta.map((f) => [f.nombre, f.figura, pct(f.meta)]) }}>
          <Medidores filas={filasMeta} />
        </TarjetaGrafica>
      </div>

      <div className="tablero-dos">
        {metricas.length > 1 && (
          <TarjetaGrafica titulo="En qué se fue su trabajo" subtitulo="Parte de cada actividad en el total del periodo." tabla={{ columnas: ["Actividad", "Cantidad", "Parte"], filas: metricas.map((m) => [METRICAS[m].corto, actual.metricas[m]!.n, pct(total(actual) ? actual.metricas[m]!.n / total(actual) : 0)]) }}>
            <BarraSegmentada partes={metricas.map((m) => ({ nombre: METRICAS[m].corto, valor: actual.metricas[m]!.n }))} unidad="actividades" />
          </TarjetaGrafica>
        )}
        <section className="tarjeta" aria-labelledby="logros-titulo">
          <h3 id="logros-titulo" className="grafica-titulo">
            Reconocimientos del periodo
          </h3>
          {logros.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Aún no hay reconocimientos en este periodo.</p>
          ) : (
            <ul className="insignias">
              {logros.map((l) => (
                <li key={l.id} className="insignia">
                  <span className="insignia-medalla" aria-hidden="true">
                    <Icon name="star" className="size-5" />
                  </span>
                  <span>
                    <span className="block font-extrabold">{l.nombre}</span>
                    <span className="block text-xs text-ink-muted">{l.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="tablero-dos">
        <section className="tarjeta" aria-labelledby="cursos-titulo">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="cursos-titulo" className="grafica-titulo">
              Capacitación
            </h3>
            <span className="chip chip-estado-neutral">Datos de muestra</span>
          </div>
          <ul className="cursos">
            {cursos.map((c) => (
              <li key={c.nombre} className="curso">
                <span className={`curso-icono curso-${c.estado}`} aria-hidden="true">
                  <Icon name={c.estado === "acreditado" ? "check" : c.estado === "en_curso" ? "clock" : "alert"} className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">{c.nombre}</span>
                  {c.estado === "en_curso" ? (
                    <span className="curso-avance" aria-label={`Avance ${pct(c.avance)}`}>
                      <span style={{ width: `${(c.avance ?? 0) * 100}%` }} />
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-xs font-bold text-ink-muted">
                  {c.estado === "acreditado" ? `Acreditado ${fechaCorta(c.fecha!)}` : c.estado === "en_curso" ? `En curso · ${pct(c.avance)}` : `Pendiente · vence ${fechaCorta(c.vence!)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="tarjeta" aria-labelledby="eventos-titulo">
          <h3 id="eventos-titulo" className="grafica-titulo">
            Actividad reciente
          </h3>
          <p className="grafica-sub">Registros reales de la consola.</p>
          {eventos.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Sin registros recientes.</p>
          ) : (
            <ol className="eventos">
              {eventos.map((ev, i) => (
                <li key={i} className="evento">
                  <span className="evento-icono">
                    <Icon name={ICONO_EVENTO[ev.tipo]} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold">{ev.texto}</span>
                    {ev.detalle && <span className="block truncate text-xs text-ink-muted">{ev.detalle}</span>}
                  </span>
                  <span className="ml-auto shrink-0 text-xs font-bold text-ink-muted">{hace(ev.ts, ahora)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <p className="nota-datos">
        <Icon name="info" size="sm" className="mt-0.5" />
        <span>
          Hoy, la actividad reciente y las rondas de los últimos 14 días vienen de los registros del prototipo. El resto del historial, la asistencia, el número de empleado, la antigüedad y la capacitación son datos de muestra. Solo se muestran datos laborales;{" "}
          {propio ? "tu jefatura y la Mesa de atención pueden ver este tablero." : "esta consulta quedó en la bitácora de auditoría."}
        </span>
      </p>
      <DetalleTicket key={ticketId ?? "ninguno"} ctx={ctx} id={ticketId} onClose={() => setTicketId(null)} perfil={perfil} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tablero del equipo                                                  */
/* ------------------------------------------------------------------ */

type Fila = Datos & { actual: Resumen; anterior: Resumen }
type Orden = "indice_desc" | "indice_asc" | "nombre" | "asistencia"

const PERFIL_DE_ALCANCE: Record<Exclude<TipoAlcance, "propio">, Perfil> = { estacion: "jefe", area: "mant", red: "mesa" }

function Equipo({ ctx, datos, alcance, periodo, setPeriodo, onAbrir, yoId }: { ctx: Ctx; datos: Datos[]; alcance: Exclude<TipoAlcance, "propio">; periodo: Periodo; setPeriodo: (p: Periodo) => void; onAbrir: (id: string) => void; yoId?: string }) {
  const { db, cuenta, ahora } = ctx
  const perfil = PERFIL_DE_ALCANCE[alcance]
  const [lugar, setLugar] = useState("todas")
  const [puesto, setPuesto] = useState("todos")
  const [buscar, setBuscar] = useState("")
  const [orden, setOrden] = useState<Orden>("indice_desc")
  const [vista, setVista] = useState<"tarjetas" | "ranking" | "tabla">("tarjetas")

  const filas: Fila[] = useMemo(() => datos.map((x) => ({ ...x, ...periodos(x.h, periodo, x.emp.perfil) })), [datos, periodo])
  const lugares = [...new Set(filas.map((f) => lugarDe(f.emp)))]
  const puestos = [...new Set(filas.filter((f) => lugar === "todas" || lugarDe(f.emp) === lugar).map((f) => f.emp.puesto))]
  useEffect(() => {
    if (puesto !== "todos" && !puestos.includes(puesto)) setPuesto("todos")
  }, [puesto, puestos])

  const q = sinAcentos(buscar.trim())
  const filtradas = filas
    .filter((f) => (lugar === "todas" || lugarDe(f.emp) === lugar) && (puesto === "todos" || f.emp.puesto === puesto) && (!q || sinAcentos(f.emp.nombre).includes(q)))
    .sort((a, b) =>
      orden === "nombre" ? a.emp.nombre.localeCompare(b.emp.nombre) : orden === "indice_asc" ? a.actual.indice - b.actual.indice : orden === "asistencia" ? a.actual.asistencia - b.actual.asistencia : b.actual.indice - a.actual.indice,
    )

  const prom = (fn: (f: Fila) => number | null) => {
    const xs = filtradas.map(fn).filter((x): x is number => x !== null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const indice = Math.round(prom((f) => f.actual.indice) ?? 0)
  const indiceAnt = Math.round(prom((f) => f.anterior.indice) ?? 0)
  const asistencia = prom((f) => f.actual.asistencia)
  const puntualidad = prom((f) => f.actual.puntualidad)
  const puntualidadAnt = prom((f) => f.anterior.puntualidad)
  const tiempo = prom((f) => aTiempo(f.actual))
  const tiempoAnt = prom((f) => aTiempo(f.anterior))
  const actividades = filtradas.reduce((a, f) => a + total(f.actual), 0)
  const actividadesAnt = filtradas.reduce((a, f) => a + total(f.anterior), 0)
  const apoyos = filtradas.reduce((a, f) => a + (f.actual.metricas.apoyos?.n ?? 0), 0)
  const presencias = filtradas.filter((f) => f.emp.plantilla).map((f) => presenciaDe(actividadesDe(db, f.emp.plantilla!, ahora), ahora))
  const enTurno = presencias.filter((p) => p.clave !== "fuera").length
  const diasEquipo = filtradas[0]?.actual.dias.map((dd, i) => ({
    ts: dd.ts,
    valor: filtradas.reduce((a, f) => a + actividadDia(f.actual.dias[i]), 0),
    nota: `${filtradas.filter((f) => f.actual.dias[i].estado === "a_tiempo" || f.actual.dias[i].estado === "retardo").length} personas trabajaron`,
  }))

  const titulo = alcance === "estacion" ? `Tu equipo en ${cuenta.estaciones?.join(", ")}` : alcance === "area" ? "Tu equipo técnico" : "Personal de la red"
  const quien = alcance === "red" ? "Mesa de atención y reportes · Toda la red" : alcance === "area" ? "Mantenimiento electromecánico" : `Jefatura de estación · ${cuenta.estaciones?.join(", ")}`
  const bajo = filtradas.filter((f) => f.actual.indice < 70).length
  const resumen = `${filtradas.length} ${filtradas.length === 1 ? "persona" : "personas"} · índice promedio ${indice} · ${bajo ? `${bajo} requieren atención` : "nadie bajo 70"}`

  const porLugar = lugares.map((l) => {
    const de = filas.filter((f) => lugarDe(f.emp) === l)
    const v = de.reduce((a, f) => a + f.actual.indice, 0) / de.length
    return { id: l, nombre: l, detalle: `${de.length} personas · ${pct(de.reduce((a, f) => a + f.actual.asistencia, 0) / de.length)} asist.`, valor: v / 100, figura: String(Math.round(v)), meta: 0.8 }
  })

  return (
    <div className={`vista rol-${perfil}`}>
      <Letrero perfil={perfil} icono="people" quien={quien} titulo={titulo} resumen={resumen} tono={bajo ? "warn" : "ok"} />

      {/* Filtros: una fila sobre todo lo que filtran */}
      <div className="filtros" role="search" aria-label="Filtros del tablero">
        <SelectorPeriodo periodo={periodo} setPeriodo={setPeriodo} />
        {alcance === "red" && (
          <div className="filtro">
            <label htmlFor="f-lugar">Estación</label>
            <select id="f-lugar" className="field-select" value={lugar} onChange={(e) => setLugar(e.target.value)}>
              <option value="todas">Toda la red ({filas.length})</option>
              {lugares.map((l) => (
                <option key={l} value={l}>
                  {l} ({filas.filter((f) => lugarDe(f.emp) === l).length})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="filtro">
          <label htmlFor="f-puesto">Puesto</label>
          <select id="f-puesto" className="field-select" value={puesto} onChange={(e) => setPuesto(e.target.value)}>
            <option value="todos">Todos los puestos</option>
            {puestos.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="filtro">
          <label htmlFor="f-buscar">Buscar</label>
          <span className="filtro-buscar">
            <Icon name="search" className="size-4" />
            <input id="f-buscar" type="search" className="field-select" placeholder="Nombre" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </span>
        </div>
        <div className="filtro">
          <label htmlFor="f-orden">Ordenar</label>
          <select id="f-orden" className="field-select" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="indice_desc">Mayor índice</option>
            <option value="indice_asc">Menor índice</option>
            <option value="asistencia">Menor asistencia</option>
            <option value="nombre">Nombre</option>
          </select>
        </div>
      </div>
      {alcance === "red" && (
        <div className="chips-lugar" role="group" aria-label="Estación rápida">
          {["todas", ...lugares].map((l) => (
            <button key={l} type="button" className="chip-lugar" aria-pressed={lugar === l} onClick={() => setLugar(l)}>
              {l === "todas" ? "Toda la red" : l}
            </button>
          ))}
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="tarjeta mt-4 text-center font-bold text-ink-muted">Nadie coincide con los filtros.</p>
      ) : (
        <>
          <div className="tablero-cabeza">
            <CifraIndice
              valor={indice}
              nivel={nivel(indice)}
              delta={indice - indiceAnt}
              pie={`Promedio de ${filtradas.length} ${filtradas.length === 1 ? "persona" : "personas"}.`}
              partes={[
                { nombre: "Asistencia y puntualidad", peso: "25 %", valor: prom((f) => f.actual.presencia) ?? 0 },
                { nombre: "Metas de actividades", peso: "75 %", valor: prom((f) => f.actual.calidad) ?? 0 },
              ]}
            />
            <div className="kpis">
              <Indicador icono="people" etiqueta="Personas" valor={String(filtradas.length)} sub={presencias.length ? `${enTurno} en turno ahora` : `${lugar === "todas" ? "todas las áreas" : lugar}`} />
              <Indicador icono="calendar" etiqueta="Asistencia promedio" valor={pct(asistencia)} sub="días laborables con asistencia" />
              <Indicador icono="clock" etiqueta="Puntualidad promedio" valor={pct(puntualidad)} delta={puntualidad !== null && puntualidadAnt !== null ? <Delta valor={(puntualidad - puntualidadAnt) * 100} unidad="pts" /> : undefined} />
              <Indicador icono="check" etiqueta="Actividades a tiempo" valor={pct(tiempo)} sub="tareas, rondas, apoyos y tickets con meta" delta={tiempo !== null && tiempoAnt !== null ? <Delta valor={(tiempo - tiempoAnt) * 100} unidad="pts" /> : undefined} />
              <Indicador icono="clipboard" etiqueta="Actividades del periodo" valor={actividades.toLocaleString("es-MX")} delta={<Delta valor={actividades - actividadesAnt} unidad="" mejor={null} />} tendencia={diasEquipo?.map((x) => x.valor)} />
              {apoyos > 0 && <Indicador icono="wheelchair" etiqueta="Apoyos atendidos" valor={apoyos.toLocaleString("es-MX")} sub="a personas usuarias" />}
            </div>
          </div>

          <div className="tablero-dos">
            {diasEquipo && (
              <TarjetaGrafica titulo="Actividad del equipo por día" subtitulo="Suma de tareas, rondas, apoyos, tickets y reportes de las personas filtradas." tabla={{ columnas: ["Día", "Actividades"], filas: diasEquipo.map((x) => [fechaCorta(x.ts), x.valor]) }}>
                <ColumnasDia datos={diasEquipo} unidad="actividades" alto={150} />
              </TarjetaGrafica>
            )}
            {alcance === "red" && lugar === "todas" ? (
              <TarjetaGrafica titulo="Índice por estación" subtitulo="Toca una estación para ver solo a su personal." tabla={{ columnas: ["Estación", "Índice promedio", "Personas"], filas: porLugar.map((p) => [p.nombre, p.figura, filas.filter((f) => lugarDe(f.emp) === p.id).length]) }}>
                <Medidores filas={porLugar} onElegir={(id) => setLugar(id)} />
              </TarjetaGrafica>
            ) : (
              <TarjetaGrafica titulo="Asistencia de hoy" subtitulo="Cómo llegó cada persona al turno.">
                <ul className="hoy-asistencia">
                  {filtradas.map((f) => {
                    const hoy = f.actual.dias[f.actual.dias.length - 1]
                    return (
                      <li key={f.emp.id}>
                        <Avatar nombre={f.emp.nombre} perfil={f.emp.perfil as Perfil} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{f.emp.nombre}</span>
                        <span className={`chip ${hoy.estado === "a_tiempo" ? "chip-estado-ok" : hoy.estado === "retardo" ? "chip-estado-warn" : hoy.estado === "falta" ? "chip-estado-bad" : "chip-estado-neutral"}`}>
                          <Icon name={hoy.estado === "a_tiempo" ? "check" : hoy.estado === "retardo" ? "clock" : hoy.estado === "falta" ? "x" : "minus"} className="size-3" />
                          {hoy.estado === "a_tiempo" ? "A tiempo" : hoy.estado === "retardo" ? `Retardo ${hoy.retardo} min` : hoy.estado === "por_iniciar" ? "Por iniciar" : hoy.estado === "falta" ? "Falta" : "Descanso"}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </TarjetaGrafica>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="seccion-titulo">
              {filtradas.length} {filtradas.length === 1 ? "persona" : "personas"}
              {lugar !== "todas" && ` · ${lugar}`}
            </h2>
            <div className="segmentado" role="group" aria-label="Cómo ver al personal">
              {(["tarjetas", "ranking", "tabla"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>
                  <Icon name={v === "tarjetas" ? "people" : v === "ranking" ? "star" : "list"} className="size-3.5" /> {v === "tarjetas" ? "Tarjetas" : v === "ranking" ? "Ranking" : "Tabla"}
                </button>
              ))}
            </div>
          </div>

          {vista === "tarjetas" && (
            <ul className="personas">
              {filtradas.map((f) => {
                const n = nivel(f.actual.indice)
                const pres = f.emp.plantilla ? presenciaDe(actividadesDe(db, f.emp.plantilla, ahora), ahora) : null
                return (
                  <li key={f.emp.id}>
                    <button type="button" className={`persona rol-${f.emp.perfil}`} onClick={() => onAbrir(f.emp.id)}>
                      <span className="persona-franja" aria-hidden="true" />
                      <span className="persona-cabeza">
                        <Avatar nombre={f.emp.nombre} perfil={f.emp.perfil as Perfil} />
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block font-extrabold leading-snug">
                            {f.emp.nombre}
                            {f.emp.id === yoId && <span className="font-bold text-ink-muted"> (tú)</span>}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {f.emp.puesto} · {lugarDe(f.emp)}
                          </span>
                          {pres && <PresenciaChip p={pres} />}
                        </span>
                        <span className="persona-indice">
                          <span className="persona-indice-valor">{f.actual.indice}</span>
                          <span className={`persona-nivel persona-nivel-${n.tono}`}>
                            <Icon name={n.tono === "ok" ? "star" : "alert"} className="size-3" />
                            {n.etiqueta}
                          </span>
                        </span>
                      </span>
                      <span className="persona-datos">
                        <span>
                          <em>Asistencia</em>
                          {pct(f.actual.asistencia)}
                        </span>
                        <span>
                          <em>Puntualidad</em>
                          {pct(f.actual.puntualidad)}
                        </span>
                        <span>
                          <em>A tiempo</em>
                          {pct(aTiempo(f.actual))}
                        </span>
                      </span>
                      <span className="persona-pie">
                        <span className="text-xs font-bold text-ink-muted">{total(f.actual)} actividades</span>
                        <Delta valor={f.actual.indice - f.anterior.indice} unidad="pts" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {vista === "ranking" && (
            <section className="tarjeta mt-3" aria-label="Ranking del índice de desempeño">
              <Medidores
                filas={filtradas.map((f) => ({ id: f.emp.id, nombre: f.emp.nombre, detalle: `${f.emp.puesto} · ${lugarDe(f.emp)}`, valor: f.actual.indice / 100, figura: String(f.actual.indice), meta: 0.8 }))}
                onElegir={onAbrir}
              />
              <p className="mt-2 text-xs text-ink-muted">La línea vertical marca 80, la meta del índice.</p>
            </section>
          )}
          {vista === "tabla" && (
            <div className="tarjeta tabla-scroll mt-3">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Puesto</th>
                    <th scope="col">{alcance === "red" ? "Estación" : "Lugar"}</th>
                    <th scope="col">Índice</th>
                    <th scope="col">Asistencia</th>
                    <th scope="col">Puntualidad</th>
                    <th scope="col">Retardos</th>
                    <th scope="col">Actividades</th>
                    <th scope="col">A tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((f) => (
                    <tr key={f.emp.id}>
                      <th scope="row">
                        <button type="button" className="enlace" onClick={() => onAbrir(f.emp.id)}>
                          {f.emp.nombre}
                        </button>
                      </th>
                      <td>{f.emp.puesto}</td>
                      <td>{lugarDe(f.emp)}</td>
                      <td>{f.actual.indice}</td>
                      <td>{pct(f.actual.asistencia)}</td>
                      <td>{pct(f.actual.puntualidad)}</td>
                      <td>{f.actual.retardos}</td>
                      <td>{total(f.actual)}</td>
                      <td>{pct(aTiempo(f.actual))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="nota-datos">
            <Icon name="info" size="sm" className="mt-0.5" />
            <span>
              {alcance === "estacion"
                ? "Ves a todo el personal de tu estación; cada persona del equipo solo ve su propio tablero."
                : alcance === "area"
                  ? "Ves a tu equipo técnico; cada persona solo ve su propio tablero."
                  : `Ves al personal de ${ESTACIONES_PILOTO.length} estaciones y de las ${CENTRALES.toLowerCase()}.`}{" "}
              Abrir el tablero de otra persona queda en la bitácora de auditoría. Parte del historial son datos de muestra.
            </span>
          </p>
        </>
      )}
    </div>
  )
}
