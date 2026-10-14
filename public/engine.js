/* UGS Clearspan install costing engine.
   Mirrors the logic in UGS_Clearspan_Install_Costing_v0.1.xlsx (Quote tab).
   Pure function: calculate(input, data) -> result. No DOM access. */

const DEFAULT_DATA = {
  schema: 1,
  updatedAt: null,
  branding: { logo: "", companyName: "Universal Glazing Systems Ltd", contact: "ugs.co.nz" },
  rates: [
    { key: "labour_rate", label: "Installer charge-out rate (per person-hour)", value: 85, unit: "$/hr", status: "PLACEHOLDER", note: "Set from UGS cost per hour + overhead + margin." },
    { key: "crew", label: "Crew size", value: 2, unit: "people", status: "PLACEHOLDER", note: "" },
    { key: "hrs_day", label: "Productive hours per day on site", value: 7.5, unit: "hrs", status: "PLACEHOLDER", note: "Excludes travel." },
    { key: "travel_pct", label: "Travel time charged at % of labour rate", value: 1, unit: "%", status: "PLACEHOLDER", note: "0% if travel time is absorbed in the rate." },
    { key: "km_rate", label: "Vehicle cost per km", value: 1.3, unit: "$/km", status: "SOURCED", note: "IRD kilometre rate 2025-26, Tier 1, diesel. Cost benchmark, not a charge-out rate." },
    { key: "vehicles", label: "Vehicles per trip", value: 1, unit: "vehicles", status: "PLACEHOLDER", note: "" },
    { key: "post_spacing", label: "Max post spacing (front beam)", value: 3, unit: "m", status: "PLACEHOLDER", note: "From Clearspan span charts." },
    { key: "bar_spacing", label: "Bar spacing", value: 0.9, unit: "m", status: "PLACEHOLDER", note: "Clearspan sheet module." },
    { key: "h_setup", label: "Set-out & site setup", value: 1.5, unit: "hrs/job", status: "PLACEHOLDER", note: "" },
    { key: "h_post", label: "Stand, plumb & fix post", value: 0.75, unit: "hrs/post", status: "PLACEHOLDER", note: "Excludes foundation work." },
    { key: "h_beam", label: "Beam install", value: 0.3, unit: "hrs/lm", status: "PLACEHOLDER", note: "" },
    { key: "h_bar", label: "Bar install", value: 0.5, unit: "hrs/bar", status: "PLACEHOLDER", note: "" },
    { key: "h_sheet", label: "Polycarbonate sheeting", value: 0.25, unit: "hrs/m²", status: "PLACEHOLDER", note: "" },
    { key: "h_gutter", label: "Gutter install", value: 0.3, unit: "hrs/lm", status: "PLACEHOLDER", note: "" },
    { key: "h_dp", label: "Downpipe install", value: 0.75, unit: "hrs/each", status: "PLACEHOLDER", note: "" },
    { key: "h_clean", label: "Clean-up & handover", value: 1, unit: "hrs/job", status: "PLACEHOLDER", note: "" },
    { key: "consumables", label: "Consumables allowance", value: 75, unit: "$/job", status: "PLACEHOLDER", note: "" },
    { key: "mat_markup", label: "Markup on materials & hire", value: 0.15, unit: "%", status: "PLACEHOLDER", note: "" },
    { key: "lbp_fee", label: "LBP fee – fixed (Record of Work + admin)", value: 450, unit: "$/job", status: "PLACEHOLDER", note: "Only when the compliance route needs an LBP." },
    { key: "lbp_hrs", label: "LBP supervision / inspection hours", value: 2, unit: "hrs/job", status: "PLACEHOLDER", note: "" },
    { key: "lbp_rate", label: "LBP hourly rate", value: 110, unit: "$/hr", status: "PLACEHOLDER", note: "" },
    { key: "cpeng_fee", label: "CPEng project-specific design/review fee", value: 0, unit: "$/job", status: "PLACEHOLDER", note: "When the route relies on CPEng design (cl 43/45/46)." },
    { key: "consent_fee", label: "UGS consent management fee", value: 0, unit: "$/job", status: "PLACEHOLDER", note: "Council fees excluded – pass through at cost." },
    { key: "measure_trips", label: "Site measure visits (if charged)", value: 1, unit: "trips", status: "PLACEHOLDER", note: "" },
    { key: "min_charge", label: "Minimum install charge (excl GST)", value: 600, unit: "$", status: "PLACEHOLDER", note: "" },
    { key: "contingency", label: "Contingency", value: 0, unit: "%", status: "PLACEHOLDER", note: "" },
    { key: "gst", label: "GST", value: 0.15, unit: "%", status: "SOURCED", note: "NZ GST 15%." }
  ],
  foundations: [
    { name: "New concrete footings (dig & pour)", hrsPerPost: 2, matPerPost: 60, extraTrips: 1, poa: false, status: "PLACEHOLDER", note: "Return trip allowed for cure." },
    { name: "Base plate to existing concrete slab", hrsPerPost: 0.75, matPerPost: 35, extraTrips: 0, poa: false, status: "PLACEHOLDER", note: "Check slab thickness and edge distance." },
    { name: "Fix to existing timber deck (with blocking)", hrsPerPost: 1.25, matPerPost: 40, extraTrips: 0, poa: false, status: "PLACEHOLDER", note: "Deck framing must be checked for uplift." },
    { name: "Screw piles", hrsPerPost: 1, matPerPost: 150, extraTrips: 0, poa: false, status: "PLACEHOLDER", note: "Confirm install vs subcontract." },
    { name: "Other / site-specific (POA)", hrsPerPost: 0, matPerPost: 0, extraTrips: 0, poa: true, status: "PLACEHOLDER", note: "Rock, retaining, slope etc." }
  ],
  mounting: [
    { id: "face", name: "Face fixed", postRows: 1, fixHrsLm: 0.75, flashHrsLm: 0.3, blockHrsLm: 0, extraHrsJob: 0, usesSubstrate: true, status: "PLACEHOLDER", note: "" },
    { id: "soffit", name: "Soffit fixed", postRows: 1, fixHrsLm: 1, flashHrsLm: 0.2, blockHrsLm: 0.5, extraHrsJob: 0, usesSubstrate: false, status: "PLACEHOLDER", note: "Blocking only if required." },
    { id: "free", name: "Freestanding", postRows: 2, fixHrsLm: 0, flashHrsLm: 0, blockHrsLm: 0, extraHrsJob: 2, usesSubstrate: false, status: "PLACEHOLDER", note: "Two post rows, bracing." }
  ],
  substrates: [
    { name: "Timber frame – weatherboard", mult: 1, status: "PLACEHOLDER", note: "Baseline." },
    { name: "Brick veneer", mult: 1.3, status: "PLACEHOLDER", note: "" },
    { name: "Concrete / masonry block", mult: 1.4, status: "PLACEHOLDER", note: "" },
    { name: "Fibre cement / sheet cladding", mult: 1.2, status: "PLACEHOLDER", note: "" },
    { name: "Plaster / EIFS / monolithic cladding", mult: 1.5, status: "PLACEHOLDER", note: "Weathertightness risk." }
  ],
  access: [
    { name: "Ladders only", perDay: 0, delivery: 0, status: "PLACEHOLDER", note: "" },
    { name: "Mobile scaffold tower", perDay: 120, delivery: 0, status: "PLACEHOLDER", note: "" },
    { name: "Scissor lift", perDay: 250, delivery: 150, status: "PLACEHOLDER", note: "" }
  ],
  travel: [
    { name: "Zone 1", fromKm: 0, rtHrs: 0.5, poa: false, status: "PLACEHOLDER", note: "One-way road km from Kumeu." },
    { name: "Zone 2", fromKm: 15, rtHrs: 1, poa: false, status: "PLACEHOLDER", note: "" },
    { name: "Zone 3", fromKm: 30, rtHrs: 1.5, poa: false, status: "PLACEHOLDER", note: "" },
    { name: "Zone 4", fromKm: 45, rtHrs: 2, poa: false, status: "PLACEHOLDER", note: "" },
    { name: "Zone 5", fromKm: 65, rtHrs: 2.75, poa: false, status: "PLACEHOLDER", note: "" },
    { name: "Outside zones – POA", fromKm: 90, rtHrs: 0, poa: true, status: "PLACEHOLDER", note: "" }
  ],
  compliance: [
    { id: "r17", name: "Exempt – cl 16/17 (attached, up to 20 m²)", consent: false, lbp: false, cpeng: false, note: "Veranda/awning on or attached to an existing building, up to 20 m²." },
    { id: "r17A", name: "Exempt – cl 16A/17A (attached 20–30 m², LBP)", consent: false, lbp: true, cpeng: false, note: "Ground level of building, not over a public area. LBP carries out or supervises design or construction." },
    { id: "r46", name: "Exempt – cl 45/46 (attached 20–30 m², CPEng design)", consent: false, lbp: false, cpeng: true, note: "Same limits as 17A; design carried out or reviewed by a CPEng. No LBP condition." },
    { id: "r3B", name: "Exempt – cl 3B (detached 10–30 m², LBP)", consent: false, lbp: true, cpeng: false, note: "1 storey, not closer than its own height to any house or boundary. LBP carries out or supervises." },
    { id: "r43", name: "Exempt – cl 43 (detached kitset 10–30 m², CPEng)", consent: false, lbp: false, cpeng: true, note: "As 3B; kitset designed or reviewed by a CPEng for the manufacturer." },
    { id: "rRes", name: "Building consent – residential (RBW likely)", consent: true, lbp: true, cpeng: false, note: "Confirm with designer/BCA whether the job contains RBW." },
    { id: "rNonRes", name: "Building consent – non-residential", consent: true, lbp: false, cpeng: false, note: "RBW rules do not apply to non-residential buildings." },
    { id: "rManual", name: "Manual review", consent: false, lbp: false, cpeng: false, note: "Not determined – review before quoting." }
  ]
};

