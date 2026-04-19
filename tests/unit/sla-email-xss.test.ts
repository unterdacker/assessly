import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  sanitizeEmailHeader,
  sanitizeUrl,
  buildManualReminderHtml,
  buildPreReminderHtml,
  buildOverdueReminderHtml,
  buildEscalationHtml,
} from "@/modules/sla-tracking/lib/email-templates";

describe("escapeHtml", () => {
  it("escapes script tags", () => {
    const input = "<script>alert('xss')</script>";
    const output = escapeHtml(input);
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("'");
    expect(output).toContain("&lt;script&gt;");
    expect(output).toContain("&lt;/script&gt;");
  });

  it("escapes angle brackets", () => {
    const input = "<div>test</div>";
    const output = escapeHtml(input);
    expect(output).toBe("&lt;div&gt;test&lt;/div&gt;");
  });

  it("escapes ampersands", () => {
    const input = "A & B";
    const output = escapeHtml(input);
    expect(output).toBe("A &amp; B");
  });

  it("escapes double quotes", () => {
    const input = 'Hello "world"';
    const output = escapeHtml(input);
    expect(output).toBe("Hello &quot;world&quot;");
  });

  it("escapes single quotes", () => {
    const input = "It's a test";
    const output = escapeHtml(input);
    expect(output).not.toContain("'");
    // Should contain either &#039; or &apos; or &#x27; (all valid)
    expect(output.includes("&#039;") || output.includes("&apos;") || output.includes("&#x27;")).toBe(true);
  });

  it("escapes complex XSS payload", () => {
    const input = '"><img src=x onerror=alert(1)>';
    const output = escapeHtml(input);
    expect(output).not.toContain("<img");
    expect(output).toContain("&lt;img");
  });
});

describe("sanitizeUrl", () => {
  it("allows https URLs", () => {
    const input = "https://safe.com";
    const output = sanitizeUrl(input);
    expect(output).toBe("https://safe.com");
  });

  it("allows http URLs", () => {
    const input = "http://safe.com/path?q=1";
    const output = sanitizeUrl(input);
    expect(output).toBe("http://safe.com/path?q=1");
  });

  it("blocks javascript: protocol", () => {
    const input = "javascript:alert(1)";
    const output = sanitizeUrl(input);
    expect(output).toBe("#");
  });

  it("blocks ftp: protocol", () => {
    const input = "ftp://file.server";
    const output = sanitizeUrl(input);
    expect(output).toBe("#");
  });

  it("blocks data: protocol", () => {
    const input = "data:text/html,<script>alert(1)</script>";
    const output = sanitizeUrl(input);
    expect(output).toBe("#");
  });

  it("returns # for invalid URLs", () => {
    const input = "not a url";
    const output = sanitizeUrl(input);
    expect(output).toBe("#");
  });
});

describe("sanitizeEmailHeader", () => {
  it("strips carriage return and newline characters", () => {
    const input = "Subject\r\nBcc: evil@hacker.com";
    const output = sanitizeEmailHeader(input);
    expect(output).not.toContain("\r");
    expect(output).not.toContain("\n");
    expect(output).toBe("SubjectBcc: evil@hacker.com");
  });

  it("truncates to 200 characters", () => {
    const input = "A".repeat(300);
    const output = sanitizeEmailHeader(input);
    expect(output.length).toBe(200);
  });

  it("handles empty strings", () => {
    const output = sanitizeEmailHeader("");
    expect(output).toBe("");
  });
});

