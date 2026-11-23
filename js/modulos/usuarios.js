(function () {
  const { sb, $, esc, fmt, ROLES, consulta, aviso, confirmar, formulario, abrirModal, funcionUsuarios, mensajeError } = MV;
  const OPC_ROL = Object.entries(ROLES);

  // Contraseña aleatoria segura (sin letras que se confunden)
  function generarClave() {
    const L = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ", N = "23456789", S = "-_.";
    const al = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
    const chars = [al(N), al(N), al(S), ...Array.from({ length: 11 }, () => al(L + N))];
    for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join("");
  }
  function botonGenerar(modal, idCampo) {
    const campo = modal.querySelector("#f-" + idCampo).closest(".form-group");
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-ghost btn-sm"; b.textContent = "Generar contraseña segura";
    b.addEventListener("click", () => { const i = modal.querySelector("#f-" + idCampo); i.type = "text"; i.value = generarClave(); });
    campo.append(b);
  }

  MV.panel.registrar({
    id: "usuarios", titulo: "Usuarios", roles: ["admin"],
    icono: MV.ico("M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"),
    async render(el) {
      el.innerHTML = `<div class="page-head"><div><h1>Usuarios</h1><p>Quién puede entrar al sistema y qué puede hacer. Todo cambio queda registrado en Movimientos.</p></div><button class="btn btn-primary btn-sm" id="u-nuevo">+ Nuevo usuario</button></div>
        <div class="panel"><div id="u-tabla"><div class="cargando">Cargando…</div></div></div>
        <div class="panel"><h2>Qué puede hacer cada rol</h2><ul class="lista-simple">
          <li><span><strong>Administrador</strong><br><small>Todo: usuarios, movimientos, inventario, finanzas, clínica y configuración.</small></span></li>
          <li><span><strong>Veterinario</strong><br><small>Citas, clientes, mascotas, registro clínico y recetas. No ve finanzas ni configuración.</small></span></li>
          <li><span><strong>Recepción</strong><br><small>Citas, clientes, mascotas, inventario, precios, comprobantes y contenido de la web. No ve el registro clínico.</small></span></li></ul></div>`;
      async function cargar() {
        const cont = $("u-tabla");
        let r; try { r = await consulta(sb.from("perfiles").select("id,usuario,nombre,rol,activo,creado_en").order("nombre")); } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
        cont.innerHTML = `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>${r.data.map((u) => `<tr><td><strong>${esc(u.nombre)}</strong>${u.id === MV.perfil.id ? ' <span class="badge badge-info">Tú</span>' : ""}</td><td>${esc(u.usuario)}</td><td>${esc(ROLES[u.rol])}</td><td>${u.activo ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-danger">Desactivado</span>'}</td>
          <td><div class="acciones"><button class="btn btn-ghost btn-sm" data-a="editar" data-id="${u.id}">Editar</button><button class="btn btn-ghost btn-sm" data-a="clave" data-id="${u.id}">Cambiar contraseña</button>${u.id === MV.perfil.id ? "" : `<button class="btn ${u.activo ? "btn-danger" : "btn-primary"} btn-sm" data-a="estado" data-id="${u.id}">${u.activo ? "Desactivar" : "Reactivar"}</button>`}</div></td></tr>`).join("")}</tbody></table></div>`;
        const porId = Object.fromEntries(r.data.map((u) => [u.id, u]));
        cont.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => {
          const u = porId[b.dataset.id], a = b.dataset.a;
          if (a === "editar") editar(u); else if (a === "clave") clave(u); else estado(u);
        }));
      }
      function nuevo() {
        const { el: m } = formulario({
          titulo: "Nuevo usuario", textoGuardar: "Crear usuario", grande: false,
          intro: "Entrará con su nombre de usuario y la contraseña temporal. Podrá cambiarla en «Mi cuenta».",
          campos: [
            { id: "usuario", label: "Nombre de usuario", required: true, maxlength: 30, patron: /^[a-z0-9._-]{3,30}$/, patronMensaje: "Usuario: 3 a 30 caracteres, solo minúsculas, números, punto, guion y guion bajo", ayuda: "Ejemplo: maria.recepcion (sin espacios ni tildes)" },
            { id: "nombre", label: "Nombre de la persona", required: true, maxlength: 80 },
            { id: "rol", label: "Rol", type: "select", options: OPC_ROL, value: "recepcion" },
            { id: "clave", label: "Contraseña temporal", type: "password", required: true, autocomplete: "new-password", ayuda: "Mínimo 10 caracteres, con letras y números." },
          ],
          alGuardar: async (v, cerrar) => {
            const r = await funcionUsuarios({ accion: "crear", usuario: v.usuario, nombre: v.nombre, rol: v.rol, clave: v.clave });
            cerrar(); cargar();
            const d = abrirModal(`<h3>Usuario creado</h3><p>Entrega estos datos a ${esc(v.nombre)}:</p><dl class="rejilla-datos"><div><dt>Usuario</dt><dd class="clave-generada">${esc(r.usuario)}</dd></div><div><dt>Contraseña temporal</dt><dd class="clave-generada">${esc(v.clave)}</dd></div></dl><div class="aviso-caja">Por seguridad, esta contraseña no se vuelve a mostrar. Que la cambie en «Mi cuenta» al entrar.</div><div class="modal-actions"><button class="btn btn-primary" data-ok>Entendido</button></div>`);
            d.el.querySelector("[data-ok]").addEventListener("click", d.cerrar);
          },
        });
        botonGenerar(m, "clave");
      }
      function editar(u) {
        formulario({ titulo: `Editar a ${u.nombre}`, grande: false, campos: [
          { id: "nombre", label: "Nombre", required: true, maxlength: 80, value: u.nombre },
          { id: "rol", label: "Rol", type: "select", options: OPC_ROL, value: u.rol },
        ], alGuardar: async (v, cerrar) => { await funcionUsuarios({ accion: "editar", id: u.id, nombre: v.nombre, rol: v.rol }); cerrar(); aviso("Usuario actualizado"); cargar(); } });
      }
      function clave(u) {
        const { el: m } = formulario({ titulo: `Cambiar contraseña de ${u.nombre}`, textoGuardar: "Cambiar contraseña", grande: false,
          intro: "Se cerrarán sus sesiones abiertas y tendrá que entrar con la nueva contraseña.",
          campos: [{ id: "clave", label: "Nueva contraseña", type: "password", required: true, autocomplete: "new-password", ayuda: "Mínimo 10 caracteres, con letras y números." }],
          alGuardar: async (v, cerrar) => { await funcionUsuarios({ accion: "cambiar_clave", id: u.id, clave: v.clave }); cerrar(); aviso("Contraseña cambiada"); } });
        botonGenerar(m, "clave");
      }
      async function estado(u) {
        const activar = !u.activo;
        if (!(await confirmar(activar ? `¿Reactivar a ${u.nombre}?` : `¿Desactivar a ${u.nombre}? No podrá entrar al sistema, pero su historial se conserva.`, activar ? "Reactivar" : "Desactivar", !activar))) return;
        try { await funcionUsuarios({ accion: "estado", id: u.id, activo: activar }); aviso(activar ? "Usuario reactivado" : "Usuario desactivado"); cargar(); }
        catch (e) { aviso(mensajeError(e), "error"); }
      }
      $("u-nuevo").addEventListener("click", nuevo);
      cargar();
    },
  });
})();
