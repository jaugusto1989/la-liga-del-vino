/* La Liga del Vino · mostrador, stock y caja (etapa 1) */
const sb = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);
const $ = s => document.querySelector(s);
const fmt = n => '$' + Math.round(+n || 0).toLocaleString('es-AR');
const fecha = d => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const hora = d => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = v => +String(v ?? '').replace(/[^\d,]/g, '').replace(',', '.') || 0;  // "40.000" -> 40000
const dec = v => +String(v ?? '').replace(',', '.') || 0;                            // "12,5" -> 12.5
const pctTxt = (p, c) => c ? ((p - c) / c * 100).toFixed(1).replace('.', ',') + '%' : '—';

function traducir(m) {
  if (/Invalid login/i.test(m)) return 'Mail o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Todavía no confirmaste tu mail. Revisá tu casilla.';
  if (/duplicate key.*codigo_barras/i.test(m)) return 'Ya hay un producto con ese código de barras.';
  if (/duplicate key/i.test(m)) return 'Ya existe un registro con ese nombre o código.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión con el servidor. Revisá internet y probá de nuevo.';
  return m;
}
async function q(p) { const { data, error } = await p; if (error) throw new Error(traducir(error.message)); return data; }

let U = null, D = {}, tab = 'vender', msg = null, busy = false;
let cart = [], pagos = [], cliente = '', qtxt = '', desc = { t: '%', v: '' }, bonif = false, motivo = '';
let ce = null, lastTicket = null;
const dueno = () => U && U.rol === 'dueno';
const medio = id => (D.medios || []).find(m => m.id === id) || { nombre: '—' };
const toast = (t, k = 'ok') => { msg = [k, t]; render(); };

/* ---------------- SESIÓN ---------------- */
async function iniciar() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return pantallaLogin();
  try {
    U = await q(sb.from('usuarios').select('*').eq('id', data.session.user.id).single());
  } catch (e) { return pantallaLogin('No encontré tu usuario. Probá cerrar sesión y volver a entrar.'); }
  if (!U.activo) return pantallaPendiente();
  await cargar();
  render();
}
function pantallaLogin(err) {
  $('#hdr').hidden = true;
  $('#app').innerHTML = `<form class="login panel" id="flogin">
    <h1>La Liga del Vino</h1>
    <div><label for="lm">Mail</label><input id="lm" type="email" autocomplete="username" required></div>
    <div><label for="lp">Contraseña</label><input id="lp" type="password" autocomplete="current-password" required minlength="6"></div>
    <div id="lnWrap" hidden><label for="ln">Tu nombre</label><input id="ln"></div>
    ${err ? `<div class="msg bad">${esc(err)}</div>` : ''}
    <button class="btn primary big" id="lbtn">Entrar</button>
    <button type="button" class="link" data-act="modoAlta">Crear una cuenta nueva</button>
  </form>`;
  $('#flogin').onsubmit = async e => {
    e.preventDefault();
    const alta = !$('#lnWrap').hidden, email = $('#lm').value.trim(), password = $('#lp').value;
    try {
      if (alta) {
        await q(sb.auth.signUp({ email, password, options: { data: { nombre: $('#ln').value.trim() } } }));
        $('#app').innerHTML = `<div class="login panel"><h1>Cuenta creada</h1><p>Te mandamos un mail para confirmar la cuenta. Después, entrá con tu mail y contraseña.</p><p class="muted">Si no sos el primer usuario, el dueño tiene que habilitarte desde Ajustes.</p><button class="btn primary" data-act="salir">Volver al inicio</button></div>`;
      } else {
        await q(sb.auth.signInWithPassword({ email, password }));
        iniciar();
      }
    } catch (er) { pantallaLogin(er.message); }
  };
}
function pantallaPendiente() {
  $('#hdr').hidden = true;
  $('#app').innerHTML = `<div class="login panel"><h1>Falta la aprobación</h1><p>Tu usuario está creado, pero el dueño todavía no lo habilitó. Avisale para que lo active desde Ajustes → Usuarios.</p><button class="btn" data-act="salir">Cerrar sesión</button></div>`;
}

/* ---------------- DATOS ---------------- */
async function cargar() {
  [D.config, D.catalogo, D.promos, D.medios, D.clientes, D.caja] = await Promise.all([
    q(sb.from('config').select('*').single()),
    q(sb.from('catalogo').select('*').order('nombre')),
    q(sb.from('promociones_catalogo').select('*').order('nombre')),
    q(sb.from('medios_pago').select('*').eq('activo', true).order('orden')),
    q(sb.from('clientes_saldo').select('*').order('nombre')),
    q(sb.from('cajas').select('*').eq('estado', 'abierta').maybeSingle())
  ]);
  if (dueno()) {
    [D.productos, D.perfiles, D.rubros, D.cierres, D.usuarios] = await Promise.all([
      q(sb.from('productos_detalle').select('*').eq('activo', true).order('nombre')),
      q(sb.from('perfiles_ganancia').select('*').order('porcentaje')),
      q(sb.from('rubros').select('*').order('nombre')),
      q(sb.from('cajas').select('*').eq('estado', 'cerrada').order('cierre', { ascending: false }).limit(30)),
      q(sb.from('usuarios').select('*').order('creado')),
      q(sb.from('proveedores').select('*').eq('activo', true).order('nombre'))
    ]).then(r => (D.proveedores = r.pop(), r));
  }
  await cargarCaja();
}
async function cargarCaja() {
  if (!D.caja) { D.ventas = []; D.movs = []; D.resumen = []; return; }
  [D.ventas, D.movs, D.resumen] = await Promise.all([
    q(sb.from('ventas').select('*,venta_items(*),venta_pagos(*)').eq('caja_id', D.caja.id).order('numero', { ascending: false })),
    q(sb.from('caja_movimientos').select('*').eq('caja_id', D.caja.id).order('fecha')),
    q(sb.rpc('resumen_caja'))
  ]);
}

/* ---------------- RENDER ---------------- */
const TABS = [['vender', 'Vender'], ['tickets', 'Tickets del día'], ['caja', 'Caja del día'], ['productos', 'Productos'],
  ['promos', 'Promociones', 1], ['ingreso', 'Ingreso de mercadería', 1], ['proveedores', 'Proveedores', 1], ['clientes', 'Cuentas corrientes'], ['perfiles', 'Perfiles de ganancia', 1], ['ajustes', 'Ajustes', 1]];
