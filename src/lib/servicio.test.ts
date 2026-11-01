/**
 * Pruebas de los reportes de servicio, los tickets entre áreas y las tareas del jefe de estación (RN11 a RN14).
 */
import { describe, expect, it } from "vitest"
import { estadoInicial, type Cuenta, type EstadoConsola } from "./admin"
import { personasDe, operacionDe, sembrarOperacion } from "./operacion"
import { baseVacia, registrarReporte, sembrarDemo, type BaseDatos } from "./reports"
import {
  asignadoA,
  asignarTicket,
  avanzarTicket,
  cerrarTicket,
  confirmarSolucion,
  crearTarea,
  idPersonal,
  levantarTicket,
  porTurnar,
  reportarServicio,
  seguimientoServicio,
  sembrarServicio,
  servicioDe,
  turnarReportes,
  turnoEnCurso,
  SEUDONIMO_DEMO,
} from "./servicio"

const AHORA = new Date(2026, 9, 28, 10, 30).getTime()
const MIN = 60_000
const HORA = 60 * MIN

function preparar() {
  const e = estadoInicial(AHORA)
  const db = sembrarServicio(sembrarOperacion(sembrarDemo(baseVacia(), AHORA), AHORA), AHORA)
  return { e, db }
}
const c = (e: EstadoConsola, id: string) => e.cuentas.find((x) => x.id === id) as Cuenta
const sesion = (seudonimo: string) => ({ seudonimo, expira: AHORA + HORA })
const ticket = (db: BaseDatos, id: string) => servicioDe(db).tickets.find((t) => t.id === id)!
const ultimo = (db: BaseDatos) => servicioDe(db).tickets[0]
const persona = (db: BaseDatos, station: string, puesto: string) => personasDe(operacionDe(db), station).find((p) => p.puesto === puesto)!

