/* Inventario: productos, lotes, kardex, por vencer y proveedores.
   El stock solo cambia con MV.sb.rpc("registrar_stock") (entrada o salida): nunca se edita a mano. */
(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, abrirModal, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 25;
  const IVA = (v) => (v === true ? "Sí" : v === false ? "No" : "Sin definir");
  const num = (v) => (v === null || v === "" || v === undefined ? null : Number(v));
  const hoyMas = (dias) => { const d = new Date(fmt.hoy() + "T12:00:00"); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
  const diasPara = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(fmt.hoy() + "T12:00:00")) / 86400000);
  const puedeEditar = () => ["admin", "recepcion"].includes(MV.perfil.rol);
  const esAdmin = () => MV.perfil.rol === "admin";
  let proveedoresCache = null;
  async function proveedores(forzar) {
    if (!proveedoresCache || forzar) proveedoresCache = (await consulta(sb.from("proveedores").select("id,nombre,contacto,telefono,email,categoria,activo").order("nombre"))).data;
    return proveedoresCache;
  }
  const numerico = { type: "number", step: "0.01", min: "0" };

  /* ---------- diálogo: elegir producto ---------- */
  function elegirProducto(alElegir) {
    const { el, cerrar } = abrirModal(`<h3>Elegir producto</h3><input type="search" id="ep-q" placeholder="Nombre o código…" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm)" autofocus>
      <div class="resultados-busqueda" id="ep-res"><div class="vacio">Escribe al menos 2 letras.</div></div><div class="modal-actions"><button class="btn btn-ghost" data-no>Cerrar</button></div>`, { grande: true });
    el.querySelector("[data-no]").addEventListener("click", cerrar);
    el.querySelector("#ep-q").addEventListener("input", debounce(async (e) => {
      const t = limpiarBusqueda(e.target.value), res = el.querySelector("#ep-res");
      if (t.length < 2) { res.innerHTML = '<div class="vacio">Escribe al menos 2 letras.</div>'; return; }
      try {
        const r = await consulta(sb.from("productos").select("id,nombre,codigo,stock,activo").eq("activo", true).or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%`).order("nombre").limit(15));
        res.innerHTML = r.data.length ? `<ul class="lista-simple">${r.data.map((p, i) => `<li class="fila-click" data-i="${i}"><span><strong>${esc(p.nombre)}</strong><br><small>Código ${esc(p.codigo || "—")} · Stock ${esc(p.stock)}</small></span><button class="btn btn-primary btn-sm">Elegir</button></li>`).join("")}</ul>` : '<div class="vacio">Sin resultados.</div>';
        res.querySelectorAll("[data-i]").forEach((li) => li.addEventListener("click", () => { cerrar(); alElegir(r.data[li.dataset.i]); }));
      } catch (ex) { res.innerHTML = `<div class="vacio">${esc(mensajeError(ex))}</div>`; }
    }));
  }

  /* ---------- entrada de stock ---------- */
  async function formEntrada(prod, lotes, alTerminar) {
    const provs = (await proveedores()).filter((p) => p.activo);
    const lotesTxt = [...new Set(lotes.map((l) => l.numero))];
    const { el } = formulario({
      titulo: `Entrada de stock — ${prod.nombre}`, textoGuardar: "Registrar entrada",
      intro: "Suma unidades al inventario. Si el lote es nuevo, se crea automáticamente.",
      campos: [
        { id: "lote", label: "N.º de lote", required: true, maxlength: 60, mitad: true, ayuda: lotesTxt.length ? "Lotes existentes: " + lotesTxt.slice(0, 5).join(", ") : "Ej.: 2026-A15" },
        { id: "vencimiento", label: "Vencimiento", type: "date", mitad: true, ayuda: "Solo si el lote es nuevo" },
        { id: "cantidad", label: "Cantidad (unidades)", type: "number", step: "1", min: "1", required: true, mitad: true },
        { id: "almacen", label: "Almacén", type: "select", options: [["1", "Almacén 1"], ["2", "Almacén 2"]], value: "2", mitad: true },
        { id: "precio", label: "Costo por unidad ($)", ...numerico, mitad: true },
        { id: "documento", label: "N.º de factura de compra", maxlength: 100, mitad: true },
        { id: "proveedor", label: "Proveedor", type: "select", options: [["", "— Sin especificar —"], ...provs.map((p) => [p.id, p.nombre])], value: prod.proveedor_id || "" },
        { id: "motivo", label: "Nota (opcional)", maxlength: 300 },
      ],
      alGuardar: async (v, cerrar) => {
        await consulta(sb.rpc("registrar_stock", { p_producto: prod.id, p_tipo: "entrada", p_cantidad: Number(v.cantidad), p_lote: v.lote, p_vencimiento: v.vencimiento, p_almacen: Number(v.almacen), p_motivo: v.motivo, p_documento: v.documento, p_proveedor: v.proveedor || null, p_precio: num(v.precio) }));
        cerrar(); aviso("Entrada registrada"); alTerminar();
      },
    });
    return el;
  }

  /* ---------- salida o ajuste ---------- */
  function formSalida(prod, lotes, alTerminar) {
    const conStock = lotes.filter((l) => l.stock > 0);
    if (!conStock.length) { aviso("Este producto no tiene stock en ningún lote.", "error"); return; }
    formulario({
      titulo: `Salida de stock — ${prod.nombre}`, textoGuardar: "Registrar salida",
      intro: "Resta unidades del lote elegido. Las ventas se descuentan desde los comprobantes; aquí van mermas, usos y ajustes.",
      campos: [
        { id: "lote", label: "Lote", type: "select", options: conStock.map((l) => [l.id, `${l.numero} · Almacén ${l.almacen} · quedan ${l.stock}${l.vencimiento ? " · vence " + fmt.fecha(l.vencimiento) : ""}`]), required: true },
        { id: "cantidad", label: "Cantidad (unidades)", type: "number", step: "1", min: "1", required: true, mitad: true },
        { id: "motivo", label: "Motivo", type: "select", options: ["Uso en consulta", "Merma o daño", "Producto vencido", "Ajuste de inventario", "Otro"].map((m) => [m, m]), mitad: true },
        { id: "nota", label: "Nota (opcional)", maxlength: 200 },
      ],
      alGuardar: async (v, cerrar) => {
        const l = conStock.find((x) => x.id === v.lote);
        await consulta(sb.rpc("registrar_stock", { p_producto: prod.id, p_tipo: "salida", p_cantidad: Number(v.cantidad), p_lote: l.numero, p_vencimiento: null, p_almacen: l.almacen, p_motivo: v.nota ? `${v.motivo}: ${v.nota}` : v.motivo, p_documento: null, p_proveedor: null, p_precio: null }));
        cerrar(); aviso("Salida registrada"); alTerminar();
      },
    });
  }

  /* ---------- producto: crear / editar ---------- */
  async function formProducto(p, alTerminar) {
    const provs = (await proveedores()).filter((x) => x.activo || (p && x.id === p.proveedor_id));
    formulario({
      titulo: p ? `Editar — ${p.nombre}` : "Nuevo producto", textoGuardar: p ? "Guardar cambios" : "Crear producto",
      intro: p ? "El stock no se edita aquí: se mueve con entradas y salidas." : "Después de crearlo, registra su primera entrada para tener stock.",
      campos: [
        { id: "nombre", label: "Nombre", required: true, maxlength: 150, value: p?.nombre },
        { id: "codigo", label: "Código", maxlength: 60, value: p?.codigo, mitad: true },
        { id: "categoria", label: "Categoría", maxlength: 60, value: p?.categoria, mitad: true },
        { id: "precio_venta", label: "Precio de venta ($)", ...numerico, value: p?.precio_venta, mitad: true },
        { id: "precio_compra", label: "Costo ($)", ...numerico, value: p?.precio_compra, mitad: true },
        { id: "precio_fraccion", label: "Precio por fracción ($)", ...numerico, value: p?.precio_fraccion, mitad: true },
        { id: "unidades_por_caja", label: "Unidades por caja", type: "number", step: "1", min: "1", value: p?.unidades_por_caja, mitad: true },
        { id: "stock_min", label: "Stock mínimo (alerta)", type: "number", step: "1", min: "0", value: p?.stock_min ?? 0, mitad: true, ayuda: "Con 0 no avisa. Pon la cantidad bajo la cual quieres la alerta." },
        { id: "grava_iva", label: "¿Grava IVA?", type: "select", options: [["", "Sin definir"], ["true", "Sí"], ["false", "No"]], value: p?.grava_iva === true ? "true" : p?.grava_iva === false ? "false" : "", mitad: true },
        { id: "proveedor_id", label: "Proveedor habitual", type: "select", options: [["", "— Sin especificar —"], ...provs.map((x) => [x.id, x.nombre])], value: p?.proveedor_id || "" },
        { id: "activo", label: "Estado", type: "select", options: [["true", "Activo"], ["false", "Inactivo (no aparece para vender)"]], value: p ? String(p.activo) : "true" },
      ],
      alGuardar: async (v, cerrar) => {
        const d = { nombre: v.nombre, codigo: v.codigo, categoria: v.categoria, precio_venta: num(v.precio_venta), precio_compra: num(v.precio_compra), precio_fraccion: num(v.precio_fraccion),
          unidades_por_caja: num(v.unidades_por_caja), stock_min: num(v.stock_min) ?? 0, grava_iva: v.grava_iva === null ? null : v.grava_iva === "true", proveedor_id: v.proveedor_id || null, activo: v.activo === "true" };
        let id = p?.id;
        if (p) await consulta(sb.from("productos").update(d).eq("id", p.id));
        else id = (await consulta(sb.from("productos").insert(d).select("id").single())).data.id;
        cerrar(); aviso(p ? "Producto actualizado" : "Producto creado"); alTerminar(id);
      },
    });
  }

  /* ---------- detalle de un producto ---------- */
  async function detalle(id, alCambiar) {
    const { el, cerrar } = abrirModal('<div class="cargando">Cargando…</div>', { grande: true });
    async function pintar() {
      let p, lotes, mov;
      try {
        [p, lotes, mov] = await Promise.all([
          consulta(sb.from("productos").select("*, proveedores(nombre)").eq("id", id).single()).then((r) => r.data),
          consulta(sb.from("lotes").select("id,numero,almacen,vencimiento,stock").eq("producto_id", id).order("vencimiento", { nullsFirst: false })).then((r) => r.data),
          consulta(sb.from("kardex").select("fecha,tipo,cantidad,lote,motivo,documento,precio_unitario").eq("producto_id", id).order("fecha", { ascending: false }).limit(15)).then((r) => r.data),
        ]);
      } catch (e) { el.firstElementChild.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
      const d = (t, v) => `<div><dt>${t}</dt><dd>${esc(v ?? "—")}</dd></div>`;
      const conStock = lotes.filter((l) => l.stock !== 0);
      el.firstElementChild.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:start;flex-wrap:wrap"><h3 style="margin:0">${esc(p.nombre)} ${p.activo ? "" : '<span class="badge badge-neutral">Inactivo</span>'} ${p.stock_bajo ? '<span class="badge badge-danger">Stock bajo</span>' : ""}</h3>
        <div class="acciones">${puedeEditar() ? '<button class="btn btn-primary btn-sm" data-ent>+ Entrada</button><button class="btn btn-ghost btn-sm" data-sal>Salida / ajuste</button><button class="btn btn-ghost btn-sm" data-edit>Editar</button>' : ""}</div></div>
        <dl class="rejilla-datos">${d("Stock total", p.stock)}${d("Stock mínimo", p.stock_min || "sin definir")}${d("Código", p.codigo)}${d("Categoría", p.categoria)}${d("Precio de venta", p.precio_venta == null ? null : fmt.dinero(p.precio_venta))}${d("Costo", p.precio_compra == null ? null : fmt.dinero(p.precio_compra))}${d("Precio por fracción", p.precio_fraccion == null ? null : fmt.dinero(p.precio_fraccion))}${d("Unidades por caja", p.unidades_por_caja)}${d("¿Grava IVA?", IVA(p.grava_iva))}${d("Proveedor", p.proveedores?.nombre)}</dl>
        <div class="sub-titulo"><h4>Lotes (${conStock.length} con existencias)</h4></div>
        ${lotes.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Lote</th><th>Almacén</th><th>Vence</th><th>Stock</th></tr></thead><tbody>${lotes.map((l) => { const dp = l.vencimiento ? diasPara(l.vencimiento) : null; return `<tr><td>${esc(l.numero)}</td><td>${esc(l.almacen)}</td><td>${l.vencimiento ? fmt.fecha(l.vencimiento) + (l.stock > 0 && dp <= 0 ? ' <span class="badge badge-danger">Vencido</span>' : l.stock > 0 && dp <= 60 ? ' <span class="badge badge-pending">Por vencer</span>' : "") : "—"}</td><td${l.stock < 0 ? ' style="color:var(--danger)"' : ""}>${esc(l.stock)}</td></tr>`; }).join("")}</tbody></table></div>` : '<div class="vacio">Sin lotes registrados.</div>'}
        <div class="sub-titulo"><h4>Últimos movimientos</h4></div>
        ${mov.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cant.</th><th>Lote</th><th>Detalle</th></tr></thead><tbody>${mov.map((m) => `<tr><td>${fmt.fechaHora(m.fecha)}</td><td>${m.tipo === "entrada" ? '<span class="badge badge-ok">Entrada</span>' : '<span class="badge badge-danger">Salida</span>'}</td><td>${esc(m.cantidad)}</td><td>${esc(m.lote || "—")}</td><td>${esc([m.documento && "Fact. " + m.documento, m.motivo, m.precio_unitario != null && fmt.dinero(m.precio_unitario)].filter(Boolean).join(" · ") || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin movimientos.</div>'}
        <div class="modal-actions"><button class="btn btn-ghost" data-cerrar>Cerrar</button></div>`;
      const q = (s) => el.querySelector(s);
      q("[data-cerrar]").addEventListener("click", () => { cerrar(); alCambiar(); });
      if (puedeEditar()) {
        q("[data-ent]").addEventListener("click", () => formEntrada(p, lotes, pintar));
        q("[data-sal]").addEventListener("click", () => formSalida(p, lotes, pintar));
        q("[data-edit]").addEventListener("click", () => formProducto(p, pintar));
      }
    }
    pintar();
  }

  /* ---------- pestañas ---------- */
  async function pestanaProductos(cont) {
    const est = { q: "", filtro: "activos", pagina: 0 };
    cont.innerHTML = `<div class="barra-filtros"><div class="chips" id="p-chips">${[["activos", "Activos"], ["bajo", "Stock bajo"], ["sin", "Sin stock"], ["inactivos", "Inactivos"]].map(([k, t]) => `<button class="chip ${k === "activos" ? "activo" : ""}" data-f="${k}">${t}</button>`).join("")}</div><input type="search" id="p-q" placeholder="Buscar por nombre o código…"></div><div id="p-tabla"><div class="cargando">Cargando…</div></div>`;
    async function cargar() {
      const t = limpiarBusqueda(est.q), tabla = $("p-tabla");
      let q = sb.from("productos").select("id,nombre,codigo,stock,stock_min,precio_venta,grava_iva,activo,stock_bajo", { count: "exact" }).order("nombre").range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1);
      q = est.filtro === "inactivos" ? q.eq("activo", false) : q.eq("activo", true);
      if (est.filtro === "bajo") q = q.eq("stock_bajo", true);
      if (est.filtro === "sin") q = q.lte("stock", 0);
      if (t) q = q.or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%`);
      let r; try { r = await consulta(q); } catch (e) { tabla.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
      if (!r.data.length) { tabla.innerHTML = `<div class="vacio">${est.filtro === "bajo" ? "No hay productos con stock bajo. (La alerta solo funciona en productos con un stock mínimo definido.)" : "Sin resultados."}</div>`; return; }
      tabla.innerHTML = `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Producto</th><th>Código</th><th>Stock</th><th>Mínimo</th><th>Precio venta</th><th>IVA</th></tr></thead><tbody>${r.data.map((p) => `<tr class="fila-click" data-id="${p.id}"><td><strong>${esc(p.nombre)}</strong> ${p.stock_bajo ? '<span class="badge badge-danger">Bajo</span>' : ""}</td><td>${esc(p.codigo || "—")}</td><td${p.stock < 0 ? ' style="color:var(--danger)"' : ""}>${esc(p.stock)}</td><td>${p.stock_min || "—"}</td><td>${p.precio_venta == null ? "—" : fmt.dinero(p.precio_venta)}</td><td>${IVA(p.grava_iva)}</td></tr>`).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}`;
      tabla.querySelectorAll("[data-id]").forEach((f) => f.addEventListener("click", () => detalle(f.dataset.id, cargar)));
      tabla.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { est.pagina += Number(b.dataset.pag); cargar(); }));
    }
    $("p-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; est.filtro = b.dataset.f; est.pagina = 0; document.querySelectorAll("#p-chips .chip").forEach((x) => x.classList.toggle("activo", x === b)); cargar(); });
    $("p-q").addEventListener("input", debounce((e) => { est.q = e.target.value; est.pagina = 0; cargar(); }));
    cargar();
  }

  async function pestanaVencer(cont) {
    cont.innerHTML = '<div class="cargando">Cargando…</div>';
    const r = await consulta(sb.from("lotes").select("id,numero,almacen,vencimiento,stock,productos(id,nombre)").gt("stock", 0).not("vencimiento", "is", null).lte("vencimiento", hoyMas(60)).order("vencimiento").limit(300));
    cont.innerHTML = r.data.length ? `<p class="ayuda" style="margin-bottom:10px">Lotes con existencias que ya vencieron o vencen en los próximos 60 días.</p><div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Producto</th><th>Lote</th><th>Almacén</th><th>Vence</th><th>Stock</th><th></th></tr></thead><tbody>${r.data.map((l) => { const d = diasPara(l.vencimiento); return `<tr class="fila-click" data-id="${l.productos?.id}"><td><strong>${esc(l.productos?.nombre)}</strong></td><td>${esc(l.numero)}</td><td>${esc(l.almacen)}</td><td>${fmt.fecha(l.vencimiento)}</td><td>${esc(l.stock)}</td><td>${d <= 0 ? '<span class="badge badge-danger">Vencido</span>' : d <= 30 ? `<span class="badge badge-danger">${d} días</span>` : `<span class="badge badge-pending">${d} días</span>`}</td></tr>`; }).join("")}</tbody></table></div>` : '<div class="vacio">No hay lotes vencidos ni por vencer en 60 días.</div>';
    cont.querySelectorAll("[data-id]").forEach((f) => f.addEventListener("click", () => detalle(f.dataset.id, () => pestanaVencer(cont))));
  }

  async function pestanaKardex(cont) {
    const est = { tipo: "", desde: "", hasta: "", q: "", pagina: 0 };
    cont.innerHTML = `<div class="barra-filtros"><select id="k-tipo"><option value="">Entradas y salidas</option><option value="entrada">Solo entradas</option><option value="salida">Solo salidas</option></select><label class="ayuda">Desde <input type="date" id="k-desde"></label><label class="ayuda">Hasta <input type="date" id="k-hasta"></label><input type="search" id="k-q" placeholder="Buscar por producto…"></div><div id="k-tabla"><div class="cargando">Cargando…</div></div>`;
    async function cargar() {
      const t = limpiarBusqueda(est.q), tabla = $("k-tabla");
      let q = sb.from("kardex").select("id,fecha,tipo,cantidad,lote,motivo,documento,precio_unitario,origen,productos!inner(nombre)", { count: "exact" }).order("fecha", { ascending: false }).order("id").range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1);
      if (est.tipo) q = q.eq("tipo", est.tipo);
      if (est.desde) q = q.gte("fecha", `${est.desde}T00:00:00-05:00`);
      if (est.hasta) q = q.lte("fecha", `${est.hasta}T23:59:59-05:00`);
      if (t) q = q.ilike("productos.nombre", `%${t}%`);
      let r; try { r = await consulta(q); } catch (e) { tabla.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
      if (!r.data.length) { tabla.innerHTML = '<div class="vacio">Sin movimientos con estos filtros.</div>'; return; }
      tabla.innerHTML = `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Lote</th><th>Detalle</th></tr></thead><tbody>${r.data.map((m) => `<tr><td style="white-space:nowrap">${fmt.fechaHora(m.fecha)}</td><td>${esc(m.productos?.nombre)}</td><td>${m.tipo === "entrada" ? '<span class="badge badge-ok">Entrada</span>' : '<span class="badge badge-danger">Salida</span>'}</td><td>${esc(m.cantidad)}</td><td>${esc(m.lote || "—")}</td><td>${esc([m.documento && "Fact. " + m.documento, m.motivo, m.origen && m.origen.startsWith("migracion") ? "(sistema anterior)" : null].filter(Boolean).join(" · ") || "—")}</td></tr>`).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}`;
      tabla.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { est.pagina += Number(b.dataset.pag); cargar(); }));
    }
    const on = (id, k) => $(id).addEventListener("change", (e) => { est[k] = e.target.value; est.pagina = 0; cargar(); });
    on("k-tipo", "tipo"); on("k-desde", "desde"); on("k-hasta", "hasta");
    $("k-q").addEventListener("input", debounce((e) => { est.q = e.target.value; est.pagina = 0; cargar(); }));
    cargar();
  }

  async function pestanaProveedores(cont) {
    async function pintar() {
      const lista = await proveedores(true);
      cont.innerHTML = `${esAdmin() ? '<div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" id="pv-nuevo">+ Nuevo proveedor</button></div>' : '<p class="ayuda" style="margin-bottom:10px">Solo el administrador puede editar proveedores.</p>'}
        ${lista.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th></th></tr></thead><tbody>${lista.map((p) => `<tr><td><strong>${esc(p.nombre)}</strong> ${p.activo ? "" : '<span class="badge badge-neutral">Inactivo</span>'}</td><td>${esc(p.contacto || "—")}</td><td>${esc(p.telefono || "—")}</td><td>${esc(p.email || "—")}</td><td>${esAdmin() ? `<button class="btn btn-ghost btn-sm" data-id="${p.id}">Editar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin proveedores.</div>'}`;
      const form = (p) => formulario({ titulo: p ? `Editar — ${p.nombre}` : "Nuevo proveedor", campos: [
        { id: "nombre", label: "Nombre de la empresa", required: true, maxlength: 150, value: p?.nombre },
        { id: "contacto", label: "Persona de contacto", maxlength: 100, value: p?.contacto, mitad: true },
        { id: "telefono", label: "Teléfono", maxlength: 30, value: p?.telefono, mitad: true },
        { id: "email", label: "Correo", type: "email", maxlength: 120, value: p?.email, mitad: true },
        { id: "categoria", label: "Categoría", maxlength: 60, value: p?.categoria, mitad: true },
        { id: "activo", label: "Estado", type: "select", options: [["true", "Activo"], ["false", "Inactivo"]], value: p ? String(p.activo) : "true" } ],
        alGuardar: async (v, cerrar) => { const d = { ...v, activo: v.activo === "true" }; if (p) await consulta(sb.from("proveedores").update(d).eq("id", p.id)); else await consulta(sb.from("proveedores").insert(d)); cerrar(); aviso("Proveedor guardado"); pintar(); } });
      if (esAdmin()) {
        $("pv-nuevo")?.addEventListener("click", () => form(null));
        cont.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => form(lista.find((x) => x.id === b.dataset.id))));
      }
    }
    pintar();
  }

  MV.panel.registrar({
    id: "inventario", titulo: "Inventario", roles: ["admin", "veterinario", "recepcion"],
    icono: MV.ico("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"),
    async render(el) {
      el.innerHTML = `<div class="page-head"><div><h1>Inventario</h1><p>Productos, lotes y movimientos de stock. El stock solo cambia con entradas y salidas.</p></div>
        <div class="acciones">${puedeEditar() ? '<button class="btn btn-primary btn-sm" id="i-entrada">+ Registrar entrada</button><button class="btn btn-ghost btn-sm" id="i-nuevo">+ Nuevo producto</button>' : ""}</div></div>
        <div class="panel"><div class="chips" id="i-tabs" style="margin-bottom:14px">${[["productos", "Productos"], ["vencer", "Por vencer"], ["kardex", "Kardex"], ["proveedores", "Proveedores"]].map(([k, t]) => `<button class="chip ${k === "productos" ? "activo" : ""}" data-t="${k}">${t}</button>`).join("")}</div><div id="i-cont"></div></div>`;
      const cont = $("i-cont");
      const mostrar = async (t) => {
        document.querySelectorAll("#i-tabs .chip").forEach((x) => x.classList.toggle("activo", x.dataset.t === t));
        try { await ({ productos: pestanaProductos, vencer: pestanaVencer, kardex: pestanaKardex, proveedores: pestanaProveedores })[t](cont); }
        catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; }
      };
      $("i-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) mostrar(b.dataset.t); });
      if (puedeEditar()) {
        $("i-nuevo").addEventListener("click", () => formProducto(null, (id) => { detalle(id, () => mostrar("productos")); }));
        $("i-entrada").addEventListener("click", () => elegirProducto(async (p) => {
          const full = (await consulta(sb.from("productos").select("*").eq("id", p.id).single())).data;
          const lotes = (await consulta(sb.from("lotes").select("id,numero,almacen,vencimiento,stock").eq("producto_id", p.id))).data;
          formEntrada(full, lotes, () => mostrar("productos"));
        }));
      }
      mostrar("productos");
    },
  });
})();
