/* Página pública: carga servicios, equipo, opiniones y contacto reales desde la base.
   Las secciones sin datos reales quedan ocultas (no se muestra contenido inventado). */
(function () {
  const { sb, $, esc } = MV;
  const ICO = '<svg class="ico" viewBox="0 0 24 24"><path d="M4.8 2.655A1.857 1.857 0 006 6a1.857 1.857 0 002.657-1.345M22 12h-6M18 22c-4 0-7-2-7-4v-2a3 3 0 013-3h8M9 7a4 4 0 11-8 0 4 4 0 018 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const iniciales = (n) => esc(String(n).split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase());
  const mostrar = (id) => {
    const s = $(id); if (s) s.hidden = false;
    document.querySelectorAll(`[data-seccion="${id}"]`).forEach((a) => { a.hidden = false; });
  };
  const estrellas = (n) => Array.from({ length: 5 }, (_, i) => `<span class="star ${i < n ? "filled" : ""}"><svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor"/></svg></span>`).join("");

  async function servicios() {
    const cont = $("lista-servicios");
    const { data, error } = await sb.from("servicios_web").select("titulo,descripcion,precio").eq("activo", true).order("orden");
    if (error || !data || !data.length) { cont.innerHTML = '<p class="ayuda">Pregunta por nuestros servicios en la clínica.</p>'; return; }
    cont.innerHTML = data.map((s) => `<div class="card fade-up animate-in"><div class="icon">${ICO}</div><h3>${esc(s.titulo)}</h3><p>${esc(s.descripcion || "")}</p>${s.precio != null ? `<p><strong>Desde $${Number(s.precio).toFixed(2)}</strong></p>` : ""}</div>`).join("");
  }
  async function equipo() {
    const { data } = await sb.from("veterinarios").select("nombre,especialidad").eq("activo", true).order("nombre");
    if (!data || !data.length) return;
    $("lista-equipo").innerHTML = data.map((v) => `<div class="team-card fade-up animate-in"><div class="team-avatar-placeholder">${iniciales(v.nombre)}</div><div><h3>${esc(v.nombre)}</h3><div class="team-role">${esc(v.especialidad || "Veterinario")}</div></div></div>`).join("");
    mostrar("equipo");
  }
  async function opiniones() {
    const { data } = await sb.from("resenas").select("autor,estrellas,texto").order("fecha", { ascending: false }).limit(8);
    if (!data || !data.length) return;
    $("lista-testimonios").innerHTML = data.map((r, i) => `<div class="testimonial-card testimonial-slide fade-up animate-in ${i === 0 ? "active" : ""}"><div class="testimonial-stars review-stars">${estrellas(r.estrellas)}</div><p>“${esc(r.texto)}”</p><div class="testimonial-author"><div class="testimonial-avatar">${iniciales(r.autor)}</div><div><strong>${esc(r.autor)}</strong></div></div></div>`).join("");
    mostrar("testimonios");
    const sl = document.querySelectorAll(".testimonial-slide");
    if (sl.length > 1) {
      let c = 0;
      setInterval(() => { sl[c].classList.toggle("active", false); c = (c + 1) % sl.length; sl[c].classList.toggle("active", true); }, 5000);
    }
  }
  async function contacto() {
    const { data } = await sb.from("sitio").select("clave,valor");
    if (!data || !data.length) return;
    const v = Object.fromEntries(data.map((x) => [x.clave, x.valor]));
    const tarjeta = (titulo, lineas) => `<div class="contact-card fade-up animate-in"><h3>${titulo}</h3><p>${lineas.map(esc).join("<br>")}</p></div>`;
    const t = [];
    if (v.direccion) t.push(tarjeta("Ubicación", ["Milagro, Ecuador", v.direccion]));
    if (v.telefono || v.whatsapp || v.correo) t.push(tarjeta("Contacto", [v.telefono, v.whatsapp && "WhatsApp: " + v.whatsapp, v.correo].filter(Boolean)));
    if (v.horario) t.push(tarjeta("Horario", v.horario.split("\n")));
    if (!t.length) return;
    $("lista-contacto").innerHTML = t.join("");
    mostrar("contacto");
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
      const t = document.querySelector(a.getAttribute("href"));
      if (t && !t.hidden) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth" }); }
    }));
    const btn = $("menu-toggle"), nav = $("mobile-nav");
    if (btn && nav) btn.addEventListener("click", () => { nav.classList.toggle("open"); btn.classList.toggle("is-open"); });
    const obs = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("animate-in"); obs.unobserve(e.target); } }), { threshold: 0.1 });
    document.querySelectorAll(".fade-up").forEach((el) => obs.observe(el));
    Promise.allSettled([servicios(), equipo(), opiniones(), contacto()]);
  });
})();
