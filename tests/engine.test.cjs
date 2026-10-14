// Expected totals come from the spreadsheet recalculated in LibreOffice (v0.1 scenario run).
const { calculate, DEFAULT_DATA, DEFAULT_INPUT } = require("../public/engine.js");
const F = DEFAULT_DATA.foundations.map(f => f.name);
const S = DEFAULT_DATA.substrates.map(s => s.name);
const cases = [
  ["base example", {}, 4796, "r17A"],
  ["soffit+block 24m2 scaffold", { mount: "soffit", soffitBlocking: true, access: "Mobile scaffold tower", substrate: S[1] }, 5541.5, "r17A"],
  ["face brick 18m2 base plate", { width: 4.5, projection: 4, substrate: S[1], foundation: F[1] }, 2986.8625, "r17"],
  ["face 24m2 cpeng Y", { cpengCovers: true }, 4126, "r46"],
  ["face 24m2 cafe", { publicArea: true, residential: false }, 4126, "rNonRes"],
  ["face 36m2 resi", { width: 9, projection: 4 }, 5825.5, "rRes"],
  ["free 24m2 clear Y", { mount: "free", clearOfHouse: true, foundation: F[3] }, 5367.75, "r3B"],
  ["free 24m2 clear N", { mount: "free" }, 5491.75, "rRes"],
  ["free 9m2", { mount: "free", width: 3, projection: 3 }, 3382, "rManual"],
  ["island + deck", { island: true, foundation: F[2] }, 3360.75, "r17A"],
  ["100km other found", { km: 100, foundation: F[4] }, 3684, "r17A"],
  ["tiny job", { width: 2, projection: 1.5, km: 5, foundation: F[1], gutter: 0, downpipes: 0, chargeMeasure: false }, 1184.25, "r17"],
  ["post override 5", { postsOverride: 5 }, 5401.5, "r17A"],
];
let fail = 0;
for (const [name, ch, exp, route] of cases) {
  const r = calculate({ ...DEFAULT_INPUT, ...ch }, DEFAULT_DATA);
  const ok = Math.abs(r.exGst - exp) < 0.005 && r.route.used === route;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} got ${r.exGst.toFixed(4)} (${r.route.used})  expected ${exp} (${route})`);
}
console.log(fail ? `${fail} FAILED` : "All scenarios match the spreadsheet");
process.exit(fail ? 1 : 0);
