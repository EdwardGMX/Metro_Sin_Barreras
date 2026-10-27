/**
 * Pruebas del control de acceso de la consola del personal (RN8, RN9, RNF-06, RNF-24).
 */
import { describe, expect, it } from "vitest"
import {
  altaCuenta,
  cambiarRoles,
  decidirContenido,
  estadoInicial,
  evaluarPublicacion,
  iniciarSesion,
  modulosVisibles,
  permisosDe,
  proponerContenido,
  publicarModelo,
  puede,
  recertificar,
  responderArco,
  revisarTerminologia,
  sesionValida,
  sugerirEstacion,
  DOMINIO,
  INACTIVIDAD,
  ORDEN_ROLES,
  ROLES,
  type EstadoConsola,
} from "./admin"

const AHORA = new Date(2026, 9, 27, 12, 0).getTime()
const nuevo = () => estadoInicial(AHORA)
const c = (e: EstadoConsola, id: string) => e.cuentas.find((x) => x.id === id)!

describe("mínimo privilegio (RN8)", () => {
  it("solo Moderación puede ver las fotos de los reportes", () => {
    const conFotos = ORDEN_ROLES.filter((r) => ROLES[r].permisos.includes("evidencias.ver"))
    expect(conFotos).toEqual(["moderacion"])
  })
  it("Administración de la plataforma no ve la bitácora, reportes ni fotos", () => {
    const e = nuevo()
    const pedro = c(e, "C-PEDRO")
    expect(puede(pedro, "bitacora.ver", AHORA)).toBe(false)
    expect(puede(pedro, "moderacion.ver", AHORA)).toBe(false)
    expect(puede(pedro, "evidencias.ver", AHORA)).toBe(false)
  })
  it("Supervisión solo ve indicadores", () => {
    const e = nuevo()
    expect([...permisosDe(c(e, "C-DIANA"), AHORA)]).toEqual(["indicadores.ver"])
    expect(modulosVisibles(c(e, "C-DIANA"), AHORA).map((m) => m.id)).toEqual(["inicio", "indicadores"])
  })
  it("una cuenta externa consulta y propone, pero no ejecuta acciones finales", () => {
    const e = nuevo()
    const ext = c(e, "C-EXT-PD")
    expect(puede(ext, "privacidad.ver", AHORA)).toBe(true)
    expect(puede(ext, "privacidad.arco", AHORA)).toBe(false)
    expect(puede(ext, "contenidos.aprobar", AHORA)).toBe(false)
    const r = responderArco(e, ext, "ARCO-0007", "procedente", AHORA)
    expect(r.ok).toBe(false)
    expect(e.auditoria[0].resultado).toBe("denegado")
  })
  it("una cuenta externa vencida pierde todos sus permisos", () => {
    const e = nuevo()
    const despues = new Date(2026, 11, 7, 9, 0).getTime()
    const ext = c(e, "C-EXT-AC")
    ext.ultimoAcceso = despues - 1000
    expect(permisosDe(ext, despues).size).toBe(0)
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
    expect(iniciarSesion(e, `cuenta.suspendida@${DOMINIO}`, true, AHORA).ok).toBe(false)
    expect(iniciarSesion(e, `said.carino@${DOMINIO}`, false, AHORA).ok).toBe(false)
    expect(iniciarSesion(e, `said.carino@${DOMINIO}`, true, AHORA).ok).toBe(true)
  })
  it("la sesión vence por inactividad", () => {
    const s = { cuentaId: "C-SAID", inicio: AHORA, ultimaActividad: AHORA }
    expect(sesionValida(s, AHORA + INACTIVIDAD - 1)).toBe(true)
    expect(sesionValida(s, AHORA + INACTIVIDAD + 1)).toBe(false)
  })
})

