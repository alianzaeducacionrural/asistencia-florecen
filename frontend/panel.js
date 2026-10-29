const $ = id => document.getElementById(id);

// textContent en vez de innerHTML: nombres y municipios vienen de usuarios.
function barras(el, items) {
  const max = Math.max(1, ...items.map(i => i.total));
  el.replaceChildren(...items.map(i => {
    const f = document.createElement('div'); f.className = 'fila';
    const n = document.createElement('span'); n.textContent = i.nombre;
    const b = document.createElement('div'); b.className = 'barra';
    const w = document.createElement('i'); w.style.width = (i.total / max * 100) + '%'; b.append(w);
    const t = document.createElement('em'); t.textContent = i.total;
    f.append(n, b, t);
    return f;
  }));
}

function render(d) {
  $('total').textContent = d.total;
  $('munis').textContent = d.porMunicipio.length;
  $('img').textContent = d.imagenSi;
  barras($('porMunicipio'), d.porMunicipio);
  barras($('porTipo'), d.porTipo);
  $('recientes').replaceChildren(...d.recientes.map(r => {
    const f = document.createElement('div'); f.className = 'rec';
    const t = document.createElement('time'); t.textContent = r.fecha;
    const s = document.createElement('div');
    s.textContent = r.nombre;
    const sm = document.createElement('small'); sm.textContent = ' · ' + r.municipio + ' · ' + r.tipo;
    s.append(sm); f.append(t, s);
    return f;
  }));
  $('estado').textContent = 'Actualizado a las ' + d.actualizado + ' · se refresca cada 10 s';
}

async function cargar() {
  try {
    const r = await (await fetch(window.APPS_SCRIPT_URL + '?action=stats')).json();
    if (!r.ok) throw new Error(r.error);
    $('panel').hidden = false;
    render(r);
  } catch {
    $('estado').textContent = 'Sin conexión, reintentando…';
  }
}

cargar();
setInterval(cargar, 10000);
