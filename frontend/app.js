const form = document.getElementById('form');
const btn = document.getElementById('enviar');
const msg = document.getElementById('msg');
const KEY = 'florecen-envio';
const MAX_INTENTOS = 4;

// El mismo ID viaja en todos los reintentos: el servidor lo reconoce y no duplica.
function submissionId() {
  try {
    return sessionStorage.getItem(KEY) || (sessionStorage[KEY] = crypto.randomUUID());
  } catch { return crypto.randomUUID(); }
}

function datos() {
  const f = new FormData(form);
  const v = k => (f.get(k) || '').toString().trim();
  return {
    submissionId: submissionId(), nombre: v('nombre'), tipo: v('tipo'), institucion: v('institucion'),
    municipio: v('municipio'), correo: v('correo'), telefono: v('telefono'), documento: v('documento'),
    autorizaDatos: f.get('autorizaDatos') === 'on', autorizaImagen: v('autorizaImagen')
  };
}

function validar() {
  let primero = null;
  form.querySelectorAll('.invalid').forEach(l => l.classList.remove('invalid'));
  for (const el of form.elements) {
    if (!el.name || el.name === 'web' || el.checkValidity()) continue;
    (el.closest('label') || el).classList.add('invalid');
    primero = primero || el;
  }
  if (primero) { primero.focus(); return 'Revisa los campos marcados.'; }
  return '';
}

async function enviar(payload) {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      // text/plain evita el preflight CORS, que Apps Script no soporta.
      const res = await fetch(window.APPS_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), signal: ctl.signal
      });
      clearTimeout(t);
      const r = await res.json();
      if (r.ok || !r.retry) return r;
    } catch { /* red caída o timeout: se reintenta */ }
    if (i < MAX_INTENTOS) await new Promise(r => setTimeout(r, 1500 * i));
  }
  return { ok: false, error: 'No pudimos guardar tu registro. Revisa tu conexión e inténtalo de nuevo; tus datos siguen en el formulario.' };
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (btn.disabled || form.web.value) return; // doble clic o honeypot
  msg.textContent = validar();
  if (msg.textContent) return;
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  const r = await enviar(datos());
  if (r.ok) {
    try { sessionStorage.removeItem(KEY); } catch {}
    form.hidden = true;
    document.getElementById('ok').hidden = false;
    if (r.duplicate) {
      document.getElementById('ok-titulo').textContent = 'Ya estás registrado(a)';
      document.getElementById('ok-texto').textContent = 'Encontramos un registro previo con tus datos, no es necesario volver a enviarlo. ¡Te esperamos!';
    }
    scrollTo({ top: 0 });
  } else {
    msg.textContent = r.error;
    btn.disabled = false;
    btn.textContent = 'Registrar asistencia';
  }
});
