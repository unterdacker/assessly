# Venshield REST API Reference

The Venshield REST API gives you programmatic access to your vendors, assessments, and API key usage metrics. The API is versioned, JSON-first, and follows consistent envelope and error conventions throughout.

**Base URL**: `https://<your-instance>/api/v1`

> ⚡ **Premium feature.** API keys can only be created on the **Premium plan**. Read scopes (`vendors:read`, `assessments:read`, `metrics:read`) are available to all Premium API keys at no extra cost. Write scopes (`vendors:write`, `assessments:write`) require both the Premium plan and the corresponding scope to be granted to the key.

---

## Table of Contents

- [Getting an API Key](#getting-an-api-key)
- [Authentication](#authentication)
- [Scopes](#scopes)
- [Rate Limiting](#rate-limiting)
- [Request Format](#request-format)
- [Response Envelope](#response-envelope)
- [Error Reference](#error-reference)
- [Endpoints](#endpoints)
  - [Vendors](#vendors)
    - [GET /vendors — List vendors](#get-apiv1vendors)
    - [POST /vendors — Create a vendor](#post-apiv1vendors) ⚡
    - [GET /vendors/{id} — Get a vendor](#get-apiv1vendorsid)
    - [PATCH /vendors/{id} — Update a vendor](#patch-apiv1vendorsid) ⚡
  - [Assessments](#assessments)
    - [GET /assessments — List assessments](#get-apiv1assessments)
    - [POST /assessments — Create an assessment](#post-apiv1assessments) ⚡
    - [GET /assessments/{id} — Get an assessment](#get-apiv1assessmentsid)
    - [PATCH /assessments/{id}/risk-status — Update risk/status](#patch-apiv1assessmentsidrisk-status) ⚡
  - [Metrics](#metrics)
    - [GET /metrics — View API key usage](#get-apiv1metrics)
- [GDPR Considerations](#gdpr-considerations)

---

## Getting an API Key

API keys are managed inside the Venshield UI. You must be on the **Premium plan** to create API keys.

1. Sign in to Venshield as an **Admin**.
2. Navigate to **Settings → API Keys**.
3. Click **Create API Key**, give it a descriptive name, and select the [scopes](#scopes) your integration needs.
4. Copy the key immediately — it is shown only once.

Keys are **per-organisation**. A key can only access resources belonging to the organisation it was created in. To revoke a key, return to Settings → API Keys and deactivate or delete it.

---

## Authentication

Every request to the API must include a valid API key in the `Authorization` header:

```
Authorization: Bearer <api_key>
```

**Key format**: All keys start with `vs_live_` and are exactly **72 characters** long. A request with a key in the wrong format is rejected immediately with `INVALID_API_KEY_FORMAT` before any database lookup is performed.

```bash
curl https://<your-instance>/api/v1/vendors \
  -H "Authorization: Bearer vs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

> **Never commit API keys to source control.** Store them in environment variables or a secrets manager.

---

## Scopes

Each API key is granted a fixed set of scopes at creation time. Calling an endpoint without the required scope returns `403 INSUFFICIENT_SCOPE`.

| Scope | Availability | What it grants |
|---|---|---|
| `vendors:read` | Included on all Premium keys | List and fetch vendors |
| `vendors:write` | Must be explicitly granted at key creation | Create and update vendors |
| `assessments:read` | Included on all Premium keys | List and fetch assessments |
| `assessments:write` | Must be explicitly granted at key creation | Create and update assessments |
| `metrics:read` | Included on all Premium keys | View API key usage metrics |

Calling a write-scope endpoint without the scope returns `403 INSUFFICIENT_SCOPE`. Calling it with the scope but without a Premium plan returns `403 PREMIUM_REQUIRED`.

---

## Rate Limiting

The API allows **100 requests per minute** per API key. Exceeding this limit returns HTTP `429` with error code `RATE_LIMIT_EXCEEDED`. Back off and retry after the limit window resets (60 seconds).

---

## Request Format

For endpoints that accept a request body (`POST`, `PATCH`), you must:

- Set `Content-Type: application/json`
- Send a valid JSON body

Requests with an invalid or missing `Content-Type` header return `415 UNSUPPORTED_MEDIA_TYPE`. Requests with malformed JSON return `400 INVALID_JSON`.

---

## Response Envelope

All responses — success and error alike — use the same top-level envelope:

**Success**
```json
{
  "data": { ... },
  "error": null
}
```

**Error**
```json
{
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of what went wrong."
  }
}
```

The `error.message` field is intended for debugging. Do not parse it programmatically — use `error.code` for conditional logic in your integration code.

---

## Error Reference

| HTTP status | `error.code` | When it occurs |
|---|---|---|
| `400` | `INVALID_JSON` | Request body is not valid JSON |
| `400` | `VALIDATION_ERROR` | Request body fails field validation — `error.message` contains the specifics |
| `401` | `INVALID_API_KEY_FORMAT` | Key does not start with `vs_live_` or is not 72 characters |
| `401` | `INVALID_API_KEY` | Key not found or has been deactivated |
| `401` | `API_KEY_EXPIRED` | Key has passed its expiry date |
| `403` | `INSUFFICIENT_SCOPE` | Key does not have the scope required by this endpoint |
| `403` | `PREMIUM_REQUIRED` | Endpoint requires a Premium plan organisation |
| `404` | `NOT_FOUND` | Resource not found within your organisation |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` must be `application/json` |
| `429` | `RATE_LIMIT_EXCEEDED` | 100 requests/minute limit exceeded |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

---

## Endpoints

### Vendors

#### GET /api/v1/vendors

List all vendors in your organisation, ordered by creation date (newest first).

**Required scope**: `vendors:read`

```bash
curl https://<your-instance>/api/v1/vendors \
  -H "Authorization: Bearer <api_key>"
```

**Response `data`** — array of vendor objects:

```json
[
  {
    "id": "clxxx...",
    "name": "Acme GmbH",
    "email": "security@acme.de",
    "serviceType": "CLOUD_PROVIDER",
    "createdAt": "2026-04-01T08:00:00.000Z",
    "updatedAt": "2026-04-10T12:00:00.000Z"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | CUID vendor identifier |
| `name` | `string` | Vendor display name |
| `email` | `string` | Vendor security contact email |
| `serviceType` | `string` | Category of service provided |
| `createdAt` | `string` (ISO 8601) | When the vendor record was created |
| `updatedAt` | `string` (ISO 8601) | When the vendor record was last modified |

---

#### POST /api/v1/vendors

Create a new vendor. ⚡ **Premium only (`vendors:write` scope required).**

**Required scope**: `vendors:write`
**Returns**: `201 Created`

```bash
curl -X POST https://<your-instance>/api/v1/vendors \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme GmbH",
    "email": "security@acme.de",
    "serviceType": "CLOUD_PROVIDER"
  }'
```

**Request body** — all fields required:

| Field | Type | Constraints |
|---|---|---|
| `name` | `string` | 1–100 characters |
| `email` | `string` | Valid email address |
| `serviceType` | `string` | 1–100 characters |

**Response `data`** — the created vendor (HTTP 201):

```json
{
  "id": "clxxx...",
  "name": "Acme GmbH",
  "email": "security@acme.de",
  "serviceType": "CLOUD_PROVIDER",
  "createdAt": "2026-04-15T10:00:00.000Z",
  "updatedAt": "2026-04-15T10:00:00.000Z"
}
```

---

#### GET /api/v1/vendors/{id}

Fetch the full record for a single vendor, including compliance officer and DPO fields. Fields that have not been set are returned as `null`.

**Required scope**: `vendors:read`

**Response `data`**:

```json
{
  "id": "clxxx...",
  "name": "Acme GmbH",
  "email": "security@acme.de",
  "serviceType": "CLOUD_PROVIDER",
  "officialName": "Acme GmbH & Co. KG",
  "registrationId": "HRB 123456",
  "headquartersLocation": "Munich, Germany",
  "securityOfficerName": "Jane Doe",
  "securityOfficerEmail": "jane@acme.de",
  "dpoName": "Max Müller",
  "dpoEmail": "dpo@acme.de",
  "createdAt": "2026-04-01T08:00:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | CUID vendor identifier |
| `name` | `string` | Vendor display name |
| `email` | `string` | Vendor security contact email |
| `serviceType` | `string` | Category of service provided |
| `officialName` | `string \| null` | Legal registered name |
| `registrationId` | `string \| null` | Company registry number |
| `headquartersLocation` | `string \| null` | Headquarters address or city |
| `securityOfficerName` | `string \| null` | Name of the vendor's security officer |
| `securityOfficerEmail` | `string \| null` | Email of the vendor's security officer |
| `dpoName` | `string \| null` | Name of the vendor's Data Protection Officer |
| `dpoEmail` | `string \| null` | Email of the vendor's Data Protection Officer |
| `createdAt` | `string` (ISO 8601) | Creation timestamp |
| `updatedAt` | `string` (ISO 8601) | Last modification timestamp |

Returns `404 NOT_FOUND` if the vendor does not exist within your organisation.

---

#### PATCH /api/v1/vendors/{id}

Update one or more fields on an existing vendor. ⚡ **Premium only (`vendors:write` scope required).**

**Required scope**: `vendors:write`

At least one field must be provided. Pass only the fields you want to change — omitted fields are left unchanged. Pass `null` to clear an optional field.

**Request body** — all fields optional:

| Field | Type | Constraints |
|---|---|---|
| `name` | `string` | 1–100 characters |
| `email` | `string` | Valid email address |
| `serviceType` | `string` | 1–100 characters |
| `officialName` | `string \| null` | Max 200 characters |
| `registrationId` | `string \| null` | Max 100 characters |
| `headquartersLocation` | `string \| null` | Max 200 characters |
| `securityOfficerName` | `string \| null` | Max 200 characters |
| `securityOfficerEmail` | `string \| null` | Valid email, max 200 characters |
| `dpoName` | `string \| null` | Max 200 characters |
| `dpoEmail` | `string \| null` | Valid email, max 200 characters |

**Response `data`**: the full updated vendor record (same shape as [GET /api/v1/vendors/{id}](#get-apiv1vendorsid)).

Returns `404 NOT_FOUND` if the vendor does not exist within your organisation.

---

### Assessments

#### GET /api/v1/assessments

List all assessments in your organisation, ordered by creation date (newest first). Each item embeds the vendor's name.

**Required scope**: `assessments:read`

```bash
curl https://<your-instance>/api/v1/assessments \
  -H "Authorization: Bearer <api_key>"
```

**Response `data`** — array of assessment objects:

```json
[
  {
    "id": "clyyy...",
    "vendorId": "clxxx...",
    "status": "IN_REVIEW",
    "riskLevel": "HIGH",
    "complianceScore": 64,
    "lastAssessmentDate": "2026-04-10T00:00:00.000Z",
    "createdAt": "2026-03-01T08:00:00.000Z",
    "updatedAt": "2026-04-10T12:00:00.000Z",
    "vendor": { "name": "Acme GmbH" }
  }
]
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | CUID assessment identifier |
| `vendorId` | `string` | CUID of the associated vendor |
| `status` | `"PENDING" \| "IN_REVIEW" \| "COMPLETED"` | Current review status |
| `riskLevel` | `"LOW" \| "MEDIUM" \| "HIGH"` | Assigned risk classification |
| `complianceScore` | `integer` (0–100) | NIS2 compliance score |
| `lastAssessmentDate` | `string` (ISO 8601) `\| null` | Date of last completed review |
| `createdAt` | `string` (ISO 8601) | Creation timestamp |
| `updatedAt` | `string` (ISO 8601) | Last modification timestamp |
| `vendor.name` | `string` | Name of the associated vendor |

---

#### POST /api/v1/assessments

Create a new assessment for a vendor. ⚡ **Premium only (`assessments:write` scope required).**

**Required scope**: `assessments:write`
**Returns**: `201 Created`

**Request body**:

| Field | Type | Required | Constraints |
|---|---|---|---|
| `vendorId` | `string` | **Yes** | CUID of an existing vendor in your organisation |
| `riskLevel` | `"LOW" \| "MEDIUM" \| "HIGH"` | No | Defaults to server-side handling |
| `complianceScore` | `integer` | No | 0–100; defaults to `0` |
| `status` | `"PENDING" \| "IN_REVIEW" \| "COMPLETED"` | No | Defaults to `"PENDING"` |

```json
{
  "vendorId": "clxxx...",
  "riskLevel": "HIGH",
  "complianceScore": 0,
  "status": "PENDING"
}
```

**Response `data`**: the created assessment (same shape as a list item from [GET /api/v1/assessments](#get-apiv1assessments)).

---

#### GET /api/v1/assessments/{id}

Fetch a single assessment with its full detail. Embeds both vendor name and email (the list endpoint embeds name only).

**Required scope**: `assessments:read`

**Response `data`**:

```json
{
  "id": "clyyy...",
  "vendorId": "clxxx...",
  "status": "COMPLETED",
  "riskLevel": "HIGH",
  "complianceScore": 72,
  "lastAssessmentDate": "2026-04-10T00:00:00.000Z",
  "createdAt": "2026-03-01T08:00:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z",
  "vendor": {
    "name": "Acme GmbH",
    "email": "security@acme.de"
  }
}
```

Returns `404 NOT_FOUND` if the assessment does not exist within your organisation.

---

#### PATCH /api/v1/assessments/{id}/risk-status

Update the risk level and/or review status of an existing assessment. ⚡ **Premium only (`assessments:write` scope required).**

**Required scope**: `assessments:write`

At least one of `status` or `riskLevel` must be provided.

**Request body**:

| Field | Type | Description |
|---|---|---|
| `status` | `"PENDING" \| "IN_REVIEW" \| "COMPLETED"` | New review status |
| `riskLevel` | `"LOW" \| "MEDIUM" \| "HIGH"` | New risk classification |

```json
{
  "status": "COMPLETED",
  "riskLevel": "HIGH"
}
```

**Response `data`**:

```json
{
  "id": "clyyy...",
  "vendorId": "clxxx...",
  "status": "COMPLETED",
  "riskLevel": "HIGH",
  "complianceScore": 72,
  "updatedAt": "2026-04-15T11:00:00.000Z"
}
```

Returns `404 NOT_FOUND` if the assessment does not exist within your organisation.

---

### Metrics

#### GET /api/v1/metrics

Return usage statistics for all API keys in your organisation. Useful for monitoring API consumption and auditing key access patterns.

**Required scope**: `metrics:read`

```bash
curl https://<your-instance>/api/v1/metrics \
  -H "Authorization: Bearer <api_key>"
```

**Response `data`**:

```json
{
  "apiKeys": [
    {
      "id": "clzzz...",
      "name": "CI pipeline",
      "keyPrefix": "vs_live_abc",
      "scopes": ["vendors:read", "assessments:read"],
      "usageCount": 4840,
      "lastUsedAt": "2026-04-15T08:30:00.000Z",
      "isActive": true,
      "createdAt": "2026-03-01T00:00:00.000Z"
    }
  ],
  "totalRequests": 4840,
  "activeKeys": 1,
  "totalKeys": 1
}
```

| Field | Type | Description |
|---|---|---|
| `apiKeys` | `array` | One entry per API key in the organisation |
| `apiKeys[].id` | `string` | CUID of the API key record |
| `apiKeys[].name` | `string` | Human-readable label set at creation |
| `apiKeys[].keyPrefix` | `string` | First characters of the key (safe to log) |
| `apiKeys[].scopes` | `string[]` | Scopes granted to this key |
| `apiKeys[].usageCount` | `integer` | Total successful requests attributed to this key |
| `apiKeys[].lastUsedAt` | `string` (ISO 8601) `\| null` | Timestamp of the most recent request |
| `apiKeys[].isActive` | `boolean` | Whether the key is currently enabled |
| `apiKeys[].createdAt` | `string` (ISO 8601) | When the key was created |
| `totalRequests` | `integer` | Sum of `usageCount` across all keys |
| `activeKeys` | `integer` | Number of keys where `isActive` is `true` |
| `totalKeys` | `integer` | Total number of API key records in the organisation |

> **Note**: The full API key value is never returned by any endpoint. Only the non-sensitive `keyPrefix` is exposed.

---

## GDPR Considerations

All API responses are **tenant-isolated** — a key can only access resources belonging to its own organisation. Resource identifiers use opaque CUIDs rather than sequential integers.

Vendor records include personal data fields (security officer email, DPO email, and general security contact email) that were entered and are controlled by your organisation. Treat API responses containing these fields according to your data processing agreements and applicable law. You are the data controller for this information.

No Venshield internal user accounts, display names, or session identifiers are returned by any `/api/v1` endpoint.

Usage logs for API keys (`WEBHOOK_DELIVERY_ATTEMPTED` equivalent: `ApiKeyUsageLog`) are retained for **90 days** and are accessible via the Audit Trail to Admins and Auditors.
