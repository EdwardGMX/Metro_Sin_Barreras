/**
 * Pruebas del tablero de desempeño del personal (RN16): quién ve a quién y que los números cuadren.
 */
import { describe, expect, it } from "vitest"
import { estadoInicial, type Cuenta, type EstadoConsola } from "./admin"
import {
  alcanceTablero,
  empleadoDeCuenta,
  empleados,
  empleadosVisibles,
  eventosDe,
  historial,
  insignias,
  periodos,
  puedeVerEmpleado,
  registrarConsulta,
  resumir,
} from "./desempeno"
import { sembrarOperacion } from "./operacion"
import { baseVacia, sembrarDemo } from "./reports"
import { sembrarServicio, servicioDe, vencimiento } from "./servicio"

const AHORA = new Date(2026, 10, 19, 11, 30).getTime()

function preparar() {
  const e = estadoInicial(AHORA)
  const db = sembrarServicio(sembrarOperacion(sembrarDemo(baseVacia(), AHORA), AHORA), AHORA)
  return { e, db, lista: empleados(db, e.cuentas) }
}
const c = (e: EstadoConsola, id: string) => e.cuentas.find((x) => x.id === id) as Cuenta

describe("Tablero de desempeño (RN16)", () => {
  it("reúne a la plantilla de las 5 estaciones y a las áreas centrales", () => {
    const { lista } = preparar()
    expect(lista).toHaveLength(31)
    expect(lista.filter((x) => x.station === "Tacubaya")).toHaveLength(5)
    expect(lista.filter((x) => !x.station).map((x) => x.perfil).sort()).toEqual(["mant", "mant", "mant", "mesa", "mesa", "sistemas"])
  })

  it("el personal solo se ve a sí mismo; el jefe, a su estación; mantenimiento, a su equipo; la Mesa, a toda la red", () => {
    const { e, lista } = preparar()
    expect(alcanceTablero(c(e, "C-SEG-TAC"))).toBe("propio")
    expect(empleadosVisibles(lista, c(e, "C-SEG-TAC")).map((x) => x.nombre)).toEqual(["Karla Jiménez Soto"])
    expect(empleadosVisibles(lista, c(e, "C-PE-TAC")).map((x) => x.nombre)).toEqual(["Jorge Aranda Vela"])
    const tac = empleadosVisibles(lista, c(e, "C-JE-TAC"))
    expect(tac).toHaveLength(5)
    expect(tac.every((x) => x.station === "Tacubaya")).toBe(true)
    expect(empleadosVisibles(lista, c(e, "C-JE-PAN")).every((x) => x.station === "Pantitlán")).toBe(true)
    expect(empleadosVisibles(lista, c(e, "C-MANT")).map((x) => x.nombre).sort()).toEqual(["Alejandra Torres Luna", "Diego Herrera Campos", "Mariana Cortés Ibáñez"])
    expect(empleadosVisibles(lista, c(e, "C-MESA"))).toHaveLength(31)
    const karla = empleadoDeCuenta(lista, c(e, "C-SEG-TAC"))!
    const jorge = empleadoDeCuenta(lista, c(e, "C-PE-TAC"))!
    expect(puedeVerEmpleado(lista, c(e, "C-SEG-TAC"), jorge.id)).toBe(false)
    expect(puedeVerEmpleado(lista, c(e, "C-JE-PAN"), karla.id)).toBe(false)
    expect(puedeVerEmpleado(lista, c(e, "C-JE-TAC"), karla.id)).toBe(true)
  })

  it("una cuenta suspendida no ve a nadie", () => {
    const { e, lista } = preparar()
    const jefe = { ...c(e, "C-JE-TAC"), estado: "suspendida" as const }
    expect(empleadosVisibles(lista, jefe)).toHaveLength(0)
  })

  it("el historial es determinista y hoy cuenta solo las tareas reales que ya hizo", () => {
    const { db, lista } = preparar()
    const karla = lista.find((x) => x.nombre === "Karla Jiménez Soto")!
    const a = historial(db, karla, AHORA)
    const b = historial(db, karla, AHORA)
    expect(a).toHaveLength(60)
    expect(a).toEqual(b)
    const hoy = a[a.length - 1]
    expect(hoy.muestra).toBe(false)
    const hechasHoy = servicioDe(db).tickets.filter((t) => t.clase === "tarea" && t.asignadoA === karla.id && t.resuelto && new Date(t.resuelto).toDateString() === new Date(AHORA).toDateString())
    expect(hoy.m.tareas?.n).toBe(hechasHoy.length)
    expect(hoy.m.tareas?.ok).toBe(hechasHoy.filter((t) => t.resuelto! <= vencimiento(t)).length)
  })

  it("el resumen cuadra: tasas entre 0 y 1, índice entre 0 y 100, días que suman el periodo", () => {
    const { db, lista } = preparar()
    for (const emp of lista) {
      const h = historial(db, emp, AHORA)
      const { actual, anterior } = periodos(h, 30, emp.perfil)
      expect(actual.dias).toHaveLength(30)
      expect(anterior.dias).toHaveLength(30)
      expect(actual.laborables + actual.descansos).toBeLessThanOrEqual(30)
      expect(actual.asistencia).toBeGreaterThanOrEqual(0)
      expect(actual.asistencia).toBeLessThanOrEqual(1)
      expect(actual.indice).toBeGreaterThanOrEqual(0)
      expect(actual.indice).toBeLessThanOrEqual(100)
      for (const m of Object.values(actual.metricas)) {
        expect(m!.ok).toBeLessThanOrEqual(m!.n)
        if (m!.tasa !== null) expect(m!.tasa).toBeLessThanOrEqual(1)
      }
      for (const d of h) {
        if (d.m.apoyos) expect(d.atencion).toHaveLength(d.m.apoyos.n)
        if (d.m.tickets) expect(d.resolucion).toHaveLength(d.m.tickets.n)
      }
    }
  })

  it("las insignias salen de los datos del periodo", () => {
    const { db, lista } = preparar()
    const emp = lista[0]
    const h = historial(db, emp, AHORA)
    const r = resumir(h.slice(-30), emp.perfil)
    for (const i of insignias(r, h)) expect(i.nombre.length).toBeGreaterThan(0)
    const perfecto = resumir(
      h.slice(-7).map((d) => ({ ...d, estado: d.estado === "descanso" ? d.estado : ("a_tiempo" as const) })),
      emp.perfil,
    )
    expect(insignias(perfecto, h).some((i) => i.id === "puntual")).toBe(true)
  })

  it("consultar el tablero de otra persona queda en la bitácora; el propio, no", () => {
    const { e, lista } = preparar()
    const jefe = c(e, "C-JE-TAC")
    const yo = empleadoDeCuenta(lista, jefe)!
    const karla = lista.find((x) => x.nombre === "Karla Jiménez Soto")!
    registrarConsulta(e, jefe, yo, AHORA)
    expect(e.auditoria.some((a) => a.accion === "consultar desempeño")).toBe(false)
    registrarConsulta(e, jefe, karla, AHORA)
    expect(e.auditoria[0].accion).toBe("consultar desempeño")
    expect(e.auditoria[0].objeto).toContain("Karla")
  })

  it("la actividad reciente solo usa registros reales del prototipo", () => {
    const { db, e, lista } = preparar()
    const rosa = lista.find((x) => x.nombre === "Rosa Martínez Ortiz")!
    const ev = eventosDe(db, rosa, e.auditoria)
    expect(ev.length).toBeGreaterThan(0)
    expect(ev.some((x) => x.detalle?.includes("TK-0051"))).toBe(true)
    for (let i = 1; i < ev.length; i++) expect(ev[i - 1].ts).toBeGreaterThanOrEqual(ev[i].ts)
  })
})