function render() {
  if (!U) return;
  $('#hdr').hidden = false;
  $('#marca').firstChild.textContent = D.config.nombre_local;
  $('#rolTxt').textContent = `${U.nombre} · ${dueno() ? 'Dueño' : 'Vendedor'}`;
  $('#tabs').innerHTML = TABS.filter(t => !t[2] || dueno()).map(([k, n]) => `<button data-tab="${k}" aria-current="${tab === k}">${n}</button>`).join('');
  $('#status').innerHTML = (D.caja ? `<span class="pill ok">Caja abierta</span> desde ${hora(D.caja.apertura)}` : `<span class="pill bad">Caja cerrada</span>`)
    + ` <button class="link" data-act="salir">Salir</button>`;
  const bajos = D.catalogo.filter(p => p.stock_bajo);
  const banner = bajos.length ? `<div class="banner"><b>Stock bajo:</b> ${bajos.map(p => `${esc(p.nombre)} (${p.stock})`).join(' · ')}</div>` : '';
  const top = msg ? `<div class="msg ${msg[0]} topmsg">${esc(msg[1])}</div>` : '';
  $('#app').innerHTML = banner + top + ({ vender, tickets, caja, productos, promos, clientes, perfiles, ajustes, ingreso, proveedores })[tab]();
  if (tab === 'vender' && !$('#dlg').open) { const i = $('#scan'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function dlg(html) { $('#dlgBody').oninput = null; $('#dlgBody').innerHTML = html; if (!$('#dlg').open) $('#dlg').showModal(); }

/* ---------------- VENDER ---------------- */
const prodC = id => D.catalogo.find(p => p.id === id);
const promo = id => D.promos.find(c => c.id === id);
const precioL = l => l.k === 'c' ? +promo(l.id).precio : +prodC(l.id).precio;
const nombreL = l => l.k === 'c' ? promo(l.id).nombre : prodC(l.id).nombre;
function demanda(cs) {
  const d = {};
  cs.forEach(l => { if (l.k === 'c') promo(l.id).items.forEach(i => d[i.producto_id] = (d[i.producto_id] || 0) + i.cantidad * l.q); else d[l.id] = (d[l.id] || 0) + l.q; });
  return d;
}
const subtotal = () => cart.reduce((s, l) => s + precioL(l) * l.q, 0);
function descuento() { const sub = subtotal(), v = dec(desc.v); return Math.max(0, Math.min(sub, Math.round(desc.t === '%' ? sub * v / 100 : money(desc.v)))); }
const totalCart = () => bonif ? 0 : subtotal() - descuento();
function buscar(t) {
  t = t.toLowerCase();
  return [...D.promos.filter(c => c.nombre.toLowerCase().includes(t)).map(c => ({ k: 'c', id: c.id, n: c.nombre, pr: c.precio, st: c.disponibles })),
    ...D.catalogo.filter(p => p.nombre.toLowerCase().includes(t)).map(p => ({ k: 'p', id: p.id, n: p.nombre, pr: p.precio, st: p.stock }))];
}
function agregar(k, id) {
  const nc = cart.map(l => ({ ...l })), l = nc.find(l => l.k === k && l.id === id);
  l ? l.q++ : nc.push({ k, id, q: 1 });
  const d = demanda(nc), falta = Object.keys(d).find(pid => d[pid] > (prodC(pid)?.stock ?? 0));
  if (falta) { msg = ['bad', `No hay stock suficiente de ${prodC(falta)?.nombre || 'un producto'} (quedan ${prodC(falta)?.stock ?? 0}).`]; return; }
  cart = nc; msg = null; qtxt = '';
}
function vender() {
  const sub = subtotal(), dsc = bonif ? 0 : descuento(), tot = totalCart();
  const sug = qtxt && !/^\d{6,}$/.test(qtxt) ? buscar(qtxt).slice(0, 8) : [];
  if (!pagos.length) pagos = [{ m: D.medios[0]?.id, monto: '' }];
  const pagado = pagos.reduce((s, x) => s + money(x.monto), 0), resta = tot - pagado;
  const usaCC = pagos.some(x => medio(x.m).es_cuenta_corriente);
  const rows = cart.map(l => `<tr><td>${esc(nombreL(l))}${l.k === 'c' ? ' <span class="pill ok">Promo</span><div class="muted">' + promo(l.id).items.map(i => i.cantidad + '× ' + esc(i.nombre)).join(' + ') + '</div>' : '<div class="muted">' + esc(prodC(l.id).codigo_barras || '') + '</div>'}</td>
    <td><span class="qty"><button data-act="menos" data-k="${l.k}" data-id="${l.id}" aria-label="Restar">−</button><span class="num">${l.q}</span><button data-act="mas" data-k="${l.k}" data-id="${l.id}" aria-label="Sumar">+</button></span></td>
    <td class="r num">${fmt(precioL(l))}</td><td class="r num">${fmt(precioL(l) * l.q)}</td>
    <td class="r"><button class="link" data-act="quitar" data-k="${l.k}" data-id="${l.id}">Quitar</button></td></tr>`).join('');
  return `<div class="grid2">
  <section class="panel stack">
    <div><label for="scan">Escaneá el código o escribí el nombre</label>
    <input id="scan" class="scan" autocomplete="off" value="${esc(qtxt)}" placeholder="Código de barras, nombre o promo">
    ${sug.length ? `<ul class="sugs">${sug.map(s => `<li data-act="add" data-k="${s.k}" data-id="${s.id}"><span>${esc(s.n)}${s.k === 'c' ? ' <span class="pill ok">Promo</span>' : ''}</span><span class="num">${fmt(s.pr)} · stock ${s.st}</span></li>`).join('')}</ul>` : ''}</div>
    <div class="tablewrap">${cart.length ? `<table><thead><tr><th>Producto</th><th>Cant.</th><th class="r">Unit.</th><th class="r">Subtotal</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Todavía no hay productos en esta venta.</div>`}</div>
    ${cart.length ? `<button class="link" style="align-self:start" data-act="vaciar">Vaciar venta</button>` : ''}
  </section>
  <aside class="panel stack">
    <div class="sumline"><span>Subtotal</span><span class="num">${fmt(sub)}</span></div>
    ${dsc ? `<div class="sumline good"><span>Descuento${desc.t === '%' ? ' ' + esc(desc.v) + '%' : ''}</span><span class="num">−${fmt(dsc)}</span></div>` : ''}
    <div class="total"><span>${bonif ? 'Bonificado' : 'Total'}</span><b class="num">${fmt(tot)}</b></div>
    <label class="check"><input type="checkbox" id="bonif" ${bonif ? 'checked' : ''}> Bonificar esta venta (regalo o atención)</label>
    ${bonif ? `<div><label for="motivo">Motivo o a quién fue</label><input id="motivo" value="${esc(motivo)}" placeholder="Ej.: regalo de cumpleaños para Juan"></div>
    <p class="muted" style="margin:0">Descuenta el stock y registra el costo de la mercadería. No entra plata a la caja.</p>
    <button class="btn primary big" data-act="cobrar" ${cart.length && !busy ? '' : 'disabled'}>${busy ? 'Registrando…' : 'Registrar bonificación'}</button>` : `
    <div><label for="dv">Descuento</label><div class="row" style="flex-wrap:nowrap"><select id="dt" style="flex:0;min-width:64px" aria-label="Tipo de descuento"><option value="%" ${desc.t === '%' ? 'selected' : ''}>%</option><option value="$" ${desc.t === '$' ? 'selected' : ''}>$</option></select><input id="dv" class="num" inputmode="decimal" value="${esc(desc.v)}" placeholder="0" style="min-width:60px">${[10, 15].map(x => `<button class="btn" style="flex:0;min-width:0" data-act="dq" data-v="${x}">${x}%</button>`).join('')}</div></div>
    <h2>Cobro</h2>
    ${pagos.map((x, i) => `<div class="row"><div><label for="pm${i}">Medio</label><select id="pm${i}" data-pago="m" data-i="${i}">${D.medios.map(m => `<option value="${m.id}" ${m.id === x.m ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></div>
      <div><label for="pa${i}">Monto</label><input id="pa${i}" class="num" inputmode="numeric" data-pago="monto" data-i="${i}" value="${esc(x.monto)}" placeholder="${Math.max(resta + money(x.monto), 0)}"></div>
      ${pagos.length > 1 ? `<button class="link" style="flex:0" data-act="delpago" data-i="${i}">Quitar</button>` : ''}</div>`).join('')}
    <button class="link" style="align-self:start" data-act="addpago">+ Dividir el pago en otro medio</button>
    ${usaCC ? `<div><label for="cli">Cliente de cuenta corriente</label><select id="cli"><option value="">Elegí un cliente</option>${D.clientes.map(c => `<option value="${c.id}" ${c.id === cliente ? 'selected' : ''}>${esc(c.nombre)} · debe ${fmt(c.saldo)}</option>`).join('')}</select></div>` : ''}
    <div class="muted num">${pagado === 0 ? 'Si dejás el monto vacío, se cobra todo con ese medio.' : resta > 0 ? `Falta cobrar ${fmt(resta)}` : resta < 0 ? `Vuelto: ${fmt(-resta)}` : 'Pago completo'}</div>
    <button class="btn primary big" data-act="cobrar" ${cart.length && !busy ? '' : 'disabled'}>${busy ? 'Registrando…' : 'Cobrar ' + fmt(tot)}</button>`}
    ${!D.caja ? `<div class="msg bad">La caja está cerrada. Abrila en «Caja del día» para poder vender.</div>` : ''}
  </aside></div>`;
}
async function cobrar() {
  if (busy) return;
  if (!D.caja) return toast('Abrí la caja antes de cobrar.', 'bad');
  const tot = totalCart();
  let ps = [], vuelto = 0;
  if (bonif) { if (!motivo.trim()) return toast('Escribí el motivo de la bonificación.', 'bad'); }
  else {
    ps = pagos.map(x => ({ m: x.m, monto: money(x.monto) }));
    if (ps.length === 1 && !ps[0].monto) ps[0].monto = tot;
    const pagado = ps.reduce((s, x) => s + x.monto, 0);
    if (pagado < tot - 0.5) return toast(`Falta cobrar ${fmt(tot - pagado)}.`, 'bad');
    vuelto = Math.round(pagado - tot);
    if (vuelto > 0) { const ef = ps.find(x => medio(x.m).es_efectivo); if (!ef || ef.monto < vuelto) return toast('El monto supera el total y no hay efectivo para dar vuelto.', 'bad'); ef.monto -= vuelto; }
    if (ps.some(x => medio(x.m).es_cuenta_corriente && x.monto > 0) && !cliente) return toast('Elegí el cliente de la cuenta corriente.', 'bad');
  }
  const items = cart.map(l => ({ n: nombreL(l), q: l.q, pu: precioL(l) }));
  const payload = {
    id: crypto.randomUUID(), cliente_id: cliente || null, bonificada: bonif, bonificacion_motivo: motivo.trim(),
    descuento_tipo: !bonif && descuento() ? desc.t : null, descuento_valor: !bonif && descuento() ? (desc.t === '%' ? dec(desc.v) : money(desc.v)) : null,
    items: cart.map(l => l.k === 'c' ? { promocion_id: l.id, cantidad: l.q } : { producto_id: l.id, cantidad: l.q }),
    pagos: ps.filter(x => x.monto > 0).map(x => ({ medio_pago_id: x.m, monto: x.monto }))
  };
  busy = true; render();
  try {
    const v = await q(sb.rpc('registrar_venta', { p: payload }));
    const cli = D.clientes.find(c => c.id === cliente);
    lastTicket = { ...v, items, pagos: payload.pagos, vuelto, cliente: cli?.nombre };
    cart = []; pagos = []; cliente = ''; desc = { t: '%', v: '' }; bonif = false; motivo = '';
    msg = ['ok', v.bonificada ? `Bonificación registrada (costo ${fmt(v.costo_total)}).` : `Venta #${v.numero} registrada por ${fmt(v.total)}.`];
    await cargar();
    busy = false; render(); ticket(lastTicket);
  } catch (e) { busy = false; await cargar().catch(() => {}); toast(e.message, 'bad'); }
}
function ticketHTML(v) {
  return `<div class="c"><b>${esc(D.config.nombre_local.toUpperCase())}</b><br>${fecha(v.fecha)} ${hora(v.fecha)} · #${v.numero}</div><hr>
  ${v.items.map(i => `<div>${esc(i.n)}</div><div class="l"><span>${i.q} x ${fmt(i.pu)}</span><span>${fmt(i.q * i.pu)}</span></div>`).join('')}<hr>
  ${+v.descuento ? `<div class="l"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div><div class="l"><span>Descuento</span><span>-${fmt(v.descuento)}</span></div>` : ''}
  <div class="l"><b>TOTAL</b><b>${fmt(v.total)}</b></div>
  ${v.anulada ? '<div class="c"><b>*** ANULADO ***</b></div>' : ''}${v.bonificada ? '<div>BONIFICADO</div>' : ''}
  ${(v.pagos || []).map(p => `<div class="l"><span>${esc(medio(p.medio_pago_id).nombre)}</span><span>${fmt(p.monto)}</span></div>`).join('')}
  ${v.vuelto ? `<div class="l"><span>Vuelto</span><span>${fmt(v.vuelto)}</span></div>` : ''}
  ${v.cliente ? `<div>Cta. cte.: ${esc(v.cliente)}</div>` : ''}<hr><div class="c">No válido como factura<br>${esc(D.config.pie_ticket)}</div>`;
}
function ticket(v) {
  lastTicket = v;
  dlg(`<h2>Ticket #${v.numero}</h2><div class="ticket">${ticketHTML(v)}</div>
  <div class="row"><button class="btn" data-act="cerrardlg">Listo</button><button class="btn primary" data-act="imprimir">Imprimir</button></div>`);
  $('#dlgBody [data-act="imprimir"]').focus();
}
const ventaTicket = v => ({ ...v, items: v.venta_items.map(i => ({ n: i.descripcion, q: i.cantidad, pu: i.precio_unitario })), pagos: v.venta_pagos, cliente: D.clientes.find(c => c.id === v.cliente_id)?.nombre });

/* ---------------- TICKETS ---------------- */
function tickets() {
  if (!D.caja) return `<section class="panel"><div class="empty">La caja está cerrada. Los tickets del día aparecen cuando la abrís y empezás a vender.</div></section>`;
  const puede = dueno() || D.config.vendedor_puede_anular;
  return `<section class="panel stack" style="max-width:960px"><h2>Tickets del día</h2>
  <p class="muted" style="margin:0">Anular un ticket devuelve el stock, saca la plata de la caja y, si fue a cuenta corriente, se lo descuenta al cliente. Queda marcado como anulado con su motivo.${puede ? '' : ' Para anular, pedíselo al dueño.'}</p>
  ${D.ventas.length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th>Hora</th><th>Detalle</th><th>Cobro</th><th class="r">Total</th><th></th></tr></thead><tbody>
  ${D.ventas.map(v => `<tr${v.anulada ? ' class="anul"' : ''}><td class="num">${v.numero}</td><td class="num">${hora(v.fecha)}</td><td>${v.venta_items.map(i => i.cantidad + '× ' + esc(i.descripcion)).join(', ')}${v.anulada ? `<div><span class="pill bad">Anulado</span> <span class="muted">${esc(v.anulada_motivo)}</span></div>` : v.bonificada ? `<div><span class="pill warn">Bonificado</span> <span class="muted">${esc(v.bonificacion_motivo)}</span></div>` : ''}</td>
  <td class="muted">${v.bonificada ? '—' : v.venta_pagos.map(p => esc(medio(p.medio_pago_id).nombre)).join(' + ')}</td><td class="r num">${fmt(v.total)}</td>
  <td class="r" style="white-space:nowrap"><button class="link" data-act="vert" data-id="${v.id}">Ver</button>${!v.anulada && puede ? `<button class="link" data-act="anular" data-id="${v.id}">Anular</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : `<div class="empty">Todavía no hay ventas hoy.</div>`}</section>`;
}

/* ---------------- CAJA ---------------- */
function caja() {
  if (!D.caja) return `<div class="grid2"><section class="panel stack"><h2>Abrir la caja</h2>
    <div><label for="fondo">Fondo inicial en efectivo</label><input id="fondo" class="num" inputmode="numeric" placeholder="0"></div>
    <button class="btn primary" data-act="abrir">Abrir caja</button></section>
    <div class="stack">${dueno() ? historial() + cfgCaja() : ''}</div></div>`;
  const c = D.caja, va = D.ventas.filter(v => !v.anulada);
  const fact = va.reduce((s, v) => s + +v.total, 0), dscTot = va.reduce((s, v) => s + +v.descuento, 0),
    bon = va.filter(v => v.bonificada).reduce((s, v) => s + +v.costo_total, 0);
  const ef = D.resumen.filter(r => r.es_efectivo).reduce((s, r) => s + +r.bruto, 0);
  const mov = D.movs.reduce((s, m) => s + (m.tipo === 'ingreso' ? 1 : -1) * m.monto, 0);
  const esperado = +c.fondo_inicial + ef + mov, ciego = D.config.cierre_ciego && !dueno();
  const filas = D.resumen.map(r => {
    const m = medio(r.medio_pago_id), acr = new Date(); acr.setDate(acr.getDate() + (m.dias_acreditacion || 0));
    return `<tr><td>${esc(r.medio)}</td><td class="r num">${fmt(r.bruto)}</td><td class="r num">${+r.comision ? '−' + fmt(r.comision) : '—'}</td><td class="r num">${fmt(r.neto)}</td><td class="r">${m.es_cuenta_corriente ? 'a cobrar' : m.dias_acreditacion ? fecha(acr) : 'en el día'}</td></tr>`;
  }).join('');
  return `<div class="kpis"><div class="kpi"><span>Ventas</span><b>${va.length}</b></div><div class="kpi"><span>Facturado</span><b>${fmt(fact)}</b></div>
    <div class="kpi"><span>Descuentos</span><b>${fmt(dscTot)}</b></div><div class="kpi"><span>Bonificado (a costo)</span><b>${fmt(bon)}</b></div>
    ${ciego ? '' : `<div class="kpi"><span>Efectivo esperado</span><b>${fmt(esperado)}</b></div>`}</div>
  <div class="grid2"><section class="panel stack">
    <h2>Por medio de pago</h2>
    <div class="tablewrap">${filas ? `<table><thead><tr><th>Medio</th><th class="r">Bruto</th><th class="r">Comisión</th><th class="r">Neto</th><th class="r">Acredita</th></tr></thead><tbody>${filas}</tbody></table>` : `<div class="empty">Todavía no hay cobros.</div>`}</div>
    <h2>Movimientos de efectivo</h2>
    <div class="tablewrap"><table><tbody><tr><td>${hora(c.apertura)} · Fondo inicial</td><td class="r num">${fmt(c.fondo_inicial)}</td></tr>
      ${D.movs.map(m => `<tr><td>${hora(m.fecha)} · ${m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'}${m.detalle ? ' — ' + esc(m.detalle) : ''}</td><td class="r num">${m.tipo === 'retiro' ? '−' : ''}${fmt(m.monto)}</td></tr>`).join('')}
    </tbody></table></div>
  </section>
  <aside class="stack">
    <section class="panel stack"><h2>Retiro o ingreso de efectivo</h2>
      <div class="row"><div><label for="mvt">Tipo</label><select id="mvt"><option value="retiro">Retiro (pago, gasto)</option><option value="ingreso">Ingreso</option></select></div>
      <div><label for="mvm">Monto</label><input id="mvm" class="num" inputmode="numeric"></div></div>
      <div><label for="mvd">Detalle</label><input id="mvd" placeholder="Ej.: pago hielo"></div>
      <button class="btn" data-act="mov">Registrar</button></section>
    <section class="panel stack"><h2>Cerrar caja</h2>
      <div><label for="contado">Efectivo contado</label><input id="contado" class="num" inputmode="numeric" placeholder="${ciego ? 'Contá y cargá el total' : Math.round(esperado)}"></div>
      <p class="muted" style="margin:0">${ciego ? 'Cierre ciego: cargá lo que contaste. La diferencia la ve el dueño.' : 'Se compara lo contado con lo esperado y se guarda la diferencia.'}</p>
      <button class="btn primary" data-act="cerrar">Cerrar caja</button></section>
    ${dueno() ? cfgCaja() : ''}
  </aside></div>`;
}
function cfgCaja() {
  return `<section class="panel stack"><h2>Opciones de caja</h2>
  <label class="check"><input type="checkbox" data-cfg="cierre_ciego" ${D.config.cierre_ciego ? 'checked' : ''}> Cierre ciego: el vendedor no ve el efectivo esperado</label>
  <label class="check"><input type="checkbox" data-cfg="vendedor_puede_anular" ${D.config.vendedor_puede_anular ? 'checked' : ''}> El vendedor puede anular tickets</label></section>`;
}
function historial() {
  return `<section class="panel stack"><h2>Cierres anteriores</h2>${D.cierres.length ? `<div class="tablewrap"><table><thead><tr><th>Cierre</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Diferencia</th></tr></thead><tbody>
  ${D.cierres.map(c => `<tr><td>${fecha(c.cierre)} ${hora(c.cierre)}</td><td class="r num">${fmt(c.efectivo_esperado)}</td><td class="r num">${fmt(c.efectivo_contado)}</td><td class="r"><span class="pill ${Math.abs(c.diferencia) < 1 ? 'ok' : c.diferencia < 0 ? 'bad' : 'warn'}">${c.diferencia > 0 ? '+' : ''}${fmt(c.diferencia)}</span></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">Cuando cierres la primera caja, aparece acá.</div>`}</section>`;
}

/* ---------------- PRODUCTOS ---------------- */
const perfil = id => (D.perfiles || []).find(p => p.id === id);
function calcPrecio(costo, sumarIva, perfilId, manual) {
  if (manual !== '' && manual != null) return money(manual);
  const cf = costo * (sumarIva ? 1 + D.config.iva_pct / 100 : 1), g = perfil(perfilId);
  return g ? Math.ceil(cf * (1 + g.porcentaje / 100) / g.redondeo) * g.redondeo : cf;
}
function productos() {
  const lista = dueno() ? D.productos : D.catalogo;
  return `<section class="panel stack"><div class="row"><div style="flex:3"><label for="fp">Buscar</label><input id="fp" placeholder="Nombre o código"></div>
  ${dueno() ? `<button class="btn primary" style="flex:0;white-space:nowrap" data-act="nuevo">+ Producto</button>` : ''}</div>
  <div class="tablewrap"><table id="tprod"><thead><tr><th>Producto</th><th>Código de barras</th>${dueno() ? '<th class="r">Costo</th><th>Perfil</th>' : ''}<th class="r">Venta</th><th class="r">Stock</th>${dueno() ? '<th></th>' : ''}</tr></thead><tbody>
  ${lista.map(p => `<tr data-txt="${esc((p.nombre + ' ' + (p.codigo_barras || '')).toLowerCase())}"><td>${esc(p.nombre)}</td><td class="num">${esc(p.codigo_barras || '—')}</td>
  ${dueno() ? `<td class="r num">${fmt(p.costo_con_iva)}<div class="muted">${p.sumar_iva ? '+IVA' : 'IVA incl.'}</div></td><td>${p.precio_manual != null ? '<span class="pill warn">Precio fijo</span>' : p.perfil ? esc(p.perfil) + ' +' + (+p.perfil_pct) + '%' : '—'}</td>` : ''}
  <td class="r num"><b>${fmt(p.precio)}</b></td>
  <td class="r num">${p.stock} ${p.stock <= p.stock_minimo ? '<span class="pill warn">bajo</span>' : ''}<div class="muted">mín. ${p.stock_minimo}</div></td>
  ${dueno() ? `<td class="r"><button class="link" data-act="editar" data-id="${p.id}">Editar</button></td>` : ''}</tr>`).join('')}
  </tbody></table>${lista.length ? '' : `<div class="empty">Todavía no hay productos.${dueno() ? ' Cargá el primero con «+ Producto».' : ''}</div>`}</div></section>`;
}
function editar(id) {
  const p = id ? D.productos.find(x => x.id === id) : { id: '', codigo_barras: '', nombre: '', costo: 0, sumar_iva: true, perfil_id: D.perfiles[0]?.id, precio_manual: null, stock: 0, stock_minimo: 0, rubro_id: null };
  dlg(`<h2>${id ? 'Editar producto' : 'Nuevo producto'}</h2>
  <div><label for="e_n">Nombre</label><input id="e_n" value="${esc(p.nombre)}"></div>
  <div class="row"><div><label for="e_cb">Código de barras (del envase)</label><input id="e_cb" class="num" value="${esc(p.codigo_barras || '')}" placeholder="Escaneá el envase"></div>
    <div><label for="e_ru">Rubro</label><select id="e_ru"><option value="">—</option>${D.rubros.map(r => `<option value="${r.id}" ${r.id === p.rubro_id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></div></div>
  <div class="row"><div><label for="e_st">Stock</label><input id="e_st" class="num" value="${p.stock}"></div><div><label for="e_mi">Avisar con</label><input id="e_mi" class="num" value="${p.stock_minimo}"></div></div>
  <div class="row"><div><label for="e_co">Costo unitario</label><input id="e_co" class="num" value="${+p.costo}"></div><div><label for="e_iv">IVA</label><select id="e_iv"><option value="1" ${p.sumar_iva ? 'selected' : ''}>Sumar ${+D.config.iva_pct}% al costo</option><option value="0" ${!p.sumar_iva ? 'selected' : ''}>El costo ya incluye IVA</option></select></div></div>
  <div class="row"><div><label for="e_pf">Perfil de ganancia</label><select id="e_pf">${D.perfiles.map(f => `<option value="${f.id}" ${f.id === p.perfil_id ? 'selected' : ''}>${esc(f.nombre)} +${+f.porcentaje}%</option>`).join('')}</select></div>
    <div><label for="e_ma">Precio fijo (opcional)</label><input id="e_ma" class="num" value="${p.precio_manual ?? ''}" placeholder="vacío = usa el perfil"></div></div>
  <div class="msg ok" id="e_prev"></div>
  <div class="row">${id ? `<button class="btn" data-act="borrarprod" data-id="${id}">Dar de baja</button>` : ''}<button class="btn" data-act="cerrardlg">Cancelar</button><button class="btn primary" data-act="guardar" data-id="${p.id}">Guardar</button></div>`);
  const prev = () => { const co = dec($('#e_co').value), iv = $('#e_iv').value === '1'; $('#e_prev').textContent = `Precio de venta: ${fmt(calcPrecio(co, iv, $('#e_pf').value, $('#e_ma').value))} · costo final ${fmt(co * (iv ? 1 + D.config.iva_pct / 100 : 1))}`; };
  $('#dlgBody').oninput = prev; prev();
}
async function guardarProducto(id) {
  const datos = {
    nombre: $('#e_n').value.trim(), codigo_barras: $('#e_cb').value.trim() || null, rubro_id: $('#e_ru').value || null,
    costo: dec($('#e_co').value), sumar_iva: $('#e_iv').value === '1', perfil_id: $('#e_pf').value || null,
    precio_manual: $('#e_ma').value.trim() === '' ? null : money($('#e_ma').value), stock_minimo: parseInt($('#e_mi').value) || 0
  };
  if (!datos.nombre) return $('#e_n').focus();
  const stock = parseInt($('#e_st').value) || 0;
  if (id) {
    const ant = D.productos.find(p => p.id === id).stock;
    await q(sb.from('productos').update({ ...datos, stock }).eq('id', id));
    if (stock !== ant) await q(sb.from('stock_movimientos').insert({ producto_id: id, tipo: 'ajuste', cantidad: stock - ant, usuario_id: U.id, nota: 'Ajuste manual' }));
  } else {
    const n = await q(sb.from('productos').insert({ ...datos, stock }).select().single());
    if (stock) await q(sb.from('stock_movimientos').insert({ producto_id: n.id, tipo: 'inicial', cantidad: stock, usuario_id: U.id }));
  }
  $('#dlg').close(); await cargar(); toast('Producto guardado.');
}

/* ---------------- PROMOCIONES ---------------- */
const prodD = id => D.productos.find(p => p.id === id);
const sumas = items => ({ sep: items.reduce((s, i) => s + (prodD(i.pid)?.precio || 0) * i.q, 0), cos: items.reduce((s, i) => s + (prodD(i.pid)?.costo_con_iva || 0) * i.q, 0) });
function promos() {
  return `<section class="panel stack" style="max-width:960px"><div class="row"><div style="flex:3"><h2 style="margin:0">Promociones y combos</h2><p class="muted" style="margin:4px 0 0">Le ponés un precio al combo. Al venderlo, se descuenta el stock de cada producto que lo forma.</p></div><button class="btn primary" style="flex:0;white-space:nowrap" data-act="ncombo" ${D.productos.length ? '' : 'disabled'}>+ Promoción</button></div>
  ${D.promos.length ? `<div class="tablewrap"><table><thead><tr><th>Promoción</th><th>Incluye</th><th class="r">Por separado</th><th class="r">Precio promo</th><th class="r">Disponibles</th><th></th></tr></thead><tbody>
  ${D.promos.map(c => { const { sep, cos } = sumas(c.items.map(i => ({ pid: i.producto_id, q: i.cantidad }))); return `<tr><td>${esc(c.nombre)}<div class="muted">${esc(c.codigo || 'sin código')}</div></td><td>${c.items.map(i => i.cantidad + '× ' + esc(i.nombre)).join('<br>')}</td><td class="r num">${fmt(sep)}</td><td class="r num"><b>${fmt(c.precio)}</b><div class="muted">ganancia ${fmt(c.precio - cos)} · ${pctTxt(c.precio, cos)}</div></td><td class="r num">${c.disponibles}</td><td class="r"><button class="link" data-act="ecombo" data-id="${c.id}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty">Todavía no hay promociones.${D.productos.length ? ' Creá la primera con «+ Promoción».' : ' Primero cargá productos.'}</div>`}</section>`;
}
function editCombo(id) {
  const c = id ? promo(id) : null;
  ce = c ? { id: c.id, nombre: c.nombre, codigo: c.codigo || '', precio: String(+c.precio), items: c.items.map(i => ({ pid: i.producto_id, q: i.cantidad })) }
    : { id: '', nombre: '', codigo: '', precio: '', items: [{ pid: D.productos[0].id, q: 1 }] };
  drawCombo();
}
function drawCombo() {
  const { sep, cos } = sumas(ce.items), pr = money(ce.precio);
  dlg(`<h2>${ce.id ? 'Editar promoción' : 'Nueva promoción'}</h2>
  <div class="row"><div style="flex:2"><label for="k_n">Nombre</label><input id="k_n" data-ce="nombre" value="${esc(ce.nombre)}" placeholder="Ej.: Combo Fernet"></div><div><label for="k_cb">Código (opcional)</label><input id="k_cb" data-ce="codigo" class="num" value="${esc(ce.codigo)}"></div></div>
  <label>Productos que incluye</label>
  ${ce.items.map((i, x) => `<div class="row" style="flex-wrap:nowrap"><select data-ci="pid" data-i="${x}" style="flex:3;min-width:0" aria-label="Producto">${D.productos.map(p => `<option value="${p.id}" ${p.id === i.pid ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select><input class="num" data-ci="q" data-i="${x}" value="${i.q}" style="flex:0;min-width:64px;width:64px" aria-label="Cantidad">${ce.items.length > 1 ? `<button class="link" style="flex:0;min-width:0" data-act="kdel" data-i="${x}">Quitar</button>` : ''}</div>`).join('')}
  <button class="link" style="align-self:start" data-act="kadd">+ Agregar producto</button>
  <div><label for="k_p">Precio de la promoción</label><input id="k_p" data-ce="precio" class="num" inputmode="numeric" value="${esc(ce.precio)}" placeholder="${Math.round(sep)}"></div>
  <div class="msg ok">Por separado: ${fmt(sep)} · Costo: ${fmt(cos)}${pr ? ` · Ganancia: ${fmt(pr - cos)} (${pctTxt(pr, cos)} sobre costo)` : ''}</div>
  <div class="row">${ce.id ? `<button class="btn" data-act="kborrar">Dar de baja</button>` : ''}<button class="btn" data-act="cerrardlg">Cancelar</button><button class="btn primary" data-act="kguardar">Guardar</button></div>`);
}
async function guardarCombo() {
  if (!ce.nombre.trim()) return $('#k_n').focus();
  if (!money(ce.precio)) return $('#k_p').focus();
  const items = {};
  ce.items.forEach(i => items[i.pid] = (items[i.pid] || 0) + Math.max(1, parseInt(i.q) || 1));
  const datos = { nombre: ce.nombre.trim(), codigo: ce.codigo.trim() || null, precio: money(ce.precio), activa: true };
  let id = ce.id;
  if (id) { await q(sb.from('promociones').update(datos).eq('id', id)); await q(sb.from('promocion_items').delete().eq('promocion_id', id)); }
  else id = (await q(sb.from('promociones').insert(datos).select().single())).id;
  await q(sb.from('promocion_items').insert(Object.entries(items).map(([pid, c]) => ({ promocion_id: id, producto_id: pid, cantidad: c }))));
  $('#dlg').close(); await cargar(); toast('Promoción guardada.');
}

/* ---------------- CLIENTES ---------------- */
function clientes() {
  const mediosCobro = D.medios.filter(m => !m.es_cuenta_corriente);
  return `<section class="panel stack" style="max-width:900px"><h2>Cuentas corrientes</h2>
  <div class="tablewrap"><table><thead><tr><th>Cliente</th><th class="r">Debe</th><th class="r">Límite</th><th>Registrar pago</th></tr></thead><tbody>
  ${D.clientes.map(c => `<tr><td>${esc(c.nombre)}${c.telefono ? `<div class="muted">${esc(c.telefono)}</div>` : ''}</td><td class="r num">${+c.saldo ? `<b>${fmt(c.saldo)}</b>` : '—'}</td>
  <td class="r num">${dueno() ? `<input class="num inline" style="width:110px;text-align:right" data-lim="${c.id}" value="${+c.limite_credito}" aria-label="Límite">` : fmt(c.limite_credito)}</td>
  <td><div class="row" style="flex-wrap:nowrap"><input class="num" id="cp_${c.id}" placeholder="Monto" inputmode="numeric" style="min-width:90px"><select id="cm_${c.id}" style="min-width:110px" aria-label="Medio">${mediosCobro.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select><button class="btn" style="flex:0" data-act="pagocc" data-id="${c.id}" ${+c.saldo > 0 ? '' : 'disabled'}>Cobrar</button></div></td></tr>`).join('')}
  </tbody></table>${D.clientes.length ? '' : '<div class="empty">Todavía no hay clientes.</div>'}</div>
  <div class="row"><div style="flex:2"><label for="nc">Nuevo cliente</label><input id="nc" placeholder="Nombre"></div><div><label for="nt">Teléfono</label><input id="nt"></div>
  ${dueno() ? `<div><label for="nl">Límite</label><input id="nl" class="num" value="50000"></div>` : ''}<button class="btn" style="flex:0" data-act="addcli">Agregar</button></div>
  ${dueno() ? '' : '<p class="muted" style="margin:0">Los clientes nuevos quedan con límite $0 hasta que el dueño les asigne uno.</p>'}</section>`;
}

/* ---------------- PERFILES ---------------- */
function perfiles() {
  return `<section class="panel stack" style="max-width:780px"><h2>Perfiles de ganancia</h2>
  <p class="muted" style="margin:0">Precio de venta = costo (con IVA si corresponde) + el porcentaje del perfil, redondeado hacia arriba. Al cambiar un perfil se recalculan todos sus productos.</p>
  <div class="tablewrap"><table><thead><tr><th>Nombre</th><th>% sobre costo</th><th>Redondear a</th><th class="r">Productos</th><th></th></tr></thead><tbody>
  ${D.perfiles.map(f => { const n = D.productos.filter(p => p.perfil_id === f.id).length; return `<tr><td><input data-perf="nombre" data-id="${f.id}" value="${esc(f.nombre)}" aria-label="Nombre"></td>
  <td><input class="num" data-perf="porcentaje" data-id="${f.id}" value="${+f.porcentaje}" inputmode="decimal" aria-label="Porcentaje"></td>
  <td><select data-perf="redondeo" data-id="${f.id}" aria-label="Redondeo">${[1, 10, 50, 100, 500].map(r => `<option value="${r}" ${r === f.redondeo ? 'selected' : ''}>$${r}</option>`).join('')}</select></td>
  <td class="r num">${n}</td><td class="r">${n ? '' : `<button class="link" data-act="delperf" data-id="${f.id}">Borrar</button>`}</td></tr>`; }).join('')}
  </tbody></table></div><button class="btn" style="align-self:start" data-act="addperf">+ Nuevo perfil</button></section>
  ${perfilesPorCategoria()}`;
}

/* ---------------- AJUSTES ---------------- */
function ajustes() {
  return `<div class="grid2"><section class="panel stack"><h2>Medios de pago</h2>
  <p class="muted" style="margin:0">Cargá la comisión real que te cobra cada medio y en cuántos días te acredita. Se usa para calcular el neto de cada caja.</p>
  <div class="tablewrap"><table><thead><tr><th>Medio</th><th>Comisión %</th><th>Días</th></tr></thead><tbody>
  ${D.medios.map(m => `<tr><td>${esc(m.nombre)}</td><td><input class="num" data-med="comision_pct" data-id="${m.id}" value="${+m.comision_pct}" inputmode="decimal" aria-label="Comisión" ${m.es_efectivo || m.es_cuenta_corriente ? 'disabled' : ''}></td><td><input class="num" data-med="dias_acreditacion" data-id="${m.id}" value="${m.dias_acreditacion}" inputmode="numeric" aria-label="Días" ${m.es_efectivo || m.es_cuenta_corriente ? 'disabled' : ''}></td></tr>`).join('')}
  </tbody></table></div></section>
  <aside class="stack">
  <section class="panel stack"><h2>Usuarios</h2>
  <p class="muted" style="margin:0">Cada persona se crea su cuenta desde la pantalla de inicio y vos la habilitás acá.</p>
  <div class="tablewrap"><table><tbody>${D.usuarios.map(u => `<tr><td>${esc(u.nombre)}${u.id === U.id ? ' <span class="muted">(vos)</span>' : ''}</td>
  <td><select data-usr="rol" data-id="${u.id}" ${u.id === U.id ? 'disabled' : ''} aria-label="Rol"><option value="vendedor" ${u.rol === 'vendedor' ? 'selected' : ''}>Vendedor</option><option value="dueno" ${u.rol === 'dueno' ? 'selected' : ''}>Dueño</option></select></td>
  <td>${u.id === U.id ? '' : `<label class="check"><input type="checkbox" data-usr="activo" data-id="${u.id}" ${u.activo ? 'checked' : ''}> Habilitado</label>`}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel stack"><h2>Local y ticket</h2>
  <div><label for="cf_n">Nombre del local</label><input id="cf_n" data-cfgtxt="nombre_local" value="${esc(D.config.nombre_local)}"></div>
  <div><label for="cf_p">Pie del ticket</label><input id="cf_p" data-cfgtxt="pie_ticket" value="${esc(D.config.pie_ticket)}"></div>
  <div><label for="cf_i">IVA %</label><input id="cf_i" class="num" data-cfgtxt="iva_pct" value="${+D.config.iva_pct}"></div></section>
  ${cfgCaja()}</aside></div>`;
}

/* ---------------- EVENTOS ---------------- */
async function run(fn) { try { await fn(); } catch (e) { if ($('#dlg').open) { const b = $('#dlgBody'); b.querySelector('.msg.bad')?.remove(); b.insertAdjacentHTML('beforeend', `<div class="msg bad">${esc(e.message)}</div>`); } else toast(e.message, 'bad'); } }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-act]'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; msg = null; return render(); }
  const a = t.dataset.act, id = t.dataset.id, k = t.dataset.k;
  run(async () => {
    switch (a) {
      case 'modoAlta': $('#lnWrap').hidden = false; $('#lbtn').textContent = 'Crear cuenta'; t.hidden = true; return;
      case 'salir': await sb.auth.signOut(); U = null; location.reload(); return;
      case 'add': case 'mas': agregar(k, id); break;
      case 'menos': { const l = cart.find(l => l.k === k && l.id === id); l.q--; if (!l.q) cart = cart.filter(x => x !== l); break; }
      case 'quitar': cart = cart.filter(l => !(l.k === k && l.id === id)); break;
      case 'vaciar': cart = []; pagos = []; desc = { t: '%', v: '' }; bonif = false; motivo = ''; break;
      case 'dq': desc = { t: '%', v: t.dataset.v }; break;
      case 'addpago': pagos.push({ m: (D.medios[1] || D.medios[0]).id, monto: '' }); break;
      case 'delpago': pagos.splice(+t.dataset.i, 1); break;
      case 'cobrar': return cobrar();
      case 'cerrardlg': $('#dlg').close(); break;
      case 'imprimir': $('#print').innerHTML = ticketHTML(lastTicket); window.print(); return;
      case 'vert': return ticket(ventaTicket(D.ventas.find(v => v.id === id)));
      case 'anular': { const v = D.ventas.find(v => v.id === id);
        return dlg(`<h2>Anular ticket #${v.numero}</h2><p style="margin:0">${v.venta_items.map(i => i.cantidad + '× ' + esc(i.descripcion)).join(', ')} · <b>${fmt(v.total)}</b></p><div><label for="am">Motivo</label><input id="am" placeholder="Ej.: cobré con el medio equivocado"></div><div class="row"><button class="btn" data-act="cerrardlg">Volver</button><button class="btn primary" data-act="anularok" data-id="${v.id}">Anular ticket</button></div>`); }
      case 'anularok': { const m = $('#am').value.trim(); if (!m) return $('#am').focus();
        await q(sb.rpc('anular_venta', { p_venta: id, p_motivo: m })); $('#dlg').close(); await cargar(); msg = ['ok', 'Ticket anulado. El stock volvió y la caja se ajustó.']; break; }
      case 'abrir': await q(sb.rpc('abrir_caja', { p_fondo: money($('#fondo').value) })); await cargar(); msg = ['ok', 'Caja abierta.']; break;
      case 'mov': { const m = money($('#mvm').value); if (!m) return $('#mvm').focus();
        await q(sb.from('caja_movimientos').insert({ caja_id: D.caja.id, tipo: $('#mvt').value, monto: m, detalle: $('#mvd').value.trim() || null, usuario_id: U.id }));
        await cargarCaja(); msg = ['ok', 'Movimiento registrado.']; break; }
      case 'cerrar': { if ($('#contado').value.trim() === '') return $('#contado').focus();
        const r = await q(sb.rpc('cerrar_caja', { p_contado: money($('#contado').value) }));
        await cargar(); msg = ['ok', r.diferencia !== undefined ? `Caja cerrada. Diferencia: ${fmt(r.diferencia)}.` : 'Caja cerrada.']; break; }
      case 'nuevo': return editar(null);
      case 'editar': return editar(id);
      case 'guardar': return guardarProducto(id);
      case 'borrarprod': await q(sb.from('productos').update({ activo: false }).eq('id', id)); $('#dlg').close(); await cargar(); msg = ['ok', 'Producto dado de baja.']; break;
      case 'ncombo': return editCombo(null);
      case 'ecombo': return editCombo(id);
      case 'kadd': ce.items.push({ pid: D.productos[0].id, q: 1 }); return drawCombo();
      case 'kdel': ce.items.splice(+t.dataset.i, 1); return drawCombo();
      case 'kguardar': return guardarCombo();
      case 'kborrar': await q(sb.from('promociones').update({ activa: false }).eq('id', ce.id)); $('#dlg').close(); await cargar(); msg = ['ok', 'Promoción dada de baja.']; break;
      case 'pagocc': { const c = D.clientes.find(c => c.id === id), m = Math.min(money($('#cp_' + id).value), +c.saldo); if (!m) return $('#cp_' + id).focus();
        await q(sb.rpc('cobrar_cuenta_corriente', { p_cliente: id, p_monto: m, p_medio: $('#cm_' + id).value })); await cargar(); msg = ['ok', `Cobro de ${fmt(m)} registrado.`]; break; }
      case 'addcli': { const nm = $('#nc').value.trim(); if (!nm) return $('#nc').focus();
        await q(sb.from('clientes').insert({ nombre: nm, telefono: $('#nt').value.trim() || null, limite_credito: dueno() ? money($('#nl').value) : 0 }));
        D.clientes = await q(sb.from('clientes_saldo').select('*').order('nombre')); msg = ['ok', 'Cliente agregado.']; break; }
      case 'addperf': await q(sb.from('perfiles_ganancia').insert({ nombre: 'Nuevo perfil ' + (D.perfiles.length + 1), porcentaje: 25, redondeo: 100 })); await cargar(); break;
      case 'delperf': await q(sb.from('perfiles_ganancia').delete().eq('id', id)); await cargar(); break;
      default: return;
    }
    render();
  });
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'scan') { qtxt = t.value; const pos = t.selectionStart; render(); const i = $('#scan'); i.setSelectionRange(pos, pos); return; }
  if (t.id === 'dv') { desc.v = t.value; const pos = t.selectionStart; render(); const i = $('#dv'); i.focus(); i.setSelectionRange(pos, pos); return; }
  if (t.dataset.pago === 'monto') { pagos[+t.dataset.i].monto = t.value; return; }
  if (t.id === 'motivo') { motivo = t.value; return; }
  if (t.dataset.ce) { ce[t.dataset.ce] = t.value; return; }
  if (t.id === 'fp') { const v = t.value.toLowerCase(); document.querySelectorAll('#tprod tbody tr').forEach(r => r.hidden = !r.dataset.txt.includes(v)); }
});
document.addEventListener('change', e => {
  const t = e.target, id = t.dataset.id;
  if (t.dataset.pago === 'm') { pagos[+t.dataset.i].m = t.value; return render(); }
  if (t.dataset.pago === 'monto') return render();
  if (t.id === 'cli') { cliente = t.value; return; }
  if (t.id === 'dt') { desc.t = t.value; return render(); }
  if (t.id === 'bonif') { bonif = t.checked; return render(); }
  if (t.dataset.ci) { ce.items[+t.dataset.i][t.dataset.ci] = t.value; return drawCombo(); }
  if (t.dataset.ce === 'precio') return drawCombo();
  run(async () => {
    if (t.dataset.cfg) { await q(sb.from('config').update({ [t.dataset.cfg]: t.checked }).eq('id', true)); D.config[t.dataset.cfg] = t.checked; msg = ['ok', 'Opción guardada.']; }
    else if (t.dataset.cfgtxt) { const v = t.dataset.cfgtxt === 'iva_pct' ? dec(t.value) : t.value.trim(); await q(sb.from('config').update({ [t.dataset.cfgtxt]: v }).eq('id', true)); await cargar(); msg = ['ok', 'Guardado.']; }
    else if (t.dataset.perf) { const f = t.dataset.perf, v = f === 'nombre' ? t.value.trim() : dec(t.value); await q(sb.from('perfiles_ganancia').update({ [f]: v }).eq('id', id)); await cargar(); msg = ['ok', 'Perfil actualizado. Los precios se recalcularon.']; }
    else if (t.dataset.med) { await q(sb.from('medios_pago').update({ [t.dataset.med]: dec(t.value) }).eq('id', id)); await cargar(); msg = ['ok', 'Medio de pago actualizado.']; }
    else if (t.dataset.usr) { await q(sb.from('usuarios').update({ [t.dataset.usr]: t.type === 'checkbox' ? t.checked : t.value }).eq('id', id)); await cargar(); msg = ['ok', 'Usuario actualizado.']; }
    else if (t.dataset.lim) { await q(sb.from('clientes').update({ limite_credito: money(t.value) }).eq('id', t.dataset.lim)); D.clientes = await q(sb.from('clientes_saldo').select('*').order('nombre')); msg = ['ok', 'Límite actualizado.']; }
    else return;
    render();
  });
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'scan' || e.key !== 'Enter') return;
  e.preventDefault(); const v = qtxt.trim(); if (!v) return;
  const p = D.catalogo.find(p => p.codigo_barras === v), c = D.promos.find(c => c.codigo && c.codigo.toLowerCase() === v.toLowerCase());
  const b = !p && !c && !/^\d+$/.test(v) ? buscar(v)[0] : null, hit = p ? { k: 'p', id: p.id } : c ? { k: 'c', id: c.id } : b;
  if (hit) agregar(hit.k, hit.id); else { msg = ['bad', `No encontré el código ${v}. Revisalo o cargalo en Productos.`]; qtxt = ''; }
  render();
});
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { U = null; pantallaLogin(); } });
iniciar();
