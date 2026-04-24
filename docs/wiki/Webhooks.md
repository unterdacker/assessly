# Outbound Webhooks

> **Premium feature.** Webhooks are available on the **Premium plan** only.
> 
> Webhook receivers are **data processors** under GDPR Art. 28. A Data Processing Agreement (DPA) must be in place before sending any event data to an external endpoint.

---

## Overview

Venshield can send real-time HTTP POST notifications to external endpoints when key events occur in your organization. Webhooks are HMAC-signed and delivered over HTTPS, enabling you to build integrations with downstream systems (SIEM, ticketing, GRC tools, etc.) without polling the Venshield API.

---

## Supported Events

| Event | Trigger |
|---|---|
| `assessment.completed` | An assessment is marked completed by a reviewer |
| `assessment.submitted` | A vendor submits their assessment questionnaire |
| `vendor.created` | A new vendor is added to the organization |
| `vendor.risk_changed` | A vendor's risk level changes on assessment update |

---

## Prerequisites

- Your organization must be on the **Premium plan**
- You must have the **Admin** role (**ADMIN**)
- The endpoint must be reachable over **public HTTPS** (private/internal IPs are blocked)

---

## Configuration

1. Navigate to **Settings → Webhooks**
2. Click **Add Webhook**
3. Fill in:
   - **Name** — a label for this webhook (max 100 characters)
   - **Endpoint URL** — the HTTPS URL that will receive deliveries
   - **Description** — optional notes (max 500 characters)
   - **Events** — select one or more events to subscribe to
   - **Enabled** — uncheck to temporarily pause delivery
4. Click **Save Webhook**
5. **Copy the signing secret immediately** — it will only be shown once

> **Important:** The signing secret is displayed only at creation time and when explicitly regenerated. It cannot be retrieved from the UI later. Store it in your secret manager immediately.

### Secret Rotation

To rotate a webhook's signing secret:

1. Click the **Regenerate Secret** button (↻) next to the webhook
2. Confirm the action
3. Copy and store the new secret immediately
4. Update your receiver to use the new secret

The old secret stops working immediately upon regeneration. This action is logged in the Audit Trail with HIGH retention.

---

## Payload Format

All deliveries are HTTP POST requests with `Content-Type: application/json`.

### `assessment.completed`

```json
{
  "event": "assessment.completed",
  "assessmentId": "clxxx...",
  "vendorId": "clyyy...",
  "companyId": "clzzz...",
  "riskLevel": "HIGH",
  "complianceScore": 72,
  "completedAt": "2026-04-16T10:30:00.000Z"
}
```

### `assessment.submitted`

```json
{
  "event": "assessment.submitted",
  "assessmentId": "clxxx...",
  "vendorId": "clyyy...",
  "companyId": "clzzz...",
  "submittedAt": "2026-04-16T09:15:00.000Z"
}
```

### `vendor.created`

```json
{
  "event": "vendor.created",
  "vendorId": "clyyy...",
  "companyId": "clzzz...",
  "serviceType": "CLOUD_PROVIDER",
  "createdAt": "2026-04-16T08:00:00.000Z"
}
```

### `vendor.risk_changed`

```json
{
  "event": "vendor.risk_changed",
  "assessmentId": "clxxx...",
  "vendorId": "clyyy...",
  "companyId": "clzzz...",
  "previousRiskLevel": "MEDIUM",
  "newRiskLevel": "HIGH",
  "changedAt": "2026-04-16T11:00:00.000Z"
}
```

> **GDPR Notice:** Payloads contain only pseudonymous IDs, scores, status values, and timestamps. No personal data (email addresses, display names, or other direct identifiers) is ever included in webhook payloads.

---

## Request Headers

Each delivery includes the following headers:

