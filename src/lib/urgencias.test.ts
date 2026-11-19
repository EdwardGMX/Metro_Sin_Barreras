/**
 * Pruebas de las urgencias graves (RN15): quién las activa, quién las ve y para quién suena la alarma.
 */
import { describe, expect, it } from "vitest"
import { estadoInicial, type Cuenta, type EstadoConsola } from "./admin"
import { baseVacia } from "./reports"
import { activarUrgencia, atenderUrgencia, debeSonar, marcarEnterado, ubicacionesParaMesa, urgenciasDe, urgenciasVisibles, VIGENCIA_URGENCIA } from "./urgencias"

const AHORA = new Date(2026, 10, 19, 10, 0).getTime()
const c = (e: EstadoConsola, id: string) => e.cuentas.find((x) => x.id === id) as Cuenta
const preparar = () => ({ e: estadoInicial(AHORA), db: baseVacia() })
const vias = { station: "Tacubaya", tipo: "persona_vias" as const, lugar: "Vías" }

describe("Urgencias graves (RN15)", () => {
  it("la activan todos los roles menos la Mesa de atención, y solo en su estación", () => {
    const { e, db } = preparar()
    const mesa = activarUrgencia(db, e, c(e, "C-MESA"), vias, AHORA)
    expect(mesa.ok).toBe(false)
    if (!mesa.ok) expect(mesa.codigo).toBe(403)
    expect(activarUrgencia(db, e, c(e, "C-SEG-TAC"), { ...vias, station: "Pantitlán" }, AHORA).ok).toBe(false)
    expect(activarUrgencia(db, e, c(e, "C-PE-TAC"), vias, AHORA).ok).toBe(true)
    expect(activarUrgencia(db, e, c(e, "C-MANT"), { station: "Pantitlán", tipo: "robo", lugar: "Andén" }, AHORA).ok).toBe(true)
    expect(activarUrgencia(db, e, c(e, "C-JE-TAC"), { station: "Tacubaya", tipo: "robo", lugar: "Mi casa" }, AHORA).ok).toBe(false)
    expect(e.auditoria.some((a) => a.accion === "activar urgencia")).toBe(true)
  })

  it("solo la ve completa el personal de esa estación, y suena para quien no ha marcado «Enterado»", () => {
    const { e, db } = preparar()
    activarUrgencia(db, e, c(e, "C-PE-TAC"), vias, AHORA)
    const id = urgenciasDe(db)[0].id
    expect(urgenciasVisibles(db, c(e, "C-SEG-TAC"), AHORA)).toHaveLength(1)
    expect(urgenciasVisibles(db, c(e, "C-JE-PAN"), AHORA)).toHaveLength(0) // otra estación
    expect(urgenciasVisibles(db, c(e, "C-MANT"), AHORA)).toHaveLength(0) // no es personal de la estación
    expect(debeSonar(db, c(e, "C-SEG-TAC"), AHORA)).toHaveLength(1)
    expect(debeSonar(db, c(e, "C-JE-TAC"), AHORA)).toHaveLength(1)
    expect(debeSonar(db, c(e, "C-PE-TAC"), AHORA)).toHaveLength(0) // quien la activó ya está enterado
    expect(debeSonar(db, c(e, "C-JE-PAN"), AHORA)).toHaveLength(0)
    expect(debeSonar(db, c(e, "C-MESA"), AHORA)).toHaveLength(0)
    expect(marcarEnterado(db, c(e, "C-SEG-TAC"), id).ok).toBe(true)
    expect(debeSonar(db, c(e, "C-SEG-TAC"), AHORA)).toHaveLength(0)
    expect(marcarEnterado(db, c(e, "C-JE-PAN"), id).ok).toBe(false)
  })

  it("la Mesa de atención solo ve dónde sucedió, sin el tipo ni quién la activó", () => {
    const { e, db } = preparar()
    activarUrgencia(db, e, c(e, "C-SEG-TAC"), vias, AHORA)
    const vista = ubicacionesParaMesa(db, c(e, "C-MESA"), AHORA)
    expect(vista).toEqual([{ id: "UR-0001", station: "Tacubaya", lugar: "Vías", ts: AHORA, estado: "activa" }])
    expect(Object.keys(vista[0])).not.toContain("tipo")
    expect(Object.keys(vista[0])).not.toContain("activadaPor")
    expect(urgenciasVisibles(db, c(e, "C-MESA"), AHORA)).toHaveLength(0)
    expect(ubicacionesParaMesa(db, c(e, "C-SEG-TAC"), AHORA)).toHaveLength(0)
  })

  it("una alerta igual en 5 minutos no se duplica; la cierran jefatura o seguridad", () => {
    const { e, db } = preparar()
    activarUrgencia(db, e, c(e, "C-PE-TAC"), vias, AHORA)
    activarUrgencia(db, e, c(e, "C-SEG-TAC"), vias, AHORA + 60_000)
    expect(urgenciasDe(db)).toHaveLength(1)
    const id = urgenciasDe(db)[0].id
    expect(atenderUrgencia(db, e, c(e, "C-PE-TAC"), id, AHORA).ok).toBe(false)
    expect(atenderUrgencia(db, e, c(e, "C-JE-PAN"), id, AHORA).ok).toBe(false)
    expect(atenderUrgencia(db, e, c(e, "C-SEG-TAC"), id, AHORA + 10 * 60_000).ok).toBe(true)
    expect(debeSonar(db, c(e, "C-JE-TAC"), AHORA + 10 * 60_000)).toHaveLength(0)
    expect(ubicacionesParaMesa(db, c(e, "C-MESA"), AHORA + 10 * 60_000)).toHaveLength(0)
  })

  it("deja de sonar tras su vigencia aunque nadie la cierre", () => {
    const { e, db } = preparar()
    activarUrgencia(db, e, c(e, "C-PE-TAC"), vias, AHORA)
    expect(debeSonar(db, c(e, "C-SEG-TAC"), AHORA + VIGENCIA_URGENCIA + 1)).toHaveLength(0)
  })
})