describe("separación de funciones (RN9)", () => {
  it("no permite combinar roles incompatibles", () => {
    const e = nuevo()
    const r = altaCuenta(e, c(e, "C-PEDRO"), { nombre: "Prueba", correo: `prueba@${DOMINIO}`, puesto: "x", roles: ["plataforma", "gobernanza"], tipo: "interno" }, AHORA)
    expect(r.ok).toBe(false)
  })
  it("nadie modifica sus propios roles", () => {
    const e = nuevo()
    const r = cambiarRoles(e, c(e, "C-PEDRO"), "C-PEDRO", ["plataforma", "supervision"], AHORA)
    expect(r.ok).toBe(false)
  })
  it("solo Administración da de alta cuentas, y las externas requieren vencimiento", () => {
    const e = nuevo()
    const datos = { nombre: "Persona externa", correo: `externa@${DOMINIO}`, puesto: "x", roles: ["contenidos" as const], tipo: "externo" as const }
    expect(altaCuenta(e, c(e, "C-EDWARD"), datos, AHORA).ok).toBe(false)
    expect(altaCuenta(e, c(e, "C-PEDRO"), datos, AHORA).ok).toBe(false)
    expect(altaCuenta(e, c(e, "C-PEDRO"), { ...datos, vence: "2026-12-06" }, AHORA).ok).toBe(true)
  })
  it("quien propone un contenido no puede aprobarlo; Gobernanza sí", () => {
    const e = nuevo()
    expect(decidirContenido(e, c(e, "C-MANUEL"), "aprobar", "", AHORA).ok).toBe(false)
    const r = decidirContenido(e, c(e, "C-EDWARD"), "aprobar", "", AHORA)
    expect(r.ok).toBe(true)
    expect(e.contenido.publicado.ejemplo).toBe(false)
    expect(e.contenido.publicado.version).toBe(2)
  })
  it("Gobernanza solo solicita revocaciones; no suspende cuentas", () => {
    const e = nuevo()
    const r = recertificar(e, c(e, "C-EDWARD"), "C-STC", "revocar", "Cambio de enlace", AHORA)
    expect(r.ok).toBe(true)
    expect(c(e, "C-STC").estado).toBe("activa")
    expect(e.revocaciones[0].estado).toBe("pendiente")
  })
})

describe("publicación controlada del modelo (HU-09, HU-26)", () => {
  it("publica solo si supera umbral, referencia y vigente sin bajar el recall de la clase alta", () => {
    const e = nuevo()
    const vigente = e.modelos.find((m) => m.estado === "vigente")!
    expect(evaluarPublicacion(e.modelos[0], vigente).ok).toBe(true)
    expect(evaluarPublicacion(e.modelos[1], vigente).ok).toBe(false)
    expect(publicarModelo(e, c(e, "C-SAID"), "sat-2026.11-gb-sin-rezagos", AHORA).ok).toBe(false)
    expect(publicarModelo(e, c(e, "C-SAID"), "sat-2026.11-gb", AHORA).ok).toBe(true)
  })
  it("Ingeniería de datos ve los modelos pero no los publica", () => {
    const e = { ...nuevo() }
    const soloDatos = { ...c(e, "C-SAID"), roles: ["datos" as const] }
    expect(puede(soloDatos, "modelos.ver", AHORA)).toBe(true)
    expect(publicarModelo(e, soloDatos, "sat-2026.11-gb", AHORA).ok).toBe(false)
  })
})

describe("contenidos y homologación", () => {
  it("detecta términos a evitar (RNF-23)", () => {
    expect(revisarTerminologia(["Apoyo para personas invidentes"])).toEqual(["invidente"])
    const e = nuevo()
    expect(proponerContenido(e, c(e, "C-MANUEL"), ["Paso uno", "El usuario discapacitado debe…"], "STC", AHORA).ok).toBe(false)
  })
  it("sugiere la estación del catálogo para nombres abreviados", () => {
    expect(sugerirEstacion("S. ANDRES TOMATLAN").station).toBe("San Andrés Tomatlán")
    expect(sugerirEstacion("HOSPITAL 20 DE NOV").station).toBe("Hospital 20 de Noviembre")
    expect(sugerirEstacion("OCEANIA").station).toBe("Oceanía")
  })
})
