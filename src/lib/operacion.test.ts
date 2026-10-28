/**
 * Pruebas de la operación en las estaciones (HU-31 a HU-37, RN10): rondas con responsable,
 * verificación en sitio, órdenes de mantenimiento, incidentes y solicitudes de apoyo.
 */
import { describe, expect, it } from "vitest"
import { altaCuenta, estadoInicial, modulosVisibles, puede, DOMINIO, type Cuenta, type EstadoConsola, type Resultado } from "./admin"
import {
  asignarIncidente,
  asignarResponsable,
  avanzarIncidente,
  personasDe,
  registrarRonda,
  reportesPorVerificar,
  resolverOrden,
  rondasDelDia,
  seguimientoReporte,
  sembrarOperacion,
  solicitarApoyo,
  tomarOrden,
  verificarEnSitio,
  type ResultadoEquipo,
} from "./operacion"
import { equiposDeEstacion } from "../data/accessibility"
import { baseVacia, estadoEquipo, sembrarDemo, type BaseDatos } from "./reports"

const AHORA = new Date(2026, 9, 28, 13, 10).getTime()
const preparar = () => {
  const e = estadoInicial(AHORA)
  const db = sembrarOperacion(sembrarDemo(baseVacia(), AHORA), AHORA)
  return { e, db }
}
const c = (e: EstadoConsola, id: string) => e.cuentas.find((x) => x.id === id) as Cuenta
const todosFuncionan = (station: string, excepto: Record<string, ResultadoEquipo> = {}) =>
  Object.fromEntries(equiposDeEstacion(station).map((eq) => [eq.id, excepto[eq.id] ?? "funciona"])) as Record<string, ResultadoEquipo>
const op = (db: BaseDatos) => db.operacion!
const codigo = (r: Resultado) => (r.ok ? 200 : r.codigo)

describe("roles operativos: cada uno ve solo lo suyo", () => {
  it("cada rol operativo tiene módulos distintos", () => {
    const { e } = preparar()
    const mods = (id: string) => modulosVisibles(c(e, id), AHORA).map((m) => m.id)
    expect(mods("C-OPER")).toEqual(["inicio", "infraestructura", "rondas", "mantenimiento"])
    expect(mods("C-JE-TAC")).toEqual(["inicio", "estacion", "rondas"])
    expect(mods("C-PE-TAC")).toEqual(["inicio", "estacion", "rondas"])
    expect(mods("C-MANT")).toEqual(["inicio", "mantenimiento"])
    expect(mods("C-JSEG")).toEqual(["inicio", "seguridad"])
    expect(mods("C-SEG-TAC")).toEqual(["inicio", "seguridad"])
  })
  it("ningún rol operativo ve fotos ni la bitácora", () => {
    const { e } = preparar()
    for (const id of ["C-OPER", "C-JE-TAC", "C-PE-TAC", "C-MANT", "C-JSEG", "C-SEG-TAC"]) {
      expect(puede(c(e, id), "evidencias.ver", AHORA)).toBe(false)
      expect(puede(c(e, id), "bitacora.ver", AHORA)).toBe(false)
    }
  })
  it("los roles de estación requieren estación y quien repara no confirma su reparación (RN9)", () => {
    const { e } = preparar()
    const pedro = c(e, "C-PEDRO")
    const base = { nombre: "Persona nueva", correo: `nueva@${DOMINIO}`, puesto: "x", tipo: "stc" as const }
    expect(altaCuenta(e, pedro, { ...base, roles: ["personal_estacion"] }, AHORA).ok).toBe(false)
    expect(altaCuenta(e, pedro, { ...base, roles: ["personal_estacion", "mantenimiento"], estaciones: ["Zapata"] }, AHORA).ok).toBe(false)
    expect(altaCuenta(e, pedro, { ...base, roles: ["personal_estacion"], estaciones: ["Zapata"] }, AHORA).ok).toBe(true)
  })
})

