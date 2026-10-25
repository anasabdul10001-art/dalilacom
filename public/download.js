
// The page speaks the language of the device: Arabic when the phone or browser is Arabic, English otherwise (the button switches by hand).
// It uses the same saved choice as the website (dlk_lang), so a person who already picked a language there gets it here too.
var lang = "en";
function detectLang() {
  try {
    var saved = localStorage.getItem("dlk_lang");
    if (saved === "ar" || saved === "en") return saved;
  } catch (e) {}
  var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
  for (var i = 0; i < list.length; i++) {
    var code = String(list[i]).slice(0, 2).toLowerCase();
    if (code === "ar") return "ar";
    if (code === "en") return "en";
  }
  return "en";
}
function applyLang(l) {
  lang = l;
  document.documentElement.lang = l;
  document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  document.getElementById("view-ar").hidden = l !== "ar";
  document.getElementById("view-en").hidden = l !== "en";
  document.getElementById("langToggle").textContent = l === "ar" ? "English" : "العربية";
  document.getElementById("backText").textContent = l === "ar" ? "الرجوع إلى دليلكم" : "Back to Dalilacom";
}
// back to where the visitor came from (the website), or to the website itself when the page was opened directly
function goBack(e) {
  var from = document.referrer || "";
  if (from.indexOf(location.origin) === 0 && history.length > 1) { e.preventDefault(); history.back(); }
}
function toggleLang() {
  var next = lang === "ar" ? "en" : "ar";
  try { localStorage.setItem("dlk_lang", next); } catch (e) {}
  applyLang(next);
}

// the message first, then the download starts (a browser without dialog support just downloads)
function askBeforeDownload(e) {
  if (e.currentTarget.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
  var d = document.getElementById("dlg-" + lang);
  if (d && typeof d.showModal === "function") { e.preventDefault(); d.showModal(); }
}
function startDownload() {
  document.querySelectorAll("dialog").forEach(function (d) { if (d.open) d.close(); });
  window.location.href = "/download/dalilacom.apk";
}

document.getElementById("backLink").addEventListener("click", goBack);
document.getElementById("langToggle").addEventListener("click", toggleLang);
document.querySelectorAll("#btn-ar, #btn-en").forEach(function (button) {
  button.addEventListener("click", askBeforeDownload);
});
document.querySelectorAll("[data-download-continue]").forEach(function (button) {
  button.addEventListener("click", startDownload);
});
document.querySelectorAll("[data-download-cancel]").forEach(function (button) {
  button.addEventListener("click", function (event) {
    event.currentTarget.closest("dialog").close();
  });
});

// what is on offer now: the version and size, or a note when the owner has the link switched off
function showOffer(info) {
  ["ar", "en"].forEach(function (l) {
    var btn = document.getElementById("btn-" + l);
    var na = document.getElementById("na-" + l);
    var ver = document.getElementById("ver-" + l);
    if (info && info.available) {
      btn.removeAttribute("aria-disabled");
      na.hidden = true;
      var mb = info.sizeBytes ? (info.sizeBytes / 1048576).toFixed(1) + " MB" : "";
      ver.textContent = (l === "ar" ? "النسخة " : "Version ") + info.version + (mb ? " · " + mb : "");
    } else {
      btn.setAttribute("aria-disabled", "true");
      na.hidden = false;
      ver.textContent = "";
    }
  });
}

applyLang(detectLang());
fetch("/app-download").then(function (r) { return r.json(); }).then(showOffer).catch(function () { showOffer(null); });
