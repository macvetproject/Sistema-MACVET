(function () {
  const { sb, esc, fmt, consulta } = MV;
  const ESTADO = { pendiente: ["badge-pending", "Pendiente"], confirmada: ["badge-ok", "Confirmada"], completada: ["badge-info", "Completada"], cancelada: ["badge-danger", "Cancelada"] };
  MV.estadoCita = (e) => { const [c, t] = ESTADO[e] || ["badge-neutral", e]; return `<span class="badge ${c}">${esc(t)}</span>`; };

  MV.panel.registrar({
    id: "inicio", titulo: "Inicio", roles: ["admin", "veterinario", "recepcion"],
    icono: MV.ico("M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"),
    async render(el, { perfil }) {
      const hoy = fmt.hoy();
      const cuenta = (q) => q.then((r) => { if (r.error) throw r.error; return r.count ?? 0; });
      const [citasHoy, pendientes, web, clientes, mascotas, prox] = await Promise.all([
        cuenta(sb.from("citas").select("id", { count: "exact", head: true }).eq("fecha", hoy).neq("estado", "cancelada")),
        cuenta(sb.from("citas").select("id", { count: "exact", head: true }).eq("estado", "pendiente").gte("fecha", hoy)),
        cuenta(sb.from("citas").select("id", { count: "exact", head: true }).eq("origen", "web").eq("estado", "pendiente").gte("fecha", hoy)),
        cuenta(sb.from("clientes").select("id", { count: "exact", head: true }).eq("activo", true)),
        cuenta(sb.from("mascotas").select("id", { count: "exact", head: true }).eq("activo", true)),
        consulta(sb.from("citas").select("id,fecha,hora,dueno,nombre_mascota,servicio,estado").gte("fecha", hoy).neq("estado", "cancelada").order("fecha").order("hora").limit(8)),
      ]);
      const stat = (clase, etq, n, nota) => `<div class="stat ${clase}"><div class="label">${esc(etq)}</div><div class="num">${n.toLocaleString("es-EC")}</div><div class="delta">${esc(nota)}</div></div>`;
      const filas = prox.data.map((c) => `<tr><td>${fmt.fecha(c.fecha)}</td><td>${fmt.hora(c.hora)}</td><td>${esc(c.dueno)}</td><td>${esc(c.nombre_mascota || "—")}</td><td>${esc(c.servicio)}</td><td>${MV.estadoCita(c.estado)}</td></tr>`).join("");
      el.innerHTML = `<div class="page-head"><div><h1>Hola, ${esc(perfil.nombre.split(" ")[0])}</h1><p>Resumen de la clínica de hoy, ${fmt.fecha(hoy)}.</p></div></div>
        <div class="stat-row">
          ${stat("", "Citas hoy", citasHoy, "sin contar canceladas")}
          ${stat("stat-ok", "Pendientes por confirmar", pendientes, "de hoy en adelante")}
          ${stat(web ? "stat-danger" : "", "Solicitudes de la web", web, "esperan confirmación")}
          ${stat("", "Clientes", clientes, "activos")}
          ${stat("", "Mascotas", mascotas, "activas")}
        </div>
        <div class="panel"><div class="panel-head"><h2>Próximas citas</h2><a class="btn btn-ghost btn-sm" href="#citas">Ver agenda</a></div>
          ${prox.data.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Hora</th><th>Dueño</th><th>Mascota</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="vacio">No hay citas próximas.</div>'}
        </div>`;
    },
  });
})();
