const status = ALLOWED_STATUSES.includes(body.status) ? body.status : "Booking Confirmed";
const SESSION_SECONDS = 60 * 60 * 8;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function fail(message, status = 400) { return json({ error: message }, status); }
function enc(value) { return new TextEncoder().encode(value); }
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(value))));
}
async function makeSession(user, env) {
  const payload = b64url(enc(JSON.stringify({ sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  return `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
}
async function getSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("solvanta_session="))?.slice("solvanta_session=".length);
  if (!token || !env.SESSION_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || (await sign(parts[0], env.SESSION_SECRET)) !== parts[1]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const user = await env.DB.prepare("SELECT id, email, role, active FROM staff_users WHERE id = ?").bind(payload.sub).first();
    if (!user || !user.active) return null;
    return user;
  } catch { return null; }
}
async function requireAdmin(request, env) {
  const user = await getSession(request, env);
  if (!user) return { response: fail("Please sign in again.", 401) };
  return { user };
}
function cookieHeader(value, maxAge = SESSION_SECONDS) {
  return `solvanta_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function normalEmail(value) { return String(value || "").trim().toLowerCase(); }
function text(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return { salt: b64url(salt), hash: b64url(new Uint8Array(bits)) };
}
async function verifyPassword(password, salt, expected) {
  const result = await hashPassword(password, unb64url(salt));
  return result.hash === expected;
}
function refCode() {
  const date = new Date();
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCDate()).padStart(2,"0")}`;
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join("").toUpperCase();
  return `SOL-${ymd}-${suffix}`;
}
async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: { "Allow": "GET, POST, PATCH, DELETE, OPTIONS" } });
  if (!env.DB) return fail("The database is not configured yet.", 503);
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return fail("The session secret is not configured correctly.", 503);
  if (["POST", "PATCH", "DELETE"].includes(method) && !sameOrigin(request)) return fail("Request origin rejected.", 403);

  if (path === "health" && method === "GET") return json({ ok: true, service: "Solvanta Logistics API" });

  if (path === "auth/login" && method === "POST") {
    const body = await readBody(request);
    if (!body) return fail("Enter your email and password.");
    const email = normalEmail(body.email);
    const password = String(body.password || "");
    if (!validEmail(email) || password.length < 1 || password.length > 200) return fail("Invalid email or password.", 401);
    let user = await env.DB.prepare("SELECT id, email, role, password_salt, password_hash, active FROM staff_users WHERE email = ?").bind(email).first();
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM staff_users").first();
    // First-admin bootstrap works only while the staff table is empty.
    if (!user && Number(count?.n || 0) === 0 && normalEmail(env.BOOTSTRAP_ADMIN_EMAIL) === email && env.BOOTSTRAP_ADMIN_PASSWORD && String(env.BOOTSTRAP_ADMIN_PASSWORD).length >= 14 && password === env.BOOTSTRAP_ADMIN_PASSWORD) {
      const id = crypto.randomUUID();
      const pw = await hashPassword(password);
      await env.DB.prepare("INSERT INTO staff_users (id, email, role, password_salt, password_hash, active, created_at) VALUES (?, ?, 'admin', ?, ?, 1, ?)")
        .bind(id, email, pw.salt, pw.hash, new Date().toISOString()).run();
      user = { id, email, role: "admin", active: 1 };
    }
    if (!user || !user.active || !(await verifyPassword(password, user.password_salt, user.password_hash))) return fail("Invalid email or password.", 401);
    const token = await makeSession(user, env);
    return json({ ok: true, user: { email: user.email, role: user.role } }, 200, { "set-cookie": cookieHeader(token) });
  }

  if (path === "auth/me" && method === "GET") {
    const user = await getSession(request, env);
    if (!user) return fail("Not signed in.", 401);
    return json({ user: { email: user.email, role: user.role } });
  }
  if (path === "auth/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
  }

  if (path === "track" && method === "GET") {
    const ref = text(url.searchParams.get("ref"), 40).toUpperCase();
    if (!/^SOL-[A-Z0-9-]{5,35}$/.test(ref)) return fail("Enter a valid shipment reference.");
    const shipment = await env.DB.prepare("SELECT reference, status, origin, destination, created_at, updated_at FROM shipments WHERE reference = ? AND public_tracking = 1").bind(ref).first();
    if (!shipment) return fail("We could not find a shipment with that reference. Check it and try again.", 404);
    const events = await env.DB.prepare("SELECT status, public_note, created_at FROM shipment_events WHERE shipment_id = (SELECT id FROM shipments WHERE reference = ?) AND is_public = 1 ORDER BY created_at DESC LIMIT 30").bind(ref).all();
    return json({ shipment, events: events.results || [] });
  }

  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;

  if (path === "shipments" && method === "GET") {
    const results = await env.DB.prepare("SELECT id, reference, customer_name, customer_email, origin, destination, goods_description, status, created_at, updated_at FROM shipments ORDER BY updated_at DESC LIMIT 250").all();
    return json({ shipments: results.results || [] });
  }

  if (path === "shipments" && method === "POST") {
    const body = await readBody(request);
    if (!body) return fail("Invalid shipment details.");
    const customerName = text(body.customer_name, 160);
    const customerEmail = normalEmail(body.customer_email);
    const origin = text(body.origin, 180);
    const destination = text(body.destination, 180);
    const goods = text(body.goods_description, 300);
    const status = "Shipment Received";
    const note = text(body.public_note, 500);
    if (!customerName || !origin || !destination) return fail("Customer name, origin, and destination are required.");
    if (customerEmail && !validEmail(customerEmail)) return fail("Enter a valid customer email or leave it blank.");
    const now = new Date().toISOString();
    let reference = refCode();
    for (let i = 0; i < 5; i++) {
      const exists = await env.DB.prepare("SELECT id FROM shipments WHERE reference = ?").bind(reference).first();
      if (!exists) break;
      reference = refCode();
    }
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO shipments (id, reference, customer_name, customer_email, origin, destination, goods_description, status, public_tracking, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)")
      .bind(id, reference, customerName, customerEmail || null, origin, destination, goods, status, now, now, user.id).run();
    await env.DB.prepare("INSERT INTO shipment_events (id, shipment_id, status, public_note, is_public, created_at, created_by) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .bind(crypto.randomUUID(), id, status, note, now, user.id).run();
    return json({ ok: true, reference, id }, 201);
  }

  const updateMatch = path.match(/^shipments\/([0-9a-f-]+)$/i);
  if (updateMatch && method === "PATCH") {
    const body = await readBody(request);
    if (!body) return fail("Invalid update.");
    const shipment = await env.DB.prepare("SELECT id FROM shipments WHERE id = ?").bind(updateMatch[1]).first();
    if (!shipment) return fail("Shipment not found.", 404);
    const status = text(body.status, 60);
    const note = text(body.public_note, 500);
    const isPublic = body.is_public === false ? 0 : 1;
    if (!ALLOWED_STATUSES.includes(status)) return fail("Choose a valid shipment status.");
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE shipments SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, shipment.id).run();
    await env.DB.prepare("INSERT INTO shipment_events (id, shipment_id, status, public_note, is_public, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), shipment.id, status, note, isPublic, now, user.id).run();
    return json({ ok: true });
  }

  if (path === "staff" && method === "GET") {
    if (user.role !== "admin") return fail("Only an administrator can manage staff accounts.", 403);
    const rows = await env.DB.prepare("SELECT id, email, role, active, created_at FROM staff_users ORDER BY created_at ASC").all();
    return json({ staff: rows.results || [] });
  }
  if (path === "staff" && method === "POST") {
    if (user.role !== "admin") return fail("Only an administrator can manage staff accounts.", 403);
    const body = await readBody(request);
    const email = normalEmail(body?.email);
    const password = String(body?.password || "");
    const role = body?.role === "admin" ? "admin" : "staff";
    if (!validEmail(email)) return fail("Enter a valid staff email address.");
    if (password.length < 14 || password.length > 200) return fail("Use a password of at least 14 characters.");
    const existing = await env.DB.prepare("SELECT id FROM staff_users WHERE email = ?").bind(email).first();
    if (existing) return fail("A staff account with that email already exists.", 409);
    const pw = await hashPassword(password);
    await env.DB.prepare("INSERT INTO staff_users (id, email, role, password_salt, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
      .bind(crypto.randomUUID(), email, role, pw.salt, pw.hash, new Date().toISOString()).run();
    return json({ ok: true }, 201);
  }
  const staffMatch = path.match(/^staff\/([0-9a-f-]+)$/i);
  if (staffMatch && method === "PATCH") {
    if (user.role !== "admin") return fail("Only an administrator can manage staff accounts.", 403);
    const body = await readBody(request);
    const target = await env.DB.prepare("SELECT id, role FROM staff_users WHERE id = ?").bind(staffMatch[1]).first();
    if (!target) return fail("Staff account not found.", 404);
    if (target.id === user.id && body?.active === false) return fail("You cannot deactivate your own account.");
    if (target.id === user.id && body?.role && body.role !== "admin") return fail("You cannot remove your own administrator role.");
    if (typeof body?.active === "boolean") await env.DB.prepare("UPDATE staff_users SET active = ? WHERE id = ?").bind(body.active ? 1 : 0, target.id).run();
    if (["admin", "staff"].includes(body?.role)) await env.DB.prepare("UPDATE staff_users SET role = ? WHERE id = ?").bind(body.role, target.id).run();
    if (body?.password) {
      const password = String(body.password);
      if (password.length < 14 || password.length > 200) return fail("Use a password of at least 14 characters.");
      const pw = await hashPassword(password);
      await env.DB.prepare("UPDATE staff_users SET password_salt = ?, password_hash = ? WHERE id = ?").bind(pw.salt, pw.hash, target.id).run();
    }
    return json({ ok: true });
  }
  return fail("Endpoint not found.", 404);
}