| Header | Description |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Venshield-Webhook/1.0` |
| `X-Venshield-Signature` | `sha256=<hex>` — HMAC-SHA256 signature |
| `X-Venshield-Timestamp` | Unix epoch seconds at delivery time |

> You can whitelist the `Venshield-Webhook/1.0` User-Agent in your firewall or WAF to distinguish genuine Venshield deliveries from other sources.

---

## Verifying Signatures

Every delivery is signed with HMAC-SHA256. Verify the signature in your receiver to ensure deliveries are genuine and have not been tampered with.

### Algorithm

1. Read `X-Venshield-Timestamp` from headers
2. **Reject if** `|now_unix_seconds − timestamp| > 300` (5-minute window prevents replay attacks)
3. Read the raw request body as bytes, then hex-encode it
4. Compute: `HMAC-SHA256(signing_secret, "${timestamp}.${bodyHex}")`
5. Compare with the hex value in `X-Venshield-Signature` (after stripping the `sha256=` prefix)

> **Important:** The HMAC input includes the hex-encoded body (not raw bytes). This is intentional and differs from some other webhook implementations. See the example below.

### Node.js Receiver Example

```javascript
const crypto = require("crypto");

function verifyVenshieldWebhook(req, signingSecret) {
  const signature = req.headers["x-venshield-signature"]; // "sha256=abc123..."
  const timestamp = req.headers["x-venshield-timestamp"]; // Unix seconds string

  // Reject stale requests (replay prevention)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    throw new Error("Webhook timestamp too old or too new");
  }

  // Recompute HMAC
  const bodyHex = Buffer.from(req.rawBody).toString("hex");
  const expected = "sha256=" + crypto
    .createHmac("sha256", signingSecret)
    .update(`${timestamp}.${bodyHex}`)
    .digest("hex");

  // Constant-time comparison
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Webhook signature invalid");
  }
}
```

---

## Retry Policy

Venshield currently uses **fire-and-forget** delivery — each event is attempted once per subscribed webhook endpoint. There is no automatic retry on failure.

**Recommendations:**
- Ensure your endpoint is highly available
- Return HTTP 200 quickly (within 30 seconds — the delivery timeout)
- Implement idempotency in your receiver using the `assessmentId` / `vendorId` as an idempotency key
- Check the Venshield **Audit Trail** (filter: System Health) for `WEBHOOK_DELIVERY_ATTEMPTED` events to see delivery success/failure history

---

## Delivery Limits

| Limit | Value |
|---|---|
| Max webhooks per organization | 25 |
| Delivery timeout | 30s (configurable via `WEBHOOK_DELIVERY_TIMEOUT_MS`) |
| Supported protocols | HTTPS only (public endpoints) |
| Events per webhook | 1–4 |

---

## Security

### Transport
- Only **HTTPS** endpoints are accepted
- Endpoints in private IP ranges (RFC 1918), loopback, cloud metadata (169.254.169.254), and IPv6 ULA/link-local ranges are blocked (SSRF protection)
- HTTP redirects from the endpoint are not followed (prevents redirect-based SSRF attacks)

### Signing
- Secrets are generated server-side using `crypto.randomBytes(32)` (256-bit entropy)
- Secrets are stored encrypted at rest using AES-256-GCM with a dedicated `WEBHOOK_ENCRYPTION_KEY`
- The plaintext secret is shown only once — at creation or after explicit regeneration
- HMAC-SHA256 provides payload integrity and authenticity

### DNS Rebinding
- DNS is resolved at both registration time and immediately before each delivery (fresh resolution prevents DNS rebinding attacks)
- For complete DNS-rebinding protection, configure network-layer egress filtering (allowlist known external webhook destinations at your firewall/proxy)

---

## Audit Trail

The following events are recorded in the Venshield Audit Trail:

| Event | Category | Retention |
|---|---|---|
| `WEBHOOK_CREATED` | Configuration | Standard |
| `WEBHOOK_UPDATED` | Configuration | Standard |
| `WEBHOOK_DELETED` | Configuration | Standard |
| `WEBHOOK_SECRET_REGENERATED` | Configuration | HIGH (365 days) |
| `WEBHOOK_DELIVERY_ATTEMPTED` | System Health | LOW (30 days) |

`WEBHOOK_SECRET_REGENERATED` entries have elevated retention because secret rotation is a security-relevant action relevant to NIS2/DORA incident investigation timelines.

---

## GDPR & Data Processing

- Webhook receivers are **data processors** under GDPR Art. 28
- A **Data Processing Agreement (DPA)** is required before configuring an endpoint that will receive event data
- You are responsible for ensuring the DPA covers the endpoint URL you configure
- Payloads are designed for data minimization — only pseudonymous IDs, not personal data
- `WEBHOOK_DELIVERY_ATTEMPTED` audit logs have a 30-day retention (GDPR data minimization principle)
