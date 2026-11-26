(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, abrirModal, paginador, mensajeError } = MV;
  const POR_PAGINA = 25;
  const TIPOS = { confirmacion: "Confirmación", recordatorio_cita: "Recordatorio cita", refuerzo_vacuna: "Refuerzo vacuna", receta: "Receta" };

  MV.panel.registrar({
    id: "whatsapp", titulo: "WhatsApp", roles: ["admin", "recepcion"],
    icono: MV.ico("M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"),
    async render(el) {
      let filtroEstado = "todos", filtroPagina = 0;

      async function pintar() {
        el.innerHTML = '<div class="cargando">Cargando…</div>';
        try {
          let q = sb.from("mensajes_whatsapp").select("*", { count: "exact" }).order("created_at", { ascending: false });
          if (filtroEstado !== "todos") q = q.eq("estado", filtroEstado);
          q = q.range(filtroPagina * POR_PAGINA, (filtroPagina + 1) * POR_PAGINA - 1);
          const { data, count } = await consulta(q);

          const pendientes = data.filter((m) => m.estado === "pendiente").length;
          el.innerHTML = `<div class="page-head"><div><h1>Cola de WhatsApp</h1><p>Mensajes programados y enviados. <strong>Envío automático pendiente de configurar API de Meta.</strong></p></div></div>
            <div class="panel">
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
                <div class="stat-mini"><strong>${count ?? 0}</strong><small>Total</small></div>
                <div class="stat-mini"><strong>${pendientes}</strong><small>Pendientes (esta página)</small></div>
              </div>
              <div class="chips" id="wa-tabs">
                ${["todos", "pendiente", "enviado", "error", "cancelado"].map((e) => `<button class="chip ${e === filtroEstado ? "activo" : ""}" data-f="${e}">${e[0].toUpperCase() + e.slice(1)}</button>`).join("")}
              </div>
              <div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha prog.</th><th>Tipo</th><th>Teléfono</th><th>Texto</th><th>Estado</th><th></th></tr></thead>
              <tbody>${data.length ? data.map((m) => `<tr>
                <td>${m.programado_para ? fmt.fechaHora(m.programado_para) : "—"}</td>
                <td><span class="badge badge-info">${esc(TIPOS[m.tipo] || m.tipo)}</span></td>
                <td>${esc(m.telefono)}</td>
                <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.texto || "").slice(0, 100))}</td>
                <td><span class="badge ${m.estado === "enviado" ? "badge-ok" : m.estado === "error" ? "badge-cancel" : m.estado === "cancelado" ? "badge-cancel" : "badge-pending"}">${esc(m.estado)}</span></td>
                <td><button class="btn btn-ghost btn-sm" data-wid="${m.id}">Ver</button></td>
              </tr>`).join("") : '<tr><td colspan="6" class="vacio">Sin mensajes.</td></tr>'}</tbody></table></div>
              ${paginador(filtroPagina, POR_PAGINA, count)}
            </div>`;

          $("wa-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { filtroEstado = b.dataset.f; filtroPagina = 0; pintar(); } });
          el.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { filtroPagina = +b.dataset.pag; pintar(); }));
          el.querySelectorAll("[data-wid]").forEach((b) => b.addEventListener("click", () => {
            const m = data.find((x) => x.id === b.dataset.wid);
            detalle(m);
          }));
        } catch (e) { el.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; }
      }

      function detalle(m) {
        const { el: modal, cerrar } = abrirModal(`<h3>Mensaje WhatsApp</h3>
          <p><strong>Teléfono:</strong> ${esc(m.telefono)}</p>
          <p><strong>Tipo:</strong> ${esc(TIPOS[m.tipo] || m.tipo)}</p>
          <p><strong>Programado para:</strong> ${m.programado_para ? fmt.fechaHora(m.programado_para) : "—"}</p>
          <p><strong>Estado:</strong> <span class="badge ${m.estado === "enviado" ? "badge-ok" : m.estado === "error" ? "badge-cancel" : "badge-pending"}">${esc(m.estado)}</span></p>
          ${m.enviado_en ? `<p><strong>Enviado en:</strong> ${fmt.fechaHora(m.enviado_en)}</p>` : ""}
          ${m.error ? `<p><strong>Error:</strong> ${esc(m.error)}</p>` : ""}
          <p><strong>Texto:</strong></p><blockquote style="background:var(--bg-soft);padding:12px;border-radius:var(--radius-sm);white-space:pre-wrap">${esc(m.texto || "—")}</blockquote>
          <div class="modal-actions">
            ${m.estado === "pendiente" ? '<button class="btn btn-danger btn-sm" data-cancelar>Cancelar envío</button>' : ""}
            ${m.estado === "error" ? '<button class="btn btn-primary btn-sm" data-reintentar>Reintentar</button>' : ""}
            <button class="btn btn-ghost btn-sm" data-no>Cerrar</button>
          </div>`, { grande: false });
        modal.querySelector("[data-no]").addEventListener("click", cerrar);
        const btnCancel = modal.querySelector("[data-cancelar]");
        if (btnCancel) btnCancel.addEventListener("click", async () => {
          if (await confirmar("¿Cancelar este mensaje?", "Sí, cancelar", true)) {
            await consulta(sb.from("mensajes_whatsapp").update({ estado: "cancelado" }).eq("id", m.id));
            cerrar(); aviso("Mensaje cancelado"); pintar();
          }
        });
        const btnRetry = modal.querySelector("[data-reintentar]");
        if (btnRetry) btnRetry.addEventListener("click", async () => {
          await consulta(sb.from("mensajes_whatsapp").update({ estado: "pendiente", error: null }).eq("id", m.id));
          cerrar(); aviso("Mensaje puesto de nuevo en cola"); pintar();
        });
      }

      pintar();
    },
  });
})();
