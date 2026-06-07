/**
 * Responsive HTML email shell — Tailwind-aligned tokens (#00B8B8 aqua, #0D4F4F heading, #FFF4DE cream).
 * Uses table layout + @media queries (email clients do not support Tailwind utility classes).
 */

const BRAND = {
  aqua: '#00B8B8',
  aquaDark: '#0D4F4F',
  aquaLight: '#7FE7DC',
  cream: '#FFF4DE',
  creamBorder: '#F6E6C2',
  body: '#334155',
  muted: '#64748b',
  violet: '#7C6EF0',
  violetBg: '#EEEDFE',
  green: '#059669',
  greenBg: '#ecfdf5',
};

const SUBTITLES = {
  neurohr: (org) => `${org} · NeuroHR AI`,
  hr: (org) => `${org} · Hiring Team`,
  agent: (org) => `${org} · HR Agent`,
};

function emailButton(href, label) {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" class="email-btn-wrap" style="margin:24px auto;width:100%;max-width:320px;">
  <tr>
    <td align="center" class="email-btn" style="border-radius:10px;background:${BRAND.aqua};">
      <a href="${href}" target="_blank" rel="noopener noreferrer"
        style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;line-height:1.25;mso-padding-alt:0;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

function emailInfoCard(innerHtml) {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-card" style="margin:16px 0;">
  <tr>
    <td class="email-card-inner" style="background:${BRAND.violetBg};padding:16px 18px;border-radius:10px;border-left:4px solid ${BRAND.violet};font-size:14px;line-height:1.6;color:${BRAND.body};">
      ${innerHtml}
    </td>
  </tr>
</table>`;
}

/**
 * Full responsive email document.
 * @param {{ title: string, bodyHtml: string, orgName: string, brand?: 'neurohr'|'hr'|'agent', footerNote?: string }} opts
 */
function buildResponsiveEmail({
  title,
  bodyHtml,
  orgName = 'XYZ',
  brand = 'neurohr',
  footerNote,
}) {
  const subtitle = (SUBTITLES[brand] || SUBTITLES.neurohr)(orgName);
  const footer = footerNote || 'This is an automated message from NeuroHR AI hiring platform.';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; max-width: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: ${BRAND.aqua}; }
    .email-body p { margin: 0 0 14px; line-height: 1.65; font-size: 15px; color: ${BRAND.body}; }
    .email-body ul { margin: 0 0 14px; padding-left: 20px; line-height: 1.7; font-size: 14px; color: ${BRAND.body}; }
    .email-body table { width: 100%; max-width: 100%; border-collapse: collapse; }
    .email-body td, .email-body th { word-break: break-word; }
    @media only screen and (max-width: 620px) {
      .email-outer-pad { padding: 12px !important; }
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-header-pad { padding: 18px 16px !important; }
      .email-body-pad { padding: 18px 16px !important; }
      .email-h1 { font-size: 20px !important; line-height: 1.3 !important; }
      .email-sub { font-size: 12px !important; }
      .email-btn a { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
      .email-btn-wrap { max-width: 100% !important; }
      .email-stack td { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      .email-stack tr { display: block !important; margin-bottom: 4px !important; }
      .email-card-inner { padding: 14px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#e8f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${title}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#e8f6f6;">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:20px 12px;">
        <table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0"
          style="max-width:600px;width:100%;border-collapse:collapse;">
          <tr>
            <td class="email-header-pad" style="background:linear-gradient(135deg,${BRAND.aqua},${BRAND.aquaDark});padding:22px 24px;border-radius:12px 12px 0 0;">
              <h1 class="email-h1" style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;">${title}</h1>
              <p class="email-sub" style="margin:8px 0 0;font-size:13px;color:${BRAND.aquaLight};">${subtitle}</p>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad email-body" style="background:${BRAND.cream};padding:24px;border:1px solid ${BRAND.creamBorder};border-top:none;border-radius:0 0 12px 12px;color:${BRAND.body};">
              ${bodyHtml}
              <p style="font-size:12px;color:${BRAND.muted};margin:24px 0 0;padding-top:14px;border-top:1px solid ${BRAND.creamBorder};line-height:1.5;">
                ${footerNote !== undefined ? footerNote : footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Post-process Groq fragment: ensure tables stack on mobile */
function enhanceGroqFragment(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/<table(?![^>]*class=)/gi, '<table class="email-stack"')
    .replace(/width:\s*100%/gi, 'width:100%;max-width:100%');
}

module.exports = {
  BRAND,
  buildResponsiveEmail,
  emailButton,
  emailInfoCard,
  enhanceGroqFragment,
};
