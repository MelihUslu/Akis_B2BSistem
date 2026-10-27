import { tenantUrl, platformUrl, tenantPortalUrl } from '../config.js';

/**
 * SMTP ayarları (.env): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM
 * SMTP tanımlı değilse mailler gönderilmez; geliştirme ortamında içerik konsola yazılır.
 */
let transporterPromise = null;

const getTransporter = async () => {
  if (!process.env.SMTP_HOST) return null;
  if (!transporterPromise) {
    transporterPromise = import('nodemailer').then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      })
    );
  }
  return transporterPromise;
};

export const sendMail = async ({ to, subject, html, fromName }) => {
  const transporter = await getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      console.log(`[MAIL - SMTP tanımlı değil] Kime: ${to} | Konu: ${subject}\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}${links.length ? `\nBağlantılar: ${links.join(' ')}` : ''}`);
    } else {
      console.warn(`[MAIL] SMTP tanımlı değil, mail gönderilemedi: ${to} - ${subject}`);
    }
    return { delivered: false };
  }

  const address = process.env.MAIL_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from: fromName ? `"${fromName.replace(/"/g, '')}" <${address.replace(/^.*<|>$/g, '')}>` : address,
    to,
    subject,
    html
  });
  return { delivered: true };
};

const PLATFORM_NAME = () => process.env.PLATFORM_NAME || 'Akis B2B';

const layout = (title, body, brand = PLATFORM_NAME()) => `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#0f172a">
    <h2 style="margin:0 0 16px;font-size:20px">${title}</h2>
    ${body}
    <p style="margin-top:32px;font-size:12px;color:#94a3b8">${brand} · Bu e-posta otomatik olarak gönderilmiştir.</p>
  </div>`;

const button = (href, text) =>
  `<p><a href="${href}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700">${text}</a></p>`;

// Kiracının bayilerine / yöneticilerine giriş bilgileri (kiracının adıyla ve kendi adresiyle)
export const sendCredentialsMail = ({ to, name, password, isReset, tenant }) =>
  sendMail({
    to,
    fromName: tenant?.name,
    subject: isReset ? `${tenant?.name || 'B2B Portal'} şifreniz sıfırlandı` : `${tenant?.name || 'B2B Portal'} giriş bilgileriniz`,
    html: layout(
      isReset ? 'Şifreniz sıfırlandı' : 'B2B Portal hesabınız oluşturuldu',
      `<p>Merhaba ${name},</p>
       <p>${isReset ? 'Hesabınız için yeni bir şifre oluşturuldu.' : 'Bayi portalına aşağıdaki bilgilerle giriş yapabilirsiniz.'}</p>
       <p style="background:#f1f5f9;padding:16px;border-radius:12px">
         <b>E-posta:</b> ${to}<br/><b>Şifre:</b> ${password}
       </p>
       <p>Güvenliğiniz için ilk girişten sonra <b>Profilim</b> sayfasından şifrenizi değiştirin.</p>
       ${button(`${tenantPortalUrl(tenant)}/login`, 'Portala giriş yap')}`,
      tenant?.name
    )
  });

export const sendVerificationMail = ({ to, name, token, tenant }) =>
  sendMail({
    to,
    subject: `${PLATFORM_NAME()} · E-posta adresinizi doğrulayın`,
    html: layout(
      'Hesabınızı doğrulayın',
      `<p>Merhaba ${name},</p>
       <p><b>${tenant.name}</b> için B2B portalınız hazır. Kullanmaya başlamak için e-posta adresinizi doğrulayın.</p>
       ${button(`${tenantPortalUrl(tenant)}/verify-email?token=${token}`, 'E-postamı doğrula')}
       <p style="font-size:13px;color:#64748b">Portal adresiniz: ${tenantPortalUrl(tenant)}</p>`
    )
  });

export const sendTrialEndingMail = ({ to, tenant, daysLeft }) =>
  sendMail({
    to,
    subject: `${PLATFORM_NAME()} · Deneme sürenizin bitmesine ${daysLeft} gün kaldı`,
    html: layout(
      'Deneme süreniz bitmek üzere',
      `<p><b>${tenant.name}</b> portalınızın deneme süresi ${daysLeft} gün içinde sona erecek. Kesintisiz devam etmek için bir paket seçin.</p>
       ${button(`${tenantPortalUrl(tenant)}/admin/subscription`, 'Paketleri gör')}`
    )
  });

