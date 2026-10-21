
"use strict";

const API = "/api";

const STATUSES = [
  "Booking Confirmed",
  "Awaiting Collection",
  "Collected",
  "In Transit",
  "Customs Clearance",
  "Out for Delivery",
  "Delivered",
  "On Hold",
  "Cancelled"
];

const $ = id => document.getElementById(id);

let currentUser = null;
let shipmentsCache = [];
let invoiceItemCount = 0;

function showMessage(el, message, kind = "success") {
  if (!el) return;
  el.textContent = message;
  el.className = `message show ${kind}`;
}

function clearMessage(el) {
  if (!el) return;
  el.textContent = "";
  el.className = "message";
}

async function api(path, options = {}) {
  const response = await fetch(`${API}/${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function dateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function fillStatuses(select, selected) {
  select.innerHTML = STATUSES.map(status => `
    <option value="${escapeHtml(status)}"
      ${status === selected ? "selected" : ""}>
      ${escapeHtml(status)}
    </option>
  `).join("");
}

function showLogin() {
  $("loginPanel").classList.remove("hidden");
  $("dashboard").classList.add("hidden");
}

function showDashboard() {
  $("loginPanel").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  $("signedInAs").textContent =
    `${currentUser.email} · ${currentUser.role}`;

  const isAdmin = currentUser.role === "admin";

  $("staffTabButton").classList.toggle("hidden", !isAdmin);

  if (!isAdmin) {
    $("staffTab").classList.add("hidden");

    if ($("staffTabButton").getAttribute("aria-pressed") === "true") {
      selectTab("shipmentsTab");
    }
  }
}

async function checkSession() {
  try {
    const result = await api("auth/me");

    currentUser = result.user;

    showDashboard();
    await loadShipments();

    if (currentUser.role === "admin") {
      await loadStaff();
    }
  } catch {
    currentUser = null;
    showLogin();
  }
}

function selectTab(tabId) {
  const availableTabs = [
    "shipmentsTab",
    "createTab",
    "invoiceTab",
    "staffTab"
  ];

  if (tabId === "staffTab" && currentUser?.role !== "admin") {
    return;
  }

  for (const id of availableTabs) {
    $(id).classList.toggle("hidden", id !== tabId);
  }

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.tab === tabId)
    );
  });

  if (tabId === "staffTab" && currentUser?.role === "admin") {
    loadStaff();
  }
}

/* Dashboard summary cards and shipment search */

function renderShipments() {
  const search = $("shipmentSearch").value.trim().toLowerCase();
  const selectedStatus = $("shipmentStatusFilter").value;

  $("totalShipments").textContent = shipmentsCache.length;

  $("inTransitShipments").textContent = shipmentsCache.filter(shipment =>
    ["In Transit", "Customs Clearance", "Out for Delivery"]
      .includes(shipment.status)
  ).length;

  $("deliveredShipments").textContent = shipmentsCache.filter(shipment =>
    shipment.status === "Delivered"
  ).length;

  $("attentionShipments").textContent = shipmentsCache.filter(shipment =>
    ["On Hold", "Cancelled"].includes(shipment.status)
  ).length;

  const filteredShipments = shipmentsCache.filter(shipment => {
    const searchableText = [
      shipment.reference,
      shipment.customer_name,
      shipment.customer_email,
      shipment.origin,
      shipment.destination,
      shipment.goods_description,
      shipment.status
    ].join(" ").toLowerCase();

    return searchableText.includes(search) &&
      (!selectedStatus || shipment.status === selectedStatus);
  });

  if (!filteredShipments.length) {
    $("shipmentRows").innerHTML = `
      <tr>
        <td colspan="6">
          ${
            shipmentsCache.length
              ? "No shipments match your search or selected status."
              : "No shipments yet. Create your first shipment."
          }
        </td>
      </tr>
    `;

    return;
  }

  $("shipmentRows").innerHTML = filteredShipments.map(shipment => `
    <tr>
      <td>
        <span class="ref">${escapeHtml(shipment.reference)}</span>
        <br>
        <button
          type="button"
          class="secondary small-btn"
          data-invoice-ref="${escapeHtml(shipment.reference)}"
          data-customer="${escapeHtml(shipment.customer_name)}"
          data-email="${escapeHtml(shipment.customer_email || "")}"
        >Use for invoice</button>
      </td>
      <td>
        ${escapeHtml(shipment.customer_name)}
        <br>
        <span class="muted">${escapeHtml(shipment.customer_email || "")}</span>
      </td>
      <td>
        ${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.destination)}
        <br>
        <span class="muted">${escapeHtml(shipment.goods_description || "")}</span>
      </td>
      <td><span class="pill">${escapeHtml(shipment.status)}</span></td>
      <td>${escapeHtml(dateTime(shipment.updated_at))}</td>
      <td>
        <button
          type="button"
          class="small-btn"
          data-update="${escapeHtml(shipment.id)}"
        >Update status</button>
      </td>
    </tr>
  `).join("");
}

async function loadShipments() {
  try {
    const data = await api("shipments");

    shipmentsCache = data.shipments || [];
    renderShipments();
  } catch (error) {
    showMessage($("appMessage"), error.message, "error");
  }
}

/* Staff account management */

async function loadStaff() {
  if (currentUser?.role !== "admin") return;

  try {
    const data = await api("staff");
    const staff = data.staff || [];

    $("staffRows").innerHTML = staff.length
      ? staff.map(member => `
          <tr>
            <td>${escapeHtml(member.email)}</td>
            <td>${escapeHtml(member.role)}</td>
            <td>${member.active ? "Active" : "Inactive"}</td>
            <td>
              <div class="actions">
                <button
                  type="button"
                  class="secondary small-btn"
                  data-staff-active="${escapeHtml(member.id)}"
                  data-active="${member.active ? "0" : "1"}"
                >${member.active ? "Deactivate" : "Reactivate"}</button>

                <button
                  type="button"
                  class="secondary small-btn"
                  data-staff-role="${escapeHtml(member.id)}"
                  data-role="${member.role === "admin" ? "staff" : "admin"}"
                >Make ${member.role === "admin" ? "staff" : "admin"}</button>

                <button
                  type="button"
                  class="secondary small-btn"
                  data-staff-password="${escapeHtml(member.id)}"
                >Reset password</button>
              </div>
            </td>
          </tr>
        `).join("")
      : `<tr><td colspan="4">No staff accounts found.</td></tr>`;

  } catch (error) {
    showMessage($("staffMessage"), error.message, "error");
  }
}

/* Invoice line items */

function addInvoiceItem(description = "", quantity = "1", price = "") {
  invoiceItemCount++;

  const row = document.createElement("div");
  row.className = "item-row";
  row.dataset.item = String(invoiceItemCount);

  row.innerHTML = `
    <input
      aria-label="Charge description"
      placeholder="Freight / handling / other charge"
      maxlength="160"
      value="${escapeHtml(description)}"
      class="item-desc"
    >

    <input
      aria-label="Quantity"
      type="number"
      min="0.01"
      step="0.01"
      value="${escapeHtml(quantity)}"
      class="item-qty"
    >

    <input
      aria-label="Unit price"
      type="number"
      min="0"
      step="0.01"
      placeholder="Unit price"
      value="${escapeHtml(price)}"
      class="item-price"
    >

    <button
      type="button"
      class="danger small-btn remove-item"
      aria-label="Remove charge"
    >Remove</button>
  `;

  $("invoiceItems").appendChild(row);

  row.querySelector(".remove-item").addEventListener("click", () => {
    row.remove();
  });
}

function money(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency
    }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function dateText(value) {
  if (!value) return "—";

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function buildInvoice() {
  const customer = $("invoiceCustomer").value.trim();
  const email = $("invoiceEmail").value.trim();
  const reference = $("invoiceRef").value.trim();
  const invoiceDate = $("invoiceDate").value;
  const dueDate = $("invoiceDue").value;
  const currency = $("invoiceCurrency").value;
  const taxRate = Number($("invoiceTax").value || 0);

  if (!customer || !invoiceDate) {
    throw new Error("Enter the customer name and invoice date.");
  }

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new Error("Tax must be between 0 and 100%.");
  }

  if (dueDate && dueDate < invoiceDate) {
    throw new Error("The due date cannot be earlier than the invoice date.");
  }

  const rows = [
    ...document.querySelectorAll("#invoiceItems .item-row")
  ];

  const items = [];

  for (const row of rows) {
    const description = row.querySelector(".item-desc").value.trim();
    const quantityInput = row.querySelector(".item-qty");
    const priceInput = row.querySelector(".item-price");

    const quantity = Number(quantityInput.value);
    const price = Number(priceInput.value);

    if (!description && !quantityInput.value && !priceInput.value) {
      continue;
    }

    if (!description) {
      throw new Error("Enter a description for each invoice charge.");
    }

    if (!quantityInput.value || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Each invoice quantity must be greater than zero.");
    }

    if (priceInput.value === "" || !Number.isFinite(price) || price < 0) {
      throw new Error("Enter a valid unit price for each invoice charge.");
    }

    items.push({ description, quantity, price });
  }

  if (!items.length) {
    throw new Error("Add at least one invoice charge.");
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  const tax = subtotal * taxRate / 100;
  const total = subtotal + tax;

  const randomBytes = crypto.getRandomValues(new Uint8Array(4));
  const randomPart = Array.from(randomBytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);

  const invoiceNumber = `SOL-INV-${timestamp}-${randomPart}`;

  $("pvNumber").textContent = invoiceNumber;
  $("pvDate").textContent = dateText(invoiceDate);
  $("pvDue").textContent = dateText(dueDate);
  $("pvCustomer").textContent = customer;
  $("pvEmail").textContent = email;
  $("pvRef").textContent = reference || "Not provided";

  $("pvItems").innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td class="num">${escapeHtml(item.quantity)}</td>
      <td class="num">${escapeHtml(money(item.price, currency))}</td>
      <td class="num">${escapeHtml(money(item.quantity * item.price, currency))}</td>
    </tr>
  `).join("");

  $("pvSubtotal").textContent = money(subtotal, currency);
  $("pvTax").textContent = `${money(tax, currency)} (${taxRate.toFixed(2)}%)`;
  $("pvTotal").textContent = money(total, currency);
  $("pvTerms").textContent = $("invoiceTerms").value.trim() || "—";

  $("invoicePreview").style.display = "block";
  $("printInvoiceBtn").disabled = false;

  $("invoicePreview").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* Login and logout */

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  clearMessage($("loginMessage"));
  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "Signing in…";

  try {
    const result = await api("auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      })
    });

    currentUser = result.user;

    showDashboard();
    await loadShipments();

    if (currentUser.role === "admin") {
      await loadStaff();
    }
  } catch (error) {
    showMessage($("loginMessage"), error.message, "error");
  } finally {
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "Sign in securely";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await api("auth/logout", {
      method: "POST",
      body: "{}"
    });
  } catch (error) {
    showMessage($("appMessage"), error.message, "error");
  } finally {
    currentUser = null;
    shipmentsCache = [];
    showLogin();
  }
});

