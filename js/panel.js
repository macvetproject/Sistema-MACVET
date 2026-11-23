/* Estructura del panel: menú por rol, rutas con #hash y cuenta del usuario */
(function () {
  const { $, esc, ROLES, salir, requerir, formulario, aviso, mensajeError, sb } = MV;
  const modulos = [];
  const ico = (d) => `<svg class="ico" viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  MV.ico = ico;

  MV.panel = {
    registrar(m) { modulos.push(m); },
    irA(id) { location.hash = id; },
  };

  function menu(perfil) {
    const visibles = modulos.filter((m) => m.roles.includes(perfil.rol));
    $("menu-lateral").innerHTML = visibles.map((m) =>
      `<a href="#${m.id}" data-m="${m.id}">${m.icono || ""} ${esc(m.titulo)}</a>`).join("");
    return visibles;
  }

  async function ruta(visibles, perfil) {
    const id = location.hash.replace("#", "") || visibles[0].id;
    const m = visibles.find((x) => x.id === id) || visibles[0];
    document.querySelectorAll("#menu-lateral a").forEach((a) => a.classList.toggle("active", a.dataset.m === m.id));
    const vista = $("vista");
    vista.innerHTML = '<div class="cargando">Cargando…</div>';
    try { await m.render(vista, { perfil }); }
    catch (e) { vista.innerHTML = `<div class="vacio">No se pudo cargar esta sección.<br><small>${esc(mensajeError(e))}</small></div>`; console.error(e); }
  }

  function miCuenta(perfil) {
    formulario({
      titulo: "Mi cuenta", textoGuardar: "Cambiar contraseña", grande: false,
      intro: `${perfil.nombre} · ${ROLES[perfil.rol]} · usuario: ${perfil.usuario}`,
      campos: [
        { id: "c1", label: "Nueva contraseña", type: "password", required: true, autocomplete: "new-password", ayuda: "Mínimo 10 caracteres, con letras y números." },
        { id: "c2", label: "Repite la nueva contraseña", type: "password", required: true, autocomplete: "new-password" },
      ],
      alGuardar: async (v, cerrar) => {
        if (v.c1.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
        if (!/[A-Za-z]/.test(v.c1) || !/[0-9]/.test(v.c1)) throw new Error("La contraseña debe mezclar letras y números");
        if (v.c1 !== v.c2) throw new Error("Las contraseñas no coinciden");
        const { error } = await sb.auth.updateUser({ password: v.c1 });
        if (error) throw error;
        cerrar(); aviso("Tu contraseña se cambió");
      },
    });
  }

  MV.arrancarPanel = async function () {
    const s = await requerir(); if (!s) return;
    const { perfil } = s; MV.perfil = perfil;
    $("u-nombre").textContent = perfil.nombre; $("u-rol").textContent = ROLES[perfil.rol];
    $("usuario-caja").hidden = false;
    $("btn-salir").addEventListener("click", salir);
    $("btn-mi-cuenta").addEventListener("click", () => miCuenta(perfil));
    const visibles = menu(perfil);
    window.addEventListener("hashchange", () => ruta(visibles, perfil));
    ruta(visibles, perfil);
    // si la sesión se cierra en otra pestaña, volver al acceso
    sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") location.replace("login.html"); });
  };
})();
