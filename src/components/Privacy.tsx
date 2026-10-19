import { VERSION_AVISO } from "../lib/reports"

/** Aviso de privacidad simplificado (RL-03; LFPDPPP, art. 15). */
export function AvisoPrivacidad() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p className="rounded-xl bg-brand-soft p-3 font-bold text-brand-dark">
        Prototipo académico: en esta versión los datos se guardan solo en tu navegador y no se envían a ningún servidor.
      </p>
      <section>
        <h3 className="font-extrabold">Responsable</h3>
        <p>Equipo 1 del proyecto Metro Sin Barreras (Licenciatura en Ciencia de Datos, ESCOM-IPN).</p>
      </section>
      <section>
        <h3 className="font-extrabold">Qué datos tratamos</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Para consultar rutas no necesitas cuenta.</strong> Tu perfil de movilidad se guarda solo en tu dispositivo; a la consulta solo se envían restricciones de ruta, nunca el tipo de discapacidad.</li>
          <li><strong>Para reportar</strong> inicias sesión con Llave CDMX. Guardamos un seudónimo calculado a partir de tu identificador y el nivel de tu cuenta. No guardamos tu nombre, CURP, correo ni teléfono.</li>
          <li><strong>Verificación de la Tarjeta Incluyente (opcional).</strong> Revela una condición de discapacidad, que es un dato personal sensible, por lo que solo se hace con tu consentimiento expreso. Guardamos únicamente que la verificación fue exitosa, nunca el número de la tarjeta. Puedes revocarla cuando quieras.</li>
          <li><strong>Reportes y fotos.</strong> Guardamos la estación, el equipo, el estado y la hora. Las fotos se guardan sin metadatos (incluida la ubicación), no se publican, solo las ve el equipo de moderación y se borran a los 90 días.</li>
        </ul>
      </section>
      <section>
        <h3 className="font-extrabold">Para qué</h3>
        <p>Para validar los reportes de fallas y mostrar a otras personas el estado de los elevadores y escaleras. No usamos tus datos para publicidad ni los vendemos.</p>
      </section>
      <section>
        <h3 className="font-extrabold">Tus derechos (ARCO)</h3>
        <p>Desde “Mi cuenta” puedes revocar la verificación y darte de baja; al hacerlo, tus reportes se conservan sin tu seudónimo. En la versión final también podrás ejercer tus derechos de acceso, rectificación, cancelación y oposición por correo con el equipo responsable.</p>
      </section>
      <section>
        <h3 className="font-extrabold">Infraestructura</h3>
        <p>En la versión final, los datos se alojan en Google Cloud, que los trata solo por cuenta del equipo.</p>
      </section>
      <p className="text-xs text-ink-muted">Versión del aviso: {VERSION_AVISO}. Ley Federal de Protección de Datos Personales en Posesión de los Particulares (2025).</p>
    </div>
  )
}
