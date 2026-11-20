/**
 * Pruebas de las urgencias graves (RN15): quién las activa, quién las ve y para quién suena la alarma.
 */
import { describe, expect, it } from "vitest"
import { estadoInicial, type Cuenta, type EstadoConsola } from "./admin"
import { baseVacia } from "./reports"
import {
  activarUrgencia,
  atenderUrgencia,
  bloqueoPorMalUso,
  colgarOficial,
  colgarPersonaUsuaria,
  contestarLlamada,
  debeSonar,
  ESCALA_JEFATURA,
  llamarASeguridad,
  marcarEnterado,
  marcarMalUso,
  ubicacionesParaMesa,
  ultimaLlamada,
  urgenciasDe,
  urgenciasVisibles,
  VIGENCIA_URGENCIA,
} from "./urgencias"

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

  describe("Llamada de una persona usuaria a seguridad (RN17)", () => {
    const ana = { seudonimo: "seud-ana", nivel: "Llave Verificada" as const }
    const conAna = () => {
      const p = preparar()
      p.db.usuarios[ana.seudonimo] = { seudonimo: ana.seudonimo, nivel: ana.nivel, verificado: false, alta: AHORA }
      return p
    }

    it("pide sesión y solo llama a estaciones con seguridad en el piloto", () => {
      const { db } = preparar()
      expect(llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "robo" }, AHORA).ok).toBe(false)
      const p = conAna()
      expect(llamarASeguridad(p.db, ana, { station: "Chapultepec", motivo: "robo" }, AHORA).ok).toBe(false)
      expect(llamarASeguridad(p.db, ana, { station: "Tacubaya", motivo: "robo", lugar: "Mi casa" }, AHORA).ok).toBe(false)
      const r = llamarASeguridad(p.db, ana, { station: "Tacubaya", motivo: "acoso", lugar: "Dentro del tren", apoyoMovilidad: true }, AHORA)
      expect(r.ok).toBe(true)
      const u = urgenciasDe(p.db)[0]
      expect(u.origen).toBe("usuaria")
      expect(u.llamada?.estado).toBe("sonando")
      expect(u.llaveVerificada).toBe(true)
      expect(p.db.bitacora[0].evento).toBe("llamada a seguridad")
    })

    it("suena para seguridad de esa estación; a la jefatura, solo si nadie contesta en 30 s", () => {
      const { e, db } = conAna()
      llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "robo" }, AHORA)
      expect(debeSonar(db, c(e, "C-SEG-TAC"), AHORA)).toHaveLength(1)
      expect(debeSonar(db, c(e, "C-PE-TAC"), AHORA)).toHaveLength(0)
      expect(debeSonar(db, c(e, "C-JE-TAC"), AHORA)).toHaveLength(0)
      expect(debeSonar(db, c(e, "C-JE-TAC"), AHORA + ESCALA_JEFATURA)).toHaveLength(1)
      expect(debeSonar(db, c(e, "C-JE-PAN"), AHORA + ESCALA_JEFATURA)).toHaveLength(0)
      expect(urgenciasVisibles(db, c(e, "C-PE-TAC"), AHORA)).toHaveLength(1) // la ve, sin sonido
      expect(ubicacionesParaMesa(db, c(e, "C-MESA"), AHORA)).toHaveLength(1)
    })

    it("contesta el primero; al segundo le dice quién la tomó y deja de sonar para todos", () => {
      const { e, db } = conAna()
      const r = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "medica" }, AHORA)
      const id = r.ok ? r.id : ""
      expect(contestarLlamada(db, e, c(e, "C-PE-TAC"), id, AHORA).ok).toBe(false) // personal de estación no contesta
      expect(contestarLlamada(db, e, c(e, "C-SEG-TAC"), id, AHORA + 5_000).ok).toBe(true)
      const segundo = contestarLlamada(db, e, c(e, "C-JE-TAC"), id, AHORA + ESCALA_JEFATURA)
      expect(segundo.ok).toBe(false)
      if (!segundo.ok) expect(segundo.mensaje).toContain("Karla")
      expect(debeSonar(db, c(e, "C-SEG-TAC"), AHORA + 6_000)).toHaveLength(0)
      expect(debeSonar(db, c(e, "C-JE-TAC"), AHORA + ESCALA_JEFATURA)).toHaveLength(0)
      expect(colgarOficial(db, e, c(e, "C-JE-TAC"), id, AHORA + 60_000).ok).toBe(false) // solo cuelga quien contestó
      expect(colgarOficial(db, e, c(e, "C-SEG-TAC"), id, AHORA + 60_000).ok).toBe(true)
      expect(ultimaLlamada(db, ana.seudonimo)?.llamada?.estado).toBe("terminada")
      expect(e.auditoria.some((a) => a.accion === "contestar llamada")).toBe(true)
    })

    it("la persona puede cancelar mientras suena; una sola llamada abierta y sin límite de llamadas", () => {
      const { db } = conAna()
      const a = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "auxilio" }, AHORA)
      const b = llamarASeguridad(db, ana, { station: "Pantitlán", motivo: "robo" }, AHORA + 1000)
      expect(a.ok && b.ok && a.id === b.id).toBe(true)
      expect(colgarPersonaUsuaria(db, ana.seudonimo, a.ok ? a.id : "", AHORA + 2000).ok).toBe(true)
      expect(urgenciasDe(db)[0].estado).toBe("cancelada")
      for (let i = 0; i < 2; i++) {
        const r = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "auxilio" }, AHORA + 10_000 * (i + 1))
        colgarPersonaUsuaria(db, ana.seudonimo, r.ok ? r.id : "", AHORA + 10_000 * (i + 1) + 1)
      }
      for (let i = 0; i < 5; i++) {
        const r = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "auxilio" }, AHORA + 60_000 + i * 1000)
        expect(r.ok).toBe(true)
        colgarPersonaUsuaria(db, ana.seudonimo, r.ok ? r.id : "", AHORA + 60_000 + i * 1000 + 1)
      }
    })

    it("dos marcas de mal uso en 90 días bloquean el botón 30 días", () => {
      const { e, db } = conAna()
      const r1 = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "auxilio" }, AHORA)
      expect(marcarMalUso(db, e, c(e, "C-PE-TAC"), r1.ok ? r1.id : "", AHORA).ok).toBe(false)
      expect(marcarMalUso(db, e, c(e, "C-SEG-TAC"), r1.ok ? r1.id : "", AHORA + 60_000).ok).toBe(true)
      expect(bloqueoPorMalUso(db, ana.seudonimo, AHORA + 60_000)).toBeNull()
      const r2 = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "auxilio" }, AHORA + 2 * 86_400_000)
      expect(marcarMalUso(db, e, c(e, "C-JE-TAC"), r2.ok ? r2.id : "", AHORA + 2 * 86_400_000).ok).toBe(true)
      const ahora = AHORA + 2 * 86_400_000 + 1
      expect(bloqueoPorMalUso(db, ana.seudonimo, ahora)).not.toBeNull()
      const bloqueada = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "robo" }, ahora)
      expect(bloqueada.ok).toBe(false)
      if (!bloqueada.ok) expect(bloqueada.codigo).toBe(403)
      expect(bloqueoPorMalUso(db, ana.seudonimo, ahora + 31 * 86_400_000)).toBeNull()
    })

    it("cerrar como atendida termina la llamada", () => {
      const { e, db } = conAna()
      const r = llamarASeguridad(db, ana, { station: "Tacubaya", motivo: "robo" }, AHORA)
      contestarLlamada(db, e, c(e, "C-SEG-TAC"), r.ok ? r.id : "", AHORA + 1000)
      expect(atenderUrgencia(db, e, c(e, "C-SEG-TAC"), r.ok ? r.id : "", AHORA + 120_000).ok).toBe(true)
      const u = ultimaLlamada(db, ana.seudonimo)!
      expect(u.resultado).toBe("atendida")
      expect(u.llamada?.estado).toBe("terminada")
    })
  })
})
