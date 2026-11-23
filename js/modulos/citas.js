(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 25;
  const SERVICIOS = ["Consulta general", "Vacunación", "Desparasitación", "Control", "Cirugía", "Hospitalización", "Peluquería y spa", "Profilaxis dental", "Ecografía", "Laboratorio", "Emergencia", "Otro"];
  const horas = []; for (let h = 7; h <= 19; h++) for (const m of ["00", "30"]) horas.push(`${String(h).padStart(2, "0")}:${m}`);
  MV.SERVICIOS_CITA = SERVICIOS; MV.HORAS_CITA = horas;

  MV.panel.registrar({
    id: "citas", titulo: "Agenda de citas", roles: ["admin", "veterinario", "recepcion"],
    icono: MV.ico("M3 4h18v18H3zM16 2v4M8 2v4M3 10h18"),
    async render(el) {
      const est = { estado: "todas", desde: fmt.hoy(), hasta: "", q: "", pagina: 0 };
      const vets = (await consulta(sb.from("veterinarios").select("id,nombre").eq("activo", true).order("nombre"))).data;
      el.innerHTML = `<div class="page-head"><div><h1>Agenda de citas</h1><p>Citas de la clínica y solicitudes que llegan desde la web.</p></div>
        <button class="btn btn-primary btn-sm" id="c-nueva">+ Nueva cita</button></div>
        <div class="panel">
          <div class="barra-filtros">
            <div class="chips" id="c-chips">${["todas", "pendiente", "confirmada", "completada", "cancelada"].map((e) => `<button class="chip ${e === "todas" ? "activo" : ""}" data-e="${e}">${e[0].toUpperCase() + e.slice(1)}</button>`).join("")}</div>
            <label class="ayuda">Desde <input type="date" id="c-desde" value="${est.desde}"></label>
            <label class="ayuda">Hasta <input type="date" id="c-hasta"></label>
            <input type="search" id="c-q" placeholder="Buscar dueño, mascota o teléfono…">
          </div>
          <div id="c-tabla"><div class="cargando">Cargando…</div></div></div>`;

      async function cargar() {
        const cont = $("c-tabla");
        let q = sb.from("citas").select("id,fecha,hora,dueno,telefono,nombre_mascota,tipo_mascota,raza_mascota,servicio,estado,origen,notas,veterinario_id,cliente_id,veterinarios(nombre)", { count: "exact" })
          .order("fecha").order("hora").range(est.pagina * POR_PAGINA, (est.pagina + 1) * POR_PAGINA - 1);
        if (est.estado !== "todas") q = q.eq("estado", est.estado);
        if (est.desde) q = q.gte("fecha", est.desde);
        if (est.hasta) q = q.lte("fecha", est.hasta);
        const t = limpiarBusqueda(est.q);
        if (t) q = q.or(`dueno.ilike.%${t}%,nombre_mascota.ilike.%${t}%,telefono.ilike.%${t}%`);
        let r; try { r = await consulta(q); } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }
        if (!r.data.length) { cont.innerHTML = '<div class="vacio">No hay citas con estos filtros.</div>'; return; }
        const acciones = (c) => {
          const b = (a, txt, cls = "btn-ghost") => `<button class="btn ${cls} btn-sm" data-a="${a}" data-id="${c.id}">${txt}</button>`;
          const l = [];
          if (c.estado === "pendiente") l.push(b("confirmada", "Confirmar", "btn-primary"));
          if (c.estado === "confirmada") l.push(b("completada", "Completar", "btn-primary"));
          if (c.estado === "cancelada") l.push(b("pendiente", "Reactivar"));
          if (c.estado === "pendiente" || c.estado === "confirmada") l.push(b("cancelada", "Cancelar", "btn-danger"));
          l.push(b("editar", "Editar"));
          return `<div class="acciones">${l.join("")}</div>`;
        };
        cont.innerHTML = `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Hora</th><th>Dueño</th><th>Mascota</th><th>Servicio</th><th>Veterinario</th><th>Estado</th><th></th></tr></thead><tbody>
          ${r.data.map((c) => `<tr><td>${fmt.fecha(c.fecha)}</td><td>${fmt.hora(c.hora)}</td>
            <td><strong>${esc(c.dueno)}</strong><br><small>${esc(c.telefono || "sin teléfono")}</small></td>
            <td>${esc(c.nombre_mascota || "—")}<br><small>${esc([c.tipo_mascota, c.raza_mascota].filter(Boolean).join(" · "))}</small></td>
            <td>${esc(c.servicio)}${c.notas ? `<br><small>${esc(c.notas)}</small>` : ""}</td>
            <td>${esc(c.veterinarios ? c.veterinarios.nombre : "—")}</td>
            <td>${MV.estadoCita(c.estado)}${c.origen === "web" ? '<br><span class="badge badge-neutral">Web</span>' : ""}</td>
            <td>${acciones(c)}</td></tr>`).join("")}</tbody></table></div>${paginador(est.pagina, POR_PAGINA, r.count)}`;
        const porId = Object.fromEntries(r.data.map((c) => [c.id, c]));
        cont.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", async () => {
          const c = porId[b.dataset.id], a = b.dataset.a;
          if (a === "editar") return abrirForm(c);
          if (a === "cancelada" && !(await confirmar(`¿Cancelar la cita de ${c.dueno}${c.nombre_mascota ? " (" + c.nombre_mascota + ")" : ""}?`, "Cancelar cita"))) return;
          try { await consulta(sb.from("citas").update({ estado: a }).eq("id", c.id)); aviso("Cita actualizada"); cargar(); }
          catch (e) { aviso(mensajeError(e), "error"); }
        }));
        cont.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { est.pagina += Number(b.dataset.pag); cargar(); }));
      }

      function abrirForm(c) {
        const opc = (arr) => arr.map((x) => [x, x]);
        const { el: m } = formulario({
          titulo: c ? "Editar cita" : "Nueva cita", textoGuardar: c ? "Guardar cambios" : "Agendar",
          campos: [
            { id: "dueno", label: "Dueño", required: true, maxlength: 120, value: c?.dueno, mitad: true },
            { id: "telefono", label: "Teléfono", type: "tel", required: true, maxlength: 20, value: c?.telefono, mitad: true, patron: /^[0-9+ ()-]{7,20}$/, patronMensaje: "El teléfono solo puede tener números (7 a 20 dígitos)" },
            { id: "nombre_mascota", label: "Mascota", required: true, maxlength: 80, value: c?.nombre_mascota, mitad: true },
            { id: "tipo_mascota", label: "Tipo", type: "select", options: opc(["Perro", "Gato", "Otro"]), value: c?.tipo_mascota || "Perro", mitad: true },
            { id: "raza_mascota", label: "Raza (opcional)", maxlength: 80, value: c?.raza_mascota },
            { id: "fecha", label: "Fecha", type: "date", required: true, value: c?.fecha, min: c ? "" : fmt.hoy(), mitad: true },
            { id: "hora", label: "Hora", type: "select", options: opc(horas), value: c ? fmt.hora(c.hora) : "09:00", mitad: true },
            { id: "servicio", label: "Servicio", type: "select", options: opc(SERVICIOS), value: c?.servicio || "Consulta general", mitad: true },
            { id: "veterinario_id", label: "Veterinario", type: "select", options: [["", "Sin asignar"], ...vets.map((v) => [v.id, v.nombre])], value: c?.veterinario_id || "", mitad: true },
            { id: "notas", label: "Notas", type: "textarea", maxlength: 1000, value: c?.notas },
          ],
          alGuardar: async (v, cerrar) => {
            const datos = { ...v, veterinario_id: v.veterinario_id || null, tipo_mascota: v.tipo_mascota };
            if (c) await consulta(sb.from("citas").update(datos).eq("id", c.id));
            else await consulta(sb.from("citas").insert({ ...datos, origen: "panel", estado: "confirmada", cliente_id: m.dataset.clienteId || null }));
            cerrar(); aviso(c ? "Cita actualizada" : "Cita agendada"); cargar();
          },
        });
        if (!c) {
          const barra = document.createElement("div");
          barra.innerHTML = '<button type="button" class="btn btn-ghost btn-sm">🔎 Buscar cliente registrado</button><small class="ayuda">Llena los datos del dueño y la mascota automáticamente.</small>';
          m.querySelector("form").prepend(barra);
          barra.querySelector("button").addEventListener("click", () => MV.buscarCliente((cli, masc) => {
            m.dataset.clienteId = cli.id;
            m.querySelector("#f-dueno").value = cli.nombre; m.querySelector("#f-telefono").value = cli.telefono || "";
            if (masc.length === 1) { m.querySelector("#f-nombre_mascota").value = masc[0].nombre; m.querySelector("#f-tipo_mascota").value = ["Perro", "Gato"].includes(masc[0].especie) ? masc[0].especie : "Otro"; }
            else if (masc.length > 1) aviso("Mascotas de este cliente: " + masc.map((x) => x.nombre).join(", "));
          }));
        }
      }

      $("c-nueva").addEventListener("click", () => abrirForm(null));
      $("c-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-e]"); if (!b) return; est.estado = b.dataset.e; est.pagina = 0; document.querySelectorAll("#c-chips .chip").forEach((x) => x.classList.toggle("activo", x === b)); cargar(); });
      $("c-desde").addEventListener("change", (e) => { est.desde = e.target.value; est.pagina = 0; cargar(); });
      $("c-hasta").addEventListener("change", (e) => { est.hasta = e.target.value; est.pagina = 0; cargar(); });
      $("c-q").addEventListener("input", debounce((e) => { est.q = e.target.value; est.pagina = 0; cargar(); }));
      cargar();
    },
  });
})();
