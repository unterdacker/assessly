/**
 * AVRA vendor invite email template.
 *
 * Produces a subject line and a table-based HTML body suitable for all
 * major email clients including Outlook (which does not support flexbox/grid).
 *
 * Design: minimalist "Enterprise" — white card on light-slate background,
 * indigo primary button, emerald access-code badge.
 */

export type VendorInviteEmailProps = {
  /** UI locale: "en" | "de" — controls subject + body copy. */
  locale: string;
  /** The inviting organisation's display name. */
  companyName: string;
  /** The vendor company being invited. */
  vendorName: string;
  /** Pre-generated access code, e.g. "ABCD-1234". */
  accessCode: string;
  /** Full URL to the external vendor portal. */
  portalUrl: string;
};

export type VendorInviteEmailResult = {
  subject: string;
  html: string;
};

// ─── Copy catalogue ─────────────────────────────────────────────────────────

type EmailCopy = {
  subject: string;
  /** Use {vendorName} as placeholder */
  greeting: string;
  /** Use {companyName} as placeholder */
  intro: string;
  steps: [string, string, string];
  securityNote: string;
  codeLabel: string;
  buttonLabel: string;
  /** Use {companyName} as placeholder */
  footer: string;
  poweredBy: string;
};

const copy: Record<string, EmailCopy> = {
  en: {
    subject: "You have been invited to complete a NIS2 Security Assessment",
    greeting: "Dear {vendorName} Security Team,",
    intro:
      "{companyName} has invited you to complete a NIS2-aligned supply chain security assessment. " +
      "Please follow the steps below to access your secure assessment portal.",
    steps: [
      "Click the button below or copy the portal link into your browser.",
      "Enter your unique Access Code when prompted.",
      "Complete the questionnaire and upload any supporting evidence.",
    ],
    securityNote:
      "Your temporary login password was sent separately via SMS for security reasons. " +
      "You will be required to change it immediately upon first login. " +
      "The two credentials are intentionally delivered through different channels.",
    codeLabel: "Your Access Code",
    buttonLabel: "Open Assessment Portal",
    footer:
      "This invitation was sent on behalf of {companyName}. " +
      "If you did not expect this, you can safely ignore this email.",
    poweredBy: "Powered by AVRA — Automated Vendor Risk Assessment",
  },
  de: {
    subject:
      "Sie wurden zur Teilnahme an einer NIS2-Sicherheitsbewertung eingeladen",
    greeting: "Sehr geehrtes Sicherheitsteam von {vendorName},",
    intro:
      "{companyName} lädt Sie ein, eine NIS2-konforme Sicherheitsbewertung der Lieferkette abzuschließen. " +
      "Bitte folgen Sie den nachstehenden Schritten, um auf Ihr sicheres Bewertungsportal zuzugreifen.",
    steps: [
      "Klicken Sie auf die Schaltfläche unten oder kopieren Sie den Portal-Link in Ihren Browser.",
      "Geben Sie Ihren einmaligen Zugangscode ein, wenn Sie dazu aufgefordert werden.",
      "Füllen Sie den Fragebogen aus und laden Sie gegebenenfalls unterstützende Nachweise hoch.",
    ],
    securityNote:
      "Ihr temporäres Anmeldepasswort wurde aus Sicherheitsgründen separat per SMS übermittelt. " +
      "Sie werden beim ersten Login aufgefordert, das Passwort sofort zu ändern. " +
      "Die zwei Zugangsdaten werden bewusst über unterschiedliche Kanäle zugestellt.",
    codeLabel: "Ihr Zugangscode",
    buttonLabel: "Bewertungsportal öffnen",
    footer:
      "Diese Einladung wurde im Auftrag von {companyName} versendet. " +
      "Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.",
    poweredBy: "Bereitgestellt von AVRA — Automated Vendor Risk Assessment",
  },
};

function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ─── Template builder ────────────────────────────────────────────────────────