describe("buildManualReminderHtml XSS prevention", () => {
  it("escapes XSS in vendorName", () => {
    const html = buildManualReminderHtml({
      vendorName: "<script>alert(1)</script>",
      companyName: "Safe Company",
      assessmentUrl: "https://example.com/assessment",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/script&gt;");
  });

  it("escapes XSS in companyName", () => {
    const html = buildManualReminderHtml({
      vendorName: "Safe Vendor",
      companyName: '"><img src=x onerror=alert(1)>',
      assessmentUrl: "https://example.com/assessment",
    });

    expect(html).not.toContain('"><img src=x onerror=alert(1)>');
    expect(html).toContain("&lt;img");
  });

  it("prevents URL injection in assessmentUrl", () => {
    const html = buildManualReminderHtml({
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      assessmentUrl: "javascript:alert(1)",
    });

    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });

  it("handles all fields with XSS payloads", () => {
    const html = buildManualReminderHtml({
      vendorName: "<b>Vendor</b>",
      companyName: "<i>Company</i>",
      assessmentUrl: "https://example.com/<script>",
    });

    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&lt;i&gt;");
  });
});

describe("buildPreReminderHtml XSS prevention", () => {
  it("escapes all interpolated fields", () => {
    const html = buildPreReminderHtml({
      vendorName: "<script>alert('vendor')</script>",
      companyName: "<script>alert('company')</script>",
      policyName: "<script>alert('policy')</script>",
      daysUntilDue: 3,
      assessmentUrl: "https://example.com/<xss>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sanitizes policyName field", () => {
    const html = buildPreReminderHtml({
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      policyName: '"><img src=x onerror=alert(1)>',
      daysUntilDue: 7,
      assessmentUrl: "https://example.com/assessment",
    });

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("handles numeric daysUntilDue safely", () => {
    const html = buildPreReminderHtml({
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      policyName: "Standard SLA",
      daysUntilDue: 999999,
      assessmentUrl: "https://example.com/assessment",
    });

    expect(html).toContain("999999");
  });

  it("prevents URL injection in assessmentUrl", () => {
    const html = buildPreReminderHtml({
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      policyName: "Standard SLA",
      daysUntilDue: 7,
      assessmentUrl: "javascript:void(0)",
    });

    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });
});

describe("buildOverdueReminderHtml XSS prevention", () => {
  it("escapes all interpolated fields", () => {
    const html = buildOverdueReminderHtml({
      vendorName: "<script>alert('vendor')</script>",
      companyName: "<script>alert('company')</script>",
      policyName: "<script>alert('policy')</script>",
      daysOverdue: 5,
      assessmentUrl: "https://example.com/<xss>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sanitizes daysOverdue display", () => {
    const html = buildOverdueReminderHtml({
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      policyName: "Standard SLA",
      daysOverdue: 10,
      assessmentUrl: "https://example.com/assessment",
    });

    expect(html).toContain("10");
  });

  it("prevents tag injection in all fields", () => {
    const html = buildOverdueReminderHtml({
      vendorName: "</div><script>alert(1)</script><div>",
      companyName: "</p><iframe src='evil.com'></iframe><p>",
      policyName: "</span><svg onload=alert(1)><span>",
      daysOverdue: 3,
      assessmentUrl: "https://example.com/test",
    });

    expect(html).not.toContain("</div><script>");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;/div&gt;");
    expect(html).toContain("&lt;iframe");
    expect(html).toContain("&lt;svg");
  });

  it("prevents URL injection in assessmentUrl", () => {
    const html = buildOverdueReminderHtml({
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      policyName: "Standard SLA",
      daysOverdue: 5,
      assessmentUrl: "javascript:void(0)",
    });

    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });
});

describe("buildEscalationHtml XSS prevention", () => {
  it("escapes all interpolated fields including escalationRecipientName", () => {
    const html = buildEscalationHtml({
      escalationRecipientName: "<script>alert('recipient')</script>",
      vendorName: "<script>alert('vendor')</script>",
      companyName: "<script>alert('company')</script>",
      policyName: "<script>alert('policy')</script>",
      daysOverdue: 14,
      assessmentUrl: "https://example.com/<xss>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sanitizes escalationRecipientName", () => {
    const html = buildEscalationHtml({
      escalationRecipientName: '"><img src=x onerror=alert(1)>',
      vendorName: "Safe Vendor",
      companyName: "Safe Company",
      policyName: "Standard SLA",
      daysOverdue: 14,
      assessmentUrl: "https://example.com/assessment",
    });

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("prevents XSS in all fields simultaneously", () => {
    const html = buildEscalationHtml({
      escalationRecipientName: "<b>Admin</b>",
      vendorName: "<i>Vendor</i>",
      companyName: "<u>Company</u>",
      policyName: "<em>Policy</em>",
      daysOverdue: 30,
      assessmentUrl: "https://example.com/<test>",
    });

    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<u>");
    expect(html).not.toContain("<em>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&lt;i&gt;");
    expect(html).toContain("&lt;u&gt;");
    expect(html).toContain("&lt;em&gt;");
  });

  it("sanitizes assessmentUrl to prevent javascript: protocol", () => {
    const html = buildEscalationHtml({
      escalationRecipientName: "Admin User",
      vendorName: "Test Vendor",
      companyName: "Test Company",
      policyName: "Standard SLA",
      daysOverdue: 14,
      assessmentUrl: "javascript:alert(document.cookie)",
    });

    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });
});

describe("XSS prevention comprehensive checks", () => {
  it("no template outputs literal <script> tags when given XSS payloads", () => {
    const xssPayload = "<script>alert(1)</script>";
    const params = {
      vendorName: xssPayload,
      companyName: xssPayload,
      policyName: xssPayload,
      assessmentUrl: "https://example.com",
      daysUntilDue: 7,
      daysOverdue: 14,
      escalationRecipientName: xssPayload,
    };

    const manualHtml = buildManualReminderHtml(params);
    const preHtml = buildPreReminderHtml(params);
    const overdueHtml = buildOverdueReminderHtml(params);
    const escalationHtml = buildEscalationHtml(params);

    expect(manualHtml).not.toContain("<script>");
    expect(preHtml).not.toContain("<script>");
    expect(overdueHtml).not.toContain("<script>");
    expect(escalationHtml).not.toContain("<script>");
  });

  it("all templates contain escaped equivalents", () => {
    const xssPayload = "<script>alert(1)</script>";
    const params = {
      vendorName: xssPayload,
      companyName: "Safe Company",
      policyName: "Standard SLA",
      assessmentUrl: "https://example.com",
      daysUntilDue: 7,
      daysOverdue: 14,
      escalationRecipientName: "Admin User",
    };

    const manualHtml = buildManualReminderHtml(params);
    const preHtml = buildPreReminderHtml(params);
    const overdueHtml = buildOverdueReminderHtml(params);
    const escalationHtml = buildEscalationHtml(params);

    expect(manualHtml).toContain("&lt;script&gt;");
    expect(preHtml).toContain("&lt;script&gt;");
    expect(overdueHtml).toContain("&lt;script&gt;");
    expect(escalationHtml).toContain("&lt;script&gt;");
  });
});
