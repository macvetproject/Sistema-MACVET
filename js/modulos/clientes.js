(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, abrirModal, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 25;
  const TEL = /^[0-9+ ()-]{7,20}$/;
  let razasCache = null;
  async function razas() {
    if (!razasCache) razasCache = (await consulta(sb.from("razas").select("id,nombre,especie").eq("activo", true).order("nombre"))).data;
    return razasCache;
  }
  const edad = (iso) => {
    if (!iso) return "—";
    const n = new Date(iso), h = new Date(); let a = h.getFullYear() - n.getFullYear(), m = h.getMonth() - n.getMonth();
    if (m < 0) { a--; m += 12; }
    return a > 0 ? `${a} año${a > 1 ? "s" : ""}${m ? ` ${m} m` : ""}` : `${Math.max(m, 0)} mes${m === 1 ? "" : "es"}`;
  };

  /* Diálogo reutilizable: buscar un cliente y devolver (cliente, sus mascotas) */
  MV.buscarCliente = function (alElegir) {
    const { el, cerrar } = abrirModal(`<h3>Buscar cliente</h3><input type="search" id="bc-q" placeholder="Nombre, cédula o teléfono…" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm)" autofocus>
      <div class="resultados-busqueda" id="bc-res"><div class="vacio">Escribe al menos 3 letras.</div></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-no>Cerrar</button></div>`, { grande: true });
    el.querySelector("[data-no]").addEventListener("click", cerrar);
    const res = el.querySelector("#bc-res");
    el.querySelector("#bc-q").addEventListener("input", debounce(async (e) => {
      const t = limpiarBusqueda(e.target.value);
      if (t.length < 3) { res.innerHTML = '<div class="vacio">Escribe al menos 3 letras.</div>'; return; }
      try {
        const r = await consulta(sb.from("clientes").select("id,nombre,telefono,cedula,mascotas(id,nombre,especie)").eq("activo", true)
          .or(`nombre.ilike.%${t}%,cedula.ilike.%${t}%,telefono.ilike.%${t}%`).order("nombre").limit(15));
        res.innerHTML = r.data.length ? `<ul class="lista-simple">${r.data.map((c, i) => `<li class="fila-click" data-i="${i}"><span><strong>${esc(c.nombre)}</strong><br><small>${esc(c.telefono || "sin teléfono")} · ${c.mascotas.length ? esc(c.mascotas.map((m) => m.nombre).join(", ")) : "sin mascotas"}</small></span><button class="btn btn-primary btn-sm">Elegir</button></li>`).join("")}</ul>` : '<div class="vacio">Sin resultados.</div>';
        res.querySelectorAll("[data-i]").forEach((li) => li.addEventListener("click", () => { const c = r.data[li.dataset.i]; cerrar(); alElegir(c, c.mascotas); }));
      } catch (ex) { res.innerHTML = `<div class="vacio">${esc(mensajeError(ex))}</div>`; }
    }));
  };

  async function formCliente(c, alTerminar) {
    formulario({
      titulo: c ? "Editar cliente" : "Nuevo cliente", textoGuardar: c ? "Guardar cambios" : "Crear cliente",
      campos: [
        { id: "nombre", label: "Nombre completo", required: true, maxlength: 120, value: c?.nombre },
        { id: "cedula", label: "Cédula / RUC", maxlength: 20, value: c?.cedula, mitad: true },
        { id: "email", label: "Correo", type: "email", maxlength: 120, value: c?.email, mitad: true },
        { id: "telefono", label: "Teléfono (celular)", type: "tel", maxlength: 20, value: c?.telefono, mitad: true, patron: TEL, patronMensaje: "El teléfono solo puede tener números (7 a 20 dígitos)", ayuda: "Se usa para los recordatorios de WhatsApp." },
        { id: "telefono_alterno", label: "Otro teléfono", type: "tel", maxlength: 20, value: c?.telefono_alterno, mitad: true, patron: TEL, patronMensaje: "El otro teléfono solo puede tener números" },
        { id: "direccion", label: "Dirección", maxlength: 200, value: c?.direccion },
        { id: "notas", label: "Notas", type: "textarea", maxlength: 1000, value: c?.notas },
      ],
      alGuardar: async (v, cerrar) => {
        let id = c?.id;
        if (c) await consulta(sb.from("clientes").update(v).eq("id", c.id));
        else id = (await consulta(sb.from("clientes").insert(v).select("id").single())).data.id;
        cerrar(); aviso(c ? "Cliente actualizado" : "Cliente creado"); alTerminar(id);
      },
    });
  }

  async function formMascota(clienteId, m, alTerminar) {
    const lista = await razas();
    const opcRaza = (esp, sel) => [["", "— Sin especificar —"], ...lista.filter((r) => r.especie === esp).map((r) => [r.id, r.nombre])].map(([v, t]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t)}</option>`).join("");
    const { el } = formulario({
      titulo: m ? `Editar a ${m.nombre}` : "Nueva mascota", textoGuardar: m ? "Guardar cambios" : "Agregar mascota",
      campos: [
        { id: "nombre", label: "Nombre", required: true, maxlength: 80, value: m?.nombre, mitad: true },
        { id: "especie", label: "Especie", type: "select", options: [["Perro", "Perro"], ["Gato", "Gato"], ["Otro", "Otro"]], value: m?.especie || "Perro", mitad: true },
        { id: "raza_id", label: "Raza", type: "select", options: [["", "—"]], value: "" },
        { id: "color", label: "Color", maxlength: 60, value: m?.color, mitad: true },
        { id: "genero", label: "Sexo", type: "select", options: [["", "—"], ["Macho", "Macho"], ["Hembra", "Hembra"]], value: m?.genero || "", mitad: true },
        { id: "fecha_nacimiento", label: "Fecha de nacimiento", type: "date", value: m?.fecha_nacimiento },
        { id: "notas", label: "Notas", type: "textarea", maxlength: 1000, value: m?.notas },
      ],
      alGuardar: async (v, cerrar) => {
        const datos = { ...v, cliente_id: clienteId };
        if (m) await consulta(sb.from("mascotas").update(datos).eq("id", m.id)); else await consulta(sb.from("mascotas").insert(datos));
        cerrar(); aviso(m ? "Mascota actualizada" : "Mascota agregada"); alTerminar();
      },
    });
    const esp = el.querySelector("#f-especie"), raza = el.querySelector("#f-raza_id");
    const pintar = (sel) => { raza.innerHTML = opcRaza(esp.value, sel); };
    pintar(m?.raza_id || ""); esp.addEventListener("change", () => pintar(""));
  }

  async function detalle(clienteId, alCambiar) {
    const { el, cerrar } = abrirModal('<div class="cargando">Cargando…</div>', { grande: true });
    async function pintar() {
      let c, masc, citas;
      try {
        [c, masc, citas] = await Promise.all([
          consulta(sb.from("clientes").select("*").eq("id", clienteId).single()).then((r) => r.data),
          consulta(sb.from("mascotas").select("id,nombre,especie,raza_id,color,genero,fecha_nacimiento,notas,activo,razas(nombre)").eq("cliente_id", clienteId).order("nombre")).then((r) => r.data),
          consulta(sb.from("citas").select("id,fecha,hora,servicio,estado,nombre_mascota").eq("cliente_id", clienteId).order("fecha", { ascending: false }).limit(8)).then((r) => r.data),
        ]);
      } catch (e) { el.firstElementChild.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
      const dato = (t, v) => `<div><dt>${t}</dt><dd>${esc(v || "—")}</dd></div>`;
      el.firstElementChild.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3 style="margin:0">${esc(c.nombre)} ${c.activo ? "" : '<span class="badge badge-neutral">Inactivo</span>'}</h3><button class="btn btn-ghost btn-sm" data-editar>Editar datos</button></div>
        <dl class="rejilla-datos">${dato("Cédula / RUC", c.cedula)}${dato("Teléfono", c.telefono)}${dato("Otro teléfono", c.telefono_alterno)}${dato("Correo", c.email)}${dato("Dirección", c.direccion)}${dato("Cliente desde", c.creado_en ? fmt.fecha(c.creado_en) : "")}</dl>
        ${c.notas ? `<p class="aviso-caja">${esc(c.notas)}</p>` : ""}
        <div class="sub-titulo"><h4>Mascotas (${masc.length})</h4><button class="btn btn-primary btn-sm" data-nueva>+ Agregar mascota</button></div>
        ${masc.length ? `<ul class="lista-simple">${masc.map((m) => `<li><span><strong>${esc(m.nombre)}</strong> ${m.activo ? "" : '<span class="badge badge-neutral">Inactiva</span>'}<br><small>${esc([m.especie, m.razas?.nombre, m.genero, m.color].filter(Boolean).join(" · "))} · ${esc(edad(m.fecha_nacimiento))}</small></span><button class="btn btn-ghost btn-sm" data-masc="${m.id}">Editar</button></li>`).join("")}</ul>` : '<div class="vacio">Sin mascotas registradas.</div>'}
        <div class="sub-titulo"><h4>Últimas citas</h4></div>
        ${citas.length ? `<ul class="lista-simple">${citas.map((x) => `<li><span>${fmt.fecha(x.fecha)} ${fmt.hora(x.hora)} · ${esc(x.servicio)}${x.nombre_mascota ? " · " + esc(x.nombre_mascota) : ""}</span>${MV.estadoCita(x.estado)}</li>`).join("")}</ul>` : '<div class="vacio">Sin citas registradas.</div>'}
        <div class="modal-actions"><button class="btn btn-ghost" data-cerrar>Cerrar</button></div>`;
      el.querySelector("[data-cerrar]").addEventListener("click", () => { cerrar(); alCambiar(); });
      el.querySelector("[data-editar]").addEventListener("click", () => formCliente(c, pintar));
      el.querySelector("[data-nueva]").addEventListener("click", () => formMascota(clienteId, null, pintar));
      el.querySelectorAll("[data-masc]").forEach((b) => b.addEventListener("click", () => formMascota(clienteId, masc.find((x) => x.id === b.dataset.masc), pintar)));
    }
    pintar();
  }

  MV.panel.registrar({
    id: "clientes", titulo: "Clientes y mascotas", roles: ["admin", "veterinario", "recepcion"],
    icono: MV.ico("M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"),
    async render(el) {
      const est = { q: "", modo: "clientes", pagina: 0 };
      el.innerHTML = `<div class="page-head"><div><h1>Clientes y mascotas</h1><p>Busca por nombre, cédula, teléfono o nombre de la mascota.</p></div><button class="btn btn-primary btn-sm" id="cl-nuevo">+ Nuevo cliente</button></div>
        <div class="panel"><div class="barra-filtros">
          <select id="cl-modo"><option value="clientes">Buscar clientes</option><option value="mascotas">Buscar mascotas</option></select>
          <input type="search" id="cl-q" placeholder="Escribe para buscar…"></div>
          <div id="cl-tabla"><div class="cargando">Cargando…</div></div></div>`;
      async function cargar() {
        const cont = $("cl-tabla"), t = limpiarBusqueda(est.q);
        try {
          if (est.modo === "mascotas") {
            if (t.length < 2) { cont.innerHTML = '<div class="vacio">Escribe al menos 2 letras del nombre de la mascota.</div>'; return; }
            const r = await consulta(sb.from("mascotas").select("id,nombre,especie,genero,cliente_id,razas(nombre),clientes(nombre,telefono)", { count: "exact" }).ilike("nombre", `%${t}%`).order("nombre").range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1));
            cont.innerHTML = r.data.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Mascota</th><th>Especie / raza</th><th>Dueño</th><th>Teléfono</th></tr></thead><tbody>${r.data.map((m) => `<tr class="fila-click" data-c="${m.cliente_id}"><td><strong>${esc(m.nombre)}</strong></td><td>${esc([m.especie, m.razas?.nombre, m.genero].filter(Boolean).join(" · "))}</td><td>${esc(m.clientes?.nombre)}</td><td>${esc(m.clientes?.telefono || "—")}</td></tr>`).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}` : '<div class="vacio">Sin resultados.</div>';
          } else {
            let q = sb.from("clientes").select("id,nombre,cedula,telefono,email,activo,mascotas(count)", { count: "exact" }).order("nombre").range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1);
            if (t) q = q.or(`nombre.ilike.%${t}%,cedula.ilike.%${t}%,telefono.ilike.%${t}%,email.ilike.%${t}%`);
            const r = await consulta(q);
            cont.innerHTML = r.data.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Correo</th><th>Mascotas</th></tr></thead><tbody>${r.data.map((c) => `<tr class="fila-click" data-c="${c.id}"><td><strong>${esc(c.nombre)}</strong> ${c.activo ? "" : '<span class="badge badge-neutral">Inactivo</span>'}</td><td>${esc(c.cedula || "—")}</td><td>${esc(c.telefono || "—")}</td><td>${esc(c.email || "—")}</td><td>${c.mascotas?.[0]?.count ?? 0}</td></tr>`).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}` : '<div class="vacio">Sin resultados.</div>';
          }
        } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
        cont.querySelectorAll("[data-c]").forEach((f) => f.addEventListener("click", () => detalle(f.dataset.c, cargar)));
        cont.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { est.pagina += Number(b.dataset.pag); cargar(); }));
      }
      $("cl-q").addEventListener("input", debounce((e) => { est.q = e.target.value; est.pagina = 0; cargar(); }));
      $("cl-modo").addEventListener("change", (e) => { est.modo = e.target.value; est.pagina = 0; cargar(); });
      $("cl-nuevo").addEventListener("click", () => formCliente(null, (id) => detalle(id, cargar)));
      cargar();
    },
  });
})();
