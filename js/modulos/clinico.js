/* Fase 4 — Módulo clínico: registros clínicos, recetas, vacunas y desparasitaciones.
   Solo admin y veterinario ven esta sección (RLS ya lo garantiza). */
(function () {
  const { sb, $, esc, fmt, consulta, aviso, confirmar, formulario, abrirModal, paginador, debounce, limpiarBusqueda, mensajeError } = MV;
  const POR_PAGINA = 20;

  /* ---------- helpers ---------- */
  const edad = (iso) => {
    if (!iso) return "—";
    const n = new Date(iso), h = new Date();
    let a = h.getFullYear() - n.getFullYear(), m = h.getMonth() - n.getMonth();
    if (m < 0) { a--; m += 12; }
    return a > 0 ? `${a} año${a > 1 ? "s" : ""}${m ? ` ${m} m` : ""}` : `${Math.max(m, 0)} mes${m === 1 ? "" : "es"}`;
  };

  /* ---------- buscar mascota ---------- */
  function buscarMascota(alElegir) {
    const { el, cerrar } = abrirModal(`<h3>Buscar mascota</h3><input type="search" id="bm-q" placeholder="Nombre de la mascota o del dueño…" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm)" autofocus>
      <div class="resultados-busqueda" id="bm-res"><div class="vacio">Escribe al menos 2 letras.</div></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-no>Cerrar</button></div>`, { grande: true });
    el.querySelector("[data-no]").addEventListener("click", cerrar);
    el.querySelector("#bm-q").addEventListener("input", debounce(async (e) => {
      const t = limpiarBusqueda(e.target.value), res = el.querySelector("#bm-res");
      if (t.length < 2) { res.innerHTML = '<div class="vacio">Escribe al menos 2 letras.</div>'; return; }
      try {
        const r = await consulta(sb.from("mascotas").select("id,nombre,especie,fecha_nacimiento,cliente_id,clientes(nombre,telefono)").eq("activo", true)
          .or(`nombre.ilike.%${t}%,clientes.nombre.ilike.%${t}%`).order("nombre").limit(20));
        const data = r.data.filter((m) => m.clientes);
        res.innerHTML = data.length ? `<ul class="lista-simple">${data.map((m, i) => `<li class="fila-click" data-i="${i}"><span><strong>${esc(m.nombre)}</strong> (${esc(m.especie)}) · ${esc(edad(m.fecha_nacimiento))}<br><small>Dueño: ${esc(m.clientes.nombre)} · ${esc(m.clientes.telefono || "sin tel.")}</small></span><button class="btn btn-primary btn-sm">Elegir</button></li>`).join("")}</ul>` : '<div class="vacio">Sin resultados.</div>';
        res.querySelectorAll("[data-i]").forEach((li) => li.addEventListener("click", () => { cerrar(); alElegir(data[li.dataset.i]); }));
      } catch (ex) { res.innerHTML = `<div class="vacio">${esc(mensajeError(ex))}</div>`; }
    }));
  }

  /* ---------- registro clínico ---------- */
  function formRegistro(mascota, reg, alTerminar) {
    formulario({
      titulo: reg ? `Editar registro — ${mascota.nombre}` : `Nuevo registro clínico — ${mascota.nombre}`,
      textoGuardar: reg ? "Guardar cambios" : "Crear registro",
      campos: [
        { id: "fecha", label: "Fecha", type: "date", required: true, value: reg?.fecha || fmt.hoy(), mitad: true },
        { id: "peso", label: "Peso (kg)", maxlength: 20, value: reg?.peso, mitad: true },
        { id: "temperatura", label: "Temperatura (°C)", maxlength: 10, value: reg?.temperatura, mitad: true },
        { id: "frecuencia_cardiaca", label: "Frec. cardíaca", maxlength: 20, value: reg?.frecuencia_cardiaca, mitad: true },
        { id: "frecuencia_respiratoria", label: "Frec. respiratoria", maxlength: 20, value: reg?.frecuencia_respiratoria, mitad: true },
        { id: "condicion_corporal", label: "Condición corporal", maxlength: 60, value: reg?.condicion_corporal, mitad: true },
        { id: "condicion_ingreso", label: "Condición al ingreso", type: "textarea", maxlength: 500, value: reg?.condicion_ingreso },
        { id: "costumbres", label: "Costumbres / hábitos", type: "textarea", maxlength: 500, value: reg?.costumbres },
        { id: "alimentacion", label: "Alimentación", maxlength: 200, value: reg?.alimentacion },
        { id: "tratado_antes", label: "¿Tratado antes por esta condición?", maxlength: 300, value: reg?.tratado_antes },
        { id: "tratamiento", label: "Tratamiento aplicado", type: "textarea", maxlength: 1000, value: reg?.tratamiento },
        { id: "programa_vacunas", label: "Programa de vacunas", type: "textarea", maxlength: 500, value: reg?.programa_vacunas },
        { id: "programa_desparasitacion", label: "Programa de desparasitación", type: "textarea", maxlength: 500, value: reg?.programa_desparasitacion },
        { id: "proxima_cita", label: "Próxima cita sugerida", type: "date", value: reg?.proxima_cita },
        { id: "comentario", label: "Comentarios adicionales", type: "textarea", maxlength: 1000, value: reg?.comentario },
      ],
      alGuardar: async (v, cerrar) => {
        const datos = { ...v, mascota_id: mascota.id };
        if (reg) await consulta(sb.from("registros_clinicos").update(datos).eq("id", reg.id));
        else await consulta(sb.from("registros_clinicos").insert(datos));
        cerrar(); aviso(reg ? "Registro actualizado" : "Registro creado"); alTerminar();
      },
    });
  }

  /* ---------- recetas ---------- */
  function formReceta(mascota, rec, alTerminar) {
    const { el } = formulario({
      titulo: rec ? `Editar receta — ${mascota.nombre}` : `Nueva receta — ${mascota.nombre}`,
      textoGuardar: rec ? "Guardar cambios" : "Crear receta",
      campos: [
        { id: "fecha", label: "Fecha", type: "date", required: true, value: rec?.fecha || fmt.hoy(), mitad: true },
        { id: "indicaciones", label: "Indicaciones", type: "textarea", required: true, maxlength: 2000, value: rec?.indicaciones, placeholder: "Medicamento, dosis, frecuencia, duración…" },
      ],
      alGuardar: async (v, cerrar) => {
        const datos = { ...v, mascota_id: mascota.id };
        if (rec) await consulta(sb.from("recetas").update(datos).eq("id", rec.id));
        else await consulta(sb.from("recetas").insert(datos));
        cerrar(); aviso(rec ? "Receta actualizada" : "Receta creada"); alTerminar();
      },
    });
    // Botón de dictado (Web Speech API)
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const area = el.querySelector("#f-indicaciones");
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn btn-ghost btn-sm"; btn.textContent = "🎤 Dictar";
      btn.style.marginTop = "6px";
      let grabando = false, recog;
      btn.addEventListener("click", () => {
        if (grabando) { recog.stop(); return; }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        recog = new SR(); recog.lang = "es-EC"; recog.continuous = true; recog.interimResults = true;
        let final = area.value;
        recog.onresult = (e) => {
          let parcial = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += (final ? " " : "") + e.results[i][0].transcript;
            else parcial = e.results[i][0].transcript;
          }
          area.value = final + (parcial ? " " + parcial : "");
        };
        recog.onend = () => { grabando = false; btn.textContent = "🎤 Dictar"; area.value = final; };
        recog.start(); grabando = true; btn.textContent = "⏹ Parar dictado";
      });
      area.closest(".form-group").append(btn);
    }
  }

  /* ---------- vacunas ---------- */
  async function formVacuna(mascota, vac, vets, alTerminar) {
    formulario({
      titulo: vac ? `Editar vacuna — ${mascota.nombre}` : `Registrar vacuna — ${mascota.nombre}`,
      textoGuardar: vac ? "Guardar cambios" : "Registrar",
      campos: [
        { id: "nombre", label: "Nombre de la vacuna", required: true, maxlength: 120, value: vac?.nombre },
        { id: "fecha", label: "Fecha de aplicación", type: "date", required: true, value: vac?.fecha || fmt.hoy(), mitad: true },
        { id: "proximo_refuerzo", label: "Próximo refuerzo", type: "date", value: vac?.proximo_refuerzo, mitad: true },
        { id: "lote", label: "Lote", maxlength: 60, value: vac?.lote, mitad: true },
        { id: "veterinario_id", label: "Veterinario", type: "select", options: [["", "— Sin asignar —"], ...vets.map((v) => [v.id, v.nombre])], value: vac?.veterinario_id || "", mitad: true },
      ],
      alGuardar: async (v, cerrar) => {
        const datos = { ...v, mascota_id: mascota.id, veterinario_id: v.veterinario_id || null };
        if (vac) await consulta(sb.from("vacunas_aplicadas").update(datos).eq("id", vac.id));
        else await consulta(sb.from("vacunas_aplicadas").insert(datos));
        cerrar(); aviso(vac ? "Vacuna actualizada" : "Vacuna registrada"); alTerminar();
      },
    });
  }

  /* ---------- desparasitaciones ---------- */
  function formDesparasitacion(mascota, des, alTerminar) {
    formulario({
      titulo: des ? `Editar desparasitación — ${mascota.nombre}` : `Registrar desparasitación — ${mascota.nombre}`,
      textoGuardar: des ? "Guardar cambios" : "Registrar",
      campos: [
        { id: "producto", label: "Producto utilizado", maxlength: 120, value: des?.producto },
        { id: "fecha", label: "Fecha de aplicación", type: "date", required: true, value: des?.fecha || fmt.hoy(), mitad: true },
        { id: "proxima", label: "Próxima desparasitación", type: "date", value: des?.proxima, mitad: true },
      ],
      alGuardar: async (v, cerrar) => {
        const datos = { ...v, mascota_id: mascota.id };
        if (des) await consulta(sb.from("desparasitaciones").update(datos).eq("id", des.id));
        else await consulta(sb.from("desparasitaciones").insert(datos));
        cerrar(); aviso(des ? "Desparasitación actualizada" : "Desparasitación registrada"); alTerminar();
      },
    });
  }

  /* ---------- ficha clínica de una mascota ---------- */
  async function fichaMascota(mascota) {
    const { el, cerrar } = abrirModal('<div class="cargando">Cargando…</div>', { grande: true });
    const vets = (await consulta(sb.from("veterinarios").select("id,nombre").eq("activo", true).order("nombre"))).data;

    async function pintar() {
      let regs, recetas, vacunas, desps;
      try {
        [regs, recetas, vacunas, desps] = await Promise.all([
          consulta(sb.from("registros_clinicos").select("*").eq("mascota_id", mascota.id).order("fecha", { ascending: false }).limit(20)).then((r) => r.data),
          consulta(sb.from("recetas").select("*").eq("mascota_id", mascota.id).order("fecha", { ascending: false }).limit(20)).then((r) => r.data),
          consulta(sb.from("vacunas_aplicadas").select("*,veterinarios(nombre)").eq("mascota_id", mascota.id).order("fecha", { ascending: false })).then((r) => r.data),
          consulta(sb.from("desparasitaciones").select("*").eq("mascota_id", mascota.id).order("fecha", { ascending: false })).then((r) => r.data),
        ]);
      } catch (e) { el.firstElementChild.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; return; }

      el.firstElementChild.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap">
          <h3 style="margin:0">${esc(mascota.nombre)} <small>(${esc(mascota.especie)} · ${esc(edad(mascota.fecha_nacimiento))})</small></h3>
          <small>Dueño: ${esc(mascota.clientes?.nombre || "—")}</small>
        </div>

        <div class="chips" id="fc-tabs" style="margin:14px 0">
          <button class="chip activo" data-t="registros">Registros (${regs.length})</button>
          <button class="chip" data-t="recetas">Recetas (${recetas.length})</button>
          <button class="chip" data-t="vacunas">Vacunas (${vacunas.length})</button>
          <button class="chip" data-t="desparasitaciones">Desparasitaciones (${desps.length})</button>
        </div>
        <div id="fc-cont"></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-cerrar>Cerrar</button></div>`;

      const cont = el.querySelector("#fc-cont");
      function mostrarTab(tab) {
        el.querySelectorAll("#fc-tabs .chip").forEach((x) => x.classList.toggle("activo", x.dataset.t === tab));
        if (tab === "registros") {
          cont.innerHTML = `<button class="btn btn-primary btn-sm" id="fc-nuevo-reg" style="margin-bottom:10px">+ Nuevo registro clínico</button>` +
            (regs.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Peso</th><th>Temp.</th><th>Tratamiento</th><th></th></tr></thead><tbody>${regs.map((r) => `<tr><td>${fmt.fecha(r.fecha)}</td><td>${esc(r.peso || "—")}</td><td>${esc(r.temperatura || "—")}</td><td>${esc((r.tratamiento || "—").slice(0, 80))}</td><td><button class="btn btn-ghost btn-sm" data-reg="${r.id}">Ver/Editar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin registros clínicos.</div>');
          cont.querySelector("#fc-nuevo-reg").addEventListener("click", () => formRegistro(mascota, null, pintar));
          cont.querySelectorAll("[data-reg]").forEach((b) => b.addEventListener("click", () => {
            const r = regs.find((x) => x.id === b.dataset.reg);
            formRegistro(mascota, r, pintar);
          }));
        } else if (tab === "recetas") {
          cont.innerHTML = `<button class="btn btn-primary btn-sm" id="fc-nueva-rec" style="margin-bottom:10px">+ Nueva receta</button>` +
            (recetas.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Indicaciones</th><th></th></tr></thead><tbody>${recetas.map((r) => `<tr><td>${fmt.fecha(r.fecha)}</td><td>${esc((r.indicaciones || "").slice(0, 120))}</td><td><button class="btn btn-ghost btn-sm" data-rec="${r.id}">Ver/Editar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin recetas.</div>');
          cont.querySelector("#fc-nueva-rec").addEventListener("click", () => formReceta(mascota, null, pintar));
          cont.querySelectorAll("[data-rec]").forEach((b) => b.addEventListener("click", () => {
            const r = recetas.find((x) => x.id === b.dataset.rec);
            formReceta(mascota, r, pintar);
          }));
        } else if (tab === "vacunas") {
          cont.innerHTML = `<button class="btn btn-primary btn-sm" id="fc-nueva-vac" style="margin-bottom:10px">+ Registrar vacuna</button>` +
            (vacunas.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Vacuna</th><th>Lote</th><th>Veterinario</th><th>Próx. refuerzo</th><th></th></tr></thead><tbody>${vacunas.map((v) => `<tr><td>${fmt.fecha(v.fecha)}</td><td>${esc(v.nombre)}</td><td>${esc(v.lote || "—")}</td><td>${esc(v.veterinarios?.nombre || "—")}</td><td>${v.proximo_refuerzo ? fmt.fecha(v.proximo_refuerzo) : "—"}</td><td><button class="btn btn-ghost btn-sm" data-vac="${v.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin vacunas registradas.</div>');
          cont.querySelector("#fc-nueva-vac").addEventListener("click", () => formVacuna(mascota, null, vets, pintar));
          cont.querySelectorAll("[data-vac]").forEach((b) => b.addEventListener("click", () => formVacuna(mascota, vacunas.find((x) => x.id === b.dataset.vac), vets, pintar)));
        } else {
          cont.innerHTML = `<button class="btn btn-primary btn-sm" id="fc-nueva-des" style="margin-bottom:10px">+ Registrar desparasitación</button>` +
            (desps.length ? `<div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Próxima</th><th></th></tr></thead><tbody>${desps.map((d) => `<tr><td>${fmt.fecha(d.fecha)}</td><td>${esc(d.producto || "—")}</td><td>${d.proxima ? fmt.fecha(d.proxima) : "—"}</td><td><button class="btn btn-ghost btn-sm" data-des="${d.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">Sin desparasitaciones.</div>');
          cont.querySelector("#fc-nueva-des").addEventListener("click", () => formDesparasitacion(mascota, null, pintar));
          cont.querySelectorAll("[data-des]").forEach((b) => b.addEventListener("click", () => formDesparasitacion(mascota, desps.find((x) => x.id === b.dataset.des), pintar)));
        }
      }

      el.querySelector("#fc-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) mostrarTab(b.dataset.t); });
      el.querySelector("[data-cerrar]").addEventListener("click", () => cerrar());
      mostrarTab("registros");
    }
    pintar();
  }

  /* ---------- vista principal ---------- */
  MV.panel.registrar({
    id: "clinico", titulo: "Clínico", roles: ["admin", "veterinario"],
    icono: MV.ico("M9 12h6M12 9v6M4.93 4.93l14.14 14.14M12 2a10 10 0 100 20 10 10 0 000-20z"),
    async render(el) {
      const est = { q: "", tab: "buscar", pagina: 0 };
      el.innerHTML = `<div class="page-head"><div><h1>Registro clínico</h1><p>Fichas clínicas, recetas, vacunas y desparasitaciones por mascota.</p></div></div>
        <div class="panel">
          <div class="chips" id="cl-tabs" style="margin-bottom:14px">
            <button class="chip activo" data-t="buscar">Buscar mascota</button>
            <button class="chip" data-t="refuerzos">Refuerzos pendientes</button>
          </div>
          <div id="cl-cont"></div>
        </div>`;

      const cont = $("cl-cont");

      async function tabBuscar() {
        cont.innerHTML = `<div class="barra-filtros"><input type="search" id="cl-q" placeholder="Nombre de la mascota o del dueño…" style="max-width:400px"></div><div id="cl-res"><div class="vacio">Busca una mascota para ver o crear su ficha clínica.</div></div>`;
        $("cl-q").addEventListener("input", debounce(async (e) => {
          const t = limpiarBusqueda(e.target.value), res = $("cl-res");
          if (t.length < 2) { res.innerHTML = '<div class="vacio">Escribe al menos 2 letras.</div>'; return; }
          try {
            const r = await consulta(sb.from("mascotas").select("id,nombre,especie,fecha_nacimiento,cliente_id,clientes(nombre,telefono)").eq("activo", true)
              .or(`nombre.ilike.%${t}%,clientes.nombre.ilike.%${t}%`).order("nombre").limit(20));
            const data = r.data.filter((m) => m.clientes);
            res.innerHTML = data.length ? `<ul class="lista-simple">${data.map((m) => `<li class="fila-click" data-mid="${m.id}"><span><strong>${esc(m.nombre)}</strong> (${esc(m.especie)}) · ${esc(edad(m.fecha_nacimiento))}<br><small>Dueño: ${esc(m.clientes.nombre)}</small></span><button class="btn btn-primary btn-sm">Abrir ficha</button></li>`).join("")}</ul>` : '<div class="vacio">Sin resultados.</div>';
            res.querySelectorAll("[data-mid]").forEach((li) => li.addEventListener("click", () => fichaMascota(data.find((m) => m.id === li.dataset.mid))));
          } catch (ex) { res.innerHTML = `<div class="vacio">${esc(mensajeError(ex))}</div>`; }
        }));
      }

      async function tabRefuerzos() {
        cont.innerHTML = '<div class="cargando">Cargando…</div>';
        try {
          const hoy = fmt.hoy();
          const en30 = (() => { const d = new Date(hoy + "T12:00:00"); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();
          const [vacs, desps] = await Promise.all([
            consulta(sb.from("vacunas_aplicadas").select("id,nombre,fecha,proximo_refuerzo,mascotas(id,nombre,especie,fecha_nacimiento,cliente_id,clientes(nombre,telefono))").not("proximo_refuerzo", "is", null).lte("proximo_refuerzo", en30).order("proximo_refuerzo").limit(50)).then((r) => r.data),
            consulta(sb.from("desparasitaciones").select("id,producto,fecha,proxima,mascotas(id,nombre,especie,fecha_nacimiento,cliente_id,clientes(nombre,telefono))").not("proxima", "is", null).lte("proxima", en30).order("proxima").limit(50)).then((r) => r.data),
          ]);
          const items = [
            ...vacs.map((v) => ({ tipo: "Vacuna", detalle: v.nombre, fecha: v.proximo_refuerzo, mascota: v.mascotas })),
            ...desps.map((d) => ({ tipo: "Desparasitación", detalle: d.producto || "—", fecha: d.proxima, mascota: d.mascotas })),
          ].sort((a, b) => a.fecha.localeCompare(b.fecha));
          cont.innerHTML = items.length ? `<p class="ayuda" style="margin-bottom:10px">Refuerzos de vacunas y desparasitaciones que vencen en los próximos 30 días (o ya vencieron).</p>
            <div class="tabla-scroll"><table class="inv-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Mascota</th><th>Dueño</th><th>Teléfono</th></tr></thead><tbody>${items.map((it) => `<tr class="fila-click" data-mid="${it.mascota?.id}"><td>${fmt.fecha(it.fecha)}</td><td><span class="badge ${it.tipo === "Vacuna" ? "badge-info" : "badge-pending"}">${esc(it.tipo)}</span></td><td>${esc(it.detalle)}</td><td>${esc(it.mascota?.nombre || "—")}</td><td>${esc(it.mascota?.clientes?.nombre || "—")}</td><td>${esc(it.mascota?.clientes?.telefono || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="vacio">No hay refuerzos pendientes en los próximos 30 días.</div>';
          cont.querySelectorAll("[data-mid]").forEach((f) => f.addEventListener("click", () => {
            const m = items.find((x) => x.mascota?.id === f.dataset.mid)?.mascota;
            if (m) fichaMascota(m);
          }));
        } catch (e) { cont.innerHTML = `<div class="vacio">${esc(mensajeError(e))}</div>`; }
      }

      $("cl-tabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-t]");
        if (!b) return;
        el.querySelectorAll("#cl-tabs .chip").forEach((x) => x.classList.toggle("activo", x.dataset.t === b.dataset.t));
        (b.dataset.t === "buscar" ? tabBuscar : tabRefuerzos)();
      });
      tabBuscar();
    },
  });
})();
