// Saved rates for the UGS install calculator.
// GET  /api/rates            -> current saved rates (or 404 if none saved yet)
// GET  /api/rates?check=admin -> 200 if the admin password is correct
// PUT  /api/rates            -> save rates (admin password required)
//
// Environment variables (set in Netlify: Site configuration > Environment variables):
//   ADMIN_PASSWORD  required to save rates. If unset, saving is refused.
//   STAFF_PIN       optional. If set, the calculator must send it to read rates.
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const STORE = "ugs-install-calculator";
const KEY = "rates";
const MAX_BYTES = 1_500_000; // rates + an embedded logo (the app resizes logos before upload)

export default async (req) => {
  const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
  const adminPw = env("ADMIN_PASSWORD") || "";
  const staffPin = env("STAFF_PIN") || "";
  const store = getStore({ name: STORE, consistency: "strong" });
  const url = new URL(req.url);

  const same = (a, b) => {
    const ha = createHash("sha256").update(String(a || "")).digest();
    const hb = createHash("sha256").update(String(b || "")).digest();
    return timingSafeEqual(ha, hb);
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  const isAdmin = () => adminPw && same(req.headers.get("x-admin-password"), adminPw);
  const isStaff = () => !staffPin || same(req.headers.get("x-staff-pin"), staffPin) || isAdmin();

  if (req.method === "GET") {
    if (url.searchParams.get("check") === "admin") {
      if (!adminPw) return json({ error: "ADMIN_PASSWORD is not set on the server." }, 503);
      return isAdmin() ? json({ ok: true }) : json({ error: "Wrong admin password." }, 401);
    }
    if (!isStaff()) return json({ error: "Staff PIN required." }, 401);
    const data = await store.get(KEY, { type: "json" });
    if (!data) return json({ error: "No rates saved yet." }, 404);
    return json(data);
  }

  if (req.method === "PUT") {
    if (!adminPw) return json({ error: "ADMIN_PASSWORD is not set on the server." }, 503);
    if (!isAdmin()) return json({ error: "Wrong admin password." }, 401);
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: "Rates file too large." }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: "Invalid JSON." }, 400); }
    const lists = ["rates", "foundations", "mounting", "substrates", "access", "travel", "compliance"];
    if (!data || data.schema !== 1 || !lists.every((k) => Array.isArray(data[k]))) {
      return json({ error: "Rates file is missing required tables." }, 400);
    }
    data.updatedAt = new Date().toISOString();
    await store.setJSON(KEY, data);
    return json({ ok: true, updatedAt: data.updatedAt });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/rates" };