describe("rondas de revisión (RN10)", () => {
  it("cada estación del piloto tiene cinco rondas con responsable y se detecta la atrasada", () => {
    const { db } = preparar()
    const pan = rondasDelDia(op(db), "Pantitlán", AHORA, AHORA)
    expect(pan).toHaveLength(5)
    expect(pan.every((r) => r.responsable)).toBe(true)
    expect(pan.find((r) => r.slot === "09:00")?.estado).toBe("atrasada")
    expect(pan.find((r) => r.slot === "apertura")?.responsable?.puesto).toBe("Jefe(a) de estación")
  })
  it("solo la persona asignada da su ronda; el jefe puede cubrirla; no se registra dos veces ni en otra estación", () => {
    const { e, db } = preparar()
    const jorge = c(e, "C-PE-TAC")
    const arturo = c(e, "C-JE-TAC")
    expect(codigo(registrarRonda(db, e, jorge, "Tacubaya", "13:00", todosFuncionan("Tacubaya"), "", AHORA))).toBe(403)
    expect(codigo(registrarRonda(db, e, jorge, "Hidalgo", "13:00", todosFuncionan("Hidalgo"), "", AHORA))).toBe(403)
    expect(registrarRonda(db, e, arturo, "Tacubaya", "13:00", todosFuncionan("Tacubaya"), "", AHORA).ok).toBe(true)
    expect(codigo(registrarRonda(db, e, arturo, "Tacubaya", "13:00", todosFuncionan("Tacubaya"), "", AHORA))).toBe(409)
  })
  it("el jefe reasigna la ronda y entonces el personal sí puede darla", () => {
    const { e, db } = preparar()
    const jorge = c(e, "C-PE-TAC")
    const yo = personasDe(op(db), "Tacubaya").find((p) => p.cuentaId === "C-PE-TAC")!
    expect(asignarResponsable(db, e, jorge, "Tacubaya", "13:00", yo.id, AHORA).ok).toBe(false)
    expect(asignarResponsable(db, e, c(e, "C-JE-TAC"), "Tacubaya", "13:00", yo.id, AHORA).ok).toBe(true)
    expect(registrarRonda(db, e, jorge, "Tacubaya", "13:00", todosFuncionan("Tacubaya"), "", AHORA).ok).toBe(true)
  })
  it("una falla encontrada en la ronda crea la orden y cambia el estado que usan las rutas", () => {
    const { e, db } = preparar()
    const eq = "EL-TACUBAYA-05"
    expect(estadoEquipo(db, eq, AHORA).estado).toBe("disponible")
    expect(registrarRonda(db, e, c(e, "C-JE-TAC"), "Tacubaya", "13:00", todosFuncionan("Tacubaya", { [eq]: "fuera_servicio" }), "Puerta trabada", AHORA).ok).toBe(true)
    const orden = op(db).ordenes.find((o) => o.equipmentId === eq && o.estado === "abierta")!
    expect(orden.prioridad).toBe("alta")
    expect(estadoEquipo(db, eq, AHORA).estado).toBe("fuera_servicio")
    const alejandra = c(e, "C-MANT")
    expect(tomarOrden(db, e, alejandra, orden.id, AHORA + 60_000).ok).toBe(true)
    expect(resolverOrden(db, e, alejandra, orden.id, "", AHORA + 120_000).ok).toBe(false)
    expect(resolverOrden(db, e, alejandra, orden.id, "Ajuste de operador de puertas", AHORA + 120_000).ok).toBe(true)
    expect(estadoEquipo(db, eq, AHORA + 180_000).estado).toBe("disponible")
  })
})

