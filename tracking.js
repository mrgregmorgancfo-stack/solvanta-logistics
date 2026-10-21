
/* Solvanta Logistics - Public Shipment Tracking */
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

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  };

  const styles = `
    .sv-tracking {
      margin: 24px 0;
      padding: clamp(18px, 4vw, 32px);
      border: 1px solid #e4e7ec;
      border-radius: 16px;
      background: #ffffff;
      color: #1d2939;
      font-family: inherit;
      font-size: 15px;
      line-height: 1.6;
      box-shadow: 0 8px 28px rgba(11, 31, 58, 0.07);
      overflow-wrap: anywhere;
    }

    .sv-tracking * {
      box-sizing: border-box;
    }

    .sv-tracking .sv-eyebrow {
      color: #667085;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .sv-tracking h3 {
      color: #0b1f3a;
      font-size: clamp(20px, 3vw, 26px);
      line-height: 1.35;
      margin: 5px 0 22px;
      overflow-wrap: anywhere;
    }

    .sv-tracking h4 {
      color: #0b1f3a;
      font-size: 17px;
      line-height: 1.4;
      margin: 0 0 18px;
    }

    .sv-tracking .sv-status {
      padding: 17px 18px;
      margin-bottom: 24px;
      border: 1px solid #dbeafe;
      border-radius: 12px;
      background: #eff6ff;
    }

    .sv-tracking .sv-status strong {
      display: block;
      margin-top: 5px;
      font-size: 21px;
      line-height: 1.4;
    }

    .sv-tracking .sv-locations {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 30px;
    }

    .sv-tracking .sv-location {
      min-width: 0;
      padding: 16px;
      border: 1px solid #eaecf0;
      border-radius: 10px;
      background: #ffffff;
    }

    .sv-tracking .sv-location strong {
      display: block;
      margin-top: 6px;
      color: #101828;
      font-size: 15px;
    }

    .sv-tracking .sv-muted {
      color: #667085;
      font-size: 13px;
      line-height: 1.6;
    }

    .sv-tracking .sv-timeline {
      margin-bottom: 25px;
    }

    .sv-tracking .sv-stage {
      display: flex;
      gap: 13px;
      min-height: 67px;
    }

    .sv-tracking .sv-marker-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }

    .sv-tracking .sv-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: 1px solid #d0d5dd;
      border-radius: 50%;
      background: #f2f4f7;
      color: #667085;
      font-size: 13px;
      font-weight: 700;
    }

    .sv-tracking .sv-marker.is-complete {
      border-color: #16845b;
      background: #16845b;
      color: #ffffff;
    }

    .sv-tracking .sv-marker.is-current {
      border-color: #2457c5;
      background: #2457c5;
      color: #ffffff;
      box-shadow: 0 0 0 4px #eaf1ff;
    }

    .sv-tracking .sv-connector {
      width: 2px;
      min-height: 25px;
      flex: 1;
      background: #e4e7ec;
    }

    .sv-tracking .sv-connector.is-complete {
      background: #16845b;
    }

    .sv-tracking .sv-stage-content {
      flex: 1;
      min-width: 0;
      padding: 2px 0 18px;
    }

    .sv-tracking .sv-stage-title {
      color: #475467;
      font-weight: 600;
    }

    .sv-tracking .sv-stage-title.is-complete {
      color: #16845b;
    }

    .sv-tracking .sv-stage-title.is-current {
      color: #2457c5;
    }

    .sv-tracking .sv-current-label {
      align-self: flex-start;
      flex-shrink: 0;
      padding: 3px 8px;
      border-radius: 20px;
      background: #eff6ff;
      color: #2457c5;
      font-size: 11px;
      font-weight: 700;
    }

    .sv-tracking .sv-history {
      margin: 0;
      padding-left: 23px;
    }

    .sv-tracking .sv-history li {
      padding: 0 0 16px 3px;
    }

    .sv-tracking .sv-history li::marker {
      color: #2457c5;
      font-weight: 700;
    }

    .sv-tracking .sv-note {
      margin-top: 20px;
      padding: 14px 15px;
      border-radius: 10px;
      background: #f8fafc;
      color: #667085;
      font-size: 12px;
      line-height: 1.7;
    }

    .sv-tracking .sv-note a {
      color: #2457c5;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .sv-tracking .sv-alert {
      margin: 18px 0;
      padding: 14px 16px;
      border: 1px solid #fedf89;
      border-radius: 10px;
      background: #fff4e5;
      color: #93370d;
    }

    .sv-tracking .sv-divider {
      margin: 26px 0;
      border: 0;
      border-top: 1px solid #eaecf0;
    }

    .sv-tracking-message {
      margin-top: 18px;
      padding: 16px;
      border: 1px solid #e4e7ec;
      border-radius: 10px;
      background: #f8fafc;
      color: #344054;
      line-height: 1.6;
    }

    .sv-tracking-message a {
      color: #2457c5;
    }

    #trackingForm button:disabled {
      opacity: 0.65;
      cursor: wait;
    }

    @media (max-width: 480px) {
      .sv-tracking .sv-locations {
        grid-template-columns: 1fr;
      }

      .sv-tracking .sv-current-label {
        padding: 2px 6px;
        font-size: 10px;
      }

      .sv-tracking .sv-stage {
        gap: 10px;
      }
    }
  `;

  if (!document.getElementById("sv-tracking-styles")) {
    const style = document.createElement("style");
    style.id = "sv-tracking-styles";
    style.textContent = styles;
    document.head.appendChild(style);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const ref = refInput.value.trim().toUpperCase();
    const button = form.querySelector('button[type="submit"]');

    if (!ref) {
      output.hidden = false;
      output.innerHTML = `
        <div class="sv-tracking-message" role="alert">
          Please enter your shipment or tracking reference.
        </div>`;
      return;
    }

    output.hidden = false;
    output.innerHTML = `
      <div class="sv-tracking-message" role="status">
        Checking shipment status...
      </div>`;

    if (button) button.disabled = true;

    try {
      const response = await fetch(
        `/api/track?ref=${encodeURIComponent(ref)}`,
        {
          headers: {
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The tracking service returned an unexpected response. Please try again."
        );
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "We couldn't find a shipment with that reference. Please check it and try again."
          );
        }

        throw new Error(
          data.error ||
          "We couldn't retrieve your shipment. Please try again."
        );
      }

      const shipment = data.shipment || {};
      const events = Array.isArray(data.events) ? data.events : [];
      const status = String(shipment.status || "Status unavailable");
      const currentIndex = stages.indexOf(status);
      const specialStatus = ["On Hold", "Cancelled"].includes(status);

      // Events are returned newest first. Keep the latest event per status.
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
        let markerClass = "";
        let titleClass = "";
        let description = "No recorded event";

        if (isCompleted) {
          symbol = "✓";
          markerClass = "is-complete";
          titleClass = "is-complete";
          description =
            `Recorded ${dateText(recordedEvent.created_at)}`;
        } else if (isCurrent) {
          symbol = "●";
          markerClass = "is-current";
          titleClass = "is-current";

          description = isRecorded
            ? `Current status · ${dateText(recordedEvent.created_at)}`
            : "Current recorded stage";
        } else if (isRecorded) {
          description =
            `Recorded ${dateText(recordedEvent.created_at)}`;
        }

        const connectorClass = isCompleted ? "is-complete" : "";

        return `
          <div class="sv-stage">
            <div class="sv-marker-column">
              <div class="sv-marker ${markerClass}" aria-hidden="true">
                ${symbol}
              </div>

              ${index < stages.length - 1
                ? `<div class="sv-connector ${connectorClass}"></div>`
                : ""}
            </div>

            <div class="sv-stage-content">
              <div class="sv-stage-title ${titleClass}">
                ${esc(stage)}
              </div>

              <div class="sv-muted">
                ${esc(description)}
              </div>
            </div>

            ${isCurrent
              ? `<span class="sv-current-label">CURRENT</span>`
              : ""}
          </div>
        `;
      }).join("");

      const history = events.length
        ? events.map(item => `
            <li>
              <strong>${esc(item.status || "Status update")}</strong>

              <div class="sv-muted">
                ${esc(dateText(item.created_at))}
              </div>

              ${item.public_note
                ? `<div>${esc(item.public_note)}</div>`
                : ""}
            </li>
          `).join("")
        : "<li>No public status updates have been recorded yet.</li>";

      const statusBackground =
        status === "Delivered"
          ? "#ecfdf3"
          : specialStatus
            ? "#fff4e5"
            : "#eff6ff";

      const statusColor =
        status === "Delivered"
          ? "#067647"
          : specialStatus
            ? "#93370d"
            : "#1746a2";

      output.innerHTML = `
        <section class="sv-tracking" aria-label="Shipment tracking results">

          <div class="sv-eyebrow">
            Shipment tracking details
          </div>

          <h3>Shipment ${esc(shipment.reference || ref)}</h3>

          <div class="sv-status" style="
            background:${statusBackground};
            border-color:${statusBackground};
          ">
            <div class="sv-eyebrow">
              Current recorded status
            </div>

            <strong style="color:${statusColor}">
              ${esc(status)}
            </strong>
          </div>

          ${specialStatus ? `
            <div class="sv-alert" role="status">
              This shipment is marked ${esc(status)}.
              Please contact our support team for further information.
            </div>
          ` : ""}

          <div class="sv-locations">
            <div class="sv-location">
              <div class="sv-eyebrow">Origin</div>
              <strong>${esc(shipment.origin || "Not provided")}</strong>
            </div>

            <div class="sv-location">
              <div class="sv-eyebrow">Destination</div>
              <strong>${esc(shipment.destination || "Not provided")}</strong>
            </div>
          </div>

          <h4>Shipment progress</h4>

          <div class="sv-timeline">
            ${timeline}
          </div>

          <div class="sv-muted">
            Last updated: ${esc(dateText(shipment.updated_at))}
          </div>

          <hr class="sv-divider">

          <h4>Shipment status history</h4>

          <ol class="sv-history">
            ${history}
          </ol>

          <div class="sv-note">
            Shipment statuses are recorded by Solvanta Logistics staff.
            Progress milestones are shown as completed only when a
            corresponding public status event has been recorded.
            This service does not provide live GPS or automatic carrier
            tracking. For assistance, contact
            <a href="mailto:info@solvantalogistics.com">
              info@solvantalogistics.com
            </a>.
          </div>
        </section>
      `;

    } catch (error) {
      output.innerHTML = `
        <div class="sv-tracking-message" role="alert">
          ${esc(
            error.message ||
            "Unable to retrieve shipment information. Please try again."
          )}
          <p>
            Need help?
            <a href="mailto:info@solvantalogistics.com">
              Contact Solvanta Logistics
            </a>.
          </p>
        </div>`;
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
