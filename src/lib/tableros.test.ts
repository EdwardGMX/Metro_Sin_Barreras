/**
 * Pruebas de los tableros por rol (HU-30 ampliada): cada rol tiene indicadores
 * propios con meta y semáforo, y reaccionan a las acciones de la consola.
 */
import { describe, expect, it } from "vitest"
import { estadoInicial, ORDEN_ROLES, type Cuenta, type EstadoConsola, type RolId } from "./admin"
import { sembrarOperacion } from "./operacion"
import { baseVacia, sembrarDemo } from "./reports"
import { tableroDe, PREGUNTAS, type Indicador } from "./tableros"

const AHORA = new Date(2026, 9, 28, 9, 0).getTime()
const base = () => {
  const estado = estadoInicial(AHORA)
  const db = sembrarOperacion(sembrarDemo(baseVacia(), AHORA), AHORA)
  return { estado, db }
}
const cuentaDe = (e: EstadoConsola, id: string) => e.cuentas.find((c) => c.id === id) as Cuenta
const CUENTA_POR_ROL: Record<RolId, string> = {
  jefe_estacion: "C-JE-TAC",
  personal_estacion: "C-PE-TAC",
  personal_seguridad: "C-SEG-TAC",
  moderacion: "C-MESA",
  mantenimiento: "C-MANT",
}
const tablero = (rol: RolId, e: EstadoConsola, db = sembrarOperacion(sembrarDemo(baseVacia(), AHORA), AHORA), ahora = AHORA) => tableroDe(rol, { estado: e, db, ahora, cuenta: cuentaDe(e, CUENTA_POR_ROL[rol]) })
const kpi = (ks: Indicador[], id: string) => ks.find((k) => k.id === id) as Indicador

describe("Cada rol tiene su propio tablero", () => {
  it("los cinco roles responden una pregunta distinta con al menos cinco indicadores", () => {
    const { estado } = base()
    const preguntas = new Set<string>()
    for (const r of ORDEN_ROLES) {
      const t = tablero(r, estado)
      preguntas.add(t.pregunta)
      expect(t.pregunta).toBe(PREGUNTAS[r])
      expect(t.indicadores.length).toBeGreaterThanOrEqual(5)
      expect(t.graficas.length).toBeGreaterThanOrEqual(1)
      for (const k of t.indicadores) {
        expect(k.meta.length).toBeGreaterThan(0)
        expect(["ok", "warn", "bad", "neutral"]).toContain(k.tono)
      }
      expect(new Set(t.indicadores.map((k) => k.id)).size).toBe(t.indicadores.length)
    }
    expect(preguntas.size).toBe(ORDEN_ROLES.length)
  })

  it("ningún par de roles comparte el mismo conjunto de indicadores", () => {
    const { estado } = base()
    const firmas = ORDEN_ROLES.map((r) => tablero(r, estado).indicadores.map((k) => k.etiqueta).sort().join("|"))
    expect(new Set(firmas).size).toBe(ORDEN_ROLES.length)
  })

})

describe("Los indicadores reaccionan a la operación", () => {
  it("Moderación: la cola del tablero coincide con los reportes pendientes", () => {
    const { estado, db } = base()
    const pendientes = db.reportes.filter((r) => r.moderacion === "pendiente").length
    const t = tablero("moderacion", estado, db)
    expect(kpi(t.indicadores, "cola").valor).toBe(String(pendientes))
    const g = t.graficas.find((x) => x.id === "cola")
    expect(g && g.tipo === "barras" ? g.barras.length : -1).toBe(pendientes)
  })
})