describe("verificación en sitio y seguimiento del reporte", () => {
  it("el reporte de Hidalgo espera verificación; solo su estación lo verifica", () => {
    const { e, db } = preparar()
    const pend = reportesPorVerificar(db, ["Hidalgo"], AHORA)
    expect(pend).toHaveLength(1)
    const eq = pend[0].equipmentId
    expect(codigo(verificarEnSitio(db, e, c(e, "C-PE-TAC"), eq, "sin_falla", AHORA))).toBe(403)
    const hidalgo = { ...c(e, "C-PE-TAC"), id: "C-PE-HID", estaciones: ["Hidalgo"] }
    expect(verificarEnSitio(db, e, hidalgo, eq, "sin_falla", AHORA).ok).toBe(true)
    expect(reportesPorVerificar(db, ["Hidalgo"], AHORA)).toHaveLength(0)
    expect(estadoEquipo(db, eq, AHORA).estado).toBe("disponible")
    const r = db.reportes.find((x) => x.equipmentId === eq)!
    expect(seguimientoReporte(db, r)?.etapa).toBe("sin_falla")
  })
  it("quien reportó el elevador de Tacubaya ve que está en reparación", () => {
    const { db } = preparar()
    const r = db.reportes.find((x) => x.equipmentId === "EL-TACUBAYA-01")!
    expect(seguimientoReporte(db, r)?.etapa).toBe("en_reparacion")
  })
  it("mantenimiento no verifica reportes y el personal no cierra órdenes", () => {
    const { e, db } = preparar()
    expect(verificarEnSitio(db, e, c(e, "C-MANT"), "EE-HIDALGO-02", "confirmada", AHORA).ok).toBe(false)
    const orden = op(db).ordenes.find((o) => o.estado !== "resuelta")!
    expect(resolverOrden(db, e, c(e, "C-PE-TAC"), orden.id, "x", AHORA).ok).toBe(false)
  })
})

describe("solicitudes de apoyo e incidentes", () => {
  it("la persona usuaria pide apoyo sin cuenta y no puede dejar teléfonos", () => {
    const { db } = preparar()
    expect(solicitarApoyo(db, { station: "Zapata", punto: "Andén", tipo: "apoyo_movilidad", detalle: "Llámame al 55 1234 5678" }, AHORA).ok).toBe(false)
    const r = solicitarApoyo(db, { station: "Zapata", punto: "Andén", tipo: "apoyo_movilidad", detalle: "Silla de ruedas, chamarra roja" }, AHORA)
    expect(r.ok).toBe(true)
    expect(op(db).incidentes[0]).toMatchObject({ station: "Zapata", estado: "abierta", origen: "persona_usuaria" })
  })
  it("el jefe de estación asigna y el personal atiende; seguridad solo asigna policía", () => {
    const { e, db } = preparar()
    const ap = op(db).incidentes.find((x) => x.id === "AP-0101")!
    const jorge = personasDe(op(db), "Tacubaya").find((p) => p.cuentaId === "C-PE-TAC")!
    expect(asignarIncidente(db, e, c(e, "C-SEG-TAC"), ap.id, jorge.id, AHORA).ok).toBe(false)
    expect(asignarIncidente(db, e, c(e, "C-JSEG"), ap.id, jorge.id, AHORA).ok).toBe(false)
    expect(asignarIncidente(db, e, c(e, "C-JE-TAC"), ap.id, jorge.id, AHORA).ok).toBe(true)
    expect(avanzarIncidente(db, e, c(e, "C-PE-TAC"), ap.id, "en_camino", "", AHORA + 60_000).ok).toBe(true)
    expect(avanzarIncidente(db, e, c(e, "C-PE-TAC"), ap.id, "atendida", "Acompañada al andén", AHORA + 300_000).ok).toBe(true)
    expect(op(db).incidentes.find((x) => x.id === ap.id)?.estado).toBe("atendida")
  })
  it("el personal de seguridad solo atiende lo que tiene asignado", () => {
    const { e, db } = preparar()
    expect(avanzarIncidente(db, e, c(e, "C-SEG-TAC"), "AP-0101", "en_camino", "", AHORA).ok).toBe(false)
    expect(avanzarIncidente(db, e, c(e, "C-SEG-TAC"), "AP-0100", "en_camino", "", AHORA).ok).toBe(true)
  })
})
