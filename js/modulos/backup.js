(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, mensajeError } = MV;

  const TABLAS = [
    { tabla: "clientes", label: "Clientes" },
    { tabla: "mascotas", label: "Mascotas" },
    { tabla: "citas", label: "Citas" },
    { tabla: "productos", label: "Productos" },
    { tabla: "lotes", label: "Lotes (stock)" },
    { tabla: "kardex", label: "Kardex (movimientos)" },
    { tabla: "comprobantes", label: "Comprobantes" },
    { tabla: "detalle_comprobante", label: "Detalle comprobantes" },
    { tabla: "registros_clinicos", label: "Registros clínicos" },
    { tabla: "recetas", label: "Recetas" },
    { tabla: "vacunas_aplicadas", label: "Vacunas aplicadas" },
    { tabla: "desparasitaciones", label: "Desparasitaciones" },
    { tabla: "proveedores", label: "Proveedores" },
    { tabla: "resenas", label: "Reseñas" },
    { tabla: "mensajes_whatsapp", label: "Mensajes WhatsApp" },
  ];

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function aCSV(data) {
    if (!data.length) return "";
    const cols = Object.keys(data[0]);
    const lineas = [cols.join(",")];
    for (const fila of data) {
      lineas.push(cols.map((c) => {
        let v = fila[c];
        if (v == null) return "";
        if (typeof v === "object") v = JSON.stringify(v);
        v = String(v);
        if (v.includes(",") || v.includes('"') || v.includes("\n")) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(","));
    }
    return lineas.join("\n");
  }

  MV.panel.registrar({
    id: "backup", titulo: "Backup", roles: ["admin"],
    icono: MV.ico("M12 3v10m0 0l-3-3m3 3l3-3M4 15v2a2 2 0 002 2h12a2 2 0 002-2v-2"),
    async render(el) {
      el.innerHTML = `<div class="page-head"><div><h1>Backup / Exportar datos</h1><p>Descarga una copia de los datos del sistema en CSV o JSON.</p></div></div>
        <div class="panel">
          <div style="display:flex;gap:10px;margin-bottom:14px">
            <button class="btn btn-primary" id="bk-todo-csv">Exportar todo (CSV)</button>
            <button class="btn btn-ghost" id="bk-todo-json">Exportar todo (JSON)</button>
          </div>
          <h3 style="margin:18px 0 10px">Exportar tabla individual</h3>
          <div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Tabla</th><th>CSV</th><th>JSON</th></tr></thead>
          <tbody>${TABLAS.map((t) => `<tr><td>${esc(t.label)}</td><td><button class="btn btn-ghost btn-sm" data-t="${t.tabla}" data-fmt="csv">CSV</button></td><td><button class="btn btn-ghost btn-sm" data-t="${t.tabla}" data-fmt="json">JSON</button></td></tr>`).join("")}</tbody></table></div>
          <div id="bk-status" style="margin-top:14px"></div>
        </div>`;

      async function exportarTabla(nombre, formato) {
        const status = $("bk-status");
        status.textContent = `Exportando ${nombre}…`;
        try {
          const { data } = await consulta(sb.from(nombre).select("*").order("created_at", { ascending: false }).limit(50000));
          const fecha = fmt.hoy().replace(/-/g, "");
          if (formato === "csv") {
            descargar(`${nombre}_${fecha}.csv`, aCSV(data), "text/csv;charset=utf-8");
          } else {
            descargar(`${nombre}_${fecha}.json`, JSON.stringify(data, null, 2), "application/json");
          }
          status.textContent = `✅ ${nombre} exportado (${data.length} registros).`;
        } catch (e) { status.textContent = `❌ Error exportando ${nombre}: ${esc(mensajeError(e))}`; }
      }

      async function exportarTodo(formato) {
        const status = $("bk-status");
        if (!await confirmar("¿Exportar todas las tablas? Esto puede tomar un momento.", "Exportar")) return;
        const fecha = fmt.hoy().replace(/-/g, "");
        if (formato === "json") {
          status.textContent = "Exportando todo en JSON…";
          const resultado = {};
          for (const t of TABLAS) {
            status.textContent = `Exportando ${t.label}…`;
            try {
              const { data } = await consulta(sb.from(t.tabla).select("*").limit(50000));
              resultado[t.tabla] = data;
            } catch { resultado[t.tabla] = []; }
          }
          descargar(`macvet_backup_${fecha}.json`, JSON.stringify(resultado, null, 2), "application/json");
          status.textContent = "✅ Backup completo descargado.";
        } else {
          status.textContent = "Exportando tablas en CSV (una por una)…";
          for (const t of TABLAS) {
            await exportarTabla(t.tabla, "csv");
            await new Promise((r) => setTimeout(r, 200));
          }
          status.textContent = "✅ Todas las tablas exportadas en CSV.";
        }
      }

      $("bk-todo-csv").addEventListener("click", () => exportarTodo("csv"));
      $("bk-todo-json").addEventListener("click", () => exportarTodo("json"));
      el.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => exportarTabla(b.dataset.t, b.dataset.fmt)));
    },
  });
})();
