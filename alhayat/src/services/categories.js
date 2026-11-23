import { db, tx } from '../db.js';
import { slugify } from '../lib/text.js';
import { plain } from '../lib/sanitize.js';
import { bumpVersion } from '../lib/cache.js';

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function listCategories({ all = false } = {}) {
  return db.prepare(`SELECT c.id,c.slug,c.name,c.description,c.color,c.sort_order AS sortOrder,c.active,c.parent_id AS parentId,
      (SELECT COUNT(*) FROM articles a WHERE a.category_id=c.id AND a.status='published') AS articlesCount
    FROM categories c ${all ? '' : 'WHERE c.active=1'} ORDER BY c.sort_order, c.id`).all();
}
export const categoryBySlug = (slug) => db.prepare('SELECT * FROM categories WHERE slug=? AND active=1').get(slug);
export const categoryById = (id) => db.prepare('SELECT * FROM categories WHERE id=?').get(id);

export function saveCategory(input, id = null) {
  const name = plain(input.name, 60);
  if (!name) throw httpError(400, 'اسم التصنيف مطلوب');
  const color = COLOR.test(input.color || '') ? input.color : '#c62828';
  const description = plain(input.description, 300);
  const sort = Number.isFinite(+input.sortOrder) ? +input.sortOrder : 0;
  const active = input.active === false || input.active === 0 ? 0 : 1;
  const parentId = input.parentId && +input.parentId !== id ? +input.parentId : null;
  const base = slugify(input.slug || name, 40);
  let slug = base, n = 2;
  while (db.prepare('SELECT 1 FROM categories WHERE slug=? AND id IS NOT ?').get(slug, id)) slug = `${base}-${n++}`;
  const r = tx(() => id
    ? (db.prepare('UPDATE categories SET slug=?,name=?,description=?,color=?,sort_order=?,active=?,parent_id=? WHERE id=?')
        .run(slug, name, description, color, sort, active, parentId, id), id)
    : Number(db.prepare('INSERT INTO categories(slug,name,description,color,sort_order,active,parent_id) VALUES(?,?,?,?,?,?,?)')
        .run(slug, name, description, color, sort, active, parentId).lastInsertRowid));
  bumpVersion();
  return categoryById(r);
}

export function deleteCategory(id) {
  const used = db.prepare('SELECT COUNT(*) n FROM articles WHERE category_id=?').get(id).n;
  if (used) throw httpError(409, `لا يمكن حذف تصنيف يحتوي ${used} خبراً. انقل الأخبار أو عطّل التصنيف.`);
  db.prepare('DELETE FROM categories WHERE id=?').run(id);
  bumpVersion();
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** أقسام أساسية تُضمن وجودها في أي قاعدة بيانات (آمنة للتكرار) */
export const CORE_SECTIONS = [
  { slug: 'investigations', name: 'تحقيقات', color: '#b8860b', description: 'تحقيقات صحفية معمّقة وملفات خاصة.' },
  { slug: 'ads', name: 'إعلانات', color: '#1e4fa3', description: 'إعلانات وإعلانات مبوّبة وإعلانات رسمية.' },
  { slug: 'nabd', name: 'نبض الحياة', color: '#c9a227', description: 'مقالات المدير العام ورئيس التحرير.' },
];
export function ensureCoreSections() {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM categories').get().m;
  CORE_SECTIONS.forEach((c, i) => {
    if (!db.prepare('SELECT 1 FROM categories WHERE slug=?').get(c.slug)) saveCategory({ ...c, sortOrder: max + 1 + i });
  });
}
