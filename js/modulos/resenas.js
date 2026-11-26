(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, abrirModal, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 20;

  MV.panel.registrar({
    id: "resenas", titulo: "Reseñas", roles: ["admin"],
    icono: MV.ico("M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z"),
    async render(el) {
      let filtro = "todas", pagina = 0;

      async function pintar() {
        el.innerHTML = '<div class="cargando">Cargando…</div>';
        try {
          let q = sb.from("resenas").select("*", { count: "exact" }).order("fecha", { ascending: false });
          if (filtro !== "todas") q = q.eq("estado", filtro);
          q = q.range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1);
          const { data, count } = await consulta(q);

          el.innerHTML = `<div class="page-head"><div><h1>Reseñas</h1><p>Reseñas del sitio web público. Solo las aprobadas se muestran a visitantes.</p></div></div>
            <div class="panel">
              <div class="chips" id="re-tabs">
                ${["todas", "pendiente", "aprobada", "rechazada"].map((e) => `<button class="chip ${e === filtro ? "activo" : ""}" data-f="${e}">${e[0].toUpperCase() + e.slice(1)}s</button>`).join("")}
              </div>
              <div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Autor</th><th>Tel.</th><th>⭐</th><th>Texto</th><th>Estado</th><th></th></tr></thead>
              <tbody>${data.length ? data.map((r) => `<tr>
                <td>${fmt.fecha(r.fecha)}</td><td>${esc(r.autor || "—")}</td><td>${esc(r.telefono || "—")}</td>
                <td>${r.estrellas}</td><td>${esc((r.texto || "").slice(0, 80))}</td>
                <td><span class="badge ${r.estado === "aprobada" ? "badge-ok" : r.estado === "rechazada" ? "badge-cancel" : "badge-pending"}">${esc(r.estado)}</span></td>
                <td><button class="btn btn-ghost btn-sm" data-rid="${r.id}">Ver</button></td>
              </tr>`).join("") : `<tr><td colspan="7" class="vacio">Sin reseñas.</td></tr>`}</tbody></table></div>
              ${paginador(pagina, POR_PAGINA, count)}
            </div>`;

          $("re-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; pagina = 0; pintar(); } });
          el.querySelectorAll("[data-pag]").forEach((b) => b.addEventListener("click", () => { pagina = +b.dataset.pag; pintar(); }));
          el.querySelectorAll("[data-rid]").forEach((b) => b.addEventListener("click", () => detalleResena(data.find((r) => r.id === b.dataset.rid))));
        } catch (e) { el.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; }
      }

      function detalleResena(r) {
        const { el: m, cerrar } = abrirModal(`<h3>Reseña de ${esc(r.autor || "Anónimo")}</h3>
          <p><strong>Estrellas:</strong> ${"⭐".repeat(r.estrellas)} (${r.estrellas}/5)</p>
          <p><strong>Teléfono:</strong> ${esc(r.telefono || "—")}</p>
          <p><strong>Fecha:</strong> ${fmt.fecha(r.fecha)}</p>
          <p><strong>Texto:</strong></p><blockquote style="background:var(--bg-soft);padding:12px;border-radius:var(--radius-sm)">${esc(r.texto || "—")}</blockquote>
          ${r.respuesta ? `<p><strong>Respuesta:</strong></p><blockquote style="background:var(--bg-soft);padding:12px;border-radius:var(--radius-sm)">${esc(r.respuesta)}</blockquote>` : ""}
          <p><strong>Estado:</strong> <span class="badge ${r.estado === "aprobada" ? "badge-ok" : r.estado === "rechazada" ? "badge-cancel" : "badge-pending"}">${esc(r.estado)}</span></p>
          <div class="modal-actions">
            ${r.estado !== "aprobada" ? '<button class="btn btn-primary btn-sm" data-a="aprobada">Aprobar</button>' : ""}
            ${r.estado !== "rechazada" ? '<button class="btn btn-danger btn-sm" data-a="rechazada">Rechazar</button>' : ""}
            <button class="btn btn-ghost btn-sm" data-resp>Responder</button>
            <button class="btn btn-ghost btn-sm" data-no>Cerrar</button>
          </div>`, { grande: false });
        m.querySelector("[data-no]").addEventListener("click", cerrar);
        m.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", async () => {
          await consulta(sb.from("resenas").update({ estado: b.dataset.a }).eq("id", r.id));
          cerrar(); aviso(`Reseña ${b.dataset.a}`); pintar();
        }));
        const btnResp = m.querySelector("[data-resp]");
        if (btnResp) btnResp.addEventListener("click", () => {
          cerrar();
          formulario({
            titulo: `Responder a ${esc(r.autor || "Anónimo")}`,
            textoGuardar: "Guardar respuesta",
            campos: [{ id: "respuesta", label: "Respuesta", type: "textarea", maxlength: 500, value: r.respuesta }],
            alGuardar: async (v, c2) => { await consulta(sb.from("resenas").update({ respuesta: v.respuesta }).eq("id", r.id)); c2(); aviso("Respuesta guardada"); pintar(); },
          });
        });
      }

      pintar();
    },
  });
})();
