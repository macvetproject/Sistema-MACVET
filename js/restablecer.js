(function () {
  const { $, sb, mensajeError } = MV;
  const estado = $("estado-enlace"), form = $("form-nueva"), err = $("error-nueva");
  (async () => {
    const h = new URLSearchParams(location.hash.slice(1));
    const at = h.get("access_token"), rt = h.get("refresh_token");
    history.replaceState(null, "", location.pathname);              // el enlace no queda en el historial
    if (!at || !rt || h.get("type") !== "recovery") { estado.textContent = "El enlace no es válido o ya venció. Pide uno nuevo desde la pantalla de acceso."; return; }
    const { error } = await sb.auth.setSession({ access_token: at, refresh_token: rt });
    if (error) { estado.textContent = "El enlace venció. Pide uno nuevo desde la pantalla de acceso."; return; }
    estado.textContent = "Elige tu nueva contraseña."; form.hidden = false;
  })();
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.hidden = true;
    const a = $("c1").value, b = $("c2").value;
    const problema = a.length < 10 ? "Debe tener al menos 10 caracteres." : !/[A-Za-z]/.test(a) || !/[0-9]/.test(a) ? "Debe mezclar letras y números." : a !== b ? "Las contraseñas no coinciden." : null;
    if (problema) { err.textContent = problema; err.hidden = false; return; }
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { err.textContent = mensajeError(error); err.hidden = false; return; }
    await sb.auth.signOut();
    estado.textContent = "Listo. Tu contraseña se cambió."; form.hidden = true;
    setTimeout(() => location.replace("login.html"), 1500);
  });
})();
