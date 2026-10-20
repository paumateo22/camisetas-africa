/**
 * Camisetas de África — backend de votos en Google Sheets.
 *
 * Hojas que usa (las crea solo la primera vez):
 *   Personas: clave | nombre | pin_hash | alta | votos
 *   Votos:    clave | nombre | camiseta_id | camiseta | nota | fecha
 *
 * Cada persona entra con nombre + PIN. El nombre queda reservado,
 * así nadie puede votar dos veces ni en nombre de otro. Volver a
 * votar una camiseta sustituye la nota anterior, no la duplica.
 */

const SH_PEOPLE = 'Personas';
const SH_VOTES = 'Votos';
const MAX_KIT_ID = 9999999;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ranking';
  if (action === 'ranking') return out_(ranking_());
  if (action === 'ping') return out_({ ok: true });
  return out_({ ok: false, error: 'accion' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'json' }); }
  try {
    if (body.action === 'login') return out_(login_(body));
    if (body.action === 'votes') return out_(saveVotes_(body));
    if (body.action === 'ranking') return out_(ranking_());
    return out_({ ok: false, error: 'accion' });
  } catch (err) {
    return out_({ ok: false, error: 'servidor', detail: String(err) });
  }
}

/* ---------- personas ---------- */

function login_(b) {
  const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const pin = String(b.pin || '');
  const key = keyOf_(name);
  if (!key || key.length < 2) return { ok: false, error: 'nombre' };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'pin_formato' };
  if (tooManyTries_(key)) return { ok: false, error: 'bloqueado' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SH_PEOPLE);
    const rows = sh.getDataRange().getValues();
    const hash = hash_(key + '|' + pin);
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][0] === key) {
        if (rows[r][2] !== hash) { failTry_(key); return { ok: false, error: 'pin' }; }
        return { ok: true, name: rows[r][1], created: false, votes: votesOf_(key) };
      }
    }
    sh.appendRow([key, name, hash, new Date(), 0]);
    return { ok: true, name: name, created: true, votes: {} };
  } finally {
    lock.releaseLock();
  }
}

function auth_(b) {
  const key = keyOf_(b.name);
  if (!key || tooManyTries_(key)) return null;
  const rows = sheet_(SH_PEOPLE).getDataRange().getValues();
  const hash = hash_(key + '|' + String(b.pin || ''));
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] === key) {
      if (rows[r][2] === hash) return { key: key, name: rows[r][1], row: r + 1 };
      failTry_(key);
      return null;
    }
  }
  return null;
}

/* ---------- votos ---------- */

function saveVotes_(b) {
  const who = auth_(b);
  if (!who) return { ok: false, error: 'auth' };
  const list = Array.isArray(b.votes) ? b.votes.slice(0, 400) : [];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SH_VOTES);
    const last = sh.getLastRow();
    const index = {};
    if (last > 1) {
      const keys = sh.getRange(2, 1, last - 1, 3).getValues();
      keys.forEach((k, i) => { if (k[0] === who.key) index[String(k[2])] = i + 2; });
    }
    const now = new Date();
    const append = [];
    list.forEach(v => {
      const id = String(v[0] || '').replace(/\D/g, '');
      const nota = Number(v[1]);
      const label = String(v[2] || '').slice(0, 80);
      if (!id || Number(id) > MAX_KIT_ID || !(nota >= 1 && nota <= 5) || nota % 1) return;
      if (index[id]) {
        sh.getRange(index[id], 4, 1, 3).setValues([[label, nota, now]]);
      } else {
        append.push([who.key, who.name, id, label, nota, now]);
        index[id] = -1;
      }
    });
    if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, 6).setValues(append);

    const total = Object.keys(index).length;
    sheet_(SH_PEOPLE).getRange(who.row, 5).setValue(total);
    CacheService.getScriptCache().remove('ranking');
    return { ok: true, saved: list.length, total: total };
  } finally {
    lock.releaseLock();
  }
}

function votesOf_(key) {
  const sh = sheet_(SH_VOTES);
  const last = sh.getLastRow();
  const res = {};
  if (last < 2) return res;
  sh.getRange(2, 1, last - 1, 5).getValues().forEach(r => {
    if (r[0] === key) res[String(r[2])] = Number(r[4]);
  });
  return res;
}

/* ---------- ranking ---------- */

function ranking_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ranking');
  if (hit) return JSON.parse(hit);

  const sh = sheet_(SH_VOTES);
  const last = sh.getLastRow();
  const kits = {};
  const people = {};
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 5).getValues().forEach(r => {
      const id = String(r[2]), n = Number(r[4]);
      if (!(n >= 1 && n <= 5)) return;
      const k = kits[id] || (kits[id] = [0, 0, 0]); // [votos, suma, cincos]
      k[0]++; k[1] += n; if (n === 5) k[2]++;
      people[r[0]] = 1;
    });
  }
  const res = { ok: true, kits: kits, voters: Object.keys(people).length, at: Date.now() };
  cache.put('ranking', JSON.stringify(res), 15);
  return res;
}

/* ---------- utilidades ---------- */

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const head = name === SH_PEOPLE
      ? ['clave', 'nombre', 'pin_hash', 'alta', 'votos']
      : ['clave', 'nombre', 'camiseta_id', 'camiseta', 'nota', 'fecha'];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function keyOf_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, '').trim().replace(/\s+/g, ' ');
}

function hash_(s) {
  const salt = PropertiesService.getScriptProperties().getProperty('SALT') || setupSalt_();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + s, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function setupSalt_() {
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('SALT', salt);
  return salt;
}

function tooManyTries_(key) {
  return Number(CacheService.getScriptCache().get('fail:' + key) || 0) >= 8;
}
function failTry_(key) {
  const c = CacheService.getScriptCache();
  c.put('fail:' + key, String(Number(c.get('fail:' + key) || 0) + 1), 600);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecútala una vez desde el editor para crear las hojas y dar permisos. */
function setup() {
  sheet_(SH_PEOPLE);
  sheet_(SH_VOTES);
  if (!PropertiesService.getScriptProperties().getProperty('SALT')) setupSalt_();
}

/** Para borrar a alguien que haya olvidado su PIN: pon su nombre y ejecútala. */
function borrarPersona() {
  const nombre = 'ESCRIBE AQUÍ EL NOMBRE';
  const key = keyOf_(nombre);
  [SH_VOTES, SH_PEOPLE].forEach(n => {
    const sh = sheet_(n);
    const rows = sh.getDataRange().getValues();
    for (let r = rows.length - 1; r >= 1; r--) if (rows[r][0] === key) sh.deleteRow(r + 1);
  });
  CacheService.getScriptCache().remove('ranking');
}
