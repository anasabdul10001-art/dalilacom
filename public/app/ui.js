/* Small pieces for the HR, accounting and auto-responder screens (their styles are in ui.css). */

/** A loader that looks like the page it replaces: a few grey cards that shimmer, instead of one lonely spinner. */
function skeleton(kind, n) {
  const count = n || 3;
  if (kind === "tiles") return `<div class="skel-tiles">${Array.from({ length: 4 }, () => `<div class="skel skel-tile"></div>`).join("")}</div>${skeleton("list", 2)}`;
  return Array.from({ length: count }, () => `<div class="skel skel-card"></div>`).join("");
}

/** Round initials in a colour taken from the name, so each person keeps the same one. */
function uiAvatar(name) {
  const text = String(name || "?").trim();
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  const initials = text.split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] || "").join("").toUpperCase();
  return `<span class="avatar" style="--h:${h}">${esc(initials || "?")}</span>`;
}

const uiChip = (text, tone) => `<span class="chip ${tone || ""}">${esc(text)}</span>`;
const uiTile = (label, value, tone, wide) => `<div class="tile tone-${tone || "net"} ${wide ? "wide" : ""}"><small>${esc(label)}</small><b>${esc(value)}</b></div>`;
const uiEmpty = (icon, text) => `<div class="empty"><span class="ico">${icon}</span>${esc(text)}</div>`;

/** The steps of a process (draft, calculated, paid): the ones reached are filled. */
function uiStepper(labels, reached) {
  return `<div class="stepper">${labels.map((l, i) => `<div class="step ${i <= reached ? "done" : ""}"><i></i>${esc(l)}</div>`).join("")}</div>`;
}

/** A section closed by default, for the details nobody needs at first glance. */
const uiFold = (title, bodyHtml) => `<details class="fold"><summary>${esc(title)}</summary><div class="fold-body">${bodyHtml}</div></details>`;

/** A small question box inside the page (instead of the browser's own prompt, which looks plain on a phone). Resolves with the text, or null when cancelled. */
function uiPrompt(label, value, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "ui-ask";
    box.innerHTML = `<div class="ui-ask-card" role="dialog" aria-modal="true"><label>${esc(label)}</label>
      <input ${opts.numeric ? 'inputmode="decimal"' : ""} value="${esc(value == null ? "" : String(value))}" />
      <div class="btn-row"><button class="btn small" data-ok>${esc(t("accounting.save"))}</button><button class="btn small outline" data-no>${esc(t("adr.cancel"))}</button></div></div>`;
    const done = (v) => { box.remove(); resolve(v); };
    const input = box.querySelector("input");
    box.querySelector("[data-ok]").onclick = () => done(input.value);
    box.querySelector("[data-no]").onclick = () => done(null);
    box.addEventListener("click", (e) => { if (e.target === box) done(null); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); else if (e.key === "Escape") done(null); });
    document.body.appendChild(box);
    input.focus(); input.select();
  });
}

/** A small choice box: options is [[value, label], ...]. Resolves with the chosen value, or null when cancelled. */
function uiPick(label, options) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "ui-ask";
    box.innerHTML = `<div class="ui-ask-card" role="dialog" aria-modal="true"><label>${esc(label)}</label>
      <div class="btn-row">${options.map(([v, l]) => `<button class="btn small soft" data-v="${esc(v)}">${esc(l)}</button>`).join("")}</div>
      <div class="btn-row"><button class="btn small outline" data-no>${esc(t("adr.cancel"))}</button></div></div>`;
    const done = (v) => { box.remove(); resolve(v); };
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) done(b.dataset.v); else if (e.target === box || e.target.closest("[data-no]")) done(null); });
    document.body.appendChild(box);
  });
}

/** Shows a button as working while a request runs, so it cannot be pressed twice. */
async function uiBusy(btn, work) {
  if (btn && btn.classList) btn.classList.add("busy");
  try { return await work(); } finally { if (btn && btn.classList) btn.classList.remove("busy"); }
}
