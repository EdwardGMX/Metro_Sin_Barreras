/**
 * Pruebas de las reglas de negocio (sección 7.1 del documento).
 * Se ejecutan con `npm test` y en GitHub Actions antes de publicar.
 */
import { describe, expect, it } from "vitest"
import { accesibilidad, equiposDeEstacion } from "../data/accessibility"
import { PERFIL_HORARIO, saturacion } from "../data/saturation"
import { combinarRestricciones } from "./profiles"
import { baseVacia, estadoComunitario, estadoEquipo, registrarReporte, seudonimo } from "./reports"
import { calcularRuta, type ConsultaEstado, type ConsultaRuta } from "./router"
import { formatoReal } from "./evidence"

const LUNES = new Date(2026, 9, 19, 12, 0)
const todoDisponible: ConsultaEstado = () => ({ estado: "disponible", fuente: "prueba" })

function consulta(parcial: Partial<ConsultaRuta>): ConsultaRuta {
  return {
    origen: "Universidad",
    destino: "Hidalgo",
    restricciones: combinarRestricciones(["silla_ruedas"]),
    fecha: LUNES,
    hora: 10 * 60,
    tipoHora: "salir_a",
    ...parcial,
  }
}

describe("perfil horario (RF-17, RNF-22)", () => {
  it("las fracciones de cada tipo de día suman 1", () => {
    for (const perfil of Object.values(PERFIL_HORARIO)) {
      expect(Math.abs(perfil.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(0.001)
    }
  })
  it("la hora pico de la mañana satura más que la madrugada", () => {
    const pico = saturacion("Pantitlán", LUNES, 7 * 60 + 40).afluenciaFranja
    const temprano = saturacion("Pantitlán", LUNES, 5 * 60 + 10).afluenciaFranja
    expect(pico).toBeGreaterThan(temprano)
  })
})

describe("ruteo por perfil (RN1, RN7)", () => {
  it("la ruta de silla de ruedas nunca usa escaleras", () => {
    const r = calcularRuta(consulta({}), todoDisponible)
    expect(["accesible", "accesible_con_apoyo"]).toContain(r.estado)
    expect(r.pasos.some((p) => /escalera/.test(p.texto))).toBe(false)
  })
  it("si el elevador está fuera de servicio, la silla de ruedas no usa ese acceso", () => {
    const elevadores = equiposDeEstacion("Universidad").filter((e) => e.tipo === "Elevador").map((e) => e.id)
    const estado: ConsultaEstado = (id) => (elevadores.includes(id) ? { estado: "fuera_servicio", fuente: "prueba" } : { estado: "disponible", fuente: "prueba" })
    const r = calcularRuta(consulta({}), estado)
    expect(r.estado).toBe("sin_ruta")
  })
  it("con andadera se puede usar la escalera eléctrica cuando el elevador falla", () => {
    const elevadores = equiposDeEstacion("Universidad").filter((e) => e.tipo === "Elevador").map((e) => e.id)
    const estado: ConsultaEstado = (id) => (elevadores.includes(id) ? { estado: "fuera_servicio", fuente: "prueba" } : { estado: "disponible", fuente: "prueba" })
    const r = calcularRuta(consulta({ restricciones: combinarRestricciones(["baston_andadera"]) }), estado)
    expect(r.estado).toBe("accesible")
    expect(r.pasos[0].texto).toMatch(/escalera eléctrica/)
  })
  it("con perro guía se prefiere el elevador sobre la escalera eléctrica", () => {
    expect(accesibilidad("Universidad").acceso.medios).toContain("escalera_electrica")
    const r = calcularRuta(consulta({ restricciones: combinarRestricciones(["perro_guia"]) }), todoDisponible)
    expect(r.pasos[0].texto).not.toMatch(/escalera eléctrica/)
  })
  it("combinar perfiles aplica la restricción más estricta", () => {
    const r = combinarRestricciones(["baston_andadera", "silla_ruedas"])
    expect(r.desniveles_admitidos).not.toContain("escalera_electrica")
  })
})

describe("estado incierto y horario (RN2, RN4)", () => {
  it("un equipo incierto produce «Accesible con apoyo»", () => {
    const estado: ConsultaEstado = () => ({ estado: "incierto", fuente: "prueba" })
    expect(calcularRuta(consulta({}), estado).estado).toBe("accesible_con_apoyo")
  })
  it("rechaza horas fuera de servicio", () => {
    expect(calcularRuta(consulta({ hora: 3 * 60 }), todoDisponible).estado).toBe("fuera_de_horario")
  })
  it("«Llegar a las» llega a más tardar a la hora pedida", () => {
    const r = calcularRuta(consulta({ tipoHora: "llegar_a", hora: 9 * 60 }), todoDisponible)
    expect(r.llegada).toBeLessThanOrEqual(9 * 60 + 0.01)
  })
})

describe("reportes y validación comunitaria (RN3, RN5)", () => {
  const eq = equiposDeEstacion("Pantitlán")[0]
  const ahora = LUNES.getTime()

  it("el seudónimo no contiene el identificador original", async () => {
    const s = await seudonimo("CURP-FALSA-123")
    expect(s).toHaveLength(64)
    expect(s).not.toContain("CURP")
  })
  it("rechaza reportes sin sesión (401)", () => {
    const r = registrarReporte(baseVacia(), null, { station: eq.station, equipmentId: eq.id, estado: "no_funciona", hashesFotos: [] }, ahora)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe(401)
  })
  it("una sola persona no cambia el estado a fuera de servicio", () => {
    const db = baseVacia()
    const sesion = { seudonimo: "p1", expira: ahora + 3600_000 }
    registrarReporte(db, sesion, { station: eq.station, equipmentId: eq.id, estado: "no_funciona", hashesFotos: [] }, ahora)
    const dup = registrarReporte(db, sesion, { station: eq.station, equipmentId: eq.id, estado: "no_funciona", hashesFotos: [] }, ahora + 60_000)
    expect(dup.ok).toBe(false)
    expect(estadoComunitario(db, eq.id, ahora + 120_000).estado).toBe("incierto")
    expect(estadoEquipo(db, eq.id, ahora + 120_000).estado).toBe("incierto")
  })
  it("tres personas distintas en 6 horas confirman la falla", () => {
    const db = baseVacia()
    ;["p1", "p2", "p3"].forEach((s, i) =>
      registrarReporte(db, { seudonimo: s, expira: ahora + 9e6 }, { station: eq.station, equipmentId: eq.id, estado: "no_funciona", hashesFotos: [] }, ahora + i * 600_000),
    )
    expect(estadoEquipo(db, eq.id, ahora + 2_000_000).estado).toBe("fuera_servicio")
  })
  it("aplica el límite de 5 reportes por día", () => {
    const db = baseVacia()
    const sesion = { seudonimo: "p1", expira: ahora + 9e7 }
    const equipos = equiposDeEstacion("Pantitlán").concat(equiposDeEstacion("Tacubaya"))
    const resultados = equipos.slice(0, 6).map((e, i) =>
      registrarReporte(db, sesion, { station: e.station, equipmentId: e.id, estado: "no_funciona", hashesFotos: [] }, ahora + i * 1000),
    )
    expect(resultados.filter((r) => r.ok)).toHaveLength(5)
  })
})

describe("evidencias (RN6)", () => {
  it("reconoce JPEG y WebP por su firma y rechaza PNG", () => {
    expect(formatoReal(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg")
    const webp = new TextEncoder().encode("RIFF0000WEBPVP8 ")
    expect(formatoReal(webp)).toBe("webp")
    expect(formatoReal(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
  })
})
