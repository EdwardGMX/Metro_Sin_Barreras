/* Service worker de Metro Sin Barreras (RF-15, RIE-13).
 * Red primero para la página (para recibir actualizaciones) y caché como respaldo;
 * caché primero para los archivos estáticos. Así, después de la primera visita,
 * la aplicación y el botón de emergencia abren sin conexión. */
const CACHE = "msb-v3"
const BASICOS = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put("./index.html", copia))
          return res
        })
        .catch(() => caches.match("./index.html")),
    )
    return
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copia = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copia))
          }
          return res
        }),
    ),
  )
})
