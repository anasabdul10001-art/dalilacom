// تشغيل يدوي: npm run seed  (يضيف المحتوى التجريبي إن كانت قاعدة البيانات فارغة)
import { db } from '../db.js';
import { seedDemo } from './demo.js';

if (db.prepare('SELECT COUNT(*) n FROM categories').get().n) {
  console.log('قاعدة البيانات تحتوي بيانات بالفعل؛ لم يُضف شيء. احذف مجلد data لإعادة التهيئة.');
} else {
  await seedDemo();
  console.log('تمت إضافة المحتوى التجريبي.');
}
