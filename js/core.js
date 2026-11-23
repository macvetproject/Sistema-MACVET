/* ===========================================================
   MACVET — utilidades compartidas: conexión, sesión, avisos, formularios
   Regla de oro: todo dato que viene de la base se muestra con MV.esc() o textContent.
   =========================================================== */
(function () {
  const cfg = window.MACVET_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmt = {
    fecha(iso) { if (!iso) return "—"; const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${y}`; },
    hora(t) { return t ? String(t).slice(0, 5) : "—"; },
    fechaHora(iso) {
      if (!iso) return "—";
      return new Date(iso).toLocaleString("es-EC", { timeZone: cfg.zona, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    },
    dinero(n) { return n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    hoy() { return new Date().toLocaleDateString("sv-SE", { timeZone: cfg.zona }); },
  };

  /* ---------- sesión ---------- */
  const ROLES = { admin: "Administrador", veterinario: "Veterinario", recepcion: "Recepción" };
  const emailInterno = (u) => `${String(u).trim().toLowerCase()}@macvet.invalid`;

  async function iniciarSesion(usuario, clave) {
    const u = String(usuario).trim();
    return sb.auth.signInWithPassword({ email: u.includes("@") ? u.toLowerCase() : emailInterno(u), password: clave });
  }
  async function sesionActual() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data: perfil } = await sb.from("perfiles").select("id,usuario,nombre,rol,activo").eq("id", session.user.id).maybeSingle();
    if (!perfil || !perfil.activo) { await sb.auth.signOut(); return null; }
    return { session, perfil };
  }
  async function requerir() {
    const s = await sesionActual();
    if (!s) {
      const destino = location.pathname.split("/").pop() + location.hash;
      location.replace("login.html?next=" + encodeURIComponent(destino));
      return null;
    }
    return s;
  }
  async function salir() { await sb.auth.signOut(); location.replace("login.html"); }

  /* ---------- errores comprensibles ---------- */
  function mensajeError(e) {
    const t = String((e && (e.message || e.error_description || e.error)) || e || "");
    if (/row-level security|permission denied/i.test(t)) return "No tienes permiso para realizar esta acción.";
    if (/duplicate key|already exists/i.test(t)) return "Ya existe un registro igual.";
    if (/violates check constraint/i.test(t)) return "Algún dato no tiene un formato válido. Revisa los campos.";
    if (/violates foreign key/i.test(t)) return "Este registro está relacionado con otros datos y no se puede modificar así.";
    if (/Failed to fetch|NetworkError|network/i.test(t)) return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
    if (/horario/i.test(t)) return t.replace(/^.*?:\s*/, "");
    return t.length < 160 ? t : "Ocurrió un error. Inténtalo de nuevo.";
  }
  async function consulta(promesa) {
    const r = await promesa;
    if (r.error) throw r.error;
    return r;
  }
  // Quita caracteres que rompen los filtros de búsqueda de PostgREST
  const limpiarBusqueda = (s) => String(s || "").replace(/[,()*\\%_:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- avisos y diálogos ---------- */
  function aviso(msg, tipo) {
    const viejo = $("aviso"); if (viejo) viejo.remove();
    const n = document.createElement("div");
    n.id = "aviso"; n.className = "custom-notif show" + (tipo === "error" ? " notif-error" : "");
    const dentro = document.createElement("div"); dentro.className = "custom-notif-inner";
    const sp = document.createElement("span"); sp.textContent = msg;
    const x = document.createElement("button"); x.className = "custom-notif-close"; x.type = "button"; x.textContent = "×";
    x.addEventListener("click", () => n.remove());
    dentro.append(sp, x); n.append(dentro); document.body.append(n);
    setTimeout(() => n.remove(), tipo === "error" ? 7000 : 4000);
  }

  function abrirModal(html, { grande } = {}) {
    const m = document.createElement("div");
    m.className = "modal-overlay open";
    m.innerHTML = `<div class="modal ${grande ? "modal-lg" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.append(m);
    const cerrar = () => m.remove();
    m.addEventListener("mousedown", (e) => { if (e.target === m) cerrar(); });
    document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { cerrar(); document.removeEventListener("keydown", onEsc); } });
    return { el: m, cerrar };
  }

  function confirmar(msg, textoBoton = "Confirmar", peligro = true) {
    return new Promise((resolver) => {
      const { el, cerrar } = abrirModal(`<h3>Confirmar acción</h3><p style="margin:16px 0;color:var(--text-secondary)">${esc(msg)}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-no>Cancelar</button><button class="btn ${peligro ? "btn-danger" : "btn-primary"}" data-si>${esc(textoBoton)}</button></div>`);
      el.querySelector("[data-no]").addEventListener("click", () => { cerrar(); resolver(false); });
      el.querySelector("[data-si]").addEventListener("click", () => { cerrar(); resolver(true); });
    });
  }

  /* Formulario en ventana. campos: [{id,label,type,options:[[valor,texto]],required,value,placeholder,maxlength,ayuda,mitad}] */
  function formulario({ titulo, campos, textoGuardar = "Guardar", alGuardar, grande = true, intro = "" }) {
    const campo = (c) => {
      const id = `f-${c.id}`, req = c.required ? "required" : "", ml = c.maxlength ? `maxlength="${c.maxlength}"` : "";
      let ctl;
      if (c.type === "select") {
        ctl = `<select id="${id}" ${req}>${(c.options || []).map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(c.value ?? "") ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
      } else if (c.type === "textarea") {
        ctl = `<textarea id="${id}" rows="3" ${ml} ${req} placeholder="${esc(c.placeholder || "")}">${esc(c.value ?? "")}</textarea>`;
      } else {
        ctl = `<input id="${id}" type="${c.type || "text"}" ${ml} ${req} ${c.min ? `min="${esc(c.min)}"` : ""} ${c.step ? `step="${c.step}"` : ""} autocomplete="${c.autocomplete || "off"}" placeholder="${esc(c.placeholder || "")}" value="${esc(c.value ?? "")}">`;
      }
      return `<div class="form-group"><label for="${id}">${esc(c.label)}${c.required ? " *" : ""}</label>${ctl}${c.ayuda ? `<small class="ayuda">${esc(c.ayuda)}</small>` : ""}</div>`;
    };
    let cuerpo = ""; let i = 0;
    while (i < campos.length) {
      if (campos[i].mitad && campos[i + 1] && campos[i + 1].mitad) { cuerpo += `<div class="form-row">${campo(campos[i])}${campo(campos[i + 1])}</div>`; i += 2; }
      else { cuerpo += campo(campos[i]); i += 1; }
    }
    const { el, cerrar } = abrirModal(`<h3>${esc(titulo)}</h3>${intro ? `<p class="ayuda" style="margin:-4px 0 14px">${esc(intro)}</p>` : ""}
      <form novalidate>${cuerpo}<div class="form-error" role="alert" hidden></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-no>Cancelar</button><button type="submit" class="btn btn-primary">${esc(textoGuardar)}</button></div></form>`, { grande });
    const form = el.querySelector("form"), err = el.querySelector(".form-error"), btn = form.querySelector("[type=submit]");
    el.querySelector("[data-no]").addEventListener("click", cerrar);
    const primero = form.querySelector("input,select,textarea"); if (primero) primero.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); err.hidden = true;
      const valores = {};
      for (const c of campos) {
        const ctl = form.querySelector(`#f-${c.id}`); let v = ctl.value.trim();
        if (c.required && !v) { err.textContent = `Falta: ${c.label}`; err.hidden = false; ctl.focus(); return; }
        if (c.patron && v && !c.patron.test(v)) { err.textContent = c.patronMensaje || `Revisa: ${c.label}`; err.hidden = false; ctl.focus(); return; }
        valores[c.id] = v === "" ? null : v;
      }
      btn.disabled = true; const txt = btn.textContent; btn.textContent = "Guardando…";
      try { await alGuardar(valores, cerrar); }
      catch (ex) { err.textContent = mensajeError(ex); err.hidden = false; btn.disabled = false; btn.textContent = txt; }
    });
    return { el, cerrar };
  }

  /* Paginación simple: devuelve el HTML de los controles */
  function paginador(pagina, porPagina, total) {
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const desde = total === 0 ? 0 : pagina * porPagina + 1, hasta = Math.min(total, (pagina + 1) * porPagina);
    return `<div class="paginador"><span>${desde}–${hasta} de ${total.toLocaleString("es-EC")}</span>
      <button class="btn btn-ghost btn-sm" data-pag="-1" ${pagina === 0 ? "disabled" : ""}>← Anterior</button>
      <span>Página ${pagina + 1} de ${paginas}</span>
      <button class="btn btn-ghost btn-sm" data-pag="1" ${pagina + 1 >= paginas ? "disabled" : ""}>Siguiente →</button></div>`;
  }

  /* Llamada a la función de usuarios (solo administradores) */
  async function funcionUsuarios(cuerpo) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(`${cfg.url}/functions/v1/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key, Authorization: `Bearer ${session ? session.access_token : ""}` },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "No se pudo completar la acción");
    return j;
  }

  window.MV = { sb, cfg, $, esc, fmt, ROLES, iniciarSesion, sesionActual, requerir, salir, mensajeError, consulta, limpiarBusqueda, debounce,
    aviso, abrirModal, confirmar, formulario, paginador, funcionUsuarios };
})();
