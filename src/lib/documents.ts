/**
 * Printable documents (invoices, receipts, and later prescriptions, training/meal programs, quotes...).
 * Every kind has its own proper Arabic name; the page header always carries the issuing account's
 * name and profile photo. Rendered as HTML so the browser / Android WebView shapes the Arabic text
 * correctly, then saved as PDF through the print dialog.
 */

export const DOCUMENT_KINDS = {
  ORDER_INVOICE: { title: "فاتورة طلب", numberLabel: "رقم الفاتورة" },
  DISCOUNT_RECEIPT: { title: "إيصال حسم", numberLabel: "رقم العملية" },
  // Added together with their professions:
  // PRESCRIPTION: "وصفة طبية", VISIT_REPORT: "تقرير زيارة", TRAINING_PROGRAM: "برنامج تدريب",
  // MEAL_PLAN: "برنامج غذائي", QUOTE: "عرض سعر", CONSULTATION_RECEIPT: "إيصال استشارة"
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export interface DocumentData {
  kind: DocumentKind;
  number: string;
  issuedAt: Date;
  issuer: { name: string; avatarUrl: string | null; bio?: string | null; phone?: string | null; address?: string | null };
  recipient: { label: string; name: string };
  status?: string;
  rows: { label: string; qty?: number; amount: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  footnote?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

const STYLE = `
.doc{font-family:Tahoma,"Segoe UI",Arial,sans-serif;direction:rtl;color:#1b1212;background:#fff;max-width:760px;margin:0 auto;padding:28px;line-height:1.6}
.doc *{box-sizing:border-box}
.doc-head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #ba2a34;padding-bottom:16px}
.doc-logo{width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid #eadcda;flex:none}
.doc-logo.ph{display:flex;align-items:center;justify-content:center;background:#ba2a34;color:#fff;font-size:34px;font-weight:700}
.doc-issuer{flex:1;min-width:0}
.doc-issuer h1{margin:0;font-size:24px}
.doc-issuer p{margin:2px 0;color:#6b5755;font-size:13px}
.doc-kind{text-align:left;flex:none}
.doc-kind strong{display:block;font-size:22px;color:#ba2a34}
.doc-kind span{font-size:12px;color:#6b5755}
.doc-meta{display:flex;justify-content:space-between;gap:12px;margin:18px 0;font-size:14px}
.doc-meta div{background:#faf4f3;border-radius:10px;padding:10px 14px;flex:1}
.doc-meta small{display:block;color:#6b5755;font-size:11px}
.doc table{width:100%;border-collapse:collapse;margin-top:6px}
.doc th{background:#ba2a34;color:#fff;padding:9px 12px;text-align:right;font-size:13px}
.doc td{padding:9px 12px;border-bottom:1px solid #eadcda;font-size:14px}
.doc td.num,.doc th.num{text-align:left;white-space:nowrap}
.doc-totals{margin:14px 0 0 auto;width:min(340px,100%)}
.doc-totals div{display:flex;justify-content:space-between;padding:6px 12px;font-size:14px}
.doc-totals .strong{background:#faf4f3;border-radius:10px;font-size:17px;font-weight:700;color:#ba2a34}
.doc-foot{margin-top:28px;text-align:center;color:#6b5755;font-size:12px;border-top:1px solid #eadcda;padding-top:12px}
@media print{@page{margin:14mm}.doc{padding:0;max-width:none}.doc,.doc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

/** A complete, self-contained HTML document (everything visible lives under .doc). */
export function renderDocumentHtml(doc: DocumentData): string {
  const kind = DOCUMENT_KINDS[doc.kind];
  const date = doc.issuedAt.toLocaleDateString("ar-SY-u-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Damascus" });
  const initial = escapeHtml((doc.issuer.name || "?").trim().slice(0, 1));
  const logo = doc.issuer.avatarUrl
    ? `<img class="doc-logo" src="${escapeHtml(doc.issuer.avatarUrl)}" alt="">`
    : `<div class="doc-logo ph">${initial}</div>`;
  const hasQty = doc.rows.some((r) => r.qty !== undefined);
  const rows = doc.rows
    .map((r) => `<tr><td>${escapeHtml(r.label)}</td>${hasQty ? `<td class="num">${escapeHtml(r.qty ?? "")}</td>` : ""}<td class="num">${escapeHtml(r.amount)}</td></tr>`)
    .join("");
  const totals = doc.totals
    .map((t) => `<div class="${t.strong ? "strong" : ""}"><span>${escapeHtml(t.label)}</span><span>${escapeHtml(t.value)}</span></div>`)
    .join("");
  const contact = [doc.issuer.phone, doc.issuer.address].filter(Boolean).map(escapeHtml).join(" · ");
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(kind.title)} ${escapeHtml(doc.number)}</title><style>${STYLE}</style></head>
<body style="margin:0;background:#fff"><div class="doc">
<div class="doc-head">
  ${logo}
  <div class="doc-issuer"><h1>${escapeHtml(doc.issuer.name)}</h1>${doc.issuer.bio ? `<p>${escapeHtml(doc.issuer.bio)}</p>` : ""}${contact ? `<p>${contact}</p>` : ""}</div>
  <div class="doc-kind"><strong>${escapeHtml(kind.title)}</strong><span>دليلكم</span></div>
</div>
<div class="doc-meta">
  <div><small>${escapeHtml(kind.numberLabel)}</small>${escapeHtml(doc.number)}</div>
  <div><small>التاريخ</small>${escapeHtml(date)}</div>
  <div><small>${escapeHtml(doc.recipient.label)}</small>${escapeHtml(doc.recipient.name)}</div>
  ${doc.status ? `<div><small>الحالة</small>${escapeHtml(doc.status)}</div>` : ""}
</div>
<table><thead><tr><th>البند</th>${hasQty ? `<th class="num">الكمية</th>` : ""}<th class="num">المبلغ</th></tr></thead><tbody>${rows}</tbody></table>
<div class="doc-totals">${totals}</div>
${doc.footnote ? `<div class="doc-foot">${escapeHtml(doc.footnote)}</div>` : ""}
</div></body></html>`;
}
