/**
 * Perfiles de movilidad y restricciones de ruta codificadas (RF-22, RN7).
 * El perfil se queda en el dispositivo; a la API solo viajan las restricciones (RN3).
 */
import type { Medio } from "../data/accessibility"

export type PerfilId =
  | "silla_ruedas"
  | "baston_andadera"
  | "adulta_mayor"
  | "visual"
  | "perro_guia"
  | "auditiva"
  | "temporal_equipaje"

export type Peso = "ninguno" | "medio" | "alto"

/** Lo único que se envía a la API de ruteo. */
export type Restricciones = {
  desniveles_admitidos: Medio[]
  desniveles_penalizados: Medio[]
  peso_transbordos: Peso
  peso_saturacion: Peso
}

export type Perfil = {
  id: PerfilId
  nombre: string
  descripcion: string
  restricciones: Restricciones
  presentacion: string
}

const TODOS: Medio[] = ["elevador", "salvaescaleras", "escalera_electrica", "escalera_fija", "nivel"]

export const PERFILES: Perfil[] = [
  {
    id: "silla_ruedas",
    nombre: "Uso silla de ruedas",
    descripcion: "Solo elevador, salvaescaleras, rampa o acceso a nivel.",
    restricciones: {
      desniveles_admitidos: ["elevador", "salvaescaleras", "nivel"],
      desniveles_penalizados: [],
      peso_transbordos: "alto",
      peso_saturacion: "alto",
    },
    presentacion: "Etiqueta de la ruta y lista de equipos requeridos.",
  },
  {
    id: "baston_andadera",
    nombre: "Uso bastón, muletas o andadera",
    descripcion: "También puedo usar escaleras eléctricas; evito escaleras fijas.",
    restricciones: {
      desniveles_admitidos: ["elevador", "salvaescaleras", "escalera_electrica", "nivel"],
      desniveles_penalizados: [],
      peso_transbordos: "alto",
      peso_saturacion: "alto",
    },
    presentacion: "Etiqueta de la ruta y lista de equipos requeridos.",
  },
  {
    id: "adulta_mayor",
    nombre: "Soy persona adulta mayor",
    descripcion: "Prefiero evitar escaleras fijas y aglomeraciones.",
    restricciones: {
      desniveles_admitidos: TODOS,
      desniveles_penalizados: ["escalera_fija"],
      peso_transbordos: "medio",
      peso_saturacion: "alto",
    },
    presentacion: "Sugerencia de la hora con menos saturación.",
  },
  {
    id: "visual",
    nombre: "Tengo ceguera o baja visión",
    descripcion: "Indicaciones en texto paso a paso y menos transbordos.",
    restricciones: {
      desniveles_admitidos: TODOS,
      desniveles_penalizados: [],
      peso_transbordos: "alto",
      peso_saturacion: "medio",
    },
    presentacion: "Ruta en texto paso a paso para lector de pantalla.",
  },
  {
    id: "perro_guia",
    nombre: "Viajo con perro guía",
    descripcion: "Prefiero elevador o escaleras fijas; evito escaleras eléctricas si hay alternativa.",
    restricciones: {
      desniveles_admitidos: TODOS,
      desniveles_penalizados: ["escalera_electrica"],
      peso_transbordos: "alto",
      peso_saturacion: "alto",
    },
    presentacion: "Ruta en texto paso a paso para lector de pantalla.",
  },
  {
    id: "auditiva",
    nombre: "Tengo sordera o hipoacusia",
    descripcion: "Todos los avisos se muestran en texto, sin depender del audio.",
    restricciones: {
      desniveles_admitidos: TODOS,
      desniveles_penalizados: [],
      peso_transbordos: "ninguno",
      peso_saturacion: "ninguno",
    },
    presentacion: "Avisos solo visuales y textuales.",
  },
  {
    id: "temporal_equipaje",
    nombre: "Viajo con carriola, equipaje, embarazo o una lesión temporal",
    descripcion: "Prefiero elevador o escalera eléctrica.",
    restricciones: {
      desniveles_admitidos: TODOS,
      desniveles_penalizados: ["escalera_fija"],
      peso_transbordos: "medio",
      peso_saturacion: "alto",
    },
    presentacion: "Sugerencia de la hora con menos saturación.",
  },
]

const ORDEN_PESO: Peso[] = ["ninguno", "medio", "alto"]
const maxPeso = (a: Peso, b: Peso): Peso => (ORDEN_PESO.indexOf(a) >= ORDEN_PESO.indexOf(b) ? a : b)

/** Combina perfiles aplicando la restricción más estricta de cada tipo (RN7). */
export function combinarRestricciones(ids: PerfilId[]): Restricciones {
  const elegidos = PERFILES.filter((p) => ids.includes(p.id))
  if (elegidos.length === 0) {
    return { desniveles_admitidos: TODOS, desniveles_penalizados: [], peso_transbordos: "ninguno", peso_saturacion: "medio" }
  }
  return elegidos.reduce<Restricciones>(
    (acc, p) => ({
      desniveles_admitidos: acc.desniveles_admitidos.filter((m) => p.restricciones.desniveles_admitidos.includes(m)),
      desniveles_penalizados: Array.from(new Set([...acc.desniveles_penalizados, ...p.restricciones.desniveles_penalizados])),
      peso_transbordos: maxPeso(acc.peso_transbordos, p.restricciones.peso_transbordos),
      peso_saturacion: maxPeso(acc.peso_saturacion, p.restricciones.peso_saturacion),
    }),
    { desniveles_admitidos: TODOS, desniveles_penalizados: [], peso_transbordos: "ninguno", peso_saturacion: "ninguno" },
  )
}

/** Peso “alto” duplica el costo base de la arista y “medio” lo aumenta 50 % (propuesta del documento). */
export function factorPeso(p: Peso): number {
  return p === "alto" ? 1 : p === "medio" ? 0.5 : 0
}
