import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// base "./" hace que el sitio funcione en cualquier ruta,
// por ejemplo https://<usuario>.github.io/<repositorio>/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
})
