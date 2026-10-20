/* Solvanta public tracking form. Add this script after the tracking form in index.html. */
(() => {
  const form = document.querySelector("#trackingForm");
  if (!form) return;
  const refInput = form.querySelector('input[name="trackingNumber"], input[name="reference"], input[type="text"]');
  if (!refInput) return;
  let output = document.getElementById("trackingResult");
  if (!output) { output = document.createElement("div"); output.id = "trackingResult"; output.setAttribute("aria-live", "polite"); form.insertAdjacentElement("afterend", output); }
  output.style.marginTop = "18px";
  output.style.lineHeight = "1.6";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const ref = refInput.value.trim();
    if (!ref) { output.textContent = "Enter your shipment reference to continue."; return; }
    output.textContent = "Checking the latest recorded shipment update…";
    const button = form.querySelector('button[type="submit"], button:not([type]) , input[type="submit"]');
    if (button) button.disabled = true;
    try {
      const response = await fetch(`/api/track?ref=${encodeURIComponent(ref)}`, { headers: { "Accept": "application/json" }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to find that shipment.");
      const s = data.shipment;
      const events = (data.events || []).map(ev => `<li style="margin:0 0 12px"><strong>${esc(ev.status)}</strong><br><span>${esc(new Date(ev.created_at).toLocaleString())}</span>${ev.public_note ? `<br>${esc(ev.public_note)}` : ""}</li>`).join("");
      output.innerHTML = `<section style="border:1px solid #e4e7ec;border-radius:12px;padding:18px;background:#fff;color:#1d2939"><h3 style="margin:0 0 8px;color:#0b1f3a">Shipment ${esc(s.reference)}</h3><p><strong>Current recorded status:</strong> ${esc(s.status)}</p><p><strong>Origin:</strong> ${esc(s.origin)}<br><strong>Destination:</strong> ${esc(s.destination)}</p><p><strong>Last updated:</strong> ${esc(new Date(s.updated_at).toLocaleString())}</p><h4 style="color:#0b1f3a">Status history</h4><ol>${events || "<li>No public status updates have been added yet.</li>"}</ol><p style="font-size:.9rem;color:#667085">Updates are entered by Solvanta Logistics staff. This page does not display live GPS or carrier data.</p></section>`;
    } catch (error) { output.textContent = error.message; }
    finally { if (button) button.disabled = false; }
  });
})();