describe("Reportes de servicio de las personas usuarias", () => {
  it("requieren sesión y solo aceptan opciones predefinidas", () => {
    const { db } = preparar()
    expect(reportarServicio(db, null, { station: "Tacubaya", categoria: "limpieza", problema: "derrame", lugar: "Andén" }, AHORA).ok).toBe(false)
    const r = reportarServicio(db, sesion("p-1"), { station: "Tacubaya", categoria: "limpieza", problema: "algo inventado", lugar: "Andén" }, AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe(400)
    const lugar = reportarServicio(db, sesion("p-1"), { station: "Tacubaya", categoria: "limpieza", problema: "basura", lugar: "Mi casa" }, AHORA)
    expect(lugar.ok).toBe(false)
  })

  it("comparten el límite de 5 por día con los reportes de equipos e ignoran duplicados de 2 h", () => {
    const { db } = preparar()
    const s = sesion("p-limite")
    for (let i = 2; i >= 0; i--) registrarReporte(db, s, { station: "Hidalgo", equipmentId: db.reportes.find((x) => x.station === "Hidalgo")!.equipmentId, estado: "no_funciona", hashesFotos: [] }, AHORA - i * 3 * HORA)
    expect(reportarServicio(db, s, { station: "Zapata", categoria: "limpieza", problema: "basura", lugar: "Andén" }, AHORA).ok).toBe(true)
    const dup = reportarServicio(db, s, { station: "Zapata", categoria: "limpieza", problema: "basura", lugar: "Pasillo" }, AHORA + 10 * MIN)
    expect(dup.ok).toBe(false)
    expect(reportarServicio(db, s, { station: "Zapata", categoria: "trato", problema: "trato", lugar: "Andén" }, AHORA + 11 * MIN).ok).toBe(true)
    const sexto = reportarServicio(db, s, { station: "Balderas", categoria: "limpieza", problema: "derrame", lugar: "Andén" }, AHORA + 12 * MIN)
    expect(sexto.ok).toBe(false)
    if (!sexto.ok) expect(sexto.codigo).toBe(429)
  })

  it("un reporte igual a un ticket abierto se suma a ese ticket", () => {
    const { db } = preparar()
    const r = reportarServicio(db, sesion("p-2"), { station: "Pantitlán", categoria: "aglomeracion", problema: "anden", lugar: "Andén" }, AHORA)
    expect(r.ok && r.reporte.ticketId).toBe("TK-0053")
    expect(ticket(db, "TK-0053").reportes).toHaveLength(3)
  })

  it("la mesa agrupa los iguales y sube la prioridad cuando 3 personas reportan lo mismo", () => {
    const { db } = preparar()
    const avisos = porTurnar(db, AHORA).find((g) => g.station === "Hidalgo" && g.problema.id === "avisos")!
    expect(avisos.reportes).toHaveLength(3)
    expect(avisos.prioridad).toBe("alta")
    expect(avisos.verificadas).toBe(1)
  })
})

describe("Tickets entre áreas (RN11, RN12)", () => {
  it("solo la Mesa de atención turna reportes ciudadanos", () => {
    const { e, db } = preparar()
    const grupo = porTurnar(db, AHORA).find((g) => g.station === "Hidalgo")!
    const ids = grupo.reportes.map((r) => r.id)
    expect(turnarReportes(db, e, c(e, "C-SEG-TAC"), ids, "mantenimiento", "alta", AHORA).ok).toBe(false)
    expect(e.auditoria[0].resultado).toBe("denegado")
    expect(turnarReportes(db, e, c(e, "C-MESA"), ids, "mantenimiento", "alta", AHORA).ok).toBe(true)
    expect(ultimo(db).reportes).toEqual(ids)
    expect(porTurnar(db, AHORA).some((g) => g.station === "Hidalgo" && g.problema.id === "avisos")).toBe(false)
  })

  it("cualquier persona del personal levanta tickets, pero solo en sus estaciones", () => {
    const { e, db } = preparar()
    const datos = { area: "sistemas" as const, station: "Tacubaya", asunto: "La app o la consola no responde", detalle: "", prioridad: "baja" as const }
    expect(levantarTicket(db, e, c(e, "C-SEG-TAC"), datos, AHORA).ok).toBe(true)
    expect(levantarTicket(db, e, c(e, "C-MANT"), { ...datos, station: "Zapata" }, AHORA).ok).toBe(true)
    expect(levantarTicket(db, e, c(e, "C-SEG-TAC"), { ...datos, station: "Pantitlán" }, AHORA).ok).toBe(false)
  })

  it("asigna la Mesa o quien encarga el área, y solo a personal de esa área", () => {
    const { e, db } = preparar()
    const r = levantarTicket(db, e, c(e, "C-PE-TAC"), { area: "seguridad", station: "Tacubaya", asunto: "Rondín adicional de vigilancia", detalle: "", prioridad: "media" }, AHORA)
    expect(r.ok).toBe(true)
    const id = ultimo(db).id
    const karla = persona(db, "Tacubaya", "Policía auxiliar")
    const rosa = persona(db, "Tacubaya", "Personal de limpieza")
    expect(asignarTicket(db, e, c(e, "C-MANT"), id, karla.id, AHORA).ok).toBe(false) // Mantenimiento no encarga seguridad
    expect(asignarTicket(db, e, c(e, "C-JE-PAN"), id, karla.id, AHORA).ok).toBe(false) // otra estación
    expect(asignarTicket(db, e, c(e, "C-JE-TAC"), id, rosa.id, AHORA).ok).toBe(false) // limpieza no atiende seguridad
    expect(asignarTicket(db, e, c(e, "C-JE-TAC"), id, karla.id, AHORA).ok).toBe(true)
    expect(ticket(db, id).estado).toBe("asignado")
  })

  it("quien tiene el ticket lo resuelve, y quien lo resolvió no lo cierra (RN9)", () => {
    const { e, db } = preparar()
    const karla = c(e, "C-SEG-TAC")
    expect(avanzarTicket(db, e, c(e, "C-PE-TAC"), "TK-0054", "resuelto", "", AHORA).ok).toBe(false)
    expect(avanzarTicket(db, e, karla, "TK-0054", "en_proceso", "", AHORA).ok).toBe(true)
    expect(avanzarTicket(db, e, karla, "TK-0054", "resuelto", "Se retiró el puesto", AHORA + 20 * MIN).ok).toBe(true)
    const propio = cerrarTicket(db, e, karla, "TK-0054", AHORA + 21 * MIN)
    expect(propio.ok).toBe(false)
    if (!propio.ok) expect(propio.codigo).toBe(403)
    expect(cerrarTicket(db, e, c(e, "C-PE-TAC"), "TK-0054", AHORA + 30 * MIN).ok).toBe(true) // lo levantó Jorge
    expect(ticket(db, "TK-0054").estado).toBe("cerrado")
  })

  it("la Mesa no cierra lo que ella misma resolvió", () => {
    const { e, db } = preparar()
    const mesa = c(e, "C-MESA")
    expect(asignarTicket(db, e, mesa, "TK-0058", "A-PATRICIA", AHORA).ok).toBe(true)
    expect(avanzarTicket(db, e, mesa, "TK-0058", "resuelto", "", AHORA).ok).toBe(true)
    const r = cerrarTicket(db, e, mesa, "TK-0058", AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe(409)
  })
})

describe("Tareas del jefe de estación (RN13)", () => {
  it("asigna a su personal de seguridad, estación y limpieza, no a otras estaciones ni áreas", () => {
    const { e, db } = preparar()
    const jefe = c(e, "C-JE-TAC")
    const karla = persona(db, "Tacubaya", "Policía auxiliar")
    const raul = persona(db, "Pantitlán", "Policía auxiliar")
    const base = { station: "Tacubaya", asunto: "Rondín de vigilancia en andenes", detalle: "", hora: 12 * 60, prioridad: "media" as const }
    expect(crearTarea(db, e, jefe, { ...base, personaId: karla.id }, AHORA).ok).toBe(true)
    expect(ultimo(db).area).toBe("seguridad")
    expect(crearTarea(db, e, jefe, { ...base, personaId: raul.id }, AHORA).ok).toBe(false)
    expect(crearTarea(db, e, jefe, { ...base, station: "Pantitlán", personaId: raul.id }, AHORA).ok).toBe(false)
    const tecnico = crearTarea(db, e, jefe, { ...base, personaId: "T-DIEGO" }, AHORA)
    expect(tecnico.ok).toBe(false)
    expect(tecnico.mensaje).toMatch(/levanta un ticket/)
    expect(crearTarea(db, e, c(e, "C-PE-TAC"), { ...base, personaId: karla.id }, AHORA).ok).toBe(false)
  })

  it("la jornada de la policía auxiliar junta sus tareas y tickets en orden de hora", () => {
    const { e, db } = preparar()
    const karla = c(e, "C-SEG-TAC")
    const lista = asignadoA(db, idPersonal(db, karla), AHORA)
    expect(lista.some((t) => t.id === "TK-0054")).toBe(true)
    expect(lista.filter((t) => t.clase === "tarea").length).toBe(6)
    const horas = lista.filter((t) => t.clase === "tarea").map((t) => t.hora!)
    expect(horas).toEqual([...horas].sort((a, b) => a - b))
    expect(turnoEnCurso(AHORA).id).toBe("matutino")
    expect(turnoEnCurso(new Date(2026, 9, 28, 18, 0).getTime()).id).toBe("vespertino")
  })
})

describe("La persona usuaria confirma la solución (RN14)", () => {
  it("si se resolvió, se cierra; si sigue, se reabre y vuelve a «En atención»", () => {
    const { db } = preparar()
    const r = servicioDe(db).reportes.find((x) => x.id === "RS-0201")!
    expect(seguimientoServicio(db, r).pideConfirmacion).toBe(true)
    expect(confirmarSolucion(db, "otra-persona", "RS-0201", false, AHORA).ok).toBe(false)
    expect(confirmarSolucion(db, SEUDONIMO_DEMO, "RS-0201", false, AHORA).ok).toBe(true)
    expect(ticket(db, "TK-0051").estado).toBe("asignado")
    expect(seguimientoServicio(db, r).etapa).toBe(2)

    const { db: db2 } = preparar()
    expect(confirmarSolucion(db2, SEUDONIMO_DEMO, "RS-0201", true, AHORA).ok).toBe(true)
    expect(ticket(db2, "TK-0051").estado).toBe("cerrado")
  })

  it("el personal nunca ve el seudónimo en el ticket, solo cuántas personas reportaron", () => {
    const { db } = preparar()
    const t = ticket(db, "TK-0051")
    expect(JSON.stringify(t)).not.toContain(SEUDONIMO_DEMO)
  })
})
