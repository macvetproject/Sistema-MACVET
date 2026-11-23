(function () {
  const { sb, $, esc, fmt, consulta, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 40;
  const TABLAS = { perfiles: "Usuarios", clientes: "Clientes", mascotas: "Mascotas", citas: "Citas", razas: "Razas", veterinarios: "Veterinarios", vacunas_aplicadas: "Vacunas", desparasitaciones: "Desparasitaciones", resenas: "Reseñas", servicios_web: "Servicios de la web", galeria: "Galería", banners: "Banners", proveedores: "Proveedores", productos: "Productos", lotes: "Lotes", kardex: "Kardex", catalogo_servicios: "Servicios facturables", formas_pago: "Formas de pago", tipos_cita: "Tipos de cita", registros_clinicos: "Registros clínicos", recetas: "Recetas", comprobantes: "Comprobantes", mensajes_whatsapp: "Mensajes de WhatsApp", configuracion: "Configuración", migracion: "Migración de datos" };
  const ACCION = { INSERT: ["badge-ok", "Creó"], UPDATE: ["badge-info", "Modificó"], DELETE: ["badge-danger", "Eliminó"] };
  const IGNORAR = new Set(["actualizado_en", "creado_en", "id"]);
  const val = (v) => (v === null || v === undefined ? "vacío" : typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 80);

  function detalle(m) {
    const a = m.antes || {}, d = m.despues || {};
    if (m.tabla === "migracion") return Object.entries(d).filter(([k]) => k !== "nota" && k !== "fecha").map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ") + (d.nota ? `<br>${esc(d.nota)}` : "");
    if (d.accion) return esc(d.accion + (d.usuario ? " — " + d.usuario : ""));
    if (m.accion === "UPDATE") {
      const claves = Object.keys(d).filter((k) => !IGNORAR.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
      return claves.length ? claves.map((k) => `<strong>${esc(k)}</strong>: <span class="cambio-antes">${esc(val(a[k]))}</span> → <span class="cambio-despues">${esc(val(d[k]))}</span>`).join("<br>") : "Sin cambios visibles";
    }
    const base = m.accion === "INSERT" ? d : a;
    const nombre = base.nombre || base.titulo || base.descripcion || base.dueno || base.usuario || base.numero || "";
    return esc(nombre ? String(nombre).slice(0, 100) : "");
  }

  MV.panel.registrar({
    id: "movimientos", titulo: "Movimientos", roles: ["admin"],
    icono: MV.ico("M12 8v4l3 3M3 12a9 9 0 1018 0 9 9 0 00-18 0z"),
    async render(el) {
      const est = { tabla: "", usuario: "", desde: "", hasta: "", pagina: 0 };
      const usuarios = (await consulta(sb.from("perfiles").select("id,nombre").order("nombre"))).data;
      el.innerHTML = `<div class="page-head"><div><h1>Movimientos</h1><p>Registro de quién hizo cada cambio y cuándo. No se puede editar ni borrar.</p></div></div>
        <div class="panel"><div class="barra-filtros">
          <select id="m-tabla"><option value="">Todas las secciones</option>${Object.entries(TABLAS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
          <select id="m-usuario"><option value="">Todas las personas</option>${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join("")}<option value="__sistema">Público / sistema</option></select>
          <label class="ayuda">Desde <input type="date" id="m-desde"></label><label class="ayuda">Hasta <input type="date" id="m-hasta"></label></div>
          <div id="m-tabla-datos"><div class="cargando">Cargando…</div></div></div>`;
      async function cargar() {
        const cont = $("m-tabla-datos");
        let q = sb.from("movimientos").select("id,ocurrido_en,usuario_id,nombre,tabla,registro_id,accion,antes,despues", { count: "exact" }).order("id", { ascending: false }).range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1);
        if (est.tabla) q = q.eq("tabla", est.tabla);
        if (est.usuario === "__sistema") q = q.is("usuario_id", null); else if (est.usuario) q = q.eq("usuario_id", est.usuario);
        if (est.desde) q = q.gte("ocurrido_en", `${est.desde}T00:00:00-05:00`);
        if (est.hasta) q = q.lte("ocurrido_en", `${est.hasta}T23:59:59-05:00`);
        let r; try { r = await consulta(q); } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
        if (!r.data.length) { cont.innerHTML = '<div class="vacio">No hay movimientos con estos filtros.</div>'; return; }
        cont.innerHTML = `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué hizo</th><th>Sección</th><th>Detalle</th></tr></thead><tbody>${r.data.map((m) => { const [c, t] = ACCION[m.accion] || ["badge-neutral", m.accion]; return `<tr><td style="white-space:nowrap">${fmt.fechaHora(m.ocurrido_en)}</td><td>${esc(m.nombre)}</td><td><span class="badge ${c}">${esc(t)}</span></td><td>${esc(TABLAS[m.tabla] || m.tabla)}</td><td class="detalle-mov">${detalle(m)}</td></tr>`; }).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}`;
        cont.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { est.pagina += Number(b.dataset.pag); cargar(); }));
      }
      const on = (id, k) => $(id).addEventListener("change", (e) => { est[k] = e.target.value; est.pagina = 0; cargar(); });
      on("m-tabla", "tabla"); on("m-usuario", "usuario"); on("m-desde", "desde"); on("m-hasta", "hasta");
      cargar();
    },
  });
})();
