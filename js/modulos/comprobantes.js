/* Comprobantes de venta (NO son facturas del SRI).
   El stock se descuenta/repone solo a través de comprobante_crear()/comprobante_anular():
   nunca se inserta ni se edita un comprobante a mano. */
(function () {
  const { sb, $, esc, fmt, consulta, aviso, formulario, abrirModal, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 20;

  /* ---------- recibo (se usa tanto al emitir como al reimprimir del historial) ---------- */
  function reciboHTML(c) {
    const items = Array.isArray(c.items) ? c.items : [];
    const raya = '<div class="receipt-divider">--------------------------------</div>';
    return `<div class="receipt-wrapper"><div class="thermal-receipt">
      <div class="receipt-header"><div class="receipt-logo">MACVET</div><div>Veterinaria en Milagro</div><div>Milagro, Ecuador</div></div>
      ${raya}
      <div class="receipt-title">Comprobante ${esc(c.numero)}</div>
      <div class="receipt-info"><div>Fecha: ${esc(fmt.fechaHora(c.creado_en))}</div><div>Cliente: ${esc(c.cliente_nombre || "Consumidor final")}</div></div>
      ${raya}
      <div class="receipt-items-header"><span>Ítem</span><span>Cant</span><span>Total</span></div>
      ${items.map((it) => `<div class="receipt-item"><span>${esc(it.nombre)}</span><span>${esc(it.cantidad)}</span><span>${fmt.dinero(it.cantidad * it.precio_unitario)}</span></div>`).join("")}
      ${raya}
      <div class="receipt-totals"><div class="receipt-total-line"><span>TOTAL</span><span>${fmt.dinero(c.total)}</span></div></div>
      ${raya}
      <div class="receipt-footer">Forma de pago: ${esc(c.forma_pago)}<br>Este comprobante no es una factura del SRI.<br>¡Gracias por su confianza!${c.anulado ? `<br><strong>ANULADO${c.motivo_anulacion ? ": " + esc(c.motivo_anulacion) : ""}</strong>` : ""}</div>
    </div></div>`;
  }

  function anularComprobante(c, alTerminar) {
    formulario({
      titulo: `Anular comprobante ${c.numero}`, textoGuardar: "Anular", grande: false,
      intro: "Se repone el stock de los productos vendidos en este comprobante. No se puede deshacer.",
      campos: [{ id: "motivo", label: "Motivo de la anulación", type: "textarea", required: true, maxlength: 300 }],
      alGuardar: async (v, cerrar) => {
        await consulta(sb.rpc("comprobante_anular", { p_id: c.id, p_motivo: v.motivo }));
        cerrar(); aviso("Comprobante anulado"); alTerminar();
      },
    });
  }

  function pintarRecibo(cont, c, { textoVolver, alVolver, mostrarAnular }) {
    cont.innerHTML = `${reciboHTML(c)}<div class="modal-actions" style="margin-top:16px;justify-content:center">
      <button class="btn btn-ghost" id="cp-volver" type="button">${esc(textoVolver)}</button>
      <button class="btn btn-primary" id="cp-imprimir" type="button">Imprimir</button>
      ${mostrarAnular && !c.anulado && MV.perfil.rol === "admin" ? '<button class="btn btn-danger" id="cp-anular" type="button">Anular</button>' : ""}</div>`;
    $("cp-imprimir").addEventListener("click", () => {
      document.body.classList.add("imprimiendo-recibo");
      window.print();
      setTimeout(() => document.body.classList.remove("imprimiendo-recibo"), 300);
    });
    $("cp-volver").addEventListener("click", alVolver);
    const ba = document.getElementById("cp-anular");
    if (ba) ba.addEventListener("click", () => anularComprobante(c, alVolver));
  }

  /* ---------- agregar ítems al carrito ---------- */
  function agregarProducto(alAgregar) {
    const { el, cerrar } = abrirModal(`<h3>Agregar producto</h3><input type="search" id="ap-q" placeholder="Nombre o código…" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm)" autofocus>
      <div class="resultados-busqueda" id="ap-res"><div class="vacio">Escribe al menos 2 letras.</div></div><div class="modal-actions"><button class="btn btn-ghost" data-no type="button">Cerrar</button></div>`, { grande: true });
    el.querySelector("[data-no]").addEventListener("click", cerrar);
    el.querySelector("#ap-q").addEventListener("input", debounce(async (e) => {
      const t = limpiarBusqueda(e.target.value), res = el.querySelector("#ap-res");
      if (t.length < 2) { res.innerHTML = '<div class="vacio">Escribe al menos 2 letras.</div>'; return; }
      try {
        const r = await consulta(sb.from("productos").select("id,nombre,codigo,stock,precio_venta").eq("activo", true).gt("stock", 0).or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%`).order("nombre").limit(15));
        res.innerHTML = r.data.length ? `<ul class="lista-simple">${r.data.map((p, i) => `<li class="fila-click" data-i="${i}"><span><strong>${esc(p.nombre)}</strong><br><small>Stock ${esc(p.stock)} · ${p.precio_venta == null ? "sin precio" : fmt.dinero(p.precio_venta)}</small></span><button class="btn btn-primary btn-sm">Elegir</button></li>`).join("")}</ul>` : '<div class="vacio">Sin resultados con stock disponible.</div>';
        res.querySelectorAll("[data-i]").forEach((li) => li.addEventListener("click", async () => {
          const p = r.data[li.dataset.i]; cerrar();
          const lotes = (await consulta(sb.from("lotes").select("id,numero,almacen,vencimiento,stock").eq("producto_id", p.id).gt("stock", 0).order("vencimiento", { nullsFirst: false }))).data;
          if (!lotes.length) { aviso("Ese producto no tiene lotes con stock.", "error"); return; }
          formulario({
            titulo: `Agregar — ${p.nombre}`, textoGuardar: "Agregar", grande: false,
            campos: [
              { id: "lote", label: "Lote", type: "select", options: lotes.map((l) => [l.id, `${l.numero} · Almacén ${l.almacen} · quedan ${l.stock}${l.vencimiento ? " · vence " + fmt.fecha(l.vencimiento) : ""}`]), required: true },
              { id: "cantidad", label: "Cantidad", type: "number", step: "1", min: "1", required: true, value: "1", mitad: true },
              { id: "precio_unitario", label: "Precio unitario ($)", type: "number", step: "0.01", min: "0", required: true, value: p.precio_venta ?? "", mitad: true },
            ],
            alGuardar: async (v, cerrarForm) => {
              const l = lotes.find((x) => x.id === v.lote);
              if (Number(v.cantidad) > l.stock) throw new Error(`Ese lote solo tiene ${l.stock} unidades disponibles`);
              alAgregar({ tipo: "producto", id: p.id, nombre: p.nombre, cantidad: Number(v.cantidad), precio_unitario: Number(v.precio_unitario), lote: l.numero, almacen: l.almacen });
              cerrarForm();
            },
          });
        }));
      } catch (ex) { res.innerHTML = `<div class="vacio">${esc(mensajeError(ex))}</div>`; }
    }));
  }

  function agregarServicio(svcs, alAgregar) {
    if (!svcs.length) { aviso("No hay servicios activos en el catálogo.", "error"); return; }
    const { el } = formulario({
      titulo: "Agregar servicio", textoGuardar: "Agregar", grande: false,
      campos: [
        { id: "servicio_id", label: "Servicio", type: "select", options: svcs.map((s) => [s.id, s.descripcion]), required: true },
        { id: "cantidad", label: "Cantidad", type: "number", step: "1", min: "1", required: true, value: "1", mitad: true },
        { id: "precio_unitario", label: "Precio unitario ($)", type: "number", step: "0.01", min: "0", required: true, value: svcs[0].precio ?? "", mitad: true },
      ],
      alGuardar: async (v, cerrar) => {
        const s = svcs.find((x) => x.id === v.servicio_id);
        alAgregar({ tipo: "servicio", id: s.id, nombre: s.descripcion, cantidad: Number(v.cantidad), precio_unitario: Number(v.precio_unitario) });
        cerrar();
      },
    });
    const sel = el.querySelector("#f-servicio_id"), precio = el.querySelector("#f-precio_unitario");
    sel.addEventListener("change", () => { const s = svcs.find((x) => x.id === sel.value); precio.value = s?.precio ?? ""; });
  }

  /* ---------- pestaña: nuevo comprobante ---------- */
  async function mostrarNuevo(cont) {
    const [formasPago, servicios] = await Promise.all([
      consulta(sb.from("formas_pago").select("id,nombre").eq("activo", true).order("orden")).then((r) => r.data),
      consulta(sb.from("catalogo_servicios").select("id,descripcion,precio").eq("activo", true).order("descripcion")).then((r) => r.data),
    ]);
    const carrito = [];
    let compradorClienteId = null, compradorCitaId = null;

    cont.innerHTML = `<div class="comprobantes-layout">
      <div>
        <div style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" id="cp-buscar-cliente" type="button">Buscar cliente registrado</button></div>
        <p class="ayuda" style="margin-bottom:8px">Citas de hoy (opcional, para vincular la venta):</p>
        <div class="comprobantes-cita-list" id="cp-citas"><div class="cargando">Cargando…</div></div>
      </div>
      <div>
        <div class="form-group"><label for="cp-cliente">Cliente</label><input id="cp-cliente" placeholder="Consumidor final" maxlength="120"></div>
        <div class="acciones" style="margin-bottom:12px"><button class="btn btn-primary btn-sm" id="cp-add-prod" type="button">+ Producto</button><button class="btn btn-ghost btn-sm" id="cp-add-serv" type="button">+ Servicio</button></div>
        <div id="cp-carrito"></div>
        <div class="form-group" style="margin-top:14px"><label for="cp-forma">Forma de pago</label><select id="cp-forma"><option value="">— Elegir —</option>${formasPago.map((f) => `<option value="${esc(f.nombre)}">${esc(f.nombre)}</option>`).join("")}</select></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0;padding-top:12px;border-top:1px solid var(--border)"><strong style="font-size:1.1rem">Total</strong><strong style="font-size:1.4rem" id="cp-total">$0.00</strong></div>
        <button class="btn btn-primary" id="cp-emitir" style="width:100%" disabled type="button">Emitir comprobante</button>
      </div>
    </div>`;

    function actualizarBotonEmitir() { $("cp-emitir").disabled = !carrito.length || !$("cp-forma").value; }
    function pintarCarrito() {
      const c = $("cp-carrito");
      c.innerHTML = carrito.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Ítem</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody>${carrito.map((it, i) => `<tr><td>${esc(it.nombre)}${it.tipo === "producto" ? ` <small>· lote ${esc(it.lote)}</small>` : ""}</td><td>${esc(it.cantidad)}</td><td>${fmt.dinero(it.precio_unitario)}</td><td>${fmt.dinero(it.cantidad * it.precio_unitario)}</td><td><button class="btn btn-ghost btn-sm" data-quitar="${i}" type="button">Quitar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Agrega productos o servicios.</div>';
      c.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => { carrito.splice(Number(b.dataset.quitar), 1); pintarCarrito(); }));
      $("cp-total").textContent = fmt.dinero(carrito.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0));
      actualizarBotonEmitir();
    }
    pintarCarrito();

    const r = await consulta(sb.from("citas").select("id,hora,dueno,nombre_mascota,servicio,cliente_id").eq("fecha", fmt.hoy()).neq("estado", "cancelada").order("hora"));
    const citasCont = $("cp-citas");
    citasCont.innerHTML = r.data.length ? r.data.map((c, i) => `<div class="comprobante-cita-item" data-i="${i}"><strong>${fmt.hora(c.hora)} · ${esc(c.dueno)}</strong><br><small>${esc([c.nombre_mascota, c.servicio].filter(Boolean).join(" · "))}</small></div>`).join("") : '<div class="vacio">No hay citas hoy.</div>';
    citasCont.querySelectorAll("[data-i]").forEach((d) => d.addEventListener("click", () => {
      const c = r.data[d.dataset.i];
      citasCont.querySelectorAll(".comprobante-cita-item").forEach((x) => x.classList.toggle("selected", x === d));
      compradorCitaId = c.id; compradorClienteId = c.cliente_id || null;
      $("cp-cliente").value = c.dueno;
    }));

    $("cp-cliente").addEventListener("input", () => {
      compradorClienteId = null; compradorCitaId = null;
      citasCont.querySelectorAll(".comprobante-cita-item.selected").forEach((x) => x.classList.remove("selected"));
    });
    $("cp-buscar-cliente").addEventListener("click", () => MV.buscarCliente((cli) => {
      compradorClienteId = cli.id; compradorCitaId = null;
      citasCont.querySelectorAll(".comprobante-cita-item.selected").forEach((x) => x.classList.remove("selected"));
      $("cp-cliente").value = cli.nombre;
    }));
    $("cp-forma").addEventListener("change", actualizarBotonEmitir);
    $("cp-add-prod").addEventListener("click", () => agregarProducto((item) => { carrito.push(item); pintarCarrito(); }));
    $("cp-add-serv").addEventListener("click", () => agregarServicio(servicios, (item) => { carrito.push(item); pintarCarrito(); }));

    $("cp-emitir").addEventListener("click", async () => {
      const btn = $("cp-emitir"); btn.disabled = true; const txt = btn.textContent; btn.textContent = "Emitiendo…";
      try {
        const res = await consulta(sb.rpc("comprobante_crear", {
          p_cliente_id: compradorClienteId, p_cliente_nombre: $("cp-cliente").value || null,
          p_cita_id: compradorCitaId, p_items: carrito, p_forma_pago: $("cp-forma").value,
        }));
        aviso("Comprobante emitido: " + res.data.numero);
        pintarRecibo(cont, res.data, { textoVolver: "Nuevo comprobante", alVolver: () => activarTab(cont, "nuevo"), mostrarAnular: false });
      } catch (e) { aviso(mensajeError(e), "error"); btn.disabled = false; btn.textContent = txt; }
    });
  }

  /* ---------- pestaña: historial ---------- */
  async function mostrarHistorial(cont) {
    const est = { q: "", desde: "", hasta: "", pagina: 0 };
    cont.innerHTML = `<div class="barra-filtros"><label class="ayuda">Desde <input type="date" id="h-desde"></label><label class="ayuda">Hasta <input type="date" id="h-hasta"></label><input type="search" id="h-q" placeholder="Buscar por número o cliente…"></div><div id="h-tabla"><div class="cargando">Cargando…</div></div>`;
    async function cargar() {
      const t = limpiarBusqueda(est.q), tabla = $("h-tabla");
      let q = sb.from("comprobantes").select("id,numero,cliente_nombre,total,forma_pago,anulado,motivo_anulacion,items,creado_en", { count: "exact" }).order("creado_en", { ascending: false }).range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1);
      if (est.desde) q = q.gte("creado_en", `${est.desde}T00:00:00-05:00`);
      if (est.hasta) q = q.lte("creado_en", `${est.hasta}T23:59:59-05:00`);
      if (t) q = q.or(`numero.ilike.%${t}%,cliente_nombre.ilike.%${t}%`);
      let r; try { r = await consulta(q); } catch (e) { tabla.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
      if (!r.data.length) { tabla.innerHTML = '<div class="vacio">Sin comprobantes con estos filtros.</div>'; return; }
      tabla.innerHTML = `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Número</th><th>Cliente</th><th>Total</th><th>Forma de pago</th><th>Estado</th></tr></thead><tbody>${r.data.map((c, i) => `<tr class="fila-click" data-i="${i}"><td>${fmt.fechaHora(c.creado_en)}</td><td>${esc(c.numero)}</td><td>${esc(c.cliente_nombre || "Consumidor final")}</td><td>${fmt.dinero(c.total)}</td><td>${esc(c.forma_pago)}</td><td>${c.anulado ? '<span class="badge badge-danger">Anulado</span>' : '<span class="badge badge-ok">Vigente</span>'}</td></tr>`).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}`;
      tabla.querySelectorAll("[data-i]").forEach((f) => f.addEventListener("click", () => pintarRecibo(cont, r.data[f.dataset.i], { textoVolver: "← Volver al historial", alVolver: () => activarTab(cont, "historial"), mostrarAnular: true })));
      tabla.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { est.pagina += Number(b.dataset.pag); cargar(); }));
    }
    $("h-desde").addEventListener("change", (e) => { est.desde = e.target.value; est.pagina = 0; cargar(); });
    $("h-hasta").addEventListener("change", (e) => { est.hasta = e.target.value; est.pagina = 0; cargar(); });
    $("h-q").addEventListener("input", debounce((e) => { est.q = e.target.value; est.pagina = 0; cargar(); }));
    cargar();
  }

  function activarTab(cont, id) {
    document.querySelectorAll("#cp-tabs .chip").forEach((x) => x.classList.toggle("activo", x.dataset.t === id));
    (id === "nuevo" ? mostrarNuevo : mostrarHistorial)(cont);
  }

  MV.panel.registrar({
    id: "comprobantes", titulo: "Comprobantes", roles: ["admin", "recepcion"],
    icono: MV.ico("M4 3h16v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V3zM8 8h8M8 12h8M8 16h5"),
    async render(el) {
      el.innerHTML = `<div class="page-head"><div><h1>Comprobantes</h1><p>Emite recibos de venta y consulta el historial. No son facturas del SRI.</p></div></div>
        <div class="panel"><div class="chips" id="cp-tabs" style="margin-bottom:14px"><button class="chip activo" data-t="nuevo" type="button">Nuevo</button><button class="chip" data-t="historial" type="button">Historial</button></div><div id="cp-cont"></div></div>`;
      const cont = $("cp-cont");
      $("cp-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) activarTab(cont, b.dataset.t); });
      mostrarNuevo(cont);
    },
  });
})();
