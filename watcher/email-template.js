/**
 * Pulse email template: one dark, on-brand HTML shell for every email we send.
 * Inline styles and table layout only (Gmail strips stylesheets and SVG); the
 * plain-text part is still passed alongside so nothing depends on HTML rendering.
 */


/**
 * @param {object} o
 * @param {string} o.title      big heading line
 * @param {string} o.intro      first paragraph (plain text, may contain \n)
 * @param {string} [o.stat]     optional highlighted value, e.g. "0.02 MON"
 * @param {string} [o.statLabel]
 * @param {string} [o.note]     optional quoted note (last words)
 * @param {string} [o.ctaText]  button label
 * @param {string} [o.ctaUrl]   button link
 * @param {string} [o.footer]   small print under the divider
 * @param {'coral'|'cyan'} [o.tone] coral = urgent/heartbeat, cyan = calm/claim
 */
export function renderEmail(o) {
  const accent = o.tone === 'cyan' ? '#4dd6c1' : '#ff5c5c'
  const para = (t) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#b8bcc8;">${esc(t).replace(/\n/g, '<br/>')}</p>`

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0d12;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d12;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

  <tr><td style="padding:0 8px 20px;">
    <span style="font-family:Georgia,serif;font-size:22px;color:#f2f3f7;letter-spacing:0.5px;">Pulse</span>
    <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#5a5f6e;letter-spacing:2px;text-transform:uppercase;">&nbsp;&nbsp;keep your heartbeat onchain</span>
  </td></tr>

  <tr><td style="background:#12151d;border:1px solid #1f2430;border-radius:16px;padding:36px 32px;font-family:Helvetica,Arial,sans-serif;">

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="width:56px;border-top:2px solid ${accent};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 8px;font-size:18px;line-height:1;color:${accent};">&#9829;</td>
      <td style="width:120px;border-top:2px solid ${accent};font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>

    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#f2f3f7;font-weight:600;">${esc(o.title)}</h1>
    ${para(o.intro)}

    ${o.stat ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
      <tr><td style="background:#0b0d12;border:1px solid #1f2430;border-radius:12px;padding:16px 24px;">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5a5f6e;margin-bottom:4px;">${esc(o.statLabel ?? '')}</div>
        <div style="font-size:26px;color:${accent};font-weight:600;">${esc(o.stat)}</div>
      </td></tr>
    </table>` : ''}

    ${o.note ? `
    <div style="border-left:3px solid ${accent};padding:4px 0 4px 16px;margin:0 0 20px;">
      <p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:16px;line-height:1.6;color:#d6d9e0;">&ldquo;${esc(o.note)}&rdquo;</p>
    </div>` : ''}

    ${o.ctaUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr><td style="border-radius:10px;background:${accent};">
        <a href="${esc(o.ctaUrl)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#0b0d12;text-decoration:none;">${esc(o.ctaText ?? 'Open Pulse')}</a>
      </td></tr>
    </table>` : ''}

  </td></tr>

  <tr><td style="padding:20px 8px 0;font-family:Helvetica,Arial,sans-serif;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#5a5f6e;">
      ${o.footer ? esc(o.footer) + '<br/>' : ''}
      Sent by <a href="https://pulseonchain.xyz" style="color:#8a8fa3;">pulseonchain.xyz</a>, an onchain will with a heartbeat, on Monad.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