const DEFAULT_INPUT = {
  ref: "", address: "",
  mount: "face", width: 6, projection: 4,
  foundation: "New concrete footings (dig & pour)",
  substrate: "Timber frame – weatherboard",
  soffitBlocking: false,
  access: "Ladders only",
  km: 25, island: false,
  gutter: 6, downpipes: 1,
  postsOverride: null,
  chargeMeasure: true,
  ground: true, publicArea: false, residential: true,
  clearOfHouse: false, cpengCovers: false,
  routeOverride: ""
};

function roundUp(x) {
  // Excel ROUNDUP(x,0) for x >= 0, tolerant of float noise like 5.000000000000001
  return Math.ceil(x - 1e-9);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calculate(input, data) {
  const R = {};
  data.rates.forEach(r => { R[r.key] = num(r.value); });
  const find = (list, key, val) => list.find(x => x[key] === val) || list[0];

  const mount = find(data.mounting, "id", input.mount);
  const found = find(data.foundations, "name", input.foundation);
  const sub = find(data.substrates, "name", input.substrate) || { mult: 1 };
  const acc = find(data.access, "name", input.access);

  const W = num(input.width), P = num(input.projection);
  const area = W * P;
  const rows = num(mount.postRows);
  const perRow = R.post_spacing > 0 ? roundUp(W / R.post_spacing) + 1 : 0;
  const ov = num(input.postsOverride);
  const posts = ov > 0 ? ov : perRow * rows;
  const beam = W * rows;
  const attach = mount.id === "free" ? 0 : W;
  const bars = R.bar_spacing > 0 ? roundUp(W / R.bar_spacing) + 1 : 0;
  const subf = mount.usesSubstrate ? num(sub.mult) : 1;

  const tasks = [
    ["Set-out & site setup", "per job", 1, R.h_setup],
    ["Foundations", "per post", posts, num(found.hrsPerPost)],
    ["Stand, plumb & fix posts", "per post", posts, R.h_post],
    ["Beams", "per lm", beam, R.h_beam],
    ["Wall / soffit fixing", "per lm × substrate", attach, num(mount.fixHrsLm) * subf],
    ["Flashing", "per lm × substrate", attach, num(mount.flashHrsLm) * subf],
    ["Soffit blocking", "per lm (if required)", input.soffitBlocking ? attach : 0, num(mount.blockHrsLm)],
    ["Freestanding bracing / extra", "per job", 1, num(mount.extraHrsJob)],
    ["Bars", "per bar", bars, R.h_bar],
    ["Polycarbonate sheeting", "per m²", area, R.h_sheet],
    ["Gutter", "per lm", num(input.gutter), R.h_gutter],
    ["Downpipes", "each", num(input.downpipes), R.h_dp],
    ["Clean-up & handover", "per job", 1, R.h_clean]
  ].map(([task, driver, qty, hpu]) => ({ task, driver, qty, hpu, hours: qty * hpu }));
  const hours = tasks.reduce((s, t) => s + t.hours, 0);
  const crewDay = R.crew * R.hrs_day;
  const days = Math.max(1, crewDay > 0 ? roundUp(hours / crewDay) : 1);

  // Travel: largest zone whose fromKm <= km (Excel MATCH type 1)
  const zones = [...data.travel].sort((a, b) => num(a.fromKm) - num(b.fromKm));
  const km = num(input.km);
  let zone = zones[0];
  zones.forEach(z => { if (num(z.fromKm) <= km) zone = z; });
  const zoneName = input.island ? "Island – POA" : zone.name;
  const trips = days + num(found.extraTrips) + (input.chargeMeasure ? R.measure_trips : 0);
  const tripCost = input.island ? 0 :
    2 * km * R.km_rate * R.vehicles + num(zone.rtHrs) * R.crew * R.labour_rate * R.travel_pct;

  const costs = [
    { line: "Installation labour", basis: "total hours × charge-out rate", amount: hours * R.labour_rate },
    { line: "Foundation materials", basis: "posts × $/post + markup", amount: posts * num(found.matPerPost) * (1 + R.mat_markup) },
    { line: "Consumables", basis: "per job", amount: R.consumables },
    { line: "Access equipment", basis: "days × day rate + delivery + markup", amount: (days * num(acc.perDay) + num(acc.delivery)) * (1 + R.mat_markup) },
    { line: "Travel", basis: "trips × cost per trip", amount: trips * tripCost }
  ];

  // Compliance route (same decision tree as the spreadsheet)
  let suggested;
  if (mount.id === "free") {
    if (area > 10 && area <= 30 && input.ground && input.clearOfHouse) suggested = input.cpengCovers ? "r43" : "r3B";
    else if (area <= 10) suggested = "rManual";
    else suggested = input.residential ? "rRes" : "rNonRes";
  } else if (area <= 20) suggested = "r17";
  else if (area <= 30 && input.ground && !input.publicArea) suggested = input.cpengCovers ? "r46" : "r17A";
  else suggested = input.residential ? "rRes" : "rNonRes";
  const routeId = input.routeOverride || suggested;
  const route = data.compliance.find(c => c.id === routeId) || data.compliance.find(c => c.id === "rManual");

  const compCosts = [
    { line: "LBP fee", basis: "fixed + hrs × LBP rate", amount: route.lbp ? R.lbp_fee + R.lbp_hrs * R.lbp_rate : 0 },
    { line: "CPEng project fee", basis: "if route relies on CPEng", amount: route.cpeng ? R.cpeng_fee : 0 },
    { line: "Consent management (UGS admin)", basis: "if consent required", amount: route.consent ? R.consent_fee : 0 }
  ];

  const subtotal = [...costs, ...compCosts].reduce((s, c) => s + c.amount, 0);
  const contingency = subtotal * R.contingency;
  const minTopUp = Math.max(0, R.min_charge - (subtotal + contingency));
  const exGst = subtotal + contingency + minTopUp;
  const gst = exGst * R.gst;
  const incGst = exGst + gst;

  const tables = ["rates", "foundations", "mounting", "substrates", "access", "travel"];
  const placeholders = tables.reduce((s, t) => s + data[t].filter(r => r.status === "PLACEHOLDER").length, 0);
  const poa = !!(input.island || zone.poa || found.poa);
  const warnings = [];
  if (placeholders > 0) warnings.push({ level: "draft", text: `${placeholders} rates are still placeholders – this price is illustrative only.` });
  if (poa) warnings.push({ level: "poa", text: "POA: outside travel zones, island site, or site-specific foundation." });
  if (route.consent) warnings.push({ level: "info", text: "Building consent likely: council fees, design and inspection time are not included." });
  if (route.id === "rManual") warnings.push({ level: "poa", text: "Compliance route not determined – review before quoting." });

  return {
    qty: { area, rows, perRow, posts, beam, attach, bars, subf },
    tasks, hours, days,
    travel: { zone: zoneName, trips, tripCost },
    costs, compCosts,
    route: { suggested, used: route.id, name: route.name, lbp: route.lbp, consent: route.consent, cpeng: route.cpeng, note: route.note },
    subtotal, contingency, minTopUp, exGst, gst, incGst,
    perM2: area > 0 ? exGst / area : 0,
    placeholders, poa, warnings
  };
}

if (typeof module !== "undefined") module.exports = { calculate, DEFAULT_DATA, DEFAULT_INPUT };
