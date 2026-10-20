
/* Solvanta Logistics public shipment tracking */
(() => {
  "use strict";

  const form = document.querySelector("#trackingForm");
  if (!form) return;

  const refInput = form.querySelector(
    'input[name="trackingNumber"], input[name="reference"], input[type="text"]'
  );

  const output = document.getElementById("trackingResult");

  if (!refInput || !output) return;

  const stages = [
    "Booking Confirmed",
    "Awaiting Collection",
    "Collected",
    "In Transit",
    "Customs Clearance",
    "Out for Delivery",
    "Delivered"
  ];

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);

  const dateText = value => {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleString();
  };

  const icon = (symbol, color) =>
    `<span style="
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:28px;
      height:28px;
      border-radius:50%;
      background:${color};
      color:#fff;
      font-weight:700;
      flex-shrink:0;
    ">${symbol}</span>`;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const ref = refInput.value.trim().toUpperCase();

    if (!ref) {
      output.hidden = false;
      output.textContent = "Please enter your shipment reference.";
      return;
    }

    output.hidden = false;
    output.innerHTML = "<p>Checking shipment status…</p>";

    const button = form.querySelector('button[type="submit"]');

    if (button) button.disabled = true;

    try {
      const response = await fetch(
        `/api/track?ref=${encodeURIComponent(ref)}`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store"
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to retrieve this shipment."
        );
      }

      const shipment = data.shipment;
      const events = Array.isArray(data.events) ? data.events : [];
      const status = String(shipment.status || "");
      const currentIndex = stages.indexOf(status);
      const specialStatus = ["On Hold", "Cancelled"].includes(status);

      /*
       * The API returns events newest first.
       * Keep the latest public event recorded for each status.
       */
      const eventByStatus = new Map();

      for (const item of events) {
        if (
          item &&
          typeof item.status === "string" &&
          !eventByStatus.has(item.status)
        ) {
          eventByStatus.set(item.status, item);
        }
      }

      /*
       * Only mark a previous milestone complete if a matching
       * public status event actually exists.
       */
      const timeline = stages.map((stage, index) => {
        const recordedEvent = eventByStatus.get(stage);
        const isCurrent = stage === status;
        const isRecorded = Boolean(recordedEvent);

        const isCompleted =
          !isCurrent &&
          isRecorded &&
          currentIndex >= 0 &&
          index < currentIndex;

        let symbol = String(index + 1);
        let color = "#d0d5dd";
        let titleColor = "#667085";
        let description = "No recorded event";

        if (isCompleted) {
          symbol = "✓";
          color = "#16845b";
          titleColor = "#16845b";
          description =
            `Recorded ${dateText(recordedEvent.created_at)}`;
        } else if (isCurrent) {
          symbol = "●";
          color = "#2457c5";
          titleColor = "#2457c5";

          description = isRecorded
            ? `Current status · ${dateText(recordedEvent.created_at)}`
            : "Current recorded stage";
        } else if (isRecorded) {
          description =
            `Recorded ${dateText(recordedEvent.created_at)}`;
        }

        const connectorColor =
          isCompleted ? "#16845b" : "#e4e7ec";

        return `
          <div style="display:flex;gap:12px;min-height:68px">
            <div style="
              display:flex;
              flex-direction:column;
              align-items:center;
            ">
              ${icon(symbol, color)}

              ${index < stages.length - 1
                ? `<div style="
                    width:2px;
                    flex:1;
                    min-height:20px;
                    background:${connectorColor};
                  "></div>`
                : ""}
            </div>

            <div style="padding-bottom:16px;flex:1">
              <div style="
                font-weight:600;
                color:${titleColor};
              ">
                ${esc(stage)}
              </div>

              <div style="font-size:13px;color:#667085">
                ${esc(description)}
              </div>
            </div>

            ${isCurrent
              ? `<span style="
                  font-size:12px;
                  color:#2457c5;
                  font-weight:600;
                ">Current</span>`
              : ""}
          </div>
        `;
      }).join("");

      const history = events.length
        ? events.map(item => `
            <li style="margin:0 0 14px">
              <strong>${esc(item.status || "Status update")}</strong>

              <div style="font-size:13px;color:#667085">
                ${esc(dateText(item.created_at))}
              </div>

              ${item.public_note
                ? `<div>${esc(item.public_note)}</div>`
                : ""}
            </li>
          `).join("")
        : "<li>No public status updates yet.</li>";

      const statusBackground =
        status === "Delivered"
          ? "#ecfdf3"
          : specialStatus
            ? "#fff4e5"
            : "#eff6ff";

      output.innerHTML = `
        <section style="
          margin-top:18px;
          border:1px solid #e4e7ec;
          border-radius:14px;
          padding:22px;
          background:#fff;
          color:#1d2939;
          line-height:1.6;
        ">

          <h3 style="margin:0 0 12px;color:#0b1f3a">
            Shipment ${esc(shipment.reference)}
          </h3>

          <div style="
            padding:14px;
            border-radius:10px;
            background:${statusBackground};
            margin-bottom:20px;
          ">
            <div style="font-size:13px;color:#667085">
              CURRENT RECORDED STATUS
            </div>

            <strong style="font-size:19px">
              ${esc(status || "Status unavailable")}
            </strong>
          </div>

          <div style="
            display:grid;
            grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
            gap:14px;
            margin-bottom:24px;
          ">
            <div>
              <div style="font-size:13px;color:#667085">Origin</div>
              <strong>${esc(shipment.origin || "Not provided")}</strong>
            </div>

            <div>
              <div style="font-size:13px;color:#667085">Destination</div>
              <strong>${esc(shipment.destination || "Not provided")}</strong>
            </div>
          </div>

          ${specialStatus ? `
            <p style="
              padding:12px;
              background:#fff4e5;
              border-radius:8px;
            ">
              This shipment is marked ${esc(status)}.
              Please contact our team if you need more information.
            </p>
          ` : ""}

          <h4 style="color:#0b1f3a;margin-bottom:18px">
            Shipment Progress
          </h4>

          <div>${timeline}</div>

          <p style="font-size:13px;color:#667085">
            Last updated: ${esc(dateText(shipment.updated_at))}
          </p>

          <hr style="
            border:0;
            border-top:1px solid #e4e7ec;
            margin:22px 0;
          ">

          <h4 style="color:#0b1f3a">
            Shipment Status History
          </h4>

          <ol style="padding-left:20px">
            ${history}
          </ol>

          <p style="
            font-size:12px;
            color:#667085;
            margin-bottom:0;
          ">
            Shipment statuses are recorded by Solvanta Logistics staff.
            Progress milestones are shown as completed only when a
            corresponding public status event has been recorded.
            This service does not provide live GPS or automatic
            carrier tracking.
          </p>
        </section>
      `;

    } catch (error) {
      output.textContent =
        error.message || "Unable to retrieve shipment information.";

    } finally {
      if (button) button.disabled = false;
    }
  });
})();
