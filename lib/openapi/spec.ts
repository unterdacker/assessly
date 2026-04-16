import "server-only";

/**
 * OpenAPI 3.1 Specification for VenShield REST API
 *
 * This spec documents all /api/v1/* endpoints with full request/response schemas
 * and security requirements. Served at /api/v1/openapi.json with interactive
 * docs at /api/v1/docs (Swagger UI).
 */

type OpenAPISpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  security: Array<Record<string, string[]>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
  paths: Record<string, Record<string, unknown>>;
};

export const openapiSpec: OpenAPISpec = {
  openapi: "3.1.0",
  info: {
    title: "VenShield API",
    version: "1.0.0",
    description:
      "VenShield Third-Party Risk Management REST API. All endpoints require Bearer authentication with a valid API key (prefix `vs_live_`, 72 characters). Obtain API keys from Settings → API Keys in the VenShield dashboard.",
  },
  servers: [
    {
      url: "/api/v1",
      description: "VenShield REST API v1",
    },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "vs_live_<token> (72 characters)",
        description: "API key obtained from Settings → API Keys in the VenShield dashboard",
      },
    },
    schemas: {
      RiskLevel: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH"],
        description: "Risk assessment level",
      },
      AssessmentStatus: {
        type: "string",
        enum: ["PENDING", "IN_REVIEW", "COMPLETED"],
        description: "Assessment workflow status",
      },
      Vendor: {
        type: "object",
        required: ["id", "name", "email", "serviceType", "createdAt", "updatedAt"],
        properties: {
          id: {
            type: "string",
            description: "Unique vendor identifier (CUID)",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          name: {
            type: "string",
            description: "Vendor name",
            example: "Acme Cloud Services",
          },
          email: {
            type: "string",
            format: "email",
            description: "PII — vendor contact email",
            example: "contact@example.com",
          },
          serviceType: {
            type: "string",
            description: "Type of service provided",
            example: "Cloud Storage",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
        },
      },
      VendorDetail: {
        type: "object",
        required: ["id", "name", "email", "serviceType", "createdAt", "updatedAt"],
        properties: {
          id: {
            type: "string",
            description: "Unique vendor identifier (CUID)",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          name: {
            type: "string",
            description: "Vendor name",
            example: "Acme Cloud Services",
          },
          email: {
            type: "string",
            format: "email",
            description: "PII — vendor contact email",
            example: "contact@example.com",
          },
          serviceType: {
            type: "string",
            description: "Type of service provided",
            example: "Cloud Storage",
          },
          officialName: {
            type: "string",
            nullable: true,
            description: "Official registered business name",
            example: "Acme Cloud Services Inc.",
          },
          registrationId: {
            type: "string",
            nullable: true,
            description: "Business registration or tax ID",
            example: "12-3456789",
          },
          headquartersLocation: {
            type: "string",
            nullable: true,
            description: "Primary business location",
            example: "San Francisco, CA",
          },
          securityOfficerName: {
            type: "string",
            nullable: true,
            description: "Name of designated security officer",
            example: "Jane Smith",
          },
          securityOfficerEmail: {
            type: "string",
            format: "email",
            nullable: true,
            description: "PII — security officer contact email",
            example: "security@example.com",
          },
          dpoName: {
            type: "string",
            nullable: true,
            description: "Data Protection Officer name",
            example: "John Doe",
          },
          dpoEmail: {
            type: "string",
            format: "email",
            nullable: true,
            description: "PII — DPO contact email",
            example: "dpo@example.com",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
        },
      },
      VendorCreateInput: {
        type: "object",
        required: ["name", "email", "serviceType"],
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            description: "Vendor name",
            example: "Acme Cloud Services",
          },
          email: {
            type: "string",
            format: "email",
            description: "Vendor contact email",
            example: "contact@example.com",
          },
          serviceType: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            description: "Type of service provided",
            example: "Cloud Storage",
          },
        },
      },
      VendorUpdateInput: {
        type: "object",
        description:
          "All fields are optional, but at least one must be provided. Use null to clear optional fields.",
        properties: {
          name: {
            type: "string",
            maxLength: 100,
            description: "Vendor name",
            example: "Updated Vendor Name",
          },
          email: {
            type: "string",
            format: "email",
            description: "Vendor contact email",
            example: "newemail@example.com",
          },
          serviceType: {
            type: "string",
            maxLength: 100,
            description: "Type of service provided",
            example: "Cloud Computing",
          },
          officialName: {
            type: "string",
            nullable: true,
            maxLength: 200,
            description: "Official registered business name",
            example: "Acme Cloud Services Inc.",
          },
          registrationId: {
            type: "string",
            nullable: true,
            maxLength: 100,
            description: "Business registration or tax ID",
            example: "12-3456789",
          },
          headquartersLocation: {
            type: "string",
            nullable: true,
            maxLength: 200,
            description: "Primary business location",
            example: "San Francisco, CA",
          },
          securityOfficerName: {
            type: "string",
            nullable: true,
            maxLength: 200,
            description: "Name of designated security officer",
            example: "Jane Smith",
          },
          securityOfficerEmail: {
            type: "string",
            format: "email",
            nullable: true,
            maxLength: 200,
            description: "Security officer contact email",
            example: "security@example.com",
          },
          dpoName: {
            type: "string",
            nullable: true,
            maxLength: 200,
            description: "Data Protection Officer name",
            example: "John Doe",
          },
          dpoEmail: {
            type: "string",
            format: "email",
            nullable: true,
            maxLength: 200,
            description: "DPO contact email",
            example: "dpo@example.com",
          },
        },
      },
      VendorUpdateResponse: {
        type: "object",
        required: [
          "id",
          "name",
          "email",
          "serviceType",
          "officialName",
          "registrationId",
          "headquartersLocation",
          "updatedAt",
        ],
        properties: {
          id: {
            type: "string",
            description: "Unique vendor identifier (CUID)",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          name: {
            type: "string",
            example: "Updated Vendor Name",
          },
          email: {
            type: "string",
            format: "email",
            example: "newemail@example.com",
          },
          serviceType: {
            type: "string",
            example: "Cloud Computing",
          },
          officialName: {
            type: "string",
            nullable: true,
            example: "Acme Cloud Services Inc.",
          },
          registrationId: {
            type: "string",
            nullable: true,
            example: "12-3456789",
          },
          headquartersLocation: {
            type: "string",
            nullable: true,
            example: "San Francisco, CA",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
        },
      },
      Assessment: {
        type: "object",
        required: [
          "id",
          "vendorId",
          "status",
          "riskLevel",
          "complianceScore",
          "lastAssessmentDate",
          "createdAt",
          "updatedAt",
          "vendor",
        ],
        properties: {
          id: {
            type: "string",
            description: "Unique assessment identifier (CUID)",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          vendorId: {
            type: "string",
            description: "Associated vendor ID",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          status: {
            $ref: "#/components/schemas/AssessmentStatus",
          },
          riskLevel: {
            $ref: "#/components/schemas/RiskLevel",
          },
          complianceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Overall compliance score (0-100)",
            example: 85,
          },
          lastAssessmentDate: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Date of most recent assessment",
            example: "2025-01-15T10:30:00.000Z",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          vendor: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
                example: "Acme Cloud Services",
              },
            },
          },
        },
      },
      AssessmentDetail: {
        type: "object",
        required: [
          "id",
          "vendorId",
          "status",
          "riskLevel",
          "complianceScore",
          "lastAssessmentDate",
          "createdAt",
          "updatedAt",
          "vendor",
        ],
        properties: {
          id: {
            type: "string",
            description: "Unique assessment identifier (CUID)",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          vendorId: {
            type: "string",
            description: "Associated vendor ID",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          status: {
            $ref: "#/components/schemas/AssessmentStatus",
          },
          riskLevel: {
            $ref: "#/components/schemas/RiskLevel",
          },
          complianceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Overall compliance score (0-100)",
            example: 85,
          },
          lastAssessmentDate: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Date of most recent assessment",
            example: "2025-01-15T10:30:00.000Z",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          vendor: {
            type: "object",
            required: ["name", "email"],
            properties: {
              name: {
                type: "string",
                example: "Acme Cloud Services",
              },
              email: {
                type: "string",
                format: "email",
                description: "PII — vendor contact email",
                example: "contact@example.com",
              },
            },
          },
        },
      },
      AssessmentCreateInput: {
        type: "object",
        required: ["vendorId", "riskLevel"],
        properties: {
          vendorId: {
            type: "string",
            description: "CUID of an existing vendor",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          riskLevel: {
            $ref: "#/components/schemas/RiskLevel",
          },
          complianceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "Initial compliance score (defaults to 0)",
            example: 0,
          },
          status: {
            $ref: "#/components/schemas/AssessmentStatus",
            description: "Initial status (defaults to PENDING)",
          },
        },
      },
      AssessmentCreateResponse: {
        type: "object",
        required: [
          "id",
          "vendorId",
          "status",
          "riskLevel",
          "complianceScore",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: {
            type: "string",
            description: "Unique assessment identifier (CUID)",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          vendorId: {
            type: "string",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          status: {
            $ref: "#/components/schemas/AssessmentStatus",
          },
          riskLevel: {
            $ref: "#/components/schemas/RiskLevel",
          },
          complianceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            example: 0,
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
        },
      },
      RiskStatusUpdateInput: {
        type: "object",
        description: "At least one of status or riskLevel must be provided",
        properties: {
          status: {
            $ref: "#/components/schemas/AssessmentStatus",
          },
          riskLevel: {
            $ref: "#/components/schemas/RiskLevel",
          },
        },
      },
      RiskStatusUpdateResponse: {
        type: "object",
        required: ["id", "vendorId", "status", "riskLevel", "complianceScore", "updatedAt"],
        properties: {
          id: {
            type: "string",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          vendorId: {
            type: "string",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          status: {
            $ref: "#/components/schemas/AssessmentStatus",
          },
          riskLevel: {
            $ref: "#/components/schemas/RiskLevel",
          },
          complianceScore: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            example: 85,
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
        },
      },
      ApiKey: {
        type: "object",
        required: [
          "id",
          "name",
          "keyPrefix",
          "scopes",
          "usageCount",
          "lastUsedAt",
          "isActive",
          "createdAt",
        ],
        properties: {
          id: {
            type: "string",
            example: "clxxxxxxxxxxxxxxxxxx",
          },
          name: {
            type: "string",
            example: "Production API Key",
          },
          keyPrefix: {
            type: "string",
            description: "First characters of the key for identification",
            example: "vs_live_abc",
          },
          scopes: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Granted permission scopes",
            example: ["vendors:read", "vendors:write", "assessments:read"],
          },
          usageCount: {
            type: "integer",
            description: "Total number of requests made with this key",
            example: 1234,
          },
          lastUsedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Most recent usage timestamp",
            example: "2025-01-15T10:30:00.000Z",
          },
          isActive: {
            type: "boolean",
            description: "Whether the key is currently active",
            example: true,
          },
          createdAt: {
            type: "string",
            format: "date-time",
            example: "2025-01-15T10:30:00.000Z",
          },
        },
      },
      Metrics: {
        type: "object",
        required: ["apiKeys", "totalRequests", "activeKeys", "totalKeys"],
        properties: {
          apiKeys: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ApiKey",
            },
          },
          totalRequests: {
            type: "integer",
            description: "Total requests across all API keys",
            example: 5678,
          },
          activeKeys: {
            type: "integer",
            description: "Number of active API keys",
            example: 3,
          },
          totalKeys: {
            type: "integer",
            description: "Total number of API keys",
            example: 5,
          },
        },
      },
      ErrorDetail: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            description: "Machine-readable error code",
            example: "INVALID_API_KEY",
          },
          message: {
            type: "string",
            description: "Human-readable error message",
            example: "The provided API key is invalid or expired",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["data", "error"],
        properties: {
          data: {
            type: "null",
          },
          error: {
            $ref: "#/components/schemas/ErrorDetail",
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication failed — invalid or missing API key",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            example: {
              data: null,
              error: {
                code: "INVALID_API_KEY",
                message: "The provided API key is invalid or expired",
              },
            },
          },
        },
      },
      Forbidden: {
        description: "Insufficient permissions or premium feature required",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              insufficientScope: {
                summary: "Missing required scope",
                value: {
                  data: null,
                  error: {
                    code: "INSUFFICIENT_SCOPE",
                    message: "API key lacks required scope: vendors:write",
                  },
                },
              },
              premiumRequired: {
                summary: "Premium feature",
                value: {
                  data: null,
                  error: {
                    code: "PREMIUM_REQUIRED",
                    message: "This operation requires a Premium subscription",
                  },
                },
              },
            },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Vendor not found",
              },
            },
          },
        },
      },
      Conflict: {
        description: "Resource conflict — duplicate or constraint violation",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            example: {
              data: null,
              error: {
                code: "ASSESSMENT_EXISTS",
                message: "An assessment already exists for this vendor",
              },
            },
          },
        },
      },
      UnprocessableEntity: {
        description: "Validation error — invalid request body",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            example: {
              data: null,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid email format",
              },
            },
          },
        },
      },
      RateLimit: {
        description: "Rate limit exceeded — too many requests",
        headers: {
          "Retry-After": {
            description: "Number of seconds to wait before retrying",
            schema: {
              type: "integer",
              example: 60,
            },
          },
        },
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            example: {
              data: null,
              error: {
                code: "RATE_LIMIT_EXCEEDED",
                message: "Too many requests",
              },
            },
          },
        },
      },
      InternalError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            example: {
              data: null,
              error: {
                code: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
              },
            },
          },
        },
      },
    },
  },
  paths: {
    "/vendors": {
      get: {
        operationId: "listVendors",
        tags: ["Vendors"],
        summary: "List all vendors",
        description: "Returns a list of all vendors visible to the authenticated organization. Requires `vendors:read` scope.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Successfully retrieved vendor list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Vendor",
                      },
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      post: {
        operationId: "createVendor",
        tags: ["Vendors"],
        summary: "Create a new vendor",
        description:
          "Creates a new vendor record. Requires `vendors:write` scope and Premium subscription.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/VendorCreateInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Vendor created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/Vendor",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/UnprocessableEntity",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
          "415": {
            description: "Unsupported media type — Content-Type must be application/json",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
    "/vendors/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Unique vendor identifier (CUID)",
          schema: {
            type: "string",
          },
        },
      ],
      get: {
        operationId: "getVendor",
        tags: ["Vendors"],
        summary: "Get vendor details",
        description:
          "Returns detailed information about a specific vendor, including optional fields. Requires `vendors:read` scope.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Successfully retrieved vendor details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/VendorDetail",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      patch: {
        operationId: "updateVendor",
        tags: ["Vendors"],
        summary: "Update vendor information",
        description:
          "Updates vendor details. All fields are optional; at least one must be provided. Requires `vendors:write` scope and Premium subscription.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/VendorUpdateInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Vendor updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/VendorUpdateResponse",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/UnprocessableEntity",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "415": {
            description: "Unsupported media type — Content-Type must be application/json",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
    "/assessments": {
      get: {
        operationId: "listAssessments",
        tags: ["Assessments"],
        summary: "List all assessments",
        description:
          "Returns a list of all assessments for the authenticated organization. Requires `assessments:read` scope.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Successfully retrieved assessment list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Assessment",
                      },
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      post: {
        operationId: "createAssessment",
        tags: ["Assessments"],
        summary: "Create a new assessment",
        description:
          "Creates a new assessment for a vendor. Only one assessment per vendor is allowed. Requires `assessments:write` scope and Premium subscription.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AssessmentCreateInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Assessment created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/AssessmentCreateResponse",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/UnprocessableEntity",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
          "415": {
            description: "Unsupported media type — Content-Type must be application/json",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
    "/assessments/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Unique assessment identifier (CUID)",
          schema: {
            type: "string",
          },
        },
      ],
      get: {
        operationId: "getAssessment",
        tags: ["Assessments"],
        summary: "Get assessment details",
        description:
          "Returns detailed information about a specific assessment. Requires `assessments:read` scope.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Successfully retrieved assessment details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/AssessmentDetail",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
    "/assessments/{id}/risk-status": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Unique assessment identifier (CUID)",
          schema: {
            type: "string",
          },
        },
      ],
      patch: {
        operationId: "updateRiskStatus",
        tags: ["Assessments"],
        summary: "Update assessment risk status",
        description:
          "Updates the risk level and/or status of an assessment. At least one field must be provided. Requires `assessments:write` scope and Premium subscription.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RiskStatusUpdateInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Risk status updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/RiskStatusUpdateResponse",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/UnprocessableEntity",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "415": {
            description: "Unsupported media type — Content-Type must be application/json",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
    "/metrics": {
      get: {
        operationId: "getMetrics",
        tags: ["Metrics"],
        summary: "Get API usage metrics",
        description:
          "Returns API usage statistics and key information for the authenticated organization. Requires `metrics:read` scope.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Successfully retrieved metrics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "error"],
                  properties: {
                    data: {
                      $ref: "#/components/schemas/Metrics",
                    },
                    error: {
                      type: "null",
                    },
                  },
                },
              },
            },
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "429": {
            $ref: "#/components/responses/RateLimit",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },
  },
};
