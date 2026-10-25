
// The page speaks the language of the e-mail link (?lang=), else the one chosen on the website, else the phone's.
const TXT = {
  ar: { title: "إعادة تعيين كلمة السر — دليلكم", brand: "🅳 دليلكم", askEmail: "أدخل بريدك الإلكتروني وبنبعتلك رابط لإعادة تعيين كلمة السر", email: "البريد الإلكتروني", sendLink: "إرسال رابط إعادة التعيين",
    setNew: "عيّن كلمة سر جديدة لحسابك", newPw: "كلمة السر الجديدة", min8: "8 أحرف على الأقل", confirmPw: "تأكيد كلمة السر", change: "تغيير كلمة السر",
    needEmail: "أدخل بريدك الإلكتروني", sent: "إذا كان هذا البريد مسجّلًا، أرسلنا رابط إعادة التعيين", noServer: "تعذّر الاتصال بالسيرفر",
    short: "كلمة السر يجب أن تكون 8 أحرف على الأقل", mismatch: "كلمتا السر غير متطابقتين", done: "تم تغيير كلمة السر بنجاح", goHome: "الذهاب إلى الموقع وتسجيل الدخول", failed: "تعذّر تغيير كلمة السر" },
  en: { title: "Reset your password — Dalilacom", brand: "🅳 Dalilacom", askEmail: "Enter your email and we will send you a link to reset your password", email: "Email", sendLink: "Send the reset link",
    setNew: "Choose a new password for your account", newPw: "New password", min8: "At least 8 characters", confirmPw: "Confirm password", change: "Change password",
    needEmail: "Enter your email", sent: "If this email is registered, we have sent the reset link", noServer: "Could not reach the server",
    short: "The password must be at least 8 characters", mismatch: "The two passwords do not match", done: "Your password was changed", goHome: "Go to the website and sign in", failed: "Could not change the password" },
};
function pickLang() {
  const asked = (new URLSearchParams(location.search).get("lang") || "").slice(0, 2).toLowerCase();
  if (asked === "ar" || asked === "en") return asked;
  try { const saved = localStorage.getItem("dlk_lang"); if (saved === "ar" || saved === "en") return saved; } catch (e) {}
  const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
  for (const l of list) { const c = String(l).slice(0, 2).toLowerCase(); if (c === "ar" || c === "en") return c; }
  return "en";
}
const LANG = pickLang();
const T = TXT[LANG];
document.documentElement.lang = LANG;
document.documentElement.dir = LANG === "ar" ? "rtl" : "ltr";
document.title = T.title;
document.getElementById("brand").textContent = T.brand;
document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T[el.dataset.i18n]; });
document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = T[el.dataset.i18nPh]; });
const JSON_HEADERS = { "Content-Type": "application/json", "Accept-Language": LANG };

function getToken() {
  return new URLSearchParams(window.location.search).get("token") || "";
}
function showMsg(text, ok) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "error");
  el.style.display = "block";
}
async function submitRequest() {
  const email = document.getElementById("email").value.trim();
  if (!email) { showMsg(T.needEmail, false); return; }
  document.getElementById("requestBtn").disabled = true;
  try {
    const res = await fetch("/auth/forgot-password", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    document.getElementById("request-form").style.display = "none";
    showMsg(data.message || T.sent, true);
    document.getElementById("home").style.display = "block";
  } catch {
    showMsg(T.noServer, false);
    document.getElementById("requestBtn").disabled = false;
  }
}
async function submitReset() {
  const token = getToken();
  const pw = document.getElementById("pw").value;
  const pw2 = document.getElementById("pw2").value;
  if (pw.length < 8) { showMsg(T.short, false); return; }
  if (pw !== pw2) { showMsg(T.mismatch, false); return; }

  document.getElementById("submitBtn").disabled = true;
  try {
    const res = await fetch("/auth/reset-password", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ token, newPassword: pw }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      document.getElementById("reset-form").style.display = "none";
      showMsg(data.message || T.done, true);
      document.getElementById("home").style.display = "block";
    } else {
      showMsg((data.error && data.error.message) || T.failed, false);
      document.getElementById("submitBtn").disabled = false;
    }
  } catch {
    showMsg(T.noServer, false);
    document.getElementById("submitBtn").disabled = false;
  }
}
(function init() {
  if (getToken()) {
    document.getElementById("request-form").style.display = "none";
    document.getElementById("reset-form").style.display = "block";
  }
})();
