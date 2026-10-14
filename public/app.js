(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const mk = (kind) => ({
    get(k, d) { try { const v = window[kind].getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { window[kind].setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { window[kind].removeItem(k); } catch (e) { /* ignore */ } }
  });
  const LS = mk("localStorage"), SS = mk("sessionStorage");
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });
  const money = (n) => NZD.format(Number(n) || 0);
  const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString("en-NZ", { maximumFractionDigits: d });
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const LOGO_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/;

  const S = { mode: "local", data: null, input: null, result: null, view: "quote", staffPin: "", pinTried: false,
    adminPw: "", authed: false, draft: null, dirty: false, atab: "rates", serverEmpty: false };

  /* ---------- data ---------- */
  function normalize(d) {
    const base = clone(DEFAULT_DATA);
    if (!d || d.schema !== 1) return base;
    const out = clone(base);
    out.updatedAt = d.updatedAt || null;
    out.rates = base.rates.map((b) => {
      const s = (d.rates || []).find((x) => x.key === b.key);
      return s ? { ...b, value: Number(s.value) || 0, status: s.status || b.status, note: s.note != null ? s.note : b.note } : b;
    });
    out.mounting = base.mounting.map((b) => ({ ...b, ...((d.mounting || []).find((x) => x.id === b.id) || {}), id: b.id, name: b.name }));
    out.compliance = base.compliance.map((b) => ({ ...b, ...((d.compliance || []).find((x) => x.id === b.id) || {}), id: b.id, name: b.name }));
    ["foundations", "substrates", "access", "travel"].forEach((k) => {
      if (Array.isArray(d[k]) && d[k].length) out[k] = clone(d[k]);
    });
    out.branding = { ...base.branding, ...(d.branding || {}) };
    if (out.branding.logo && !LOGO_RE.test(out.branding.logo)) out.branding.logo = "";
    return out;
  }

  async function loadRates() {
    S.staffPin = LS.get("ugs.staffPin", "");
    let res;
    try {
      res = await fetch("/api/rates", { headers: S.staffPin ? { "x-staff-pin": S.staffPin } : {}, cache: "no-store" });
    } catch (e) {
      const c = LS.get("ugs.serverData", null);
      if (c) { S.mode = "offline"; S.data = normalize(c); return "ok"; }
      return localMode();
    }
    let body = null;
    if ((res.headers.get("content-type") || "").includes("application/json")) body = await res.json().catch(() => null);
    if (body && res.ok && body.schema === 1) { S.mode = "server"; S.data = normalize(body); LS.set("ugs.serverData", body); return "ok"; }
    if (body && res.status === 401) { S.mode = "server"; return "pin"; }
    if (body && res.status === 404 && body.error === "No rates saved yet.") { S.mode = "server"; S.serverEmpty = true; S.data = normalize(null); return "ok"; }
    return localMode();
  }
  function localMode() { S.mode = "local"; S.data = normalize(LS.get("ugs.localData", null)); return "ok"; }

  /* ---------- chrome ---------- */
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function arm(btn, label, fn) {
    if (btn.dataset.armed !== undefined) { delete btn.dataset.armed; fn(); return; }
    const orig = btn.textContent; btn.dataset.armed = ""; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed !== undefined) { delete btn.dataset.armed; btn.textContent = orig; } }, 3500);
  }
  function brandMarkHTML(b) {
    return b.logo ? `<span class="logo-chip"><img src="${esc(b.logo)}" alt="${esc(b.companyName)} logo"></span>` : `<b>UGS<span>·</span></b>`;
  }
  function applyBranding() { $("#brandMark").innerHTML = brandMarkHTML(S.data.branding); }
  function renderMode() {
    const chip = $("#modeChip");
    const m = { server: ["Shared rates", ""], local: ["Rates on this device", "warn"], offline: ["Offline – saved rates", "warn"] }[S.mode];
    chip.textContent = m[0]; chip.className = "mode " + m[1];
  }
  function renderBanner() {
    let h = "";
    if (S.mode === "local") h = `<div class="notice">Shared rates aren't available here, so rates and the logo are saved on this device only. Deploy to Netlify with the rates function to share them across iPads.</div>`;
    else if (S.mode === "offline") h = `<div class="notice">You're offline. Using rates last downloaded${S.data.updatedAt ? " (saved " + esc(new Date(S.data.updatedAt).toLocaleString("en-NZ")) + ")" : ""}. Rate changes need a connection.</div>`;
    else if (S.serverEmpty) h = `<div class="notice info">No rates have been saved on the server yet, so the spreadsheet defaults are showing. Sign in to Admin and save to set them for everyone.</div>`;
    $("#banner").innerHTML = h;
  }
  function setView(v) {
    S.view = v;
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    $("#quoteView").hidden = v !== "quote";
    $("#adminView").hidden = v !== "admin";
    if (v === "admin") showAdmin(); else $("#saveBar").hidden = true;
    if (v === "quote") update();
    window.scrollTo(0, 0);
  }

  /* ---------- quote ---------- */
  function refreshQuoteOptions() {
    const d = S.data, i = S.input;
    if (!d.foundations.some((f) => f.name === i.foundation)) i.foundation = d.foundations[0].name;
    if (!d.substrates.some((f) => f.name === i.substrate)) i.substrate = d.substrates[0].name;
    if (!d.access.some((f) => f.name === i.access)) i.access = d.access[0].name;
    if (i.routeOverride && !d.compliance.some((c) => c.id === i.routeOverride)) i.routeOverride = "";
    if (!d.mounting.some((m) => m.id === i.mount)) i.mount = d.mounting[0].id;
    const opts = (list) => list.map((x) => `<option>${esc(x.name)}</option>`).join("");
    $("#f_foundation").innerHTML = opts(d.foundations);
    $("#f_substrate").innerHTML = opts(d.substrates);
    $("#f_access").innerHTML = opts(d.access);
    $("#f_routeOverride").innerHTML = `<option value="">Automatic (suggested)</option>` + d.compliance.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    $("#seg_mount").innerHTML = d.mounting.map((m) => `<button type="button" data-v="${esc(m.id)}">${esc(m.name)}</button>`).join("");
    writeInputs();
  }
  function writeInputs() {
    $$("#quoteView input[data-field], #quoteView select[data-field]").forEach((el) => {
      const v = S.input[el.dataset.field];
      el.value = v == null ? "" : v;
    });
  }
  function initQuote() {
    $$(".seg[data-bool]").forEach((s) => { s.innerHTML = `<button type="button" data-v="1">Yes</button><button type="button" data-v="0">No</button>`; });
    refreshQuoteOptions();
  }

  function update() {
    if (!S.data || !S.input) return;
    $$(".seg").forEach((seg) => {
      const f = seg.dataset.field, bool = seg.hasAttribute("data-bool");
      $$("button", seg).forEach((b) => {
        const v = bool ? b.dataset.v === "1" : b.dataset.v;
        b.setAttribute("aria-pressed", String(S.input[f] === v));
      });
    });
    const mount = S.data.mounting.find((m) => m.id === S.input.mount) || S.data.mounting[0];
    $("#row_substrate").hidden = !mount.usesSubstrate;
    $("#row_block").hidden = mount.id !== "soffit";
    $("#row_clear").hidden = mount.id !== "free";

    const r = calculate(S.input, S.data);
    S.result = r;
    $("#areaLine").innerHTML = `Roof area <b class="num">${fmt(r.qty.area)} m²</b>`;
    $("#postsHint").textContent = `Auto: ${r.qty.perRow * r.qty.rows} posts (${r.qty.rows} row${r.qty.rows > 1 ? "s" : ""} of ${r.qty.perRow}).`;
    const found = S.data.foundations.find((f) => f.name === S.input.foundation);
    $("#foundHint").textContent = found && found.note ? found.note : "";
    $("#zoneHint").textContent = `${r.travel.zone} · ${r.travel.trips} trip${r.travel.trips === 1 ? "" : "s"} at ${money(r.travel.tripCost)} each`;
    renderPrice(r);
    LS.set("ugs.quoteDraft", S.input);
  }

  function renderPrice(r) {
    const col = $("#priceCol");
    const open = $$("details[data-k]", col).filter((d) => d.open).map((d) => d.dataset.k);
    const nameOf = (id) => (S.data.compliance.find((c) => c.id === id) || {}).name || id;
    const lines = r.costs.concat(r.compCosts.filter((c) => c.amount > 0));
    const row = (a, b, basis, cls) => `<tr${cls ? ` class="${cls}"` : ""}><td>${esc(a)}${basis ? `<span class="b">${esc(basis)}</span>` : ""}</td><td class="n">${b}</td></tr>`;
    col.innerHTML = `
      <div class="card total-card">
        ${r.placeholders ? `<span class="draft">DRAFT RATES</span>` : ""}
        <span class="k">Installation estimate, excl GST</span>
        <div class="total">${money(r.exGst)}</div>
        <div class="sub"><span>incl GST <b>${money(r.incGst)}</b></span><span><b>${money(r.perM2)}</b> per m²</span><span><b>${fmt(r.hours, 1)}</b> hrs · <b>${r.days}</b> day${r.days === 1 ? "" : "s"}</span></div>
      </div>
      <div class="card route">
        <span class="k hint">Compliance route</span>
        <div class="name">${esc(r.route.name)}</div>
        <div class="pills">
          <span class="pill ${r.route.lbp ? "alert" : ""}">${r.route.lbp ? "LBP required" : "No LBP"}</span>
          <span class="pill ${r.route.consent ? "alert" : ""}">${r.route.consent ? "Consent likely" : "No consent"}</span>
          ${r.route.cpeng ? `<span class="pill on">CPEng design</span>` : ""}
        </div>
        ${S.input.routeOverride && S.input.routeOverride !== r.route.suggested ? `<div class="hint">Set manually. Suggested: ${esc(nameOf(r.route.suggested))}</div>` : ""}
        <div class="hint">${esc(r.route.note)}</div>
      </div>
      ${r.warnings.length ? `<ul class="warns">${r.warnings.map((w) => `<li class="w-${esc(w.level)}">${esc(w.text)}</li>`).join("")}</ul>` : ""}
      <div class="card">
        <table class="lines">
          ${lines.map((c) => row(c.line, money(c.amount), c.basis)).join("")}
          ${r.contingency ? row("Contingency", money(r.contingency)) : ""}
          ${r.minTopUp ? row("Minimum charge top-up", money(r.minTopUp)) : ""}
          ${row("Total excl GST", money(r.exGst), "", "sum")}
          ${row("GST", money(r.gst))}
          ${row("Total incl GST", money(r.incGst), "", "sum")}
        </table>
        <details data-k="labour"${open.includes("labour") ? " open" : ""}><summary>Labour detail · ${fmt(r.hours)} hrs</summary>
          <table class="lines">${r.tasks.filter((t) => t.hours > 0).map((t) => row(t.task, fmt(t.hours) + " h", `${fmt(t.qty)} × ${fmt(t.hpu)} h ${t.driver}`)).join("")}</table>
        </details>
        <details data-k="qty"${open.includes("qty") ? " open" : ""}><summary>Quantities &amp; travel</summary>
          <table class="lines">
            ${row("Posts", fmt(r.qty.posts, 0))}${row("Beam", fmt(r.qty.beam) + " lm")}${row("Wall / soffit fixing", fmt(r.qty.attach) + " lm")}
            ${row("Bars", fmt(r.qty.bars, 0))}${row("Substrate factor", fmt(r.qty.subf))}
            ${row("Travel zone", esc(r.travel.zone))}${row("Trips", fmt(r.travel.trips, 0))}${row("Cost per trip", money(r.travel.tripCost))}
          </table>
        </details>
      </div>
      <div class="actions">
        ${inFrame ? "" : `<button class="btn primary" id="printBtn" type="button">Customer summary</button>`}
        <button class="btn" id="newBtn" type="button">New quote</button>
      </div>`;
  }

  function printSummary() {
    const r = S.result, b = S.data.branding, i = S.input;
    const mount = S.data.mounting.find((m) => m.id === i.mount) || S.data.mounting[0];
    const install = r.costs.filter((c) => c.line !== "Travel").reduce((s, c) => s + c.amount, 0) + r.contingency + r.minTopUp;
    const travel = (r.costs.find((c) => c.line === "Travel") || { amount: 0 }).amount;
    const compAmt = r.compCosts.reduce((s, c) => s + c.amount, 0);
    const compWhat = [r.compCosts[0].amount ? "LBP supervision" : "", r.compCosts[1].amount ? "engineer review" : "", r.compCosts[2].amount ? "consent management" : ""].filter(Boolean).join(", ");
    $("#printView").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16pt">
        <div>${b.logo ? `<img src="${esc(b.logo)}" alt="${esc(b.companyName)} logo" style="max-height:64px;max-width:240px">` : `<h1>${esc(b.companyName)}</h1>`}</div>
        <div class="small" style="text-align:right">${esc(b.companyName)}<br>${esc(b.contact)}<br>${new Date().toLocaleDateString("en-NZ")}</div>
      </div>
      ${r.placeholders ? `<p><span class="wm">DRAFT – RATES NOT CONFIRMED</span></p>` : ""}
      <h1 style="margin-top:14pt">Installation estimate</h1>
      <p>${i.ref ? esc(i.ref) + "<br>" : ""}${esc(i.address)}</p>
      <p>Clearspan, ${esc(mount.name.toLowerCase())}, ${fmt(i.width)} m × ${fmt(i.projection)} m (${fmt(r.qty.area)} m²). Foundations: ${esc(i.foundation)}.</p>
      <table>
        <tr><td>Installation &amp; assembly</td><td class="n">${money(install)}</td></tr>
        <tr><td>Travel</td><td class="n">${money(travel)}</td></tr>
        ${compAmt > 0 ? `<tr><td>Compliance (${esc(compWhat)})</td><td class="n">${money(compAmt)}</td></tr>` : ""}
        <tr><td><b>Total excl GST</b></td><td class="n"><b>${money(r.exGst)}</b></td></tr>
        <tr><td>GST</td><td class="n">${money(r.gst)}</td></tr>
        <tr><td><b>Total incl GST</b></td><td class="n"><b>${money(r.incGst)}</b></td></tr>
      </table>
      <p class="small">Installation only. Clearspan supply is quoted separately. This estimate is confirmed after a site measure.${r.route.consent ? " A building consent is likely to be needed; council fees are not included." : ""}${r.poa ? " Some items are priced on application." : ""}</p>`;
    window.print();
  }

  /* ---------- admin ---------- */
  const TABS = [
    ["rates", "Rates"], ["foundations", "Foundations"], ["mounting", "Mounting"], ["substrates", "Wall substrate"],
    ["access", "Access"], ["travel", "Travel zones"], ["compliance", "Compliance"], ["branding", "Branding & logo"]
  ];
  const ST = { k: "status", t: "status", h: "Status" }, NOTE = { k: "note", t: "text", h: "Note" };
  const DEFS = {
    rates: { hint: "Percentages are entered as whole numbers (15 = 15%).", fixed: true,
      cols: [{ k: "label", t: "static", h: "Item", cls: "lab" }, { k: "value", t: "num", h: "Value" }, { k: "unit", t: "static", h: "Unit", cls: "unit" }, ST, NOTE] },
    foundations: { hint: "Labour and materials per post. A return trip covers footings curing before the frame goes up.",
      cols: [{ k: "name", t: "text", h: "Foundation" }, { k: "hrsPerPost", t: "num", h: "Hrs / post" }, { k: "matPerPost", t: "num", h: "$ / post" }, { k: "extraTrips", t: "num", h: "Extra trips" }, { k: "poa", t: "chk", h: "POA" }, ST, NOTE],
      blank: { name: "New foundation", hrsPerPost: 0, matPerPost: 0, extraTrips: 0, poa: false, status: "PLACEHOLDER", note: "" } },
    mounting: { hint: "Fixing and flashing hours are per lineal metre of width along the house.", fixed: true,
      cols: [{ k: "name", t: "static", h: "Mounting", cls: "lab" }, { k: "postRows", t: "num", h: "Post rows" }, { k: "fixHrsLm", t: "num", h: "Fixing hrs/lm" }, { k: "flashHrsLm", t: "num", h: "Flashing hrs/lm" }, { k: "blockHrsLm", t: "num", h: "Blocking hrs/lm" }, { k: "extraHrsJob", t: "num", h: "Extra hrs/job" }, { k: "usesSubstrate", t: "chk", h: "Substrate factor" }, ST, NOTE] },
    substrates: { hint: "Multiplier on wall-fixing and flashing hours for face-fixed jobs.",
      cols: [{ k: "name", t: "text", h: "Wall substrate" }, { k: "mult", t: "num", h: "Multiplier" }, ST, NOTE],
      blank: { name: "New substrate", mult: 1, status: "PLACEHOLDER", note: "" } },
    access: { hint: "Hire is charged per install day plus delivery, with the materials markup.",
      cols: [{ k: "name", t: "text", h: "Access" }, { k: "perDay", t: "num", h: "$ / day" }, { k: "delivery", t: "num", h: "Delivery $" }, ST, NOTE],
      blank: { name: "New access option", perDay: 0, delivery: 0, status: "PLACEHOLDER", note: "" } },
    travel: { hint: "A zone runs from its 'From km' up to the next zone's 'From km' (one-way road km from Kumeu).",
      cols: [{ k: "name", t: "text", h: "Zone" }, { k: "fromKm", t: "num", h: "From km" }, { k: "rtHrs", t: "num", h: "Round-trip hrs" }, { k: "poa", t: "chk", h: "POA" }, ST, NOTE],
      blank: { name: "New zone", fromKm: 0, rtHrs: 0, poa: false, status: "PLACEHOLDER", note: "" } },
    compliance: { hint: "Which fees each route triggers. Routes are chosen by the Schedule 1 rules built into the app.", fixed: true,
      cols: [{ k: "name", t: "static", h: "Route", cls: "lab" }, { k: "consent", t: "chk", h: "Consent" }, { k: "lbp", t: "chk", h: "LBP fee" }, { k: "cpeng", t: "chk", h: "CPEng fee" }, NOTE] }
  };

  function showAdmin() {
    const needLogin = S.mode === "server" && !S.authed;
    $("#adminLogin").hidden = !needLogin;
    $("#adminEditor").hidden = needLogin;
    $("#saveBar").hidden = needLogin;
    if (needLogin) {
      const saved = SS.get("ugs.adminPw", "");
      if (saved) adminLogin(saved, true); else setTimeout(() => $("#adminPw").focus(), 50);
      return;
    }
    if (!S.draft) { S.draft = clone(S.data); S.dirty = false; }
    renderAdmin();
  }

  async function adminLogin(pw, silent) {
    const err = $("#adminErr"); err.textContent = "";
    let res = null;
    try { res = await fetch("/api/rates?check=admin", { headers: { "x-admin-password": pw }, cache: "no-store" }); } catch (e) { res = null; }
    if (res && res.ok) {
      S.adminPw = pw; S.authed = true; SS.set("ugs.adminPw", pw);
      S.draft = clone(S.data); S.dirty = false; showAdmin(); return;
    }
    SS.del("ugs.adminPw");
    if (silent) { $("#adminPw").focus(); return; }
    if (!res) err.textContent = "Can't reach the server. Check the connection and try again.";
    else if (res.status === 503) err.textContent = "The admin password hasn't been set up yet. In Netlify, add ADMIN_PASSWORD under Site configuration → Environment variables, then redeploy.";
    else err.textContent = "That password didn't match.";
  }

  function renderAdmin() {
    $("#adminTabs").innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" id="at_${k}" data-atab="${k}" aria-selected="${k === S.atab}">${esc(l)}</button>`).join("");
    $("#adminTable").innerHTML = S.atab === "branding" ? brandingHTML() : tableHTML();
    renderPreview(); renderSaveBar();
  }

  function cellHTML(c, row, i) {
    const id = `a_${S.atab}_${i}_${c.k}`;
    const rowName = row.label || row.name || "";
    const p = `id="${id}" data-i="${i}" data-k="${c.k}" aria-label="${esc(rowName + " – " + c.h)}"`;
    if (c.t === "static") return `<td class="${c.cls || ""}">${esc(row[c.k])}</td>`;
    if (c.t === "num") {
      const pct = S.atab === "rates" && row.unit === "%";
      const v = pct ? +(Number(row[c.k]) * 100).toFixed(4) : row[c.k];
      return `<td><input type="number" inputmode="decimal" step="any" min="0" ${p} data-pct="${pct ? 1 : 0}" value="${esc(v)}"></td>`;
    }
    if (c.t === "text") return `<td><input type="text" ${p} value="${esc(row[c.k])}"></td>`;
    if (c.t === "chk") return `<td><input type="checkbox" class="chk" ${p}${row[c.k] ? " checked" : ""}></td>`;
    if (c.t === "status") return `<td><select ${p} class="st-${esc(row.status)}">${["PLACEHOLDER", "CONFIRMED", "SOURCED"].map((s) => `<option${s === row.status ? " selected" : ""}>${s}</option>`).join("")}</select></td>`;
    return "<td></td>";
  }

  function tableHTML() {
    const def = DEFS[S.atab], rows = S.draft[S.atab];
    const title = TABS.find((t) => t[0] === S.atab)[1];
    return `<div class="ahead"><h2>${esc(title)}</h2><span class="hint">${esc(def.hint)}</span></div>
      <div class="scroll"><table class="edit"><thead><tr>${def.cols.map((c) => `<th>${esc(c.h)}</th>`).join("")}${def.fixed ? "" : "<th></th>"}</tr></thead>
      <tbody>${rows.map((row, i) => `<tr>${def.cols.map((c) => cellHTML(c, row, i)).join("")}${def.fixed ? "" : `<td><button class="btn danger" type="button" data-del="${i}"${rows.length < 2 ? " disabled" : ""}>Delete</button></td>`}</tr>`).join("")}</tbody></table></div>
      ${def.fixed ? "" : `<button class="btn addrow" id="addRow" type="button">Add row</button>`}`;
  }

  function brandingHTML() {
    const b = S.draft.branding;
    return `<div class="ahead"><h2>Branding &amp; logo</h2><span class="hint">The logo shows in the top bar and on the printed customer summary. Save rates to keep changes.</span></div>
      <div class="brandbox">
        <label class="logo-drop" id="logoDrop" for="logoFile">
          ${b.logo ? `<img src="${esc(b.logo)}" alt="Current logo">` : `<span class="hint">No logo uploaded yet</span>`}
          <span><b>${b.logo ? "Tap to replace the logo" : "Tap to upload a logo"}</b><br><span class="hint">PNG, JPG, WebP or SVG. Large images are resized to 800 px wide. A transparent PNG or SVG looks best.</span></span>
          <input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml">
        </label>
        <div class="panel">
          <div class="field"><label for="b_companyName">Company name</label><input id="b_companyName" type="text" data-bk="companyName" value="${esc(b.companyName)}"></div>
          <div class="field"><label for="b_contact">Contact line on the customer summary</label><input id="b_contact" type="text" data-bk="contact" value="${esc(b.contact)}" placeholder="Phone · email · website"></div>
          <div class="field"><span class="lbl">Top bar preview</span><div class="logo-preview-bar">${brandMarkHTML(b)}<span>Clearspan install calculator</span></div></div>
          ${b.logo ? `<button class="btn danger" id="logoRemove" type="button">Remove logo</button>` : ""}
        </div>
      </div>`;
  }

  function renderPreview() {
    if (!S.input) return;
    const was = calculate(S.input, S.data), now = calculate(S.input, S.draft);
    $("#adminPreview").innerHTML = `<span>Current quote: <b>${money(was.exGst)}</b> with saved rates</span><span>→ <b>${money(now.exGst)}</b> with these edits</span><span>${now.placeholders} placeholder${now.placeholders === 1 ? "" : "s"} left</span>`;
  }

  function renderSaveBar() {
    const st = $("#saveStatus"), save = $("#saveBtn");
    const when = S.data.updatedAt ? new Date(S.data.updatedAt).toLocaleString("en-NZ") : null;
    const where = S.mode === "local" ? "on this device" : "for everyone";
    st.innerHTML = S.dirty ? `<b>Unsaved changes</b> · saves ${where}` : (when ? `Last saved ${esc(when)}` : "Spreadsheet defaults – not saved yet");
    save.disabled = !S.dirty || S.mode === "offline";
    $("#discardBtn").disabled = !S.dirty;
    $("#exportBtn").textContent = inFrame ? "Copy backup" : "Export backup";
    if (S.mode === "offline") st.innerHTML = "Offline – changes can't be saved right now";
  }
  function markDirty() { S.dirty = true; renderPreview(); renderSaveBar(); }

  async function save() {
    const btn = $("#saveBtn"); btn.disabled = true;
    try {
      if (S.mode === "local") {
        S.draft.updatedAt = new Date().toISOString();
        if (!LS.set("ugs.localData", S.draft)) throw new Error("This browser wouldn't store the rates (private browsing?).");
        commit(S.draft); toast("Saved on this device");
      } else if (S.mode === "server") {
        const res = await fetch("/api/rates", { method: "PUT", headers: { "content-type": "application/json", "x-admin-password": S.adminPw }, body: JSON.stringify(S.draft) });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) { S.authed = false; SS.del("ugs.adminPw"); showAdmin(); toast("Password not accepted – sign in again"); return; }
        if (!res.ok) throw new Error(body.error || "Save failed (" + res.status + ").");
        S.draft.updatedAt = body.updatedAt; LS.set("ugs.serverData", S.draft); S.serverEmpty = false;
        commit(S.draft); toast("Rates saved for everyone");
      }
    } catch (e) {
      toast(e && e.message ? e.message : "Save failed – check the connection.");
    } finally { renderSaveBar(); }
  }
  function commit(d) {
    S.data = normalize(clone(d)); S.draft = clone(S.data); S.dirty = false;
    applyBranding(); refreshQuoteOptions(); renderBanner(); renderAdmin(); update();
  }

  function readFile(file, asText) {
    return new Promise((ok, bad) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error);
      asText ? r.readAsText(file) : r.readAsDataURL(file);
    });
  }
  function loadImg(src) {
    return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error("Couldn't read that image.")); im.src = src; });
  }
  async function processLogo(file) {
    if (!file) return;
    try {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { toast("Choose a PNG, JPG, WebP or SVG image."); return; }
      let url;
      if (file.type === "image/svg+xml") {
        if (file.size > 300000) { toast("That SVG is over 300 KB. Export a simpler version."); return; }
        url = await readFile(file);
      } else {
        const img = await loadImg(await readFile(file));
        const scale = Math.min(1, 800 / img.naturalWidth, 400 / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        url = c.toDataURL("image/png");
        if (url.length > 600000) url = c.toDataURL("image/jpeg", 0.9);
      }
      if (!LOGO_RE.test(url) || url.length > 900000) { toast("That image is too large. Try a smaller file."); return; }
      S.draft.branding.logo = url; markDirty(); renderAdmin(); toast("Logo added – tap Save rates to keep it");
    } catch (e) { toast(e.message || "Couldn't read that image."); }
  }

  function exportBackup() {
    const text = JSON.stringify(S.draft, null, 2);
    if (inFrame) {
      navigator.clipboard.writeText(text).then(() => toast("Backup copied"), () => toast("Copy isn't available here"));
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = `ugs-install-rates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  /* ---------- events ---------- */
  function bind() {
    $$(".tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

    const qv = $("#quoteView");
    const onField = (e) => {
      const el = e.target; const f = el.dataset && el.dataset.field;
      if (!f || !(el.tagName === "INPUT" || el.tagName === "SELECT")) return;
      S.input[f] = el.value; update();
    };
    qv.addEventListener("input", onField);
    qv.addEventListener("change", onField);
    qv.addEventListener("click", (e) => {
      const sb = e.target.closest(".seg button");
      if (sb) {
        const seg = sb.parentElement, f = seg.dataset.field;
        S.input[f] = seg.hasAttribute("data-bool") ? sb.dataset.v === "1" : sb.dataset.v;
        update(); return;
      }
      const st = e.target.closest("[data-step]");
      if (st) {
        const f = st.dataset.step, d = Number(st.dataset.d);
        const nv = Math.max(0, Math.round(((parseFloat(S.input[f]) || 0) + d) * 10) / 10);
        S.input[f] = String(nv); $("#f_" + f).value = nv; update(); return;
      }
      if (e.target.closest("#printBtn")) { printSummary(); return; }
      const nb = e.target.closest("#newBtn");
      if (nb) arm(nb, "Tap to clear", () => { S.input = clone(DEFAULT_INPUT); refreshQuoteOptions(); update(); toast("New quote started"); });
    });

    $("#pinForm").addEventListener("submit", (e) => {
      e.preventDefault(); LS.set("ugs.staffPin", $("#pinInput").value.trim()); S.pinTried = true; boot();
    });
    $("#adminForm").addEventListener("submit", (e) => { e.preventDefault(); adminLogin($("#adminPw").value, false); });

    const ed = $("#adminEditor");
    ed.addEventListener("click", (e) => {
      const t = e.target.closest("[data-atab]");
      if (t) { S.atab = t.dataset.atab; renderAdmin(); return; }
      const del = e.target.closest("[data-del]");
      if (del) { arm(del, "Tap to confirm", () => { S.draft[S.atab].splice(Number(del.dataset.del), 1); markDirty(); renderAdmin(); }); return; }
      if (e.target.closest("#addRow")) { S.draft[S.atab].push(clone(DEFS[S.atab].blank)); markDirty(); renderAdmin(); return; }
      const rm = e.target.closest("#logoRemove");
      if (rm) arm(rm, "Tap to remove", () => { S.draft.branding.logo = ""; markDirty(); renderAdmin(); });
    });
    const onEdit = (e) => {
      const el = e.target;
      if (el.id === "logoFile") { if (e.type === "change") processLogo(el.files && el.files[0]); return; }
      if (el.dataset.bk) { S.draft.branding[el.dataset.bk] = el.value; markDirty(); return; }
      if (el.dataset.k === undefined) return;
      const row = S.draft[S.atab][Number(el.dataset.i)];
      let v;
      if (el.type === "checkbox") v = el.checked;
      else if (el.type === "number") { v = el.value === "" ? 0 : Number(el.value); if (el.dataset.pct === "1") v = v / 100; }
      else v = el.value;
      row[el.dataset.k] = v;
      if (el.dataset.k === "status") el.className = "st-" + v;
      markDirty();
    };
    ed.addEventListener("input", onEdit);
    ed.addEventListener("change", (e) => { if (e.target.type === "checkbox" || e.target.tagName === "SELECT" || e.target.id === "logoFile") onEdit(e); });
    ed.addEventListener("dragover", (e) => { const d = e.target.closest("#logoDrop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
    ed.addEventListener("dragleave", (e) => { const d = e.target.closest("#logoDrop"); if (d) d.classList.remove("over"); });
    ed.addEventListener("drop", (e) => { const d = e.target.closest("#logoDrop"); if (d) { e.preventDefault(); d.classList.remove("over"); processLogo(e.dataTransfer.files[0]); } });

    $("#saveBtn").addEventListener("click", save);
    $("#discardBtn").addEventListener("click", () => { S.draft = clone(S.data); S.dirty = false; renderAdmin(); toast("Changes discarded"); });
    $("#resetBtn").addEventListener("click", (e) => arm(e.currentTarget, "Tap to reset", () => {
      const keep = clone(S.draft.branding); S.draft = clone(DEFAULT_DATA); S.draft.branding = keep; markDirty(); renderAdmin(); toast("Defaults loaded – review, then save");
    }));
    $("#exportBtn").addEventListener("click", exportBackup);
    $("#importFile").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = "";
      if (!f) return;
      try {
        const obj = JSON.parse(await readFile(f, true));
        if (!obj || obj.schema !== 1) throw new Error("That file isn't a rates backup from this app.");
        S.draft = normalize(obj); markDirty(); renderAdmin(); toast("Backup loaded – review, then save");
      } catch (err) { toast(err.message || "Couldn't read that file."); }
    });
    window.addEventListener("beforeunload", (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
  }

  async function boot() {
    const st = await loadRates();
    renderMode();
    if (st === "pin") {
      $("#pinView").hidden = false; $("#quoteView").hidden = true; $("#adminView").hidden = true;
      $("#pinErr").textContent = S.pinTried ? "That PIN didn't work." : "";
      setTimeout(() => $("#pinInput").focus(), 50);
      return;
    }
    $("#pinView").hidden = true;
    S.input = { ...DEFAULT_INPUT, ...LS.get("ugs.quoteDraft", {}) };
    applyBranding(); renderBanner(); initQuote(); setView(S.view);
  }

  bind();
  boot();
  if ("serviceWorker" in navigator && !inFrame && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
