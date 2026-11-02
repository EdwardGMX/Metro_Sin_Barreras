/**
 * Pruebas de la jornada en el tiempo del turno: las actividades de cada persona, quién está
 * dónde en este momento y el reparto en carriles del diagrama de Gantt.
 */
import { describe, expect, it } from "vitest"
import { estadoInicial } from "./admin"
import { actividadesDe, carriles, presenciaDe, type Actividad } from "./jornada"
import { avanzarIncidente, operacionDe, personasDe, sembrarOperacion } from "./operacion"
import { baseVacia, sembrarDemo } from "./reports"
import { crearTarea, sembrarServicio, turnoEnCurso } from "./servicio"

const AHORA = new Date(2026, 9, 28, 10, 30).getTime()
const preparar = () => {
  const e = estadoInicial(AHORA)
  const db = sembrarServicio(sembrarOperacion(sembrarDemo(baseVacia(), AHORA), AHORA), AHORA)
  return { e, db }
}
const jefe = (e: ReturnType<typeof estadoInicial>) => e.cuentas.find((c) => c.id === "C-JE-TAC")!
const act = (id: string, inicio: number, fin: number): Actividad => ({ id, tipo: "tarea", titulo: id, inicio, fin, estado: "pendiente" })

describe("actividades de la jornada", () => {
  it("todas caen dentro del turno en curso, ordenadas y con fin después del inicio", () => {
    const { db } = preparar()
    const turno = turnoEnCurso(AHORA)
    for (const p of personasDe(operacionDe(db), "Tacubaya")) {
      const acts = actividadesDe(db, p, AHORA)
      for (const a of acts) {
        expect(a.inicio).toBeGreaterThanOrEqual(turno.inicio)
        expect(a.fin).toBeLessThanOrEqual(turno.fin)
        expect(a.fin).toBeGreaterThan(a.inicio)
      }
      expect(acts.map((a) => a.inicio)).toEqual([...acts.map((a) => a.inicio)].sort((x, y) => x - y))
    }
  })

  it("una tarea que asigna el jefe aparece en la línea de la persona a su hora", () => {
    const { e, db } = preparar()
    const rosa = personasDe(operacionDe(db), "Tacubaya").find((p) => p.puesto === "Personal de limpieza")!
    expect(crearTarea(db, e, jefe(e), { station: "Tacubaya", personaId: rosa.id, asunto: "Revisar el sanitario del andén", detalle: "", hora: 12 * 60 + 15, prioridad: "media" }, AHORA).ok).toBe(true)
    const a = actividadesDe(db, rosa, AHORA).find((x) => x.titulo === "Revisar el sanitario del andén")!
    expect(a).toMatchObject({ tipo: "tarea", inicio: 12 * 60 + 15, estado: "pendiente" })
  })

  it("las rondas a su cargo cuentan como actividades del turno", () => {
    const { db } = preparar()
    const acts = personasDe(operacionDe(db), "Tacubaya").flatMap((p) => actividadesDe(db, p, AHORA))
    expect(acts.some((a) => a.tipo === "ronda")).toBe(true)
  })
})

describe("quién está dónde", () => {
  it("un apoyo asignado manda sobre todo lo demás y cambia al ir en camino", () => {
    const { e, db } = preparar()
    const op = operacionDe(db)
    const x = op.incidentes.find((i) => i.station === "Tacubaya" && i.estado === "asignada")!
    const p = personasDe(op, "Tacubaya").find((y) => y.id === x.asignadoA)!
    expect(presenciaDe(actividadesDe(db, p, AHORA), AHORA)).toMatchObject({ clave: "apoyo", texto: "Apoyo por atender" })
    const cuenta = e.cuentas.find((c) => c.id === p.cuentaId)!
    expect(avanzarIncidente(db, e, cuenta, x.id, "en_camino", "", AHORA).ok).toBe(true)
    expect(presenciaDe(actividadesDe(db, p, AHORA), AHORA).texto).toBe("En camino a un apoyo")
  })

  it("sin nada en curso, la persona está disponible y se ve qué sigue", () => {
    const acts = [act("a", 11 * 60, 11 * 60 + 30)]
    expect(presenciaDe(acts, AHORA)).toMatchObject({ clave: "disponible", detalle: "Sigue 11:00 · a" })
  })

  it("fuera del horario de los turnos nadie aparece en la estación", () => {
    const noche = new Date(2026, 9, 28, 23, 30).getTime()
    expect(presenciaDe([], noche).clave).toBe("fuera")
  })
})

describe("carriles del Gantt", () => {
  it("las actividades que se enciman van en carriles distintos y las demás reutilizan el primero", () => {
    const r = carriles([act("a", 360, 400), act("b", 380, 420), act("c", 410, 440)])
    expect(r.map((x) => x.carril)).toEqual([0, 1, 0])
  })
})
