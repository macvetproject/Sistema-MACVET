(function () {
  const { $, sesionActual, iniciarSesion, mensajeError, sb, cfg, aviso } = MV;
  const form = $("form-acceso"), err = $("error-acceso"), btn = $("btn-entrar");
  const destino = () => {
    const n = new URLSearchParams(location.search).get("next") || "";
    return /^[a-z0-9_-]+\.html(#[a-z0-9_-]*)?$/i.test(n) ? n : "admin.html";   // solo páginas propias
  };

  sesionActual().then((s) => { if (s) location.replace(destino()); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.hidden = true;
    const usuario = $("usuario").value, clave = $("clave").value;
    if (!usuario.trim() || !clave) { err.textContent = "Escribe tu usuario y tu contraseña."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Entrando…";
    try {
      const { error } = await iniciarSesion(usuario, clave);
      if (error) throw error;
      const s = await sesionActual();
      if (!s) throw new Error("Tu usuario está desactivado. Habla con el administrador.");
      location.replace(destino());
    } catch (ex) {
      const t = String(ex.message || "");
      err.textContent = /invalid login|invalid_credentials|Invalid/i.test(t) ? "Usuario o contraseña incorrectos." : mensajeError(ex);
      err.hidden = false; btn.disabled = false; btn.textContent = "Entrar";
    }
  });

  $("olvide").addEventListener("click", async (e) => {
    e.preventDefault();
    const u = $("usuario").value.trim();
    if (!u.includes("@")) {
      err.textContent = "Si entras con un nombre de usuario (sin correo), pide al administrador que te cambie la contraseña. Si usas correo, escríbelo arriba y vuelve a pulsar este enlace.";
      err.hidden = false; return;
    }
    err.hidden = true;
    await sb.auth.resetPasswordForEmail(u.toLowerCase(), { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, "") + "restablecer.html" });
    aviso("Si el correo existe, te enviamos un enlace para crear una nueva contraseña.");
  });
})();
