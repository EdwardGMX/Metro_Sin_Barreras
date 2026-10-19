/** Lectura y escritura segura en el almacenamiento local del navegador. */
export function leer<T>(clave: string, porDefecto: T): T {
  try {
    const raw = window.localStorage.getItem(clave)
    return raw ? (JSON.parse(raw) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

export function guardar<T>(clave: string, valor: T): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* almacenamiento no disponible: la app sigue funcionando en memoria */
  }
}

export function borrar(clave: string): void {
  try {
    window.localStorage.removeItem(clave)
  } catch {
    /* sin efecto */
  }
}
