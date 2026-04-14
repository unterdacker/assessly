/**
 * Venshield internal user invite email template.
 * Produced when an Admin creates a new Admin or Auditor account.
 */

export type UserInviteEmailProps = {
  locale: string;
  companyName: string;
  inviteUrl: string;
  recipientEmail: string;
};

export type UserInviteEmailResult = {
  subject: string;
  html: string;
};

type EmailCopy = {
  subject: string;
  greeting: string;
  intro: string;
  buttonLabel: string;
  expiryNote: string;
  footer: string;
  poweredBy: string;
};

const copy: Record<string, EmailCopy> = {
  en: {
    subject: "You've been invited to Venshield - set up your account",
    greeting: "You have been invited to join Venshield.",
    intro:
      "An administrator has created an account for you on the Venshield vendor risk assessment platform. " +
      "Click the button below to set up your password and activate your account.",
    buttonLabel: "Set Up My Account",
    expiryNote: "This link expires in 48 hours and can only be used once.",
    footer:
      "If you did not expect this invitation, you can safely ignore this email. No account will be active until the link is used.",
    poweredBy: "Powered by Venshield - Sovereign Vendor Risk Assessment",
  },
  de: {
    subject: "Sie wurden zu Venshield eingeladen - richten Sie Ihr Konto ein",
    greeting: "Sie wurden eingeladen, Venshield beizutreten.",
    intro:
      "Ein Administrator hat ein Konto fur Sie auf der Venshield-Plattform fur Lieferantenrisikobewertung erstellt. " +
      "Klicken Sie auf die Schaltflache unten, um Ihr Passwort festzulegen und Ihr Konto zu aktivieren.",
    buttonLabel: "Mein Konto einrichten",
    expiryNote: "Dieser Link lauft in 48 Stunden ab und kann nur einmal verwendet werden.",
    footer:
      "Falls Sie diese Einladung nicht erwartet haben, konnen Sie diese E-Mail ignorieren. Es wird kein Konto aktiviert, solange der Link nicht verwendet wird.",
    poweredBy: "Bereitgestellt von Venshield - Sovereign Vendor Risk Assessment",
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str: string): string {
  if (/^(javascript|data|vbscript):/i.test(str.trim())) return "#";
  return str
    .replace(/&/g, "&amp;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildUserInviteEmail(props: UserInviteEmailProps): UserInviteEmailResult {
  const { locale, companyName, inviteUrl } = props;
  const c = copy[locale] ?? copy.en;

  const subject = c.subject;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${locale}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
  style="background-color:#f1f5f9;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600"
        style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;
               border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="background-color:#4f46e5;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;
                       letter-spacing:0.05em;">Venshield</p>
            <p style="margin:4px 0 0;font-size:12px;color:#c7d2fe;
                       letter-spacing:0.08em;text-transform:uppercase;">
              Vendor Risk Assessment
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#1e293b;line-height:1.5;font-weight:bold;">
              ${escapeHtml(c.greeting)}
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              ${escapeHtml(c.intro)}
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
              style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${escapeAttr(inviteUrl)}"
                    style="display:inline-block;background-color:#4f46e5;
                           color:#ffffff;font-size:14px;font-weight:bold;
                           text-decoration:none;padding:12px 32px;
                           border-radius:6px;letter-spacing:0.02em;">
                    ${escapeHtml(c.buttonLabel)}
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:12px;color:#94a3b8;text-align:center;">
              ${escapeHtml(c.expiryNote)}
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="background-color:#fffbeb;border-left:4px solid #f59e0b;
                           border-radius:0 6px 6px 0;padding:12px 16px;">
                  <p style="margin:0;font-size:12px;color:#78350f;line-height:1.5;">
                    ${escapeHtml(c.footer)}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;">
            <p style="margin:0;font-size:10px;color:#cbd5e1;">
              ${escapeHtml(c.poweredBy)}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html };
}
