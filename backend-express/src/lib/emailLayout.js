/**
 * Responsive HTML email shell — matches NeuroHR app theme (tailwind: aqua, cream, teal).
 * Uses table layout + @media queries (email clients do not support Tailwind utility classes).
 */

const BRAND = {
  aqua: '#00B8B8',
  aquaDark: '#0D4F4F',
  aquaMid: '#1A6B6B',
  aquaLight: '#7FE7DC',
  aquaBg: '#E6FAF8',
  cream: '#FFF4DE',
  creamBorder: '#F6E6C2',
  creamMuted: '#FBF0DC',
  body: '#1A6B6B',
  heading: '#0D4F4F',
  muted: 'rgba(13, 79, 79, 0.55)',
  success: '#008B8B',
  successBg: '#E6FAF8',
  warn: '#B45309',
  warnBg: '#FFF4DE',
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
    <td class="email-card-inner" style="background:${BRAND.aquaBg};padding:16px 18px;border-radius:10px;border-left:4px solid ${BRAND.aqua};font-size:14px;line-height:1.6;color:${BRAND.body};">
      ${innerHtml}
    </td>
  </tr>
</table>`;
}

/** Highlight block for offers, compensation, key facts */
function emailHighlightCard(innerHtml) {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-card" style="margin:16px 0;">
  <tr>
    <td style="background:${BRAND.creamMuted};padding:16px 18px;border-radius:10px;border:1px solid ${BRAND.creamBorder};border-left:4px solid ${BRAND.aqua};font-size:14px;line-height:1.6;color:${BRAND.body};">
      ${innerHtml}
    </td>
  </tr>
</table>`;
}

/** Standard NeuroHR details table for Groq + templates */
function emailDetailsTable(rows) {
  const bodyRows = (rows || [])
    .map(([label, value]) => `
      <tr>
        <td style="padding:10px 12px;border:1px solid ${BRAND.creamBorder};background:${BRAND.aquaBg};font-weight:600;color:${BRAND.heading};vertical-align:top;width:38%;">${label}</td>
        <td style="padding:10px 12px;border:1px solid ${BRAND.creamBorder};color:${BRAND.body};word-break:break-word;">${value ?? '—'}</td>
      </tr>`)
    .join('');
  return `
<table class="email-stack" role="presentation" style="width:100%;max-width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
  ${bodyRows}
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
<body style="margin:0;padding:0;background:linear-gradient(135deg,${BRAND.aquaLight} 0%,${BRAND.cream} 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${title}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,${BRAND.aquaLight} 0%,${BRAND.cream} 100%);">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:20px 12px;">
        <table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0"
          style="max-width:600px;width:100%;border-collapse:collapse;">
          <tr>
            <td class="email-header-pad" style="background:linear-gradient(180deg,${BRAND.aquaDark} 0%,${BRAND.aquaMid} 100%);padding:22px 24px;border-radius:12px 12px 0 0;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.aquaLight};">NeuroHR AI</p>
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

/** Post-process Groq fragment: strip full documents, normalize colors, mobile tables */
function enhanceGroqFragment(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html.trim();
  const bodyMatch = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) out = bodyMatch[1];
  out = out
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/#7C6EF0/gi, BRAND.aqua)
    .replace(/#EEEDFE/gi, BRAND.aquaBg)
    .replace(/#4ade80/gi, BRAND.aqua)
    .replace(/#f0fff4/gi, BRAND.successBg)
    .replace(/#059669/gi, BRAND.success)
    .replace(/#334155/gi, BRAND.body)
    .replace(/#64748b/gi, BRAND.muted)
    .replace(/background:\s*#007bff/gi, `background:${BRAND.aqua}`)
    .replace(/background-color:\s*#007bff/gi, `background-color:${BRAND.aqua}`);
  return out
    .replace(/<table(?![^>]*class=)/gi, '<table class="email-stack"')
    .replace(/width:\s*100%/gi, 'width:100%;max-width:100%');
}

module.exports = {
  BRAND,
  buildResponsiveEmail,
  emailButton,
  emailInfoCard,
  emailHighlightCard,
  emailDetailsTable,
  enhanceGroqFragment,
};
