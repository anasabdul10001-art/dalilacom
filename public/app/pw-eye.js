/* The eye on every password field: tap it to see what was typed, tap again to hide it. Works on the pages that are redrawn by script too. */
(function () {
  var EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  var WORDS = { ar: ["إظهار كلمة السر", "إخفاء كلمة السر"], en: ["Show password", "Hide password"] };
  function words() {
    var lang = (document.documentElement.getAttribute("lang") || "ar").slice(0, 2);
    return WORDS[lang] || WORDS.en;
  }
  var style = document.createElement("style");
  style.textContent =
    ".pw-wrap{position:relative;display:block}.pw-wrap>input{width:100%;padding-inline-end:44px!important;box-sizing:border-box}" +
    ".pw-eye{position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);width:34px!important;height:34px!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:8px;box-shadow:none!important;line-height:1;background:transparent!important;color:#6b5d5b!important;display:flex;align-items:center;justify-content:center;cursor:pointer}" +
    ".pw-eye:hover{color:#ba2a34!important}";
  document.head.appendChild(style);

  function enhance(root) {
    var inputs = (root || document).querySelectorAll('input[type="password"]:not([data-eye])');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      input.setAttribute("data-eye", "1");
      var wrap = document.createElement("span");
      wrap.className = "pw-wrap";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pw-eye";
      btn.innerHTML = EYE;
      btn.setAttribute("aria-label", words()[0]);
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep the cursor in the field
      btn.addEventListener("click", (function (inp, b) {
        return function () {
          var show = inp.type === "password";
          inp.type = show ? "text" : "password";
          b.innerHTML = show ? EYE_OFF : EYE;
          b.setAttribute("aria-label", words()[show ? 1 : 0]);
        };
      })(input, btn));
      wrap.appendChild(btn);
    }
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; enhance(); });
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== "loading") enhance(); else document.addEventListener("DOMContentLoaded", function () { enhance(); });
})();
