/* Lector de listas de precios de proveedores (PDF y Excel).
   Cada formato convierte líneas de texto (PDF) o filas (Excel) en artículos:
   { codigo, descripcion, rubro, costo, costo_bulto, unidades_bulto, fecha_precio } */
(function (root) {
  const us = s => +String(s).replace(/,/g, '');                         // 1,318.50
  const ar = s => +String(s).replace(/\./g, '').replace(',', '.');      // 13.110,00
  const fecha = s => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const limpia = s => String(s || '').replace(/Ð/g, 'Ñ').replace(/\s+/g, ' ').trim().replace(/^[ .]+|[ .]+$/g, '');
  const HDR = /Hoja:|Lista de precios|Listado de precios|Grupo:|^Articulo\b|^Codigo\b|^NºArt|Página|@|Logistica & Distribucion/i;

  const FORMATOS = {
    vendimia: {
      nombre: 'PDF tipo La Vendimia (código, detalle, unitario, bulto, fecha)',
      lineas(lines) {
        let rubro = ''; const out = [];
        for (const ln of lines) {
          const r = /RUBRO:\s*(.+)/.exec(ln); if (r) { rubro = r[1].trim(); continue; }
          const m = /^\s*(\d+)\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d{2}\/\d{2}\/\d{4})/.exec(ln); if (!m) continue;
          const u = us(m[3]), b = us(m[4]);
          let ub = u ? Math.round(b / u) : null;
          if (!ub) { const x = /(\d+)\s*X\s*\d/i.exec(m[2]); ub = x ? +x[1] : null; }
          out.push({ codigo: m[1], descripcion: limpia(m[2]), rubro, costo: u || (ub ? b / ub : null), costo_bulto: b || null, unidades_bulto: ub, fecha_precio: fecha(m[5]) });
        }
        return out;
      }
    },
    luan: {
      nombre: 'PDF tipo LU-AN (código, nombre, precio)',
      lineas(lines) {
        let rubro = [], prevItem = true; const out = [];
        for (const ln of lines) {
          if (!ln.trim() || HDR.test(ln.trim()) || /LU-AN|Urquiza|^\s*0\d{3,4}-/.test(ln)) continue;
          const m = /^\s*(\d+)\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?\s*$/.exec(ln);
          if (m) { out.push({ codigo: m[1], descripcion: limpia(m[2]), rubro: rubro.join(' / '), costo: us(m[4] || m[3]) }); prevItem = true; continue; }
          if (/^\s*\d/.test(ln)) continue;
          if (prevItem) rubro = [ln.trim()]; else rubro.push(ln.trim());
          prevItem = false;
        }
        return out;
      }
    },
    rk: {
      nombre: 'PDF tipo RK (artículo, descripción, precio bulto, precio unitario, fecha)',
      lineas(lines) {
        let rubro = ''; const out = [];
        for (const ln of lines) {
          if (!ln.trim() || HDR.test(ln.trim())) continue;
          const m = /^\s*(\d+)\s+(?:(\S+) - )?(.+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d{2}\/\d{2}\/\d{4})/.exec(ln);
          if (m) { const u = /x\s*(\d+)\s*u\b/i.exec(m[3]); out.push({ codigo: m[1], descripcion: limpia(m[3]), rubro, costo: ar(m[5]), costo_bulto: ar(m[4]), unidades_bulto: u ? +u[1] : null, fecha_precio: fecha(m[6]) }); continue; }
          if (/^\s*\d/.test(ln)) continue;
          rubro = ln.trim();
        }
        return out;
      }
    },
    santarosa: {
      nombre: 'Excel tipo Dist. Santa Rosa (precios x1000, toma «precio final»)',
      filas(rows, archivo) { return excel(rows, archivo, 1000); }
    },
    excel: {
      nombre: 'Excel común (detecta columnas de código, artículo y precio)',
      filas(rows, archivo) { return excel(rows, archivo, 1); }
    }
  };

  function excel(rows, archivo, divisor) {
    rows = rows.filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    const hi = rows.findIndex(r => r.some(c => /articulo|artículo|descripci|detalle|producto|nombre/i.test(String(c ?? ''))));
    if (hi < 0) return [];
    const h = rows[hi].map(c => String(c ?? '').trim().toLowerCase());
    const find = res => { for (const re of res) { const i = h.findIndex(x => re.test(x)); if (i >= 0) return i; } return -1; };
    const ic = find([/^c[oó]d/, /^c[oó]digo/, /^art.*n[ºo°]/]);
    const id = find([/^art[ií]culo$/, /descripci/, /detalle/, /producto/, /nombre/, /art[ií]culo/]);
    const ip = find([/precio final/, /^precio$/, /costo/, /unitario/, /precio/]);
    if (id < 0 || ip < 0) return [];
    const rubro = String(archivo || '').replace(/\.[^.]+$/, '').replace(/\s+\d{1,2}-\d{1,2}.*$/, '');
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const d = limpia(r[id]); const p = typeof r[ip] === 'number' ? r[ip] : ar(r[ip]);
      if (!d || !p || isNaN(p)) continue;
      const cod = ic >= 0 && ic !== id && r[ic] !== null && r[ic] !== undefined && String(r[ic]).trim() ? String(r[ic]).trim() : d.toUpperCase();
      out.push({ codigo: cod, descripcion: d, rubro, costo: Math.round(p / divisor * 100) / 100 });
    }
    return out;
  }

  /* Elige el formato que reconoce más artículos */
  function leer(contenido, formato) {
    const tipo = contenido.lineas ? 'lineas' : 'filas';
    const cands = formato && formato !== 'auto' && FORMATOS[formato] && FORMATOS[formato][tipo] ? [formato] : tipo === 'filas' ? ['excel'] : Object.keys(FORMATOS).filter(k => FORMATOS[k][tipo]);
    let mejor = { formato: cands[0], items: [] };
    for (const k of cands) {
      const f = FORMATOS[k][tipo]; if (!f) continue;
      const items = tipo === 'lineas' ? f(contenido.lineas) : f(contenido.filas, contenido.archivo);
      if (items.length > mejor.items.length) mejor = { formato: k, items };
    }
    // líneas con código que no se pudieron leer
    if (tipo === 'lineas') {
      const cods = new Set(mejor.items.map(i => i.codigo));
      mejor.noLeidas = contenido.lineas.filter(l => { const m = /^\s*(\d+)\s+\S/.exec(l); return m && !cods.has(m[1]) && /[a-z]{3}/i.test(l); }).map(l => l.trim());
    } else mejor.noLeidas = [];
    return mejor;
  }

  /* Une artículos repetidos por código (gana el último) */
  function unir(listas) {
    const m = new Map();
    for (const it of listas.flat()) m.set(it.codigo, it);
    return [...m.values()];
  }

  /* PDF -> líneas de texto, reconstruyendo filas por posición (pdf.js) */
  async function pdfLineas(pdfjs, data) {
    const doc = await pdfjs.getDocument({ data }).promise; const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const filas = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let f = filas.find(f => Math.abs(f.y - y) < 2.5);
        if (!f) { f = { y, items: [] }; filas.push(f); }
        f.items.push({ x, s: it.str, w: it.width });
      }
      filas.sort((a, b) => b.y - a.y);
      for (const f of filas) {
        f.items.sort((a, b) => a.x - b.x);
        let s = '', fin = null;
        for (const it of f.items) { s += (fin === null ? ' '.repeat(Math.max(0, Math.round(it.x / 5))) : (it.x - fin > 1.5 ? '   ' : '')) + it.s; fin = it.x + it.w; }
        lines.push(s);
      }
    }
    return lines;
  }

  const api = { FORMATOS, leer, unir, pdfLineas };
  if (typeof module !== 'undefined') module.exports = api; else root.Listas = api;
})(this);