/* Navigation and shipment filtering */

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    selectTab(button.dataset.tab);
  });
});

$("refreshBtn").addEventListener("click", loadShipments);

$("shipmentSearch").addEventListener("input", renderShipments);

$("shipmentStatusFilter").addEventListener("change", renderShipments);

/* Create shipment */

fillStatuses($("initialStatus"), "Booking Confirmed");

$("createShipmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  clearMessage($("appMessage"));

  const body = {
    customer_name: $("customerName").value.trim(),
    customer_email: $("customerEmail").value.trim(),
    origin: $("origin").value.trim(),
    destination: $("destination").value.trim(),
    goods_description: $("goodsDescription").value.trim(),
    status: $("initialStatus").value,
    public_note: $("initialNote").value.trim()
  };

  try {
    const result = await api("shipments", {
      method: "POST",
      body: JSON.stringify(body)
    });

    showMessage(
      $("appMessage"),
      `Shipment created successfully. Reference: ${result.reference}`
    );

    $("createShipmentForm").reset();
    fillStatuses($("initialStatus"), "Booking Confirmed");

    await loadShipments();
    selectTab("shipmentsTab");
  } catch (error) {
    showMessage($("appMessage"), error.message, "error");
  }
});

/* Shipment actions: invoice shortcut and manual status updates */

