/* Formulario público para pedir cita. Solo puede CREAR una solicitud "pendiente"; no puede leer ninguna cita. */
(function () {
  const { sb, $, esc, fmt, mensajeError } = MV;
  // Horario de atención (según la página actual de la clínica): lunes a domingo, con cita previa, 7:30 a 18:00.
  const HORARIO = { inicio: "07:30", fin: "18:00" };
  const SERVICIOS = ["Consulta general", "Vacunación", "Desparasitación", "Control", "Cirugía", "Peluquería y spa", "Profilaxis dental", "Ecografía", "Laboratorio", "Emergencia", "Otro"];
  const TEL = /^[0-9+ ()-]{7,20}$/;
  const abierto = Date.now();

  const horasDelDia = (iso) => {
    const [ini, fin] = [HORARIO.inicio, HORARIO.fin];
    const out = []; let [h, m] = ini.split(":").map(Number); const [hf, mf] = fin.split(":").map(Number);
    while (h * 60 + m < hf * 60 + mf) { out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`); m += 30; if (m >= 60) { h++; m -= 60; } }
    return out;
  };

  async function pintarHoras() {
    const fecha = $("fecha").value, sel = $("hora"), ayuda = $("ayuda-hora");
    if (!fecha) { sel.innerHTML = '<option value="">Elige primero la fecha</option>'; return; }
    const horas = horasDelDia(fecha);
    ayuda.textContent = "";
    const { data } = await sb.rpc("horas_ocupadas", { p_fecha: fecha });
    const ocupadas = new Set((data || []).map((h) => String(h).slice(0, 5)));
    const hoy = fmt.hoy(), ahora = new Date().toLocaleTimeString("sv-SE", { timeZone: MV.cfg.zona, hour: "2-digit", minute: "2-digit" });
    const libres = horas.filter((h) => !ocupadas.has(h) && !(fecha === hoy && h <= ahora));
    sel.innerHTML = libres.length ? '<option value="">Elige una hora</option>' + libres.map((h) => `<option value="${h}">${h}</option>`).join("") : '<option value="">Sin horas libres</option>';
    if (!libres.length) ayuda.textContent = "Ese día ya no hay horas libres. Prueba con otra fecha.";
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("servicio").innerHTML = SERVICIOS.map((s) => `<option>${esc(s)}</option>`).join("");
    const f = $("fecha"); f.min = fmt.hoy();
    f.addEventListener("change", pintarHoras);
    const err = $("error-cita"), btn = $("btn-cita");
    $("form-cita").addEventListener("submit", async (e) => {
      e.preventDefault(); err.hidden = true;
      const v = { dueno: $("dueno").value.trim(), telefono: $("telefono").value.trim(), nombre_mascota: $("mascota").value.trim(), tipo_mascota: $("tipo").value,
        raza_mascota: $("raza").value.trim() || null, fecha: f.value, hora: $("hora").value, servicio: $("servicio").value, notas: $("notas").value.trim() || null };
      const problema = v.dueno.length < 2 ? "Escribe tu nombre." : !TEL.test(v.telefono) ? "Escribe un teléfono válido (solo números)." : !v.nombre_mascota ? "Escribe el nombre de tu mascota." : !v.fecha ? "Elige la fecha." : !v.hora ? "Elige la hora." : null;
      if (problema) { err.textContent = problema; err.hidden = false; return; }
      // Anti-spam básico: campo trampa lleno o formulario enviado en menos de 4 segundos
      if ($("sitio-web").value || Date.now() - abierto < 4000) { $("form-cita").hidden = true; $("listo").hidden = false; return; }
      btn.disabled = true; btn.textContent = "Enviando…";
      const { error } = await sb.from("citas").insert({ ...v, origen: "web" });
      if (error) {
        err.textContent = /horario/i.test(error.message) ? "Esa hora acaba de ocuparse. Elige otra." : mensajeError(error);
        err.hidden = false; btn.disabled = false; btn.textContent = "Solicitar cita"; pintarHoras(); return;
      }
      $("form-cita").hidden = true; $("listo").hidden = false;
    });
  });
})();
