import { db, nowIso, PERMISSIONS } from '../db.js';
import { hashPassword, validPassword } from '../lib/auth.js';
import { plain } from '../lib/sanitize.js';
import { httpError } from './categories.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const listUsers = () => db.prepare(`SELECT u.id,u.name,u.email,u.role,r.label AS roleLabel,u.active,u.bio,u.created_at AS createdAt,u.last_login_at AS lastLoginAt,
  (SELECT COUNT(*) FROM articles a WHERE a.author_id=u.id) AS articles FROM users u JOIN roles r ON r.name=u.role ORDER BY u.id`).all();

export const listRoles = () => db.prepare('SELECT name,label,permissions,builtin FROM roles ORDER BY builtin DESC, name').all()
  .map((r) => ({ name: r.name, label: r.label, builtin: !!r.builtin, permissions: JSON.parse(r.permissions) }));

function adminCount(excludeId) {
  return db.prepare(`SELECT COUNT(*) n FROM users u WHERE u.role='admin' AND u.active=1 AND u.id != ?`).get(excludeId ?? -1).n;
}

export function saveUser(input, id = null) {
  const name = plain(input.name, 80);
  const email = String(input.email || '').trim().toLowerCase();
  if (!name) throw httpError(400, 'الاسم مطلوب');
  if (!EMAIL.test(email)) throw httpError(400, 'البريد الإلكتروني غير صالح');
  if (!db.prepare('SELECT 1 FROM roles WHERE name=?').get(input.role)) throw httpError(400, 'الدور غير صالح');
  const active = input.active === false ? 0 : 1;
  if (db.prepare('SELECT 1 FROM users WHERE email=? AND id IS NOT ?').get(email, id)) throw httpError(409, 'البريد مستخدم لحساب آخر');
  if (id) {
    const cur = db.prepare('SELECT role,active FROM users WHERE id=?').get(id);
    if (!cur) throw httpError(404, 'المستخدم غير موجود');
    if (cur.role === 'admin' && (input.role !== 'admin' || !active) && adminCount(id) === 0) throw httpError(409, 'يجب أن يبقى مدير نظام واحد نشط على الأقل');
    db.prepare('UPDATE users SET name=?,email=?,role=?,bio=?,active=? WHERE id=?').run(name, email, input.role, plain(input.bio, 300), active, id);
    if (input.password) setPassword(id, input.password);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    return id;
  }
  if (!validPassword(input.password)) throw httpError(400, 'كلمة المرور يجب ألا تقل عن 10 أحرف');
  return Number(db.prepare('INSERT INTO users(name,email,password_hash,role,bio,active,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(name, email, hashPassword(input.password), input.role, plain(input.bio, 300), active, nowIso()).lastInsertRowid);
}

export function setPassword(id, pw) {
  if (!validPassword(pw)) throw httpError(400, 'كلمة المرور يجب ألا تقل عن 10 أحرف');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(pw), id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
}

export function deleteUser(id) {
  const u = db.prepare('SELECT role FROM users WHERE id=?').get(id);
  if (!u) return;
  if (u.role === 'admin' && adminCount(id) === 0) throw httpError(409, 'لا يمكن حذف آخر مدير نظام');
  db.prepare('DELETE FROM users WHERE id=?').run(id);
}

export function saveRole(name, input) {
  const perms = (input.permissions || []).filter((p) => p in PERMISSIONS);
  const label = plain(input.label, 40);
  if (!label) throw httpError(400, 'اسم الدور مطلوب');
  if (name === 'admin') throw httpError(400, 'دور مدير النظام ثابت');
  const exists = db.prepare('SELECT 1 FROM roles WHERE name=?').get(name);
  if (exists) db.prepare('UPDATE roles SET label=?, permissions=? WHERE name=?').run(label, JSON.stringify(perms), name);
  else {
    if (!/^[a-z][a-z0-9_]{1,20}$/.test(name)) throw httpError(400, 'معرّف الدور: أحرف لاتينية صغيرة وأرقام فقط');
    db.prepare('INSERT INTO roles(name,label,permissions,builtin) VALUES(?,?,?,0)').run(name, label, JSON.stringify(perms));
  }
}
export function deleteRole(name) {
  const r = db.prepare('SELECT builtin FROM roles WHERE name=?').get(name);
  if (!r) return;
  if (r.builtin) throw httpError(409, 'لا يمكن حذف دور أساسي');
  if (db.prepare('SELECT 1 FROM users WHERE role=?').get(name)) throw httpError(409, 'يوجد مستخدمون بهذا الدور');
  db.prepare('DELETE FROM roles WHERE name=?').run(name);
}
