/* ---------------- PROVEEDORES ---------------- */
let provCount = {}, imp = null, ing = null;
const prov = id => (D.proveedores || []).find(p => p.id === id);
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function contarArticulos() {
  try { D.catalogos = await q(sb.from('catalogos').select('*').order('nombre')); } catch (e) { D.catalogos = []; provCount = { _: 0 }; throw e; }
  D.proveedores.forEach(p => provCount[p.id] = D.catalogos.filter(c => c.proveedor_id === p.id).reduce((s, c) => s + c.articulos, 0)); render();
}
const catsDe = id => (D.catalogos || []).filter(c => c.proveedor_id === id);
const fechaCorta = d => d ? fecha(String(d).slice(0, 10) + 'T12:00') : '—';
const viejo = d => !!d && (Date.now() - new Date(String(d).slice(0, 10) + 'T12:00')) > 31 * 864e5;
function proveedores() {
  if (!Object.keys(provCount).length && D.proveedores.length) setTimeout(() => run(contarArticulos));
  const F = Listas.FORMATOS;
  return `<section class="panel stack"><div><h2 style="margin:0">Proveedores</h2><p class="muted" style="margin:4px 0 0">Cada proveedor puede tener varios catálogos. Las condiciones (IVA y envío) se aplican solas en el comparador y al ingresar mercadería.</p></div>
  <div class="tablewrap"><table><thead><tr><th>Proveedor</th><th>Lista con IVA</th><th>Envío %</th><th>WhatsApp</th><th>Condiciones</th><th>Catálogos</th><th>Formato de lista</th><th></th></tr></thead><tbody>
  ${D.proveedores.map(p => { const cs = catsDe(p.id), ult = cs.map(c => c.fecha_lista).filter(Boolean).sort().pop(); return `<tr><td><b>${esc(p.nombre)}</b></td>
    <td><label class="check"><input type="checkbox" data-prov="lista_incluye_iva" data-id="${p.id}" ${p.lista_incluye_iva ? 'checked' : ''}> Incluye</label></td>
    <td><input class="num" style="width:64px" data-prov="envio_pct" data-id="${p.id}" value="${+p.envio_pct}" inputmode="decimal" aria-label="Envío"></td>
    <td><input class="num" style="width:130px" data-prov="telefono" data-id="${p.id}" value="${esc(p.telefono || '')}" placeholder="2954123456" inputmode="tel" aria-label="WhatsApp"></td>
    <td><input style="min-width:150px" data-prov="condiciones" data-id="${p.id}" value="${esc(p.condiciones || '')}" placeholder="Ej.: pedido mínimo, días de entrega" aria-label="Condiciones"></td>
    <td>${D.catalogos ? `<b>${cs.length}</b> · ${provCount[p.id] ?? 0} art.${ult ? `<div class="muted">último ${fechaCorta(ult)} ${viejo(ult) ? '<span class="pill warn">viejo</span>' : ''}</div>` : ''}` : '…'}</td>
    <td><select data-prov="formato" data-id="${p.id}" aria-label="Formato" style="min-width:140px"><option value="auto" ${p.formato === 'auto' ? 'selected' : ''}>Detectar solo</option>${Object.entries(F).map(([k, f]) => `<option value="${k}" ${p.formato === k ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}</select></td>
    <td class="r" style="white-space:nowrap"><button class="link" data-act="p_imp" data-id="${p.id}">Cargar catálogo</button><button class="link" data-act="p_cats" data-id="${p.id}">Ver catálogos</button><button class="link" data-act="p_del1" data-id="${p.id}">Borrar</button></td></tr>`; }).join('')}
  </tbody></table></div>
  <p class="muted" style="margin:0">WhatsApp: cargá el número con característica, sin 0 ni 15 (ej.: 2954 123456).</p>
  <div class="row"><div style="flex:3"><label for="np">Nuevo proveedor</label><input id="np" placeholder="Nombre de la distribuidora o del vendedor"></div><button class="btn" style="flex:0" data-act="p_add">Agregar</button></div></section>`;
}
function dlgCatalogos(id) {
  const cs = catsDe(id);
  dlg(`<h2>Catálogos de ${esc(prov(id).nombre)}</h2>
  ${cs.length ? `<div class="tablewrap"><table><thead><tr><th>Catálogo</th><th>Fecha de la lista</th><th>Cargado</th><th class="r">Artículos</th><th></th></tr></thead><tbody>
  ${cs.map(c => `<tr><td><b>${esc(c.nombre)}</b>${c.archivo ? `<div class="muted">${esc(c.archivo)}</div>` : ''}</td><td>${fechaCorta(c.fecha_lista)} ${viejo(c.fecha_lista) ? '<span class="pill warn">precio viejo</span>' : ''}</td><td class="muted">${fecha(c.cargado)} ${hora(c.cargado)}</td><td class="r num">${c.articulos}</td>
  <td class="r" style="white-space:nowrap"><button class="link" data-act="p_cdel" data-id="${c.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Este proveedor todavía no tiene catálogos.</div>'}
  <div class="row"><button class="btn" data-act="p_cat" data-id="${id}">Buscar en sus artículos</button><button class="btn primary" data-act="p_imp" data-id="${id}">Cargar catálogo</button><button class="btn" data-act="cerrardlg">Cerrar</button></div>`);
}
function dlgImportar(id) {
  imp = { id, archivos: [] };
  dlg(`<h2>Cargar catálogo de ${esc(prov(id).nombre)}</h2>
  <p class="muted" style="margin:0">Elegí uno o varios archivos (PDF o Excel). Cada archivo es un catálogo: si ya existe uno con ese nombre, se actualiza; si no, se crea.</p>
  <input type="file" id="p_files" multiple accept=".pdf,.xlsx,.xls,.csv,image/*">
  <div id="p_prev" class="stack"></div>
  <div class="row"><button class="btn" data-act="cerrardlg">Cancelar</button><button class="btn primary" data-act="p_ok" id="p_ok" disabled>Cargar</button></div>`);
  $('#p_files').onchange = e => run(() => leerArchivos([...e.target.files]));
}
function nombreCatalogo(archivo, existentes) {
  const base = archivo.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s*\b\d{1,2}[ ./-]\d{1,2}(?:[ ./-]\d{2,4})?\b\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const ex = existentes.find(c => norm(c.nombre) === norm(base));
  return ex ? ex.nombre : base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}
function fechaArchivo(archivo, items) {
  const m = /(\d{1,2})[ ._-](\d{1,2})(?:[ ._-](\d{2,4}))?(?=[^\d]|$)/.exec(archivo);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d > new Date()) d.setFullYear(y - 1);
    return d.toISOString().slice(0, 10);
  }
  const f = items.map(i => i.fecha_precio).filter(Boolean).sort().pop();
  return f || new Date().toISOString().slice(0, 10);
}
async function leerArchivos(files) {
  const p = prov(imp.id); $('#p_prev').innerHTML = '<p class="muted">Leyendo…</p>';
  if (!D.catalogos) D.catalogos = await q(sb.from('catalogos').select('*').order('nombre'));
  const cs = catsDe(imp.id); imp.archivos = [];
  for (const f of files) {
    if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name)) { imp.archivos.push({ nombre: f.name, items: [], noLeidas: [], foto: true }); continue; }
    const buf = await f.arrayBuffer(); let r;
    if (/\.pdf$/i.test(f.name)) r = Listas.leer({ lineas: await Listas.pdfLineas(pdfjsLib, new Uint8Array(buf)) }, p.formato);
    else { const wb = XLSX.read(buf, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; r = Listas.leer({ filas: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }), archivo: f.name }, p.formato); }
    imp.archivos.push({ nombre: f.name, ...r, cat: nombreCatalogo(f.name, cs), fecha: fechaArchivo(f.name, r.items) });
  }
  const ok = imp.archivos.filter(a => a.items.length);
  $('#p_prev').innerHTML = `<datalist id="dl_cats">${cs.map(c => `<option value="${esc(c.nombre)}">`).join('')}</datalist>
  ${imp.archivos.map((a, i) => a.foto ? `<div class="msg bad"><b>${esc(a.nombre)}</b>: las fotos no se pueden leer automáticamente. Pedile al proveedor la lista en PDF o Excel, o pasámela y la transcribo.</div>`
    : !a.items.length ? `<div class="msg bad"><b>${esc(a.nombre)}</b>: no pude leer artículos. Probá elegir otro formato para este proveedor.</div>`
    : `<div class="panel stack" style="padding:12px"><div class="muted">${esc(a.nombre)} · <b>${a.items.length}</b> artículos${a.noLeidas.length ? ` · <span class="pill warn">${a.noLeidas.length} líneas sin leer</span>` : ''}</div>
      <div class="row"><div style="flex:2"><label for="imp_n_${i}">Nombre del catálogo</label><input id="imp_n_${i}" list="dl_cats" value="${esc(a.cat)}"></div><div><label for="imp_f_${i}">Fecha de la lista</label><input id="imp_f_${i}" type="date" value="${a.fecha}"></div></div>
      ${cs.some(c => c.nombre === a.cat) ? '<span class="pill ok" style="align-self:start">Actualiza el catálogo existente</span>' : '<span class="pill warn" style="align-self:start">Catálogo nuevo</span>'}
      <details><summary class="muted">Ver los primeros artículos</summary><div class="tablewrap"><table><tbody>${a.items.slice(0, 6).map(it => `<tr><td class="num">${esc(it.codigo)}</td><td>${esc(it.descripcion)}</td><td class="r num">${fmt(it.costo)}</td></tr>`).join('')}</tbody></table></div></details></div>`).join('')}
  ${ok.length ? '<p class="muted" style="margin:0">Si un artículo que estaba en el catálogo no viene en la lista nueva, queda marcado como «no figura».</p>' : ''}`;
  $('#p_ok').disabled = !ok.length; $('#p_ok').textContent = `Cargar ${ok.length} catálogo${ok.length === 1 ? '' : 's'}`;
}
async function dlgCatalogo(id, txt = '') {
  let qy = sb.from('articulos_proveedor').select('*, productos(nombre)').eq('proveedor_id', id).order('descripcion').limit(60);
  if (txt) qy = qy.or(`descripcion.ilike.%${txt.replace(/[%,()]/g, ' ')}%,codigo.eq.${txt.replace(/[,()]/g, '')}`);
  const rows = await q(qy);
  dlg(`<h2>Catálogo de ${esc(prov(id).nombre)}</h2>
  <input id="p_q" data-provid="${id}" placeholder="Buscar por nombre o código" value="${esc(txt)}">
  <div class="tablewrap" style="max-height:55vh;overflow:auto"><table><thead><tr><th>Código</th><th>Artículo</th><th class="r">Costo</th><th>Precio del</th><th>Tu producto</th></tr></thead><tbody>
  ${rows.map(a => `<tr><td class="num">${esc(a.codigo)}</td><td>${esc(a.descripcion)}<div class="muted">${esc(a.rubro || '')}</div></td><td class="r num">${fmt(a.costo)}</td><td class="muted">${a.fecha_precio ? fecha(a.fecha_precio + 'T12:00') : '—'}</td><td>${a.productos ? esc(a.productos.nombre) : '<span class="muted">sin vincular</span>'}</td></tr>`).join('')}
  </tbody></table>${rows.length ? '' : '<div class="empty">No hay artículos.</div>'}</div>
  <p class="muted" style="margin:0">Se muestran hasta 60. Buscá para encontrar el resto.</p>
  <button class="btn" data-act="cerrardlg">Cerrar</button>`);
  const i = $('#p_q'); i.focus(); i.setSelectionRange(txt.length, txt.length);
}

/* ---------------- INGRESO DE MERCADERÍA ---------------- */
const RUBRO_REGLAS = [['Fernet', /FERNET/], ['Espumantes', /ESPUM|CHAMP|BRUT|SIDRA|PROSECCO/], ['Whisky', /WHISK|WALKER|CHIVAS|JAMESON|BALLANTINE|JACK DANIEL|OLD PARR|WHITE HORSE/],
  ['Gin', /\bGIN\b|BEEFEATER|BOMBAY|TANQUERAY|GORDON/], ['Vodka', /VODKA|SMIRNOFF|ABSOLUT|SKY|SERNOVA/], ['Ron y tequila', /\bRON\b|BACARDI|HAVANA|TEQUILA/],
  ['Aperitivos y vermú', /APERIT|VERMOUTH|MARTINI|CINZANO|CAMPARI|APEROL|GANCIA|CARPANO|AMARGO|TERMA|HESPERIDINA|DR\.? LEMON/], ['Licores', /LICOR|BAILEYS|AMARULA|BORGHETTI|TRES PLUMAS|COÑAC|CONAC|BRANDY/],
  ['Cervezas', /CERV|QUILMES|BRAHMA|STELLA|HEINEKEN|CORONA|SCHNEIDER|ISENBECK|IMPERIAL|ANDES|PATAGONIA|AMSTEL|\b361\b|BRUL/], ['Energizantes', /SPEED|RED BULL|MONSTER|ENERG/],
  ['Gaseosas y aguas', /COCA|SPRITE|FANTA|PEPSI|SCHWEPPES|MANAOS|GASEOSA|TONICA|AGUA|SODA|SIFON|IVESS|VILLAVICENCIO/], ['Jugos e isotónicas', /JUGO|CEPITA|BAGGIO|ADES|GATORADE|POWERADE|PINDAPOY/],
  ['Vinos', /VINO|MALBEC|CABERNET|MERLOT|SYRAH|CHARDONNAY|SAUV|TORRONT|BONARDA|PINOT|BLEND|ROSADO|TINTO|BLANCO|TARDIO|ESTUCHE|RESERVA/]];
function adivinarRubro(desc) { const d = desc.toUpperCase(); const n = (RUBRO_REGLAS.find(([, re]) => re.test(d)) || ['Almacén'])[0]; return (D.rubros.find(r => r.nombre === n) || D.rubros.find(r => r.nombre === 'Otros') || {}).id || ''; }
function nombreLimpio(desc) {
  let t = ' ' + desc.replace(/^\s*\d{3,}\s*-\s*/, '').replace(/\bx\s*\d+\s*u\b/ig, ' ').replace(/\b\d+\s*X\s*(?=\d)/ig, ' ') + ' ';
  let vol = '';
  const m = /(?:\bX\s*)?(\d+(?:[.,]\d+)?)\s*(CC|ML|LTS?|LTRO?S?|L|CL)?\b(?!.*\d)/i.exec(t);
  if (m) {
    let v = +m[1].replace(',', '.'), u = (m[2] || '').toUpperCase();
    if (/^L/.test(u) || (!u && v <= 10)) v *= 1000; else if (u === 'CL') v *= 10;
    if (v >= 50000) v /= 1000;
    if (v >= 50) { vol = v >= 1000 ? `${String(v / 1000).replace('.', ',')} L` : `${Math.round(v)} ml`; t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); }
  }
  t = t.replace(/\bX\s*$/i, ' ').replace(/\s+[.,-]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(Ap|Ener|Beb|Gas)\.\s*/i, '').replace(/^Cerv\./i, 'Cerveza');
  t = t.toLowerCase().replace(/(^|[\s(/-])(\S)/g, (a, b, c) => b + c.toUpperCase());
  return (t + (vol ? ' ' + vol : '')).trim();
}
function parecido(nom) {
  const tk = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const a = tk(nom); let best = null, bs = 0;
  for (const p of D.productos) { const b = tk(p.nombre); const hit = a.filter(w => b.includes(w)).length; const sc = 2 * hit / (a.length + b.length); if (sc > bs) { bs = sc; best = p; } }
  return bs >= 0.6 ? best : null;
}
async function porCodigo(cb) {
  cb = String(cb || '').trim(); if (!cb) return null;
  let p = D.productos.find(p => p.codigo_barras === cb); if (p) return p;
  const r = await q(sb.from('productos_detalle').select('*').eq('codigo_barras', cb).limit(1));
  if (r[0]) { p = { ...r[0], dadoDeBaja: !r[0].activo }; D.productos.push(p); return p; }
  return null;
}
function nuevoIngreso(provId) { const p = prov(provId); ing = { prov: provId || '', envio: p ? +p.envio_pct : 0, iva: p ? !p.lista_incluye_iva : false, comp: '', items: [], q: '', sug: [] }; }
const costoFinalIng = c => (+c || 0) * (ing.iva ? 1 + D.config.iva_pct / 100 : 1) * (1 + (dec(ing.envio) || 0) / 100);
function precioVentaIng(l) {
  const prod = l.producto_id ? D.productos.find(p => p.id === l.producto_id) : null;
  if (prod && prod.precio_manual != null) return +prod.precio_manual;
  return calcPrecio(costoFinalIng(l.costo), false, prod ? prod.perfil_id : l.nuevo.perfil_id, '');
}
function ingreso() {
  if (!ing) nuevoIngreso('');
  const opts = D.productos.map(p => `<option value="${esc(p.nombre)}">`).join('');
  const total = ing.items.reduce((s, l) => s + costoFinalIng(l.costo) * (+l.cantidad || 0), 0);
  return `<datalist id="dl_prod">${opts}</datalist><div class="grid2">
  <section class="panel stack">
    <div class="row"><div style="flex:2"><label for="i_prov">Proveedor</label><select id="i_prov"><option value="">Elegí de quién compraste</option>${D.proveedores.map(p => `<option value="${p.id}" ${p.id === ing.prov ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}<option value="_nuevo">+ Otro proveedor (nuevo)…</option></select></div>
      <div><label for="i_comp">Factura o remito (opcional)</label><input id="i_comp" value="${esc(ing.comp)}"></div></div>
    ${ing.prov === '_nuevo' ? `<div class="row"><div style="flex:3"><label for="i_np">Nombre del proveedor nuevo</label><input id="i_np" placeholder="Ej.: oferta Mayorista X"></div><button class="btn" style="flex:0" data-act="i_np">Crear</button></div>` : ''}
    ${ing.prov && ing.prov !== '_nuevo' ? `<div><label for="i_q">Buscá en la lista de ${esc(prov(ing.prov).nombre)} o escaneá un producto tuyo</label>
      <input id="i_q" class="scan" autocomplete="off" value="${esc(ing.q)}" placeholder="Nombre, código del proveedor o código de barras">
      ${ing.sug.length ? `<ul class="sugs">${ing.sug.map((a, k) => `<li data-act="i_add" data-k="${k}"><span>${esc(a.descripcion)} <span class="muted">· ${esc(a.codigo)}</span>${a.productos ? ` <span class="pill ok">${esc(a.productos.nombre)}</span>` : ''}</span><span class="num">${fmt(a.costo)}</span></li>`).join('')}</ul>` : ''}
      <button class="link" style="margin-top:6px" data-act="i_manual">+ Producto que no está en la lista</button></div>` : ''}
    <div class="tablewrap">${ing.items.length ? `<table><thead><tr><th>Producto</th><th>Cant.</th><th class="r">Costo lista</th><th class="r">Costo final</th><th class="r">Venta</th><th></th></tr></thead><tbody>
    ${ing.items.map((l, k) => { const nuevo = !l.producto_id; return `<tr><td style="min-width:240px">
      ${l.desc ? `<div class="muted">${esc(l.desc)}</div>` : ''}
      <input list="dl_prod" data-il="nombre" data-k="${k}" value="${esc(l.nombre)}" aria-label="Producto">
      ${nuevo ? `<div class="row" style="margin-top:6px"><span class="pill warn" style="flex:0;align-self:center">Nuevo</span>
        <input class="num" data-il="cb" data-k="${k}" value="${esc(l.nuevo.codigo_barras)}" placeholder="Código de barras" aria-label="Código de barras">
        <select data-il="rubro" data-k="${k}" aria-label="Categoría">${D.rubros.map(r => `<option value="${r.id}" ${r.id === l.nuevo.rubro_id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select>
        <select data-il="perfil" data-k="${k}" aria-label="Perfil">${D.perfiles.map(f => `<option value="${f.id}" ${f.id === l.nuevo.perfil_id ? 'selected' : ''}>${esc(f.nombre)} +${+f.porcentaje}%</option>`).join('')}</select></div>
        ${l.sugerido && D.productos.find(p => p.id === l.sugerido) ? `<div class="msg ok" style="margin-top:6px">¿Es <b>${esc(D.productos.find(p => p.id === l.sugerido).nombre)}</b>, que ya tenés? <button class="link" data-act="i_usar" data-k="${k}">Sí, es ese</button></div>` : ''}`
        : (D.productos.find(p => p.id === l.producto_id)?.dadoDeBaja ? `<span class="pill warn">Estaba dado de baja · se reactiva al cargar</span>` : `<span class="pill ok">Ya lo tenés · stock ${D.productos.find(p => p.id === l.producto_id)?.stock ?? 0}</span>`)}</td>
      <td><input class="num" style="width:64px" data-il="cantidad" data-k="${k}" value="${esc(l.cantidad)}" inputmode="numeric" aria-label="Cantidad"></td>
      <td class="r"><input class="num" style="width:100px;text-align:right" data-il="costo" data-k="${k}" value="${esc(l.costo)}" inputmode="decimal" aria-label="Costo"></td>
      <td class="r num">${fmt(costoFinalIng(l.costo))}</td><td class="r num"><b>${fmt(precioVentaIng(l))}</b></td>
      <td class="r"><button class="link" data-act="i_del" data-k="${k}">Quitar</button></td></tr>`; }).join('')}
    </tbody></table>` : `<div class="empty">${ing.prov ? 'Buscá los artículos que compraste y agregalos.' : 'Primero elegí el proveedor.'}</div>`}</div>
  </section>
  <aside class="panel stack">
    <h2>Costos de esta compra</h2>
    <label class="check"><input type="checkbox" id="i_iva" ${ing.iva ? 'checked' : ''}> Sumar IVA (${+D.config.iva_pct}%) al costo de lista</label>
    <div><label for="i_env">Envío o flete (% sobre el costo)</label><input id="i_env" class="num" inputmode="decimal" value="${esc(ing.envio)}"></div>
    <p class="muted" style="margin:0">Costo final = costo de lista${ing.iva ? ' + IVA' : ''} + ${dec(ing.envio) || 0}% de envío. Ese pasa a ser el costo del producto y el precio de venta se recalcula con su perfil.</p>
    <div class="total"><span>Total compra</span><b class="num">${fmt(total)}</b></div>
    <button class="btn primary big" data-act="i_ok" ${ing.items.length && !busy ? '' : 'disabled'}>${busy ? 'Guardando…' : 'Cargar al stock'}</button>
    ${ing.items.length ? `<button class="link" data-act="i_reset">Descartar este ingreso</button>` : ''}
  </aside></div>`;
}
function lineaDesdeArticulo(a) {
  const prod = a.producto_id ? D.productos.find(p => p.id === a.producto_id) : null;
  const nom = prod ? prod.nombre : nombreLimpio(a.descripcion);
  const ex = !prod && D.productos.find(p => p.nombre.toLowerCase() === nom.toLowerCase());
  const p2 = prod || ex;
  const sim = !p2 ? parecido(nom) : null;
  return { sugerido: sim ? sim.id : null, articulo_id: a.id, desc: `${a.codigo} · ${a.descripcion}`, nombre: p2 ? p2.nombre : nom, producto_id: p2 ? p2.id : null, cantidad: a.unidades_bulto || 1, costo: a.costo ?? '',
    nuevo: { nombre: nom, codigo_barras: '', rubro_id: adivinarRubro(a.descripcion), perfil_id: D.perfiles[0]?.id, stock_minimo: 0 } };
}
let iTimer = null;
async function buscarArticulos() {
  const t = ing.q.trim(); if (t.length < 2) { ing.sug = []; return render(); }
  ing.sug = await q(sb.from('articulos_proveedor').select('*, productos(nombre)').eq('proveedor_id', ing.prov).eq('activo', true)
    .or(`descripcion.ilike.%${t.replace(/[%,()]/g, ' ').replace(/\s+/g, '%')}%,codigo.eq.${t.replace(/[,()]/g, '')}`).order('descripcion').limit(10));
  render(); const i = $('#i_q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
async function confirmarIngreso() {
  for (const l of ing.items) if (!l.producto_id && l.nuevo.codigo_barras) { const p = await porCodigo(l.nuevo.codigo_barras); if (p) { l.producto_id = p.id; l.nombre = p.nombre; } }
  for (const l of ing.items) {
    if (!(+l.cantidad > 0)) throw new Error('Revisá las cantidades.');
    if (l.costo === '' || isNaN(dec(l.costo))) throw new Error(`Falta el costo de ${l.nombre}.`);
    if (!l.producto_id && !l.nombre.trim()) throw new Error('Hay un producto sin nombre.');
  }
  busy = true; render();
  try {
    const r = await q(sb.rpc('registrar_compra', { p: { proveedor_id: ing.prov, envio_pct: dec(ing.envio), suma_iva: ing.iva, comprobante: ing.comp,
      items: ing.items.map(l => ({ articulo_id: l.articulo_id || null, producto_id: l.producto_id || null, cantidad: parseInt(l.cantidad), costo: dec(l.costo),
        nuevo: l.producto_id ? null : { ...l.nuevo, nombre: l.nombre.trim() } })) } }));
    const pv = ing.prov, ped = ing.pedido;
    if (ped) await q(sb.from('pedidos').update({ estado: 'recibido', recibido: new Date().toISOString() }).eq('id', ped));
    nuevoIngreso(pv); peds = null; await cargar(); busy = false;
    toast(`Mercadería cargada: ${r.items} productos por ${fmt(r.total)}.`);
  } finally { busy = false; }
}

/* ---------------- PERFILES POR CATEGORÍA ---------------- */
function perfilesPorCategoria() {
  return `<section class="panel stack" style="max-width:780px"><h2>Aplicar un perfil a una categoría</h2>
  <p class="muted" style="margin:0">Cambia el perfil de todos los productos de esa categoría (también los que tenían precio fijo).</p>
  <div class="row"><div><label for="ap_r">Categoría</label><select id="ap_r">${D.rubros.map(r => `<option value="${r.id}">${esc(r.nombre)} (${D.productos.filter(p => p.rubro_id === r.id).length})</option>`).join('')}</select></div>
  <div><label for="ap_p">Perfil</label><select id="ap_p">${D.perfiles.map(f => `<option value="${f.id}">${esc(f.nombre)} +${+f.porcentaje}%</option>`).join('')}</select></div>
  <button class="btn primary" style="flex:none;white-space:nowrap" data-act="ap_ok">Aplicar</button></div>
  <div class="row"><div style="flex:3"><label for="nr">Nueva categoría</label><input id="nr" placeholder="Ej.: Vinos premium"></div><button class="btn" style="flex:0" data-act="nr_ok">Crear</button></div></section>`;
}

/* ---------------- EVENTOS (proveedores, ingreso, categorías) ---------------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id, k = +t.dataset.k;
  if (!/^(p_|i_|ap_|nr_)/.test(a)) return;
  run(async () => {
    switch (a) {
      case 'p_imp': return dlgImportar(id);
      case 'p_cat': return dlgCatalogo(id);
      case 'p_ok': { const btn = $('#p_ok'); btn.disabled = true; btn.textContent = 'Cargando…';
        let tot = { total: 0, nuevos: 0, precios_cambiados: 0, no_figuran: 0 }, n = 0;
        for (const [i, ar] of imp.archivos.entries()) { if (!ar.items.length) continue;
          const nom = $('#imp_n_' + i).value.trim(); if (!nom) { btn.disabled = false; btn.textContent = 'Cargar'; throw new Error('Poné un nombre a cada catálogo.'); }
          const r = await q(sb.rpc('importar_catalogo', { p_proveedor: imp.id, p_nombre: nom, p_fecha: $('#imp_f_' + i).value || null, p_archivo: ar.nombre, p_items: ar.items }));
          for (const k in tot) tot[k] += r[k] || 0; n++; }
        $('#dlg').close(); D.proveedores = await q(sb.from('proveedores').select('*').eq('activo', true).order('nombre')); D.catalogos = null; provCount = {};
        msg = ['ok', `${n} catálogo${n === 1 ? '' : 's'} cargado${n === 1 ? '' : 's'}: ${tot.total} artículos (${tot.nuevos} nuevos, ${tot.precios_cambiados} con precio nuevo${tot.no_figuran ? `, ${tot.no_figuran} ya no figuran` : ''}).`]; break; }
      case 'p_cats': return dlgCatalogos(id);
      case 'p_cdel': { const c = D.catalogos.find(c => c.id === id);
        return dlg(`<h2>¿Borrar el catálogo «${esc(c.nombre)}»?</h2><p style="margin:0">Se borran sus ${c.articulos} artículos. Tus productos y las compras registradas no se tocan.</p><div class="row"><button class="btn" data-act="p_cats" data-id="${c.proveedor_id}">Volver</button><button class="btn primary" data-act="p_cdel2" data-id="${c.id}">Borrar catálogo</button></div>`); }
      case 'p_cdel2': { const c = D.catalogos.find(c => c.id === id); await q(sb.from('catalogos').delete().eq('id', id));
        await contarArticulos(); return dlgCatalogos(c.proveedor_id); }
      case 'p_add': { const n = $('#np').value.trim(); if (!n) return $('#np').focus();
        await q(sb.from('proveedores').insert({ nombre: n })); D.proveedores = await q(sb.from('proveedores').select('*').eq('activo', true).order('nombre')); provCount = {}; msg = ['ok', 'Proveedor agregado.']; break; }
      case 'p_del1': { const p = prov(id), n = provCount[p.id] ?? 0;
        return dlg(`<h2>¿Borrar ${esc(p.nombre)}?</h2><p style="margin:0">Se borra el proveedor y los <b>${n}</b> artículos de su catálogo. Las compras que ya registraste y tus productos no se tocan.</p><div class="row"><button class="btn" data-act="cerrardlg">Cancelar</button><button class="btn primary" data-act="p_del2" data-id="${p.id}">Sí, continuar</button></div>`); }
      case 'p_del2': { const p = prov(id);
        return dlg(`<h2>Confirmá el borrado</h2><p style="margin:0">Esto no se puede deshacer. Escribí <b>${esc(p.nombre)}</b> para confirmar.</p><input id="p_conf" autocomplete="off"><div class="row"><button class="btn" data-act="cerrardlg">Cancelar</button><button class="btn primary" data-act="p_del3" data-id="${p.id}">Borrar definitivamente</button></div>`); }
      case 'p_del3': { const p = prov(id);
        if ($('#p_conf').value.trim().toLowerCase() !== p.nombre.toLowerCase()) throw new Error('El nombre no coincide. No se borró nada.');
        await q(sb.from('articulos_proveedor').delete().eq('proveedor_id', id));
        const { error } = await sb.from('proveedores').delete().eq('id', id);
        if (error) await q(sb.from('proveedores').update({ activo: false, nombre: `${p.nombre} (borrado ${fecha(new Date())} ${hora(new Date())})` }).eq('id', id));
        $('#dlg').close(); D.proveedores = await q(sb.from('proveedores').select('*').eq('activo', true).order('nombre')); provCount = {};
        if (ing && ing.prov === id) nuevoIngreso(''); msg = ['ok', `Proveedor ${p.nombre} borrado.`]; break; }
      case 'i_np': { const n = $('#i_np').value.trim(); if (!n) return $('#i_np').focus();
        const p = await q(sb.from('proveedores').insert({ nombre: n }).select().single()); D.proveedores = await q(sb.from('proveedores').select('*').eq('activo', true).order('nombre')); nuevoIngreso(p.id); break; }
      case 'i_add': { const art = ing.sug[k]; ing.items.push(lineaDesdeArticulo(art)); ing.q = ''; ing.sug = []; break; }
      case 'i_manual': ing.items.push({ articulo_id: null, desc: '', nombre: '', producto_id: null, cantidad: 1, costo: '', nuevo: { nombre: '', codigo_barras: '', rubro_id: D.rubros[0]?.id, perfil_id: D.perfiles[0]?.id, stock_minimo: 0 } }); break;
      case 'i_usar': { const l = ing.items[k], p = D.productos.find(p => p.id === l.sugerido); l.producto_id = p.id; l.nombre = p.nombre; l.sugerido = null; break; }
      case 'i_del': ing.items.splice(k, 1); break;
      case 'i_reset': nuevoIngreso(ing.prov); break;
      case 'i_ok': return confirmarIngreso();
      case 'ap_ok': { const n = await q(sb.rpc('aplicar_perfil_rubro', { p_perfil: $('#ap_p').value, p_rubro: $('#ap_r').value })); await cargar(); msg = ['ok', `Perfil aplicado a ${n} productos.`]; break; }
      case 'nr_ok': { const n = $('#nr').value.trim(); if (!n) return $('#nr').focus(); await q(sb.from('rubros').insert({ nombre: n })); await cargar(); msg = ['ok', 'Categoría creada.']; break; }
    }
    render();
  });
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'p_q') { clearTimeout(iTimer); iTimer = setTimeout(() => run(() => dlgCatalogo(t.dataset.provid, t.value)), 300); return; }
  if (t.id === 'i_q') { ing.q = t.value; clearTimeout(iTimer); iTimer = setTimeout(() => run(buscarArticulos), 250); return; }
  if (t.id === 'i_comp') { ing.comp = t.value; return; }
  if (t.dataset.il) { const l = ing.items[+t.dataset.k], f = t.dataset.il;
    if (f === 'cantidad' || f === 'costo') l[f] = t.value; else if (f === 'cb') { l.nuevo.codigo_barras = t.value;
      clearTimeout(iTimer); const v = t.value;
      iTimer = setTimeout(() => run(async () => { const p = await porCodigo(v);
        if (p) { l.producto_id = p.id; l.nombre = p.nombre; l.sugerido = null; msg = ['ok', p.dadoDeBaja ? `Ese código es de ${p.nombre}, que estaba dado de baja: se reactiva y se le suma el stock.` : `Ese código es de ${p.nombre}: se va a sumar a ese producto.`]; render(); } }), 400); } }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'i_prov') { if (t.value === '_nuevo') { ing.prov = '_nuevo'; } else { const it = ing.items; nuevoIngreso(t.value); ing.items = it; } return render(); }
  if (t.id === 'i_iva') { ing.iva = t.checked; return render(); }
  if (t.id === 'i_env') { ing.envio = t.value; return render(); }
  if (t.dataset.il) { const l = ing.items[+t.dataset.k], f = t.dataset.il;
    if (f === 'nombre') { l.nombre = t.value; const p = D.productos.find(p => p.nombre.toLowerCase() === t.value.trim().toLowerCase()); l.producto_id = p ? p.id : null; }
    else if (f === 'rubro') l.nuevo.rubro_id = t.value; else if (f === 'perfil') l.nuevo.perfil_id = t.value;
    return render(); }
  if (t.dataset.prov) run(async () => {
    const f = t.dataset.prov, v = f === 'lista_incluye_iva' ? t.checked : f === 'envio_pct' ? dec(t.value) : t.value;
    await q(sb.from('proveedores').update({ [f]: v }).eq('id', t.dataset.id)); prov(t.dataset.id)[f] = v; msg = ['ok', 'Proveedor actualizado.']; render(); });
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'i_q' || e.key !== 'Enter') return;
  e.preventDefault(); const v = ing.q.trim(); if (!v) return;
  return run(async () => {
    const p = await porCodigo(v);
    if (!p) { if (ing.sug.length === 1) { ing.items.push(lineaDesdeArticulo(ing.sug[0])); ing.q = ''; ing.sug = []; render(); } return; }
    const art = await q(sb.from('articulos_proveedor').select('id,costo,codigo,descripcion').eq('proveedor_id', ing.prov).eq('producto_id', p.id).limit(1));
    ing.items.push({ articulo_id: art[0]?.id || null, desc: art[0] ? `${art[0].codigo} · ${art[0].descripcion}` : '', nombre: p.nombre, producto_id: p.id, cantidad: 1, costo: art[0]?.costo ?? '', nuevo: {} });
    ing.q = ''; ing.sug = []; render(); });
});

/* ---------------- ÁREA COMPRAS ---------------- */
let sub = 'comparar', cmp = { q: '', res: [], sel: new Set(), buscando: false }, peds = null, cTimer = null;
const SUBS = [['comparar', 'Comparar precios'], ['pedidos', 'Pedidos'], ['ingreso', 'Ingreso de mercadería'], ['proveedores', 'Proveedores']];
function compras() {
  if (peds === null) setTimeout(() => run(cargarPedidos));
  const n = (peds || []).filter(p => p.estado === 'armado').reduce((s, p) => s + p.pedido_items.length, 0);
  return `<div class="areahd"><b>Compras</b><nav class="subnav">${SUBS.map(([k, t]) => `<button data-sub="${k}" aria-current="${sub === k}">${t}${k === 'pedidos' && n ? ` <span class="cnt">${n}</span>` : ''}</button>`).join('')}</nav></div>
  ${({ comparar, pedidos, ingreso, proveedores })[sub]()}`;
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SINON = [['cerveza', 'cerv', 'cerve'], ['malbec', 'mal', 'mb'], ['cabernet', 'cab', 'caber'], ['sauvignon', 'sauv', 'sauvig'], ['chardonnay', 'chard', 'chardon'],
  ['reserva', 'rva', 'rsve', 'rsv', 'res', 'reserve'], ['espumante', 'esp', 'espum', 'champ', 'champagne', 'champana'], ['aperitivo', 'ap', 'aperit', 'aper'], ['gaseosa', 'gas'],
  ['energizante', 'ener', 'energ'], ['blanco', 'bco', 'blanc'], ['tinto', 'tto'], ['whisky', 'whiskey', 'whisk'], ['estuche', 'est'], ['botella', 'bot'], ['litro', 'lt', 'lts', 'ltr', 'ltro'], ['vermouth', 'vermut', 'vermu']];
function patrones(txt) {
  return norm(txt).split(' ').filter(w => w.length >= 2 || /\d/.test(w)).map(w => {
    const g = SINON.find(g => g.some(x => x === w || (w.length >= 4 && x.startsWith(w))));
    return '\\m(' + (g ? [...new Set([w, ...g])] : [w]).join('|') + ')';
  });
}
function precioArt(a) {
  const lista = +a.costo || 0, iva = a.lista_incluye_iva ? 0 : lista * D.config.iva_pct / 100, env = (lista + iva) * (+a.envio_pct || 0) / 100;
  return { lista, iva, env, final: lista + iva + env };
}
async function buscarCmp() {
  const pats = patrones(cmp.q);
  if (!pats.length) { cmp.res = []; return render(); }
  cmp.buscando = true;
  const r = await q(sb.rpc('buscar_articulos', { p_patrones: pats, p_limite: 150 }));
  r.forEach(a => a.p = precioArt(a));
  r.sort((x, y) => (y.vigente - x.vigente) || ((x.costo == null) - (y.costo == null)) || (x.p.final - y.p.final));
  cmp.res = r; cmp.buscando = false; render();
  const i = $('#c_q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function comparar() {
  const fl = a => a.fecha_lista || a.fecha_precio;
  const rows = cmp.res.map(a => { const p = a.p, ub = a.unidades_bulto || 0;
    if (!a.vigente) return `<tr class="nofig"><td></td><td><b>${esc(a.descripcion)}</b><div>${esc(a.codigo)} · ${esc(a.catalogo || '')}</div><div class="nofigtxt">No figura en el catálogo del ${fechaCorta(a.no_figura_desde)}</div></td><td>${esc(a.proveedor)}</td><td class="r num">antes ${fmt(a.costo)}</td><td></td><td></td><td></td></tr>`;
    return `<tr${cmp.sel.has(a.id) ? ' class="selrow"' : ''}><td><input type="checkbox" data-csel="${a.id}" ${cmp.sel.has(a.id) ? 'checked' : ''} aria-label="Comparar"></td>
    <td style="min-width:220px"><b>${esc(a.descripcion)}</b><div class="muted">${esc(a.codigo)} · ${esc(a.catalogo || 'sin catálogo')} · ${fechaCorta(fl(a))} ${viejo(fl(a)) ? '<span class="pill warn">precio viejo</span>' : ''}</div></td>
    <td>${esc(a.proveedor)}</td>
    ${a.costo == null ? '<td class="r"><span class="pill warn">sin precio</span></td><td class="r muted">a confirmar</td>' : `<td class="r num desg">${fmt(p.lista)}${p.iva ? `<div>+ IVA ${fmt(p.iva)}</div>` : ''}${p.env ? `<div>+ envío ${+a.envio_pct}% ${fmt(p.env)}</div>` : ''}</td>
    <td class="r num"><b>${fmt(p.final)}</b>${ub > 1 ? `<div class="muted">bulto x${ub}: ${fmt(p.final * ub)}</div>` : ''}</td>`}
    <td><div class="row" style="flex-wrap:nowrap;gap:4px"><input class="num" id="cq_${a.id}" value="1" inputmode="numeric" style="width:52px;min-width:0;flex:none" aria-label="Cantidad">${ub > 1 ? `<select id="cu_${a.id}" style="min-width:0;flex:none;width:auto" aria-label="Unidad"><option value="b">bultos x${ub}</option><option value="u">unid.</option></select>` : '<span class="muted" style="flex:0;align-self:center">unid.</span>'}</div></td>
    <td><button class="btn" data-act="c_add" data-id="${a.id}">Agregar</button></td></tr>`; }).join('');
  return `<section class="panel stack">
    <div class="row" style="align-items:end"><div style="flex:4"><label for="c_q">Buscá en todos los catálogos</label><input id="c_q" class="scan" autocomplete="off" value="${esc(cmp.q)}" placeholder="Ej.: lata quilmes, gancia, fernet 750"></div>
    <button class="btn primary" style="flex:none;white-space:nowrap" data-act="c_cmp" ${cmp.sel.size >= 2 ? '' : 'disabled'}>Comparar${cmp.sel.size ? ` (${cmp.sel.size})` : ''}</button></div>
    <p class="muted" style="margin:0">Ordenado del más barato al más caro según el costo final (con IVA y envío de cada proveedor). Tildá dos o más para compararlos lado a lado.</p>
    ${cmp.q && !cmp.buscando && !cmp.res.length ? `<div class="empty">No encontré nada con «${esc(cmp.q)}». Probá con menos palabras o solo la marca.</div>` : ''}
    ${cmp.res.length ? `<div class="tablewrap"><table><thead><tr><th></th><th>Artículo</th><th>Proveedor</th><th class="r">Lista</th><th class="r">Costo final unit.</th><th>Cantidad</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${cmp.res.length >= 150 ? '<p class="muted" style="margin:0">Hay más resultados: agregá otra palabra para afinar.</p>' : ''}` : ''}
    ${!cmp.q ? '<div class="empty">Escribí una marca o un producto. No importa cómo lo llame cada proveedor.</div>' : ''}
  </section>`;
}
function dlgComparar() {
  const L = cmp.res.filter(a => cmp.sel.has(a.id)), min = Math.min(...L.filter(a => a.costo != null).map(a => a.p.final));
  const fila = (t, f) => `<tr><th style="text-transform:none;letter-spacing:0">${t}</th>${L.map(a => `<td class="r num">${f(a)}</td>`).join('')}</tr>`;
  dlg(`<h2>Comparación</h2><div class="tablewrap"><table><thead><tr><th></th>${L.map(a => `<th class="r" style="text-transform:none;letter-spacing:0;min-width:150px">${esc(a.proveedor)}<div class="muted" style="font-weight:400">${esc(a.descripcion)}</div></th>`).join('')}</tr></thead><tbody>
  ${fila('Catálogo', a => `${esc(a.catalogo || '—')}<div class="muted">${fechaCorta(a.fecha_lista || a.fecha_precio)}</div>`)}
  ${fila('Precio de lista', a => fmt(a.p.lista))}
  ${fila('IVA', a => a.p.iva ? '+ ' + fmt(a.p.iva) : 'incluido')}
  ${fila('Envío', a => a.p.env ? `+ ${fmt(a.p.env)} (${+a.envio_pct}%)` : '—')}
  ${fila('<b>Costo final</b>', a => a.costo == null ? 'sin precio' : `<b class="${a.p.final === min ? 'best' : ''}">${fmt(a.p.final)}</b>`)}
  ${fila('Diferencia', a => a.costo == null ? '—' : a.p.final === min ? '<span class="pill ok">el más barato</span>' : '+ ' + fmt(a.p.final - min))}
  ${fila('Bulto', a => a.unidades_bulto > 1 ? `x${a.unidades_bulto} · ${fmt(a.p.final * a.unidades_bulto)}` : '—')}
  ${fila('', a => `<button class="btn" data-act="c_add" data-id="${a.id}">Agregar al pedido</button>`)}
  </tbody></table></div><button class="btn" data-act="cerrardlg">Cerrar</button>`);
}

/* ---------------- PEDIDOS ---------------- */
async function cargarPedidos() {
  try { peds = await q(sb.from('pedidos').select('*, proveedores(nombre,telefono,envio_pct,lista_incluye_iva), pedido_items(*)').in('estado', ['armado', 'enviado']).order('creado')); } catch (e) { peds = []; throw e; }
  render();
}
const unidadesItem = i => i.cantidad * (i.por_bulto ? (i.unidades_bulto || 1) : 1);
const precioItem = (i, pr) => precioArt({ costo: i.costo, lista_incluye_iva: pr.lista_incluye_iva, envio_pct: pr.envio_pct });
function pedidos() {
  if (peds === null) return '<div class="empty">Cargando pedidos…</div>';
  if (!peds.length) return `<section class="panel"><div class="empty">No hay pedidos en armado. Buscá productos en «Comparar precios» y tocá «Agregar».</div></section>`;
  return `<div class="stack">${peds.map(p => { const pr = p.proveedores;
    const t = p.pedido_items.reduce((s, i) => { const x = precioItem(i, pr), u = unidadesItem(i); return { lista: s.lista + x.lista * u, final: s.final + x.final * u, u: s.u + u }; }, { lista: 0, final: 0, u: 0 });
    return `<section class="panel stack"><div class="row" style="align-items:center">
      <div style="flex:3"><h2 style="margin:0">${esc(pr.nombre)} <span class="pill ${p.estado === 'armado' ? 'warn' : 'ok'}">${p.estado === 'armado' ? 'En armado' : 'Enviado el ' + fecha(p.enviado)}</span></h2><div class="muted">${p.pedido_items.length} artículos · ${t.u} unidades</div></div>
      <div style="flex:1;text-align:right"><div class="muted">Lista ${fmt(t.lista)}</div><b class="num" style="font-size:20px">${fmt(t.final)}</b><div class="muted">con IVA y envío</div></div></div>
    <div class="tablewrap"><table><thead><tr><th>Código</th><th>Artículo</th><th>Cantidad</th><th class="r">Costo final</th><th></th></tr></thead><tbody>
    ${p.pedido_items.map(i => `<tr><td class="num">${esc(i.codigo || '')}</td><td>${esc(i.descripcion)}</td>
      <td><div class="row" style="flex-wrap:nowrap;gap:6px;align-items:center"><input class="num" style="width:60px;min-width:0;flex:none" data-pi="${i.id}" value="${i.cantidad}" inputmode="numeric" aria-label="Cantidad"><span class="muted" style="flex:none;white-space:nowrap">${i.por_bulto ? `bultos x${i.unidades_bulto}` : 'unid.'}</span></div></td>
      <td class="r num">${i.costo == null ? '<span class="pill warn">sin precio</span>' : fmt(precioItem(i, pr).final * unidadesItem(i))}</td><td class="r"><button class="link" data-act="pd_del" data-id="${i.id}">Quitar</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row"><button class="btn primary" style="flex:none;white-space:nowrap" data-act="pd_wa" data-id="${p.id}">Texto para WhatsApp</button>
      ${p.estado === 'armado' ? `<button class="btn" style="flex:none;white-space:nowrap" data-act="pd_env" data-id="${p.id}">Marcar como enviado</button>` : ''}
      <button class="btn" style="flex:none;white-space:nowrap" data-act="pd_rec" data-id="${p.id}">Llegó: pasar a ingreso</button>
      <button class="link" style="flex:none;white-space:nowrap" data-act="pd_can" data-id="${p.id}">Descartar pedido</button></div></section>`; }).join('')}</div>`;
}
function textoPedido(p) {
  const u = i => i.por_bulto ? `${i.cantidad} ${i.cantidad === 1 ? 'bulto' : 'bultos'}${i.unidades_bulto ? ` x${i.unidades_bulto}` : ''}` : `${i.cantidad} ${i.cantidad === 1 ? 'unidad' : 'unidades'}`;
  return `Hola! Te paso el pedido de ${D.config.nombre_local}:\n\n${p.pedido_items.map(i => `• ${u(i)} - ${i.codigo ? `[${i.codigo}] ` : ''}${i.descripcion}`).join('\n')}\n\nGracias!`;
}
const waNum = t => { let d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('54')) return d; return '549' + d.replace(/^0/, ''); };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-sub]'); if (!t) return;
  sub = t.dataset.sub; msg = null; if (sub === 'pedidos') peds = null; render();
  if (sub === 'comparar') { const i = $('#c_q'); if (i) i.focus(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  if (!/^(c_|pd_)/.test(a)) return;
  run(async () => {
    switch (a) {
      case 'c_cmp': return dlgComparar();
      case 'c_add': { const art = cmp.res.find(x => x.id === id), ub = art.unidades_bulto || 0;
        const cant = parseInt($('#cq_' + id)?.value) || 1, bulto = ub > 1 && ($('#cu_' + id)?.value || 'b') === 'b';
        await q(sb.rpc('agregar_a_pedido', { p_articulo: id, p_cantidad: cant, p_por_bulto: bulto }));
        peds = null; if ($('#dlg').open) $('#dlg').close();
        msg = ['ok', `Agregado al pedido de ${art.proveedor}: ${cant} ${bulto ? 'bulto(s)' : 'unid.'} de ${art.descripcion}.`]; break; }
      case 'pd_del': await q(sb.from('pedido_items').delete().eq('id', id)); await cargarPedidos(); return;
      case 'pd_env': await q(sb.from('pedidos').update({ estado: 'enviado', enviado: new Date().toISOString() }).eq('id', id)); await cargarPedidos(); return;
      case 'pd_wa': { const p = peds.find(x => x.id === id), txt = textoPedido(p), n = waNum(p.proveedores.telefono);
        return dlg(`<h2>Pedido para ${esc(p.proveedores.nombre)}</h2><textarea id="pd_txt" rows="12" style="width:100%;font:13px/1.45 var(--f-mono);color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px">${esc(txt)}</textarea>
        <div class="row"><button class="btn primary" data-act="pd_copy">Copiar texto</button>${n ? `<a class="btn" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${n}?text=${encodeURIComponent(txt)}">Abrir WhatsApp</a>` : ''}<button class="btn" data-act="cerrardlg">Cerrar</button></div>
        ${n ? '' : '<p class="muted" style="margin:0">Cargá el WhatsApp del proveedor en «Proveedores» para abrirlo directo.</p>'}`); }
      case 'pd_copy': { const ta = $('#pd_txt'); try { await navigator.clipboard.writeText(ta.value); } catch (er) { ta.select(); document.execCommand('copy'); }
        t.textContent = 'Copiado'; return; }
      case 'pd_can': return dlg(`<h2>¿Descartar este pedido?</h2><p style="margin:0">Se borra el pedido con todos sus artículos.</p><div class="row"><button class="btn" data-act="cerrardlg">Volver</button><button class="btn primary" data-act="pd_can2" data-id="${id}">Descartar</button></div>`);
      case 'pd_can2': await q(sb.from('pedidos').update({ estado: 'cancelado' }).eq('id', id)); $('#dlg').close(); await cargarPedidos(); return;
      case 'pd_rec': { const p = peds.find(x => x.id === id), ids = p.pedido_items.map(i => i.articulo_id).filter(Boolean);
        const arts = ids.length ? await q(sb.from('articulos_proveedor').select('*, productos(nombre)').in('id', ids)) : [];
        nuevoIngreso(p.proveedor_id); ing.pedido = p.id;
        ing.items = p.pedido_items.map(i => { const art = arts.find(x => x.id === i.articulo_id);
          const l = art ? lineaDesdeArticulo(art) : { articulo_id: null, desc: i.descripcion, nombre: nombreLimpio(i.descripcion), producto_id: null, costo: i.costo ?? '',
            nuevo: { nombre: nombreLimpio(i.descripcion), codigo_barras: '', rubro_id: adivinarRubro(i.descripcion), perfil_id: D.perfiles[0]?.id, stock_minimo: 0 } };
          l.cantidad = unidadesItem(i); return l; });
        sub = 'ingreso'; msg = ['ok', `Pedido de ${p.proveedores.nombre} cargado. Revisá lo que llegó (cantidades y costos) y confirmá con «Cargar al stock».`]; break; }
    }
    render();
  });
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'c_q') { cmp.q = t.value; clearTimeout(cTimer); cTimer = setTimeout(() => run(buscarCmp), 300); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.csel) { t.checked ? cmp.sel.add(t.dataset.csel) : cmp.sel.delete(t.dataset.csel); return render(); }
  if (t.dataset.pi) { const v = parseInt(t.value); if (!(v > 0)) return render();
    run(async () => { await q(sb.from('pedido_items').update({ cantidad: v }).eq('id', t.dataset.pi)); await cargarPedidos(); }); }
});