$("shipmentRows").addEventListener("click", async event => {
  const invoiceButton = event.target.closest("[data-invoice-ref]");

  if (invoiceButton) {
    $("invoiceCustomer").value = invoiceButton.dataset.customer || "";
    $("invoiceEmail").value = invoiceButton.dataset.email || "";
    $("invoiceRef").value = invoiceButton.dataset.invoiceRef || "";

    selectTab("invoiceTab");
    return;
  }

  const updateButton = event.target.closest("[data-update]");

  if (!updateButton) return;

  const shipment = shipmentsCache.find(
    item => String(item.id) === String(updateButton.dataset.update)
  );

  if (!shipment) {
    showMessage($("appMessage"), "Shipment could not be found. Refresh and try again.", "error");
    return;
  }

  const status = prompt(
    `New status for ${shipment.reference}:\n\n${STATUSES.join("\n")}`,
    shipment.status
  );

  if (status === null) return;

  if (!STATUSES.includes(status.trim())) {
    showMessage(
      $("appMessage"),
      "Please enter one of the listed status names exactly.",
      "error"
    );
    return;
  }

  const note = prompt(
    "Customer-visible update note (leave blank if none):",
    ""
  );

  if (note === null) return;

  const isPublic = confirm(
    "Show this status update on the public tracking page?\n\nChoose OK to publish it. Choose Cancel to keep it private."
  );

  try {
    await api(`shipments/${encodeURIComponent(shipment.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: status.trim(),
        public_note: note.trim(),
        is_public: isPublic
      })
    });

    showMessage($("appMessage"), `Updated ${shipment.reference}.`);
    await loadShipments();
  } catch (error) {
    showMessage($("appMessage"), error.message, "error");
  }
});

/* Invoice generation and PDF printing */

$("addInvoiceItem").addEventListener("click", () => {
  addInvoiceItem();
});

$("invoiceForm").addEventListener("submit", event => {
  event.preventDefault();
  clearMessage($("appMessage"));

  try {
    buildInvoice();
  } catch (error) {
    showMessage($("appMessage"), error.message, "error");
  }
});

$("printInvoiceBtn").addEventListener("click", () => {
  if ($("invoicePreview").style.display === "block") {
    window.print();
  }
});

/* Create and manage staff accounts */

$("createStaffForm").addEventListener("submit", async event => {
  event.preventDefault();
  clearMessage($("staffMessage"));

  const password = $("staffPassword").value;

  if (password.length < 14) {
    showMessage(
      $("staffMessage"),
      "The password must contain at least 14 characters.",
      "error"
    );
    return;
  }

  try {
    await api("staff", {
      method: "POST",
      body: JSON.stringify({
        email: $("staffEmail").value.trim(),
        password,
        role: $("staffRole").value
      })
    });

    showMessage(
      $("staffMessage"),
      "Staff account created. Share the temporary credentials securely and ask the staff member to use a unique password."
    );

    $("createStaffForm").reset();
    await loadStaff();
  } catch (error) {
    showMessage($("staffMessage"), error.message, "error");
  }
});

$("staffRows").addEventListener("click", async event => {
  const button = event.target.closest(
    "[data-staff-active], [data-staff-role], [data-staff-password]"
  );

  if (!button) return;

  const id =
    button.dataset.staffActive ||
    button.dataset.staffRole ||
    button.dataset.staffPassword;

  const body = {};

  if (button.hasAttribute("data-staff-active")) {
    body.active = button.dataset.active === "1";
  } else if (button.hasAttribute("data-staff-role")) {
    const nextRole = button.dataset.role;

    const confirmed = confirm(
      `Change this account's role to ${nextRole}?`
    );

    if (!confirmed) return;

    body.role = nextRole;
  } else if (button.hasAttribute("data-staff-password")) {
    const password = prompt(
      "Enter a new password containing at least 14 characters. Share it securely with the staff member:"
    );

    if (password === null) return;

    if (password.length < 14) {
      showMessage(
        $("staffMessage"),
        "The password must contain at least 14 characters.",
        "error"
      );
      return;
    }

    body.password = password;
  }

  try {
    await api(`staff/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });

    showMessage($("staffMessage"), "Staff account updated successfully.");
    await loadStaff();
  } catch (error) {
    showMessage($("staffMessage"), error.message, "error");
  }
});

/* Set today's date and initialise the portal */

const today = new Date();
const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

$("invoiceDate").value = localDate;

addInvoiceItem("International shipment coordination", "1", "");

checkSession();
