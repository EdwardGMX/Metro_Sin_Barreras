import React, { useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import AdminApp from "./components/admin/AdminApp"
import "./index.css"

/** La consola del personal vive en #/consola; el resto de la app es pública y no requiere cuenta. */
const enConsola = () => window.location.hash.startsWith("#/consola")

function Root() {
  const [consola, setConsola] = useState(enConsola)
  useEffect(() => {
    const cambiar = () => {
      const ahora = enConsola()
      setConsola((antes) => {
        if (antes !== ahora) window.scrollTo(0, 0)
        return ahora
      })
    }
    window.addEventListener("hashchange", cambiar)
    return () => window.removeEventListener("hashchange", cambiar)
  }, [])
  return consola ? <AdminApp /> : <App />
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

// Service worker: guarda la aplicación y el contenido de emergencia para usarlos sin conexión (RF-15).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* sin service worker la app sigue funcionando con conexión */
    })
  })
}
