const $ = id => document.getElementById(id);
let ultimo = '';

// textContent en vez de innerHTML: nombres y municipios vienen de usuarios.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function barras(cont, items) {
  if (!items.length) return cont.replaceChildren(el('p', 'vacio', 'Aún no hay registros'));
  const max = Math.max(1, ...items.map(i => i.total));
  cont.replaceChildren(...items.map((i, k) => {
    const f = el('div', 'fila');
    const b = el('div', 'barra'); const w = el('i'); w.style.width = (i.total / max * 100) + '%'; b.append(w);
    f.append(el('span', 'n', k + 1), el('span', null, i.nombre), b, el('em', null, i.total));
    return f;
  }));
}

function render(d) {
  $('total').textContent = d.total;
  $('munis').textContent = d.porMunicipio.length;
  $('lider').textContent = d.porMunicipio.length ? 'Mayor: ' + d.porMunicipio[0].nombre : '';
  $('img').textContent = d.imagenSi;
  $('imgPct').textContent = d.total ? Math.round(d.imagenSi / d.total * 100) + '% del total' : '';
  barras($('porMunicipio'), d.porMunicipio);
  barras($('porTipo'), d.porTipo);
  const rec = $('recientes');
  if (!d.recientes.length) rec.replaceChildren(el('p', 'vacio', 'Aún no hay registros'));
  else if (d.recientes[0].fecha + d.total !== ultimo) { // solo repinta cuando hay algo nuevo
    ultimo = d.recientes[0].fecha + d.total;
    rec.replaceChildren(...d.recientes.map(r => {
      const f = el('div', 'rec');
      const info = el('div', null, r.nombre);
      info.append(el('small', null, r.municipio + ' · ' + r.tipo));
      f.append(el('div', 'av', (r.nombre[0] || '?').toUpperCase()), info, el('time', null, r.fecha));
      return f;
    }));
  }
  $('estado').textContent = 'Última actualización: ' + d.actualizado + ' · se refresca cada 10 s';
}

async function cargar() {
  try {
    const r = await (await fetch(window.APPS_SCRIPT_URL + '?action=stats')).json();
    if (!r.ok) throw new Error(r.error);
    $('panel').hidden = false;
    $('live').className = 'live'; $('live').textContent = 'En vivo';
    render(r);
  } catch {
    $('live').className = 'live off'; $('live').textContent = 'Sin conexión, reintentando…';
  }
}

cargar();
setInterval(cargar, 10000);
