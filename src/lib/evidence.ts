/**
 * Evidencias fotográficas (RF-21, RN6, RNF-20).
 * - Solo JPEG o WebP, verificados por su firma de bytes (no por la extensión).
 * - Se reducen a 1280 px por el lado mayor y a 1 MB como máximo.
 * - Al volver a codificar la imagen en un canvas se eliminan los metadatos EXIF (incluido el GPS).
 * - En el prototipo se guardan en IndexedDB y se borran a los 90 días.
 */
export const MAX_FOTOS = 2
export const MAX_BYTES = 1024 * 1024
export const MAX_LADO = 1280

export type FotoProcesada = {
  blob: Blob
  formato: string
  bytes: number
  ancho: number
  alto: number
  sha256: string
  url: string
}

export class ErrorEvidencia extends Error {
  constructor(public codigo: 413 | 415, mensaje: string) {
    super(mensaje)
  }
}

/** Detecta el formato real por los primeros bytes. */
export function formatoReal(bytes: Uint8Array): "jpeg" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b))
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp"
  return null
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad))
}

/** Comprime en el dispositivo y valida como lo haría el servidor. */
export async function procesarFoto(archivo: File): Promise<FotoProcesada> {
  const cabecera = new Uint8Array(await archivo.slice(0, 16).arrayBuffer())
  if (!formatoReal(cabecera)) {
    throw new ErrorEvidencia(415, "Formato no permitido: solo se aceptan fotos JPEG o WebP.")
  }
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height))
  const ancho = Math.round(bitmap.width * escala)
  const alto = Math.round(bitmap.height * escala)
  const canvas = document.createElement("canvas")
  canvas.width = ancho
  canvas.height = alto
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  let blob: Blob | null = null
  for (const calidad of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    blob = await aBlob(canvas, "image/webp", calidad)
    // Algunos navegadores no codifican WebP: se usa JPEG, que también se acepta.
    if (blob && blob.type !== "image/webp") blob = await aBlob(canvas, "image/jpeg", calidad)
    if (blob && blob.size <= MAX_BYTES) break
  }
  if (!blob || blob.size > MAX_BYTES) {
    throw new ErrorEvidencia(413, "La foto sigue pesando más de 1 MB después de comprimirla. Intenta con otra.")
  }
  return {
    blob,
    formato: blob.type === "image/webp" ? "WebP" : "JPEG",
    bytes: blob.size,
    ancho,
    alto,
    sha256: await sha256(blob),
    url: URL.createObjectURL(blob),
  }
}

// ---------- IndexedDB: depósito privado simulado ----------
const DB = "msb-evidencias"
const STORE = "fotos"

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function guardarFoto(id: string, blob: Blob): Promise<void> {
  try {
    const db = await abrir()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(blob, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* sin IndexedDB: la foto solo vive en esta sesión */
  }
}

export async function leerFoto(id: string): Promise<Blob | null> {
  try {
    const db = await abrir()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as Blob) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function borrarFotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    const db = await abrir()
    const tx = db.transaction(STORE, "readwrite")
    ids.forEach((id) => tx.objectStore(STORE).delete(id))
  } catch {
    /* sin efecto */
  }
}
