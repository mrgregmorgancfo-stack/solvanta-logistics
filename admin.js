const API = "/api";
const STATUSES = ["Booking Confirmed","Awaiting Collection","Collected","In Transit","Customs Clearance","Out for Delivery","Delivered","On Hold","Cancelled"];
const $ = id => document.getElementById(id);
let currentUser = null;
let shipmentsCache = [];
let invoiceItemCount = 0;
function showMessage(el, message, kind = "success") { el.textContent = message; el.className = `message show ${kind}`; }
function clearMessage(el) { el.textContent = ""; el.className = "message"; }
async function api(path, options = {}) {
  const response = await fetch(`${API}/${path}`, { credentials: "same-origin", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function dateTime(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(); }
function fillStatuses(select, selected) { select.innerHTML = STATUSES.map(s => `<option ${s === selected ? "selected" : ""} value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(""); }
async function checkSession() {
  try { const result = await api("auth/me"); currentUser = result.user; showDashboard(); await loadShipments(); if (currentUser.role === "admin") await loadStaff(); }
  catch { showLogin(); }
}
function showLogin() { $("loginPanel").classList.remove("hidden"); $("dashboard").classList.add("hidden"); }
function showDashboard() { $("loginPanel").classList.add("hidden"); $("dashboard").classList.remove("hidden"); $("signedInAs").textContent = `${currentUser.email} · ${currentUser.role}`; if (currentUser.role !== "admin") { $("staffTabButton").classList.add("hidden"); $("staffTab").classList.add("hidden"); } else { $("staffTabButton").classList.remove("hidden"); } }
function selectTab(tabId) { for (const id of ["shipmentsTab","createTab","invoiceTab","staffTab"]) $(id).classList.toggle("hidden", id !== tabId); document.querySelectorAll("[data-tab]").forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.tab === tabId))); if (tabId === "staffTab" && currentUser?.role === "admin") loadStaff(); }
async function loadShipments() {
  try {
    const data = await api("shipments"); shipmentsCache = data.shipments || [];
    $("shipmentRows").innerHTML = shipmentsCache.length ? shipmentsCache.map(s => `<tr><td><span class="ref">${escapeHtml(s.reference)}</span><br><button class="secondary small-btn" data-invoice-ref="${escapeHtml(s.reference)}" data-customer="${escapeHtml(s.customer_name)}">Use for invoice</button></td><td>${escapeHtml(s.customer_name)}<br><span class="muted">${escapeHtml(s.customer_email || "")}</span></td><td>${escapeHtml(s.origin)} → ${escapeHtml(s.destination)}<br><span class="muted">${escapeHtml(s.goods_description || "")}</span></td><td><span class="pill">${escapeHtml(s.status)}</span></td><td>${escapeHtml(dateTime(s.updated_at))}</td><td><button class="small-btn" data-update="${escapeHtml(s.id)}">Update status</button></td></tr>`).join("") : `<tr><td colspan="6">No shipments yet. Create your first shipment.</td></tr>`;
  } catch (e) { showMessage($("appMessage"), e.message, "error"); }
}
async function loadStaff() {
  if (currentUser?.role !== "admin") return;
  try { const data = await api("staff"); $("staffRows").innerHTML = (data.staff || []).map(s => `<tr><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.role)}</td><td>${s.active ? "Active" : "Inactive"}</td><td><div class="actions"><button class="secondary small-btn" data-staff-active="${escapeHtml(s.id)}" data-active="${s.active ? "0" : "1"}">${s.active ? "Deactivate" : "Reactivate"}</button><button class="secondary small-btn" data-staff-role="${escapeHtml(s.id)}" data-role="${s.role === "admin" ? "staff" : "admin"}">Make ${s.role === "admin" ? "staff" : "admin"}</button><button class="secondary small-btn" data-staff-password="${escapeHtml(s.id)}">Reset password</button></div></td></tr>`).join(""); }
  catch (e) { showMessage($("staffMessage"), e.message, "error"); }
}
function addInvoiceItem(description = "", qty = "1", price = "") {
  invoiceItemCount++;
  const row = document.createElement("div"); row.className = "item-row"; row.dataset.item = String(invoiceItemCount);
  row.innerHTML = `<input aria-label="Charge description" placeholder="Freight / handling / other charge" maxlength="160" value="${escapeHtml(description)}" class="item-desc"><input aria-label="Quantity" type="number" min="0.01" step="0.01" value="${escapeHtml(qty)}" class="item-qty"><input aria-label="Unit price" type="number" min="0" step="0.01" placeholder="Unit price" value="${escapeHtml(price)}" class="item-price"><button type="button" class="danger small-btn remove-item" aria-label="Remove charge">×</button>`;
  $("invoiceItems").appendChild(row);
  row.querySelector(".remove-item").addEventListener("click", () => { row.remove(); });
}
function money(value, currency) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); } catch { return `${currency} ${Number(value).toFixed(2)}`; } }
function dateText(value) { if (!value) return "—"; const [y,m,d] = value.split("-"); return `${d}/${m}/${y}`; }
function buildInvoice() {
  const customer = $("invoiceCustomer").value.trim();
  const email = $("invoiceEmail").value.trim();
  const ref = $("invoiceRef").value.trim();
  const date = $("invoiceDate").value;
  const due = $("invoiceDue").value;
  const currency = $("invoiceCurrency").value;
  const taxRate = Number($("invoiceTax").value || 0);
  if (!customer || !date) throw new Error("Enter the customer name and invoice date.");
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("Tax must be between 0 and 100%.");
  const items = [...document.querySelectorAll("#invoiceItems .item-row")].map(row => ({ description: row.querySelector(".item-desc").value.trim(), qty: Number(row.querySelector(".item-qty").value), price: Number(row.querySelector(".item-price").value) })).filter(i => i.description && Number.isFinite(i.qty) && i.qty > 0 && Number.isFinite(i.price) && i.price >= 0);
  if (!items.length) throw new Error("Add at least one charge with a description, quantity, and unit price.");
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const tax = subtotal * taxRate / 100;
  const total = subtotal + tax;
  const invoiceNo = `SOL-INV-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0,14)}-${crypto.getRandomValues(new Uint8Array(2)).reduce((a,b)=>a+b,0).toString(36).toUpperCase()}`;
  $("pvNumber").textContent = invoiceNo; $("pvDate").textContent = dateText(date); $("pvDue").textContent = dateText(due);
  $("pvCustomer").textContent = customer; $("pvEmail").textContent = email; $("pvRef").textContent = ref || "Not provided";
  $("pvItems").innerHTML = items.map(i => `<tr><td>${escapeHtml(i.description)}</td><td class="num">${escapeHtml(i.qty)}</td><td class="num">${escapeHtml(money(i.price,currency))}</td><td class="num">${escapeHtml(money(i.qty*i.price,currency))}</td></tr>`).join("");
  $("pvSubtotal").textContent = money(subtotal,currency); $("pvTax").textContent = `${money(tax,currency)} (${taxRate.toFixed(2)}%)`; $("pvTotal").textContent = money(total,currency); $("pvTerms").textContent = $("invoiceTerms").value.trim() || "—";
  $("invoicePreview").style.display = "block"; $("printInvoiceBtn").disabled = false; $("invoicePreview").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("loginForm").addEventListener("submit", async e => { e.preventDefault(); clearMessage($("loginMessage")); try { const data = await api("auth/login", { method: "POST", body: JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value }) }); currentUser = data.user; showDashboard(); await loadShipments(); if (currentUser.role === "admin") await loadStaff(); } catch (err) { showMessage($("loginMessage"), err.message, "error"); } });
$("logoutBtn").addEventListener("click", async () => { try { await api("auth/logout", { method: "POST", body: "{}" }); } finally { currentUser = null; showLogin(); } });
document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
$("refreshBtn").addEventListener("click", loadShipments);
status: $("initialStatus").value,
$("createShipmentForm").addEventListener("submit", async e => { e.preventDefault(); clearMessage($("appMessage")); const body = { customer_name: $("customerName").value, customer_email: $("customerEmail").value, origin: $("origin").value, destination: $("destination").value, goods_description: $("goodsDescription").value, status: $("initialStatus").value, public_note: $("initialNote").value }; try { const data = await api("shipments", { method: "POST", body: JSON.stringify(body) }); showMessage($("appMessage"), `Shipment created. Reference: ${data.reference}`); $("createShipmentForm").reset(); status: $("initialStatus").value, await loadShipments(); selectTab("shipmentsTab"); } catch (err) { showMessage($("appMessage"), err.message, "error"); } });
$("shipmentRows").addEventListener("click", async e => { const invoiceButton = e.target.closest("[data-invoice-ref]"); if (invoiceButton) { $("invoiceCustomer").value = invoiceButton.dataset.customer; $("invoiceRef").value = invoiceButton.dataset.invoiceRef; selectTab("invoiceTab"); return; } const btn = e.target.closest("[data-update]"); if (!btn) return; const shipment = shipmentsCache.find(s => s.id === btn.dataset.update); if (!shipment) return; const status = prompt(`New status for ${shipment.reference}:\n\n${STATUSES.join("\n")}`, shipment.status); if (status === null) return; if (!STATUSES.includes(status.trim())) { showMessage($("appMessage"), "Please enter one of the listed status names exactly.", "error"); return; } const note = prompt("Customer-visible update note (leave blank if none):", ""); if (note === null) return; const isPublic = confirm("Show this status update on the public tracking page? Choose Cancel to keep the event private."); try { await api(`shipments/${shipment.id}`, { method: "PATCH", body: JSON.stringify({ status: status.trim(), public_note: note, is_public: isPublic }) }); showMessage($("appMessage"), `Updated ${shipment.reference}.`); await loadShipments(); } catch (err) { showMessage($("appMessage"), err.message, "error"); } });
$("addInvoiceItem").addEventListener("click", () => addInvoiceItem());
$("invoiceForm").addEventListener("submit", e => { e.preventDefault(); try { buildInvoice(); } catch (err) { showMessage($("appMessage"), err.message, "error"); } });
$("printInvoiceBtn").addEventListener("click", () => window.print());
$("createStaffForm").addEventListener("submit", async e => { e.preventDefault(); clearMessage($("staffMessage")); try { await api("staff", { method: "POST", body: JSON.stringify({ email: $("staffEmail").value, password: $("staffPassword").value, role: $("staffRole").value }) }); showMessage($("staffMessage"), "Staff account created. Share the credentials securely and ask the staff member to change their password after sign-in."); $("createStaffForm").reset(); await loadStaff(); } catch (err) { showMessage($("staffMessage"), err.message, "error"); } });
$("staffRows").addEventListener("click", async e => { const active = e.target.closest("[data-staff-active]"); const role = e.target.closest("[data-staff-role]"); const pass = e.target.closest("[data-staff-password]"); if (!active && !role && !pass) return; const id = (active || role || pass).dataset.staffActive || (active || role || pass).dataset.staffRole || (active || role || pass).dataset.staffPassword; let body = {}; if (active) body.active = active.dataset.active === "1"; if (role) body.role = role.dataset.role; if (pass) { const password = prompt("Enter a new password (minimum 14 characters). Share it with the staff member through a secure channel:"); if (password === null) return; body.password = password; } try { await api(`staff/${id}`, { method: "PATCH", body: JSON.stringify(body) }); showMessage($("staffMessage"), "Staff account updated."); await loadStaff(); } catch (err) { showMessage($("staffMessage"), err.message, "error"); } });
const now = new Date(); $("invoiceDate").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; addInvoiceItem("International shipment coordination", "1", "");
checkSession();
