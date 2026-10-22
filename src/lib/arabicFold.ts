import { Prisma } from "@prisma/client";

// The same folding as normalizeText, done inside the database: alef variants, teh marbuta, alef maksura, hamza on yeh/waw,
// diacritics and tatweel, and case. A typed "الاسد" then finds a stored "الأسد".
const FROM = String.fromCharCode(0x0623, 0x0625, 0x0622, 0x0671, 0x0629, 0x0649, 0x0626, 0x0624);
const TO = String.fromCharCode(0x0627, 0x0627, 0x0627, 0x0627, 0x0647, 0x064a, 0x064a, 0x0648);
const DIACRITICS = "[" + String.fromCharCode(0x064b) + "-" + String.fromCharCode(0x065f, 0x0670, 0x0640) + "]";

/** SQL for a column (written like `Prisma.raw('l."name"')`) folded the way typed text is. */
export const foldedColumn = (column: Prisma.Sql) => Prisma.sql`translate(lower(regexp_replace(${column}, ${DIACRITICS}, '', 'g')), ${FROM}, ${TO})`;
