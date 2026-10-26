/* ---------------- PROVEEDORES ---------------- */
let provCount = {}, imp = null, ing = null;
const prov = id => (D.proveedores || []).find(p => p.id === id);
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function contarArticulos() {
  const r = await Promise.all(D.proveedores.map(p => sb.from('articulos_proveedor').select('id', { count: 'exact', head: true }).eq('proveedor_id', p.id)));
  D.proveedores.forEach((p, i) => provCount[p.id] = r[i].count || 0); render();
}
function proveedores() {
  if (!Object.keys(provCount).length && D.proveedores.length) setTimeout(() => run(contarArticulos));
  const F = Listas.FORMATOS;
  return `<section class="panel stack"><div class="row"><div style="flex:3"><h2 style="margin:0">Proveedores</h2><p class="muted" style="margin:4px 0 0">Cada proveedor tiene su propio catálogo, tal como viene en su lista. Al actualizar la lista se agregan los artículos nuevos y se actualizan los precios por código.</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Proveedor</th><th>Formato de su lista</th><th>Lista con IVA</th><th>Envío %</th><th class="r">Artículos</th><th>Actualizada</th><th></th></tr></thead><tbody>
  ${D.proveedores.map(p => `<tr><td><b>${esc(p.nombre)}</b></td>
    <td><select data-prov="formato" data-id="${p.id}" aria-label="Formato"><option value="auto" ${p.formato === 'auto' ? 'selected' : ''}>Detectar solo</option>${Object.entries(F).map(([k, f]) => `<option value="${k}" ${p.formato === k ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}</select></td>
    <td><label class="check"><input type="checkbox" data-prov="lista_incluye_iva" data-id="${p.id}" ${p.lista_incluye_iva ? 'checked' : ''}> Incluye</label></td>
    <td><input class="num" style="width:70px" data-prov="envio_pct" data-id="${p.id}" value="${+p.envio_pct}" inputmode="decimal" aria-label="Envío"></td>
    <td class="r num">${provCount[p.id] ?? '…'}</td><td class="muted">${p.lista_actualizada ? fecha(p.lista_actualizada) : 'nunca'}</td>
    <td class="r" style="white-space:nowrap"><button class="link" data-act="p_imp" data-id="${p.id}">Actualizar lista</button><button class="link" data-act="p_cat" data-id="${p.id}">Ver catálogo</button><button class="link" data-act="p_del1" data-id="${p.id}">Borrar</button></td></tr>`).join('')}
  </tbody></table></div>
  <div class="row"><div style="flex:3"><label for="np">Nuevo proveedor</label><input id="np" placeholder="Nombre de la distribuidora o del vendedor"></div><button class="btn" style="flex:0" data-act="p_add">Agregar</button></div></section>`;
}
function dlgImportar(id) {
  imp = { id, archivos: [] };
  dlg(`<h2>Actualizar lista de ${esc(prov(id).nombre)}</h2>
  <p class="muted" style="margin:0">Elegí el PDF o los Excel que te mandaron. Si viene en varios archivos, seleccionalos todos juntos.</p>
  <input type="file" id="p_files" multiple accept=".pdf,.xlsx,.xls,.csv">
  <div id="p_prev"></div>
  <div class="row"><button class="btn" data-act="cerrardlg">Cancelar</button><button class="btn primary" data-act="p_ok" id="p_ok" disabled>Cargar lista</button></div>`);
  $('#p_files').onchange = e => run(() => leerArchivos([...e.target.files]));
}
async function leerArchivos(files) {
  const p = prov(imp.id); $('#p_prev').innerHTML = '<p class="muted">Leyendo…</p>';
  imp.archivos = [];
  for (const f of files) {
    const buf = await f.arrayBuffer(); let r;
    if (/\.pdf$/i.test(f.name)) r = Listas.leer({ lineas: await Listas.pdfLineas(pdfjsLib, new Uint8Array(buf)) }, p.formato);
    else { const wb = XLSX.read(buf, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; r = Listas.leer({ filas: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }), archivo: f.name }, p.formato); }
    imp.archivos.push({ nombre: f.name, ...r });
  }
  imp.items = Listas.unir(imp.archivos.map(a => a.items));
  const ej = imp.items.slice(0, 6);
  $('#p_prev').innerHTML = `<div class="tablewrap"><table><tbody>${imp.archivos.map(a => `<tr><td>${esc(a.nombre)}</td><td class="muted">${esc(Listas.FORMATOS[a.formato]?.nombre || '')}</td><td class="r num"><b>${a.items.length}</b> artículos${a.noLeidas.length ? ` · <span class="pill warn">${a.noLeidas.length} sin leer</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
  ${imp.items.length ? `<p class="muted" style="margin:0">Así quedan los primeros (revisá que el costo sea el unitario):</p><div class="tablewrap"><table><thead><tr><th>Código</th><th>Artículo</th><th class="r">Costo unit.</th></tr></thead><tbody>${ej.map(i => `<tr><td class="num">${esc(i.codigo)}</td><td>${esc(i.descripcion)}</td><td class="r num">${fmt(i.costo)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="msg bad">No pude leer artículos de este archivo. Probá elegir otro formato para este proveedor.</div>`}
  ${imp.archivos.some(a => a.noLeidas.length) ? `<details><summary class="muted">Ver líneas que no se pudieron leer</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(imp.archivos.flatMap(a => a.noLeidas).slice(0, 30).join('\n'))}</pre></details>` : ''}`;
  $('#p_ok').disabled = !imp.items.length; $('#p_ok').textContent = `Cargar ${imp.items.length} artículos`;
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
    const pv = ing.prov; nuevoIngreso(pv); await cargar(); busy = false;
    toast(`Mercadería cargada: ${r.items} productos por ${fmt(r.total)}.`);
  } finally { busy = false; }
}

/* ---------------- PERFILES POR CATEGORÍA ---------------- */
function perfilesPorCategoria() {
  return `<section class="panel stack" style="max-width:780px"><h2>Aplicar un perfil a una categoría</h2>
  <p class="muted" style="margin:0">Cambia el perfil de todos los productos de esa categoría (también los que tenían precio fijo).</p>
  <div class="row"><div><label for="ap_r">Categoría</label><select id="ap_r">${D.rubros.map(r => `<option value="${r.id}">${esc(r.nombre)} (${D.productos.filter(p => p.rubro_id === r.id).length})</option>`).join('')}</select></div>
  <div><label for="ap_p">Perfil</label><select id="ap_p">${D.perfiles.map(f => `<option value="${f.id}">${esc(f.nombre)} +${+f.porcentaje}%</option>`).join('')}</select></div>
  <button class="btn primary" style="flex:0;white-space:nowrap" data-act="ap_ok">Aplicar</button></div>
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
        const r = await q(sb.rpc('importar_lista', { p_proveedor: imp.id, p_items: imp.items }));
        $('#dlg').close(); D.proveedores = await q(sb.from('proveedores').select('*').eq('activo', true).order('nombre')); provCount = {};
        msg = ['ok', `Lista cargada: ${r.total} artículos (${r.nuevos} nuevos, ${r.precios_cambiados} con precio nuevo).`]; break; }
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