export function buildVendorInviteEmail(
  props: VendorInviteEmailProps,
): VendorInviteEmailResult {
  const { locale, companyName, vendorName, accessCode, portalUrl } = props;

  // Fall back to English if locale is not translated
  const c = copy[locale] ?? copy.en;
  const vars = { companyName, vendorName };

  const subject = c.subject;
  const greeting = interpolate(c.greeting, vars);
  const intro = interpolate(c.intro, vars);
  const footer = interpolate(c.footer, vars);

  const [step1, step2, step3] = c.steps;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${locale}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
  style="background-color:#f1f5f9;padding:32px 16px;">
  <tr>
    <td align="center">

      <!-- Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="600"
        style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;
               border:1px solid #e2e8f0;overflow:hidden;">

        <!-- Header band -->
        <tr>
          <td style="background-color:#4f46e5;padding:24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;
                             letter-spacing:0.05em;">AVRA</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#c7d2fe;
                             letter-spacing:0.08em;text-transform:uppercase;">
                    Vendor Risk Assessment
                  </p>
                </td>
                <td align="right">
                  <p style="margin:0;font-size:11px;color:#a5b4fc;">
                    NIS2 &amp; ISO&nbsp;27001
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">

            <!-- Greeting -->
            <p style="margin:0 0 16px;font-size:15px;color:#1e293b;line-height:1.5;">
              ${escapeHtml(greeting)}
            </p>

            <!-- Intro -->
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              ${escapeHtml(intro)}
            </p>

            <!-- Steps -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
              style="margin-bottom:24px;">
              ${[step1, step2, step3]
                .map(
                  (step, i) => `
              <tr>
                <td width="36" valign="top"
                  style="padding:0 12px 12px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:26px;height:26px;border-radius:50%;
                                 background-color:#eef2ff;text-align:center;
                                 vertical-align:middle;">
                        <span style="font-size:12px;font-weight:bold;color:#4f46e5;">
                          ${i + 1}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="padding-bottom:12px;font-size:13px;color:#475569;line-height:1.5;">
                  ${escapeHtml(step)}
                </td>
              </tr>`,
                )
                .join("")}
            </table>

            <!-- Access Code badge -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
              style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#f0fdf4;border:2px solid #bbf7d0;
                           border-radius:8px;padding:20px 24px;text-align:center;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:bold;
                             color:#15803d;letter-spacing:0.1em;text-transform:uppercase;">
                    ${escapeHtml(c.codeLabel)}
                  </p>
                  <p style="margin:0;font-size:28px;font-weight:bold;
                             color:#166534;letter-spacing:0.2em;font-family:monospace;">
                    ${escapeHtml(accessCode)}
                  </p>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
              style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                    href="${escapeAttr(portalUrl)}"
                    style="height:44px;v-text-anchor:middle;width:260px;"
                    arcsize="15%" fillcolor="#4f46e5" stroke="f">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;
                                   font-size:14px;font-weight:bold;">
                      ${escapeHtml(c.buttonLabel)}
                    </center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${escapeAttr(portalUrl)}"
                    style="display:inline-block;background-color:#4f46e5;
                           color:#ffffff;font-size:14px;font-weight:bold;
                           text-decoration:none;padding:12px 32px;
                           border-radius:6px;letter-spacing:0.02em;">
                    ${escapeHtml(c.buttonLabel)}
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>

            <!-- Portal URL (plain text fallback) -->
            <p style="margin:0 0 24px;font-size:12px;color:#94a3b8;
                       word-break:break-all;text-align:center;">
              ${escapeHtml(portalUrl)}
            </p>

            <!-- Security note -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
              style="margin-bottom:8px;">
              <tr>
                <td style="background-color:#fffbeb;border-left:4px solid #f59e0b;
                           border-radius:0 6px 6px 0;padding:12px 16px;">
                  <p style="margin:0;font-size:12px;color:#78350f;line-height:1.5;">
                    <strong>&#9888;&#65039; Security:</strong>
                    ${escapeHtml(c.securityNote)}
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;
                     padding:20px 32px;">
            <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;line-height:1.5;">
              ${escapeHtml(footer)}
            </p>
            <p style="margin:0;font-size:10px;color:#cbd5e1;">
              ${escapeHtml(c.poweredBy)}
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;

  return { subject, html };
}

// ─── Security helpers ────────────────────────────────────────────────────────

/** Escape untrusted content before embedding in HTML text nodes. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape untrusted content before embedding in HTML attribute values. */
function escapeAttr(str: string): string {
  // Reject javascript: / data: URIs to prevent XSS via href
  if (/^(javascript|data|vbscript):/i.test(str.trim())) {
    return "#";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
