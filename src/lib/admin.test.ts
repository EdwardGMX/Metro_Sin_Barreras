/**
 * Pruebas del control de acceso de la consola del personal (RN8, RN9, RNF-06, RNF-24).
 */
import { describe, expect, it } from "vitest"
import { estadoInicial, iniciarSesion, modulosVisibles, permisosDe, puede, sesionValida, DOMINIO, INACTIVIDAD, ORDEN_ROLES, ROLES, ROLES_INCOMPATIBLES, type EstadoConsola } from "./admin"

const AHORA = new Date(2026, 9, 27, 12, 0).getTime()
const nuevo = () => estadoInicial(AHORA)
const c = (e: EstadoConsola, id: string) => e.cuentas.find((x) => x.id === id)!

describe("cuentas de demostración", () => {
  it("solo hay personal del STC de las vistas por perfil, uno o más por rol", () => {
    const e = nuevo()
    expect(e.cuentas.map((x) => x.id)).toEqual(["C-JE-TAC", "C-SEG-TAC", "C-PE-TAC", "C-JE-PAN", "C-MESA", "C-MANT"])
    for (const r of ORDEN_ROLES) expect(e.cuentas.some((x) => x.roles.includes(r))).toBe(true)
    expect(e.cuentas.every((x) => x.correo.endsWith(`@${DOMINIO}`))).toBe(true)
  })
})

describe("mínimo privilegio (RN8)", () => {
  it("solo la Mesa de atención puede ver las fotos de los reportes", () => {
    const conFotos = ORDEN_ROLES.filter((r) => ROLES[r].permisos.includes("evidencias.ver"))
    expect(conFotos).toEqual(["moderacion"])
  })
  it("solo el jefe de estación asigna tareas a su personal", () => {
    expect(ORDEN_ROLES.filter((r) => ROLES[r].permisos.includes("tareas.asignar"))).toEqual(["jefe_estacion"])
  })
  it("el personal de estación y la policía no ven la Moderación ni asignan", () => {
    const e = nuevo()
    for (const id of ["C-SEG-TAC", "C-PE-TAC"]) {
      expect(puede(c(e, id), "moderacion.ver", AHORA)).toBe(false)
      expect(puede(c(e, id), "incidentes.asignar", AHORA)).toBe(false)
      expect(puede(c(e, id), "tareas.asignar", AHORA)).toBe(false)
    }
  })
  it("una cuenta suspendida pierde todos sus permisos y módulos", () => {
    const e = nuevo()
    const karla = c(e, "C-SEG-TAC")
    karla.estado = "suspendida"
    expect(permisosDe(karla, AHORA).size).toBe(0)
    expect(modulosVisibles(karla, AHORA)).toEqual([])
  })
  it("quien repara un equipo no puede confirmar su reparación (RN9)", () => {
    expect(ROLES_INCOMPATIBLES.every(([a]) => a === "mantenimiento")).toBe(true)
    expect(puede(c(nuevo(), "C-MANT"), "rondas.registrar", AHORA)).toBe(false)
  })
})

describe("inicio de sesión del personal (IAP + verificación en dos pasos)", () => {
  it("rechaza cuentas no registradas y lo registra en la bitácora", () => {
    const e = nuevo()
    const r = iniciarSesion(e, "persona.usuaria@gmail.com", true, AHORA)
    expect(r.ok).toBe(false)
    expect(e.auditoria[0]).toMatchObject({ resultado: "denegado", accion: "inicio de sesión" })
  })
  it("rechaza cuentas suspendidas y códigos incorrectos", () => {
    const e = nuevo()
    c(e, "C-PE-TAC").estado = "suspendida"
    expect(iniciarSesion(e, `jorge.aranda@${DOMINIO}`, true, AHORA).ok).toBe(false)
    expect(iniciarSesion(e, `karla.jimenez@${DOMINIO}`, false, AHORA).ok).toBe(false)
    expect(iniciarSesion(e, `karla.jimenez@${DOMINIO}`, true, AHORA).ok).toBe(true)
  })
  it("la sesión vence por inactividad", () => {
    const s = { cuentaId: "C-SEG-TAC", inicio: AHORA, ultimaActividad: AHORA }
    expect(sesionValida(s, AHORA + INACTIVIDAD - 1)).toBe(true)
    expect(sesionValida(s, AHORA + INACTIVIDAD + 1)).toBe(false)
  })
})
