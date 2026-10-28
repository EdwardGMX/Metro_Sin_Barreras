/**
 * Pruebas de los tableros por rol (HU-30 ampliada): cada rol tiene indicadores
 * propios con meta y semáforo, y reaccionan a las acciones de la consola.
 */
import { describe, expect, it } from "vitest"
import { decidirContenido, estadoInicial, recertificar, reintentarEjecucion, ORDEN_ROLES, type Cuenta, type EstadoConsola, type RolId } from "./admin"
import { baseVacia, sembrarDemo } from "./reports"
import { matrizEjecuciones, muestraRutas, operacionDemo, tableroDe, PREGUNTAS, type Indicador } from "./tableros"

const AHORA = new Date(2026, 9, 28, 9, 0).getTime()
const base = () => {
  const estado = estadoInicial(AHORA)
  const db = sembrarDemo(baseVacia(), AHORA)
  return { estado, db }
}
const cuentaDe = (e: EstadoConsola, id: string) => e.cuentas.find((c) => c.id === id) as Cuenta
const CUENTA_POR_ROL: Record<RolId, string> = {
  plataforma: "C-PEDRO",
  datos: "C-SAID",
  modelos: "C-SAID",
  moderacion: "C-BRISA",
  gobernanza: "C-EDWARD",
  contenidos: "C-MANUEL",
  supervision: "C-DIANA",
}
const tablero = (rol: RolId, e: EstadoConsola, db = sembrarDemo(baseVacia(), AHORA), ahora = AHORA) => tableroDe(rol, { estado: e, db, ahora, cuenta: cuentaDe(e, CUENTA_POR_ROL[rol]) })
const kpi = (ks: Indicador[], id: string) => ks.find((k) => k.id === id) as Indicador

describe("Cada rol tiene su propio tablero", () => {
  it("los siete roles responden una pregunta distinta con al menos cinco indicadores", () => {
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

  it("las series de demostración no cambian durante el día", () => {
    expect(operacionDemo(AHORA)).toEqual(operacionDemo(AHORA + 3 * 3600_000))
  })
})

describe("Los indicadores reaccionan a la operación", () => {
  it("Ingeniería de datos: la falla de ADIP aparece y desaparece al reintentar", () => {
    const { estado } = base()
    expect(kpi(tablero("datos", estado).indicadores, "sin-recuperar").valor).toBe("1")
    const id = estado.ejecuciones.find((x) => x.resultado === "falla")!.id
    expect(reintentarEjecucion(estado, cuentaDe(estado, "C-SAID"), id, AHORA).ok).toBe(true)
    const t = tablero("datos", estado)
    expect(kpi(t.indicadores, "sin-recuperar").valor).toBe("0")
    expect(t.acciones.some((a) => a.texto.includes("ADIP"))).toBe(false)
  })

  it("Ingeniería de datos: la matriz marca el perfil horario como omitido cuando la ingesta falló", () => {
    const { estado } = base()
    const m = matrizEjecuciones(estado, AHORA)
    expect(m.filas).toHaveLength(3)
    expect(m.filas.every((f) => f.celdas.length === 30)).toBe(true)
    const dia1 = m.dias.findIndex((d) => d.getDate() === 1)
    expect(m.filas[1].celdas[dia1].estado).toBe("falla")
    expect(m.filas[2].celdas[dia1].estado).toBe("omitida")
  })

  it("Gobernanza: la recertificación sube el avance del mes", () => {
    const { estado } = base()
    const antes = kpi(tablero("gobernanza", estado).indicadores, "recertificacion").valor
    recertificar(estado, cuentaDe(estado, "C-EDWARD"), "C-PEDRO", "mantener", "", AHORA)
    const despues = kpi(tablero("gobernanza", estado).indicadores, "recertificacion").valor
    expect(antes.startsWith("0 de")).toBe(true)
    expect(despues.startsWith("1 de")).toBe(true)
  })

  it("Gobernanza: la solicitud ARCO más urgente se señala con sus días hábiles restantes", () => {
    const { estado } = base()
    const t = tablero("gobernanza", estado)
    expect(kpi(t.indicadores, "arco").nota).toContain("ARCO-0006")
    expect(t.acciones[0].texto).toContain("ARCO-0006")
    expect(t.acciones[0].prioridad).toBe("alta")
  })

  it("Contenidos: al aprobar la propuesta, la fuente pasa a oficial y se reinicia la vigencia", () => {
    const { estado } = base()
    expect(kpi(tablero("contenidos", estado).indicadores, "fuente").valor).toBe("Ejemplo")
    expect(decidirContenido(estado, cuentaDe(estado, "C-EDWARD"), "aprobar", "", AHORA).ok).toBe(true)
    const t = tablero("contenidos", estado)
    expect(kpi(t.indicadores, "fuente").valor).toBe("Oficial")
    expect(kpi(t.indicadores, "vigencia").valor).toBe("0")
    expect(kpi(t.indicadores, "terminos").valor).toBe("0")
  })

  it("Moderación: la cola del tablero coincide con los reportes pendientes", () => {
    const { estado, db } = base()
    const pendientes = db.reportes.filter((r) => r.moderacion === "pendiente").length
    const t = tablero("moderacion", estado, db)
    expect(kpi(t.indicadores, "cola").valor).toBe(String(pendientes))
    const g = t.graficas.find((x) => x.id === "cola")
    expect(g && g.tipo === "barras" ? g.barras.length : -1).toBe(pendientes)
  })

  it("Ciencia de datos: la brecha entre líneas es la diferencia entre la mejor y la peor", () => {
    const { estado } = base()
    const vigente = estado.modelos.find((m) => m.estado === "vigente")!
    const v = Object.values(vigente.f1PorLinea)
    expect(kpi(tablero("modelos", estado).indicadores, "brecha").valor).toBe((Math.max(...v) - Math.min(...v)).toFixed(2))
  })

  it("Supervisión: el resultado de la muestra suma el total de trayectos", () => {
    const { estado, db } = base()
    const muestra = muestraRutas(db, AHORA)
    const t = tableroDe("supervision", { estado, db, ahora: AHORA, cuenta: cuentaDe(estado, "C-DIANA") }, muestra)
    const g = t.graficas.find((x) => x.tipo === "partes")
    expect(g && g.tipo === "partes" ? g.partes.reduce((a, p) => a + p.valor, 0) : -1).toBe(muestra.total)
    expect(t.acciones.every((a) => a.modulo === undefined)).toBe(true)
  })

  it("Plataforma: una revocación pendiente se vuelve acción de prioridad alta", () => {
    const { estado } = base()
    recertificar(estado, cuentaDe(estado, "C-EDWARD"), "C-MANUEL", "revocar", "Ya no participa", AHORA)
    const t = tablero("plataforma", estado)
    expect(kpi(t.indicadores, "revocaciones").valor).toBe("1")
    expect(t.acciones[0]).toMatchObject({ prioridad: "alta", modulo: "cuentas" })
  })
})
