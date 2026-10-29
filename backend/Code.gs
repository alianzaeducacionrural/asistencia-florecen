const FOLDER_ID = '1aUabIiWJF1Q3aSnpC7Tm8NWNdS55ytsS';
const SHEET_NAME = 'Asistencia';
const HEADERS = [
  'Fecha de registro', 'ID de envío', 'Nombre completo', 'Tipo de participante',
  'Institución u organización', 'Municipio', 'Correo electrónico', 'Número de contacto',
  'Documento de identidad', 'Autoriza tratamiento de datos', 'Autoriza uso de imagen, voz y video',
  'Clave anti-duplicado'
];
const KEY_COL = HEADERS.length; // última columna
const TIPOS = [
  'Asistente / Invitado(a)', 'Docente', 'Directivo docente', 'Estudiante',
  'Padre, madre o acudiente', 'Representante de entidad o aliado'
];

class Registro {
  constructor(d) {
    const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
    this.id = s(d.submissionId, 64);
    this.nombre = s(d.nombre);
    this.tipo = s(d.tipo);
    this.institucion = s(d.institucion);
    this.municipio = s(d.municipio);
    this.correo = s(d.correo).toLowerCase();
    this.telefono = s(d.telefono, 30);
    this.documento = s(d.documento, 30);
    this.autorizaDatos = d.autorizaDatos === true;
    this.autorizaImagen = d.autorizaImagen === 'si' ? 'Sí' : d.autorizaImagen === 'no' ? 'No' : '';
  }

  error() {
    if (!this.id) return 'Falta el identificador del envío.';
    if (!this.nombre) return 'El nombre completo es obligatorio.';
    if (TIPOS.indexOf(this.tipo) < 0) return 'Selecciona un tipo de participante válido.';
    if (!this.municipio) return 'El municipio es obligatorio.';
    if (this.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.correo)) return 'El correo electrónico no es válido.';
    if (!this.autorizaDatos) return 'Debes autorizar el tratamiento de datos personales.';
    if (!this.autorizaImagen) return 'Indica si autorizas el uso de imagen, voz y video.';
    return '';
  }

  // Documento > correo > nombre+municipio, para detectar a la misma persona.
  get clave() {
    const norm = v => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (this.documento) return 'doc:' + norm(this.documento);
    if (this.correo) return 'mail:' + this.correo;
    return 'nom:' + norm(this.nombre) + '|' + norm(this.municipio);
  }

  fila() {
    // Evita que Sheets interprete el texto como fórmula.
    const safe = v => (/^[=+\-@]/.test(v) ? "'" + v : v);
    return [
      new Date(), this.id, safe(this.nombre), this.tipo, safe(this.institucion), safe(this.municipio),
      this.correo, this.telefono, this.documento, 'Sí', this.autorizaImagen, this.clave
    ];
  }
}

class Hoja {
  static obtener() {
    const props = PropertiesService.getScriptProperties();
    let ss;
    const id = props.getProperty('SPREADSHEET_ID');
    if (id) {
      ss = SpreadsheetApp.openById(id);
    } else {
      ss = SpreadsheetApp.create('Asistencia - Caldas y Manizales Florecen 2026');
      DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
      props.setProperty('SPREADSHEET_ID', ss.getId());
    }
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.getSheets()[0].setName(SHEET_NAME);
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange('G:I').setNumberFormat('@'); // teléfono y documento como texto
      sh.getRange('L:L').setNumberFormat('@');
    }
    return sh;
  }

  // Devuelve {duplicado, ...} o agrega la fila. Debe llamarse con el lock tomado.
  static guardar(r) {
    const sh = Hoja.obtener();
    const n = sh.getLastRow() - 1;
    if (n > 0) {
      const ids = sh.getRange(2, 2, n, 1).getValues();
      const claves = sh.getRange(2, KEY_COL, n, 1).getValues();
      for (let i = 0; i < n; i++) {
        if (ids[i][0] === r.id) return { ok: true, duplicate: true };
        if (claves[i][0] === r.clave) return { ok: true, duplicate: true };
      }
    }
    sh.appendRow(r.fila());
    SpreadsheetApp.flush();
    return { ok: true, duplicate: false };
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let r;
  try {
    r = new Registro(JSON.parse(e.postData.contents));
  } catch (err) {
    return json_({ ok: false, error: 'Solicitud inválida.' });
  }
  const msg = r.error();
  if (msg) return json_({ ok: false, error: msg });

  // El lock serializa envíos simultáneos: sin él dos filas iguales podrían pasar la verificación a la vez.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, retry: true, error: 'Servidor ocupado, reintenta.' });
  try {
    return json_(Hoja.guardar(r));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, retry: true, error: 'No se pudo guardar el registro.' });
  } finally {
    lock.releaseLock();
  }
}

class Panel {
  static resumen() {
    const cache = CacheService.getScriptCache();
    const hit = cache.get('stats');
    if (hit) return JSON.parse(hit);

    const sh = Hoja.obtener();
    const n = sh.getLastRow() - 1;
    const filas = n > 0 ? sh.getRange(2, 1, n, 11).getValues() : [];
    const norm = v => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const contar = (mapa, clave, etiqueta) => {
      const m = mapa[clave] || (mapa[clave] = { nombre: etiqueta, total: 0 });
      m.total++;
    };
    const municipios = {}, tipos = {};
    let imagenSi = 0;
    filas.forEach(f => {
      contar(municipios, norm(f[5]), String(f[5]).trim());
      contar(tipos, f[3], f[3]);
      if (f[10] === 'Sí') imagenSi++;
    });
    const orden = o => Object.keys(o).map(k => o[k]).sort((a, b) => b.total - a.total);
    const out = {
      ok: true,
      total: filas.length,
      imagenSi: imagenSi,
      porMunicipio: orden(municipios),
      porTipo: orden(tipos),
      recientes: filas.slice(-15).reverse().map(f => ({
        fecha: Utilities.formatDate(new Date(f[0]), 'America/Bogota', 'HH:mm:ss'),
        nombre: String(f[2]).trim().split(/\s+/).slice(0, 2).map((w, i) => (i ? w[0] + '.' : w)).join(' '), municipio: f[5], tipo: f[3]
      })),
      actualizado: Utilities.formatDate(new Date(), 'America/Bogota', 'HH:mm:ss')
    };
    cache.put('stats', JSON.stringify(out), 5); // amortigua muchos paneles abiertos a la vez
    return out;
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'stats') {
    try {
      return json_(Panel.resumen());
    } catch (err) {
      console.error(err);
      return json_({ ok: false, error: 'No se pudieron leer los datos.' });
    }
  }
  return json_({ ok: true, service: 'Caldas y Manizales Florecen - asistencia' });
}

// Ejecutar una vez desde el editor: crea la hoja y autoriza permisos.
function setup() {
  Logger.log('Hoja: ' + Hoja.obtener().getParent().getUrl());
}