export const sendPlatformAlert = ({ subject, text }) =>
  process.env.PLATFORM_ALERT_EMAIL
    ? sendMail({ to: process.env.PLATFORM_ALERT_EMAIL, subject: `[Platform] ${subject}`, html: layout(subject, `<p>${text}</p><p>${button(platformUrl(), 'Platform paneli')}</p>`) })
    : Promise.resolve({ delivered: false });

// "Şifremi unuttum" bağlantısı (firma kullanıcıları firmanın adıyla, platform yöneticisi platform adıyla)
export const sendPasswordResetMail = ({ to, name, link, brand }) =>
  sendMail({
    to,
    fromName: brand,
    subject: `${brand || PLATFORM_NAME()} · Şifre sıfırlama`,
    html: layout(
      'Şifrenizi sıfırlayın',
      `<p>Merhaba ${name},</p>
       <p>Hesabınız için şifre sıfırlama talebi aldık. Yeni şifre belirlemek için aşağıdaki butona tıklayın. Bağlantı <b>1 saat</b> geçerlidir ve yalnızca bir kez kullanılabilir.</p>
       ${button(link, 'Yeni şifre belirle')}
       <p style="font-size:13px;color:#64748b">Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.</p>`,
      brand
    )
  });

// Panel bildiriminin e-posta kopyası (kullanıcının tercihine göre)
export const sendNotificationMail = ({ to, name, tenant, notification }) => {
  const base = tenant ? tenantPortalUrl(tenant) : '';
  const link = notification.link ? `${base}${notification.link}` : `${base}/login`;
  return sendMail({
    to,
    fromName: tenant?.name,
    subject: `${tenant?.name || PLATFORM_NAME()} · ${notification.title}`,
    html: layout(
      notification.title,
      `<p>Merhaba ${name},</p>
       <p>${notification.message || ''}</p>
       ${button(link, 'Görüntüle')}
       <p style="font-size:12px;color:#94a3b8">Bu e-postaları almak istemiyorsanız portalda Hesabım / Profilim → Bildirim tercihleri'nden kapatabilirsiniz.</p>`,
      tenant?.name
    )
  });
};

// Müşteriye teklif bağlantısı (teklifi görüntüleme, kabul / ret / revizyon talebi)
export const sendQuoteMail = ({ to, tenant, code, title, total, validUntil, url, message }) =>
  sendMail({
    to,
    fromName: tenant?.name,
    subject: `${tenant?.name || PLATFORM_NAME()} · Teklif ${code}${title ? ` – ${title}` : ''}`,
    html: layout(
      `Teklif ${code}`,
      `<p>Merhaba,</p>
       <p>${tenant?.name || ''} tarafından hazırlanan teklifi aşağıdaki bağlantıdan inceleyebilir, kabul edebilir veya revizyon isteyebilirsiniz.</p>
       ${message ? `<p style="white-space:pre-line">${String(message).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p>` : ''}
       <p><b>Tutar (KDV dahil):</b> ${total}${validUntil ? `<br><b>Geçerlilik:</b> ${validUntil}` : ''}</p>
       ${button(url, 'Teklifi Görüntüle')}`,
      tenant?.name
    )
  });

// Cari ekstre bağlantısı (görüntüleme ve mutabakat yanıtı)
export const sendStatementMail = ({ to, tenant, companyName, balanceText, url, message }) =>
  sendMail({
    to,
    fromName: tenant?.name,
    subject: `${tenant?.name || PLATFORM_NAME()} · Cari hesap ekstreniz`,
    html: layout(
      'Cari hesap ekstreniz',
      `<p>Sayın ${String(companyName).replace(/[<>&]/g, '')},</p>
       <p>${tenant?.name || ''} nezdindeki cari hesap ekstrenizi aşağıdaki bağlantıdan inceleyebilir, mutabakat onayı verebilir veya itirazınızı iletebilirsiniz.</p>
       ${message ? `<p style="white-space:pre-line">${String(message).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p>` : ''}
       <p><b>Güncel bakiye:</b> ${balanceText}</p>
       ${button(url, 'Ekstreyi Görüntüle')}
       <p style="font-size:12px;color:#94a3b8">Bağlantı 30 gün geçerlidir.</p>`,
      tenant?.name
    )
  });
