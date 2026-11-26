(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, abrirModal, paginador, mensajeError } = MV;

  MV.panel.registrar({
    id: "contenido", titulo: "Contenido web", roles: ["admin", "recepcion"],
    icono: MV.ico("M3 3h18v18H3zM9 3v18M3 9h18M3 15h18"),
    async render(el) {
      let tab = "servicios";
      el.innerHTML = `<div class="page-head"><div><h1>Contenido web</h1><p>Administra los servicios y galería del sitio público.</p></div></div>
        <div class="panel">
          <div class="chips" id="cw-tabs"><button class="chip activo" data-t="servicios">Servicios</button><button class="chip" data-t="galeria">Galería</button></div>
          <div id="cw-cont"></div>
        </div>`;

      const cont = $("cw-cont");

      async function pintarServicios() {
        cont.innerHTML = '<div class="cargando">Cargando…</div>';
        try {
          const { data } = await consulta(sb.from("servicios_web").select("*").order("orden"));
          cont.innerHTML = `<button class="btn btn-primary btn-sm" id="cw-nuevo-s" style="margin-bottom:10px">+ Nuevo servicio</button>` +
            (data.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>#</th><th>Título</th><th>Precio</th><th>Activo</th><th></th></tr></thead>
            <tbody>${data.map((s) => `<tr><td>${s.orden}</td><td>${esc(s.titulo)}</td><td>${s.precio != null ? fmt.dinero(s.precio) : "—"}</td>
            <td>${s.activo ? "✅" : "❌"}</td><td><button class="btn btn-ghost btn-sm" data-sid="${s.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin servicios.</div>');
          $("cw-nuevo-s").addEventListener("click", () => formServicio(null, pintarServicios));
          cont.querySelectorAll("[data-sid]").forEach((b) => b.addEventListener("click", () => formServicio(data.find((s) => s.id === b.dataset.sid), pintarServicios)));
        } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; }
      }

      function formServicio(s, cb) {
        formulario({
          titulo: s ? "Editar servicio" : "Nuevo servicio",
          textoGuardar: s ? "Guardar cambios" : "Crear",
          campos: [
            { id: "titulo", label: "Título", required: true, maxlength: 120, value: s?.titulo },
            { id: "descripcion", label: "Descripción", type: "textarea", maxlength: 500, value: s?.descripcion },
            { id: "precio", label: "Precio ($)", type: "number", min: 0, step: "0.01", value: s?.precio, mitad: true },
            { id: "orden", label: "Orden", type: "number", min: 0, value: s?.orden ?? 0, mitad: true },
            { id: "activo", label: "Activo", type: "select", options: [["true", "Sí"], ["false", "No"]], value: s ? String(s.activo) : "true", mitad: true },
          ],
          alGuardar: async (v, cerrar) => {
            const datos = { titulo: v.titulo, descripcion: v.descripcion, precio: v.precio ? +v.precio : null, orden: +v.orden || 0, activo: v.activo === "true" };
            if (s) await consulta(sb.from("servicios_web").update(datos).eq("id", s.id));
            else await consulta(sb.from("servicios_web").insert(datos));
            cerrar(); aviso(s ? "Servicio actualizado" : "Servicio creado"); cb();
          },
        });
      }

      async function pintarGaleria() {
        cont.innerHTML = '<div class="cargando">Cargando…</div>';
        try {
          const { data } = await consulta(sb.from("galeria").select("*").order("orden"));
          cont.innerHTML = `<button class="btn btn-primary btn-sm" id="cw-nuevo-g" style="margin-bottom:10px">+ Nueva imagen</button>` +
            (data.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>#</th><th>Título</th><th>URL imagen</th><th>Activo</th><th></th></tr></thead>
            <tbody>${data.map((g) => `<tr><td>${g.orden}</td><td>${esc(g.titulo || "—")}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(g.imagen_url || "—")}</td>
            <td>${g.activo ? "✅" : "❌"}</td><td><button class="btn btn-ghost btn-sm" data-gid="${g.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin imágenes.</div>');
          $("cw-nuevo-g").addEventListener("click", () => formGaleria(null, pintarGaleria));
          cont.querySelectorAll("[data-gid]").forEach((b) => b.addEventListener("click", () => formGaleria(data.find((g) => g.id === b.dataset.gid), pintarGaleria)));
        } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; }
      }

      function formGaleria(g, cb) {
        formulario({
          titulo: g ? "Editar imagen" : "Nueva imagen de galería",
          textoGuardar: g ? "Guardar cambios" : "Crear",
          campos: [
            { id: "titulo", label: "Título", maxlength: 120, value: g?.titulo },
            { id: "imagen_url", label: "URL de la imagen", required: true, maxlength: 500, value: g?.imagen_url, placeholder: "https://…" },
            { id: "orden", label: "Orden", type: "number", min: 0, value: g?.orden ?? 0, mitad: true },
            { id: "activo", label: "Activo", type: "select", options: [["true", "Sí"], ["false", "No"]], value: g ? String(g.activo) : "true", mitad: true },
          ],
          alGuardar: async (v, cerrar) => {
            const datos = { titulo: v.titulo, imagen_url: v.imagen_url, orden: +v.orden || 0, activo: v.activo === "true" };
            if (g) await consulta(sb.from("galeria").update(datos).eq("id", g.id));
            else await consulta(sb.from("galeria").insert(datos));
            cerrar(); aviso(g ? "Imagen actualizada" : "Imagen agregada"); cb();
          },
        });
      }

      $("cw-tabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-t]");
        if (!b) return;
        tab = b.dataset.t;
        el.querySelectorAll("#cw-tabs .chip").forEach((x) => x.classList.toggle("activo", x.dataset.t === tab));
        (tab === "servicios" ? pintarServicios : pintarGaleria)();
      });
      pintarServicios();
    },
  });
})();
