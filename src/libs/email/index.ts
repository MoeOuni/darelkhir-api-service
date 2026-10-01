import type { IAddress, IOrderItem } from '@libs/interfaces';
import { OrderStatus } from '@libs/enums';

export type EmailLocale = 'fr' | 'ar';

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type EmailBranding = {
  brandName?: string;
  logoUrl?: string;
  supportEmail?: string;
  websiteUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
};

type EmailAction = {
  label: string;
  href: string;
};

type BaseEmailInput = {
  locale?: EmailLocale;
  customerName?: string;
  branding?: EmailBranding;
  previewText?: string;
};

type VerificationCodeEmailInput = BaseEmailInput & {
  code: string;
  expiresInMinutes?: number;
  actionUrl?: string;
};

type WelcomeEmailInput = BaseEmailInput & {
  accountUrl?: string;
};

type PasswordResetEmailInput = BaseEmailInput & {
  resetUrl?: string;
  code?: string;
  expiresInMinutes?: number;
};

type OrderLine = Pick<IOrderItem, 'name' | 'quantity' | 'priceHT' | 'priceTTC' | 'discountedPrice' | 'discountPercentage' | 'taxRate'>;

type OrderConfirmationEmailInput = BaseEmailInput & {
  orderNumber: number;
  subtotal: number;
  tax: number;
  timber: number;
  total: number;
  transport?: number;
  shippingAddress: IAddress;
  items: OrderLine[];
  notes?: string;
  orderUrl?: string;
};

type OrderReceivedEmailInput = BaseEmailInput & {
  orderNumber: number;
  items: Array<Pick<IOrderItem, 'name' | 'quantity' | 'priceHT' | 'priceTTC' | 'discountedPrice'>>;
  notes?: string;
  orderUrl?: string;
};

type OrderStatusEmailInput = BaseEmailInput & {
  orderNumber: number;
  status: OrderStatus;
  trackingUrl?: string;
  summary?: string;
};

const DEFAULT_BRANDING: Required<EmailBranding> = {
  brandName: 'Dar El Khir',
  logoUrl: 'https://centre-en-gros-assets.s3.amazonaws.com/assets/email/logo.png',
  supportEmail: '',
  websiteUrl: '',
  primaryColor: '#01bba7',
  accentColor: '#E8FCF9',
  backgroundColor: '#F3FDFC',
};

const CONTENT = {
  fr: {
    greeting: 'Bonjour',
    signOff: 'Merci pour votre confiance,',
    team: 'L\'equipe Dar El Khir',
    support: 'Besoin d\'aide ? Contactez-nous :',
    verification: {
      subject: 'Votre code de verification Dar El Khir',
      preview: 'Utilisez ce code pour confirmer votre compte.',
      heading: 'Confirmez votre adresse e-mail',
      intro: 'Utilisez le code ci-dessous pour terminer la creation de votre compte.',
      codeLabel: 'Code de verification',
      expires: 'Ce code expire dans {minutes} minutes.',
      action: 'Confirmer mon compte',
      footnote: 'Si vous n\'avez pas cree de compte, vous pouvez ignorer cet e-mail.',
    },
    welcome: {
      subject: 'Bienvenue chez Dar El Khir',
      preview: 'Votre compte est pret.',
      heading: 'Votre compte est actif',
      intro: 'Votre adresse e-mail a ete verifiee avec succes. Vous pouvez maintenant commander et suivre vos livraisons.',
      action: 'Acceder a mon compte',
      footnote: 'Pensez a completer votre profil pour accelerer vos prochaines commandes.',
    },
    reset: {
      subject: 'Reinitialisation de votre mot de passe',
      preview: 'Suivez les instructions pour definir un nouveau mot de passe.',
      heading: 'Reinitialisez votre mot de passe',
      intro: 'Nous avons recu une demande de reinitialisation de mot de passe pour votre compte.',
      codeLabel: 'Code de reinitialisation',
      action: 'Reinitialiser le mot de passe',
      expires: 'Cette demande expire dans {minutes} minutes.',
      footnote: 'Si vous n\'etes pas a l\'origine de cette demande, ignorez simplement cet e-mail.',
    },
    orderConfirmation: {
      subject: 'Confirmation de commande #{orderNumber}',
      preview: 'Votre commande a bien ete enregistree.',
      heading: 'Commande confirmee',
      intro: 'Votre commande est maintenant confirmee. Voici le recapitulatif complet avec les montants.',
      orderNumber: 'Commande',
      items: 'Articles',
      shippingAddress: 'Adresse de livraison',
      notes: 'Notes',
      subtotal: 'Sous-total',
      tax: 'TVA',
      timber: 'Timbre fiscal',
      transport: 'Transport',
      total: 'Total',
      priceHT: 'Prix HT',
      priceTTC: 'Prix TTC',
      discount: 'Remise',
      action: 'Suivre ma commande',
    },
    orderReceived: {
      subject: 'Commande recuee #{orderNumber}',
      preview: 'Nous avons bien recu votre commande et nous revenons vers vous rapidement.',
      heading: 'Nous avons bien recu votre commande',
      intro: 'Votre commande est en attente de confirmation par notre equipe. Nous vous recontacterons sous peu avec le detail final.',
      orderNumber: 'Commande',
      items: 'Articles demandes',
      notes: 'Notes',
      priceHT: 'Prix HT',
      priceTTC: 'Prix TTC',
      action: 'Voir ma commande',
    },
    orderStatus: {
      subject: 'Mise a jour de la commande #{orderNumber}',
      preview: 'Le statut de votre commande a change.',
      heading: 'Statut de commande mis a jour',
      intro: 'Votre commande a evolue. Consultez le dernier statut ci-dessous.',
      orderNumber: 'Commande',
      currentStatus: 'Statut actuel',
      action: 'Suivre la commande',
      statuses: {
        [OrderStatus.PENDING]: 'En attente',
        [OrderStatus.CONFIRMED]: 'Confirmee',
        [OrderStatus.PROCESSING]: 'En preparation',
        [OrderStatus.SHIPPED]: 'Expediee',
        [OrderStatus.DELIVERED]: 'Livree',
        [OrderStatus.CANCELLED]: 'Annulee',
        [OrderStatus.REFUNDED]: 'Remboursee',
      },
    },
  },
  ar: {
    greeting: 'مرحبا',
    signOff: 'شكرا لثقتكم،',
    team: 'فريق Dar El Khir',
    support: 'للمساعدة تواصل معنا على:',
    verification: {
      subject: 'رمز التحقق من Dar El Khir',
      preview: 'استخدم هذا الرمز لتأكيد حسابك.',
      heading: 'تأكيد البريد الإلكتروني',
      intro: 'استخدم الرمز التالي لإكمال إنشاء حسابك.',
      codeLabel: 'رمز التحقق',
      expires: 'تنتهي صلاحية هذا الرمز خلال {minutes} دقيقة.',
      action: 'تأكيد الحساب',
      footnote: 'إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد.',
    },
    welcome: {
      subject: 'مرحبا بك في Dar El Khir',
      preview: 'حسابك أصبح جاهزا.',
      heading: 'تم تفعيل حسابك',
      intro: 'تم تأكيد بريدك الإلكتروني بنجاح. يمكنك الآن الطلب وتتبع عمليات التوصيل.',
      action: 'الدخول إلى حسابي',
      footnote: 'يفضل إكمال ملفك الشخصي لتسريع طلباتك القادمة.',
    },
    reset: {
      subject: 'إعادة تعيين كلمة المرور',
      preview: 'اتبع التعليمات لتعيين كلمة مرور جديدة.',
      heading: 'إعادة تعيين كلمة المرور',
      intro: 'تلقينا طلبا لإعادة تعيين كلمة المرور الخاصة بحسابك.',
      codeLabel: 'رمز إعادة التعيين',
      action: 'إعادة تعيين كلمة المرور',
      expires: 'تنتهي صلاحية هذا الطلب خلال {minutes} دقيقة.',
      footnote: 'إذا لم تكن أنت من طلب ذلك، يمكنك تجاهل هذا البريد.',
    },
    orderConfirmation: {
      subject: 'تأكيد الطلب #{orderNumber}',
      preview: 'تم تسجيل طلبك بنجاح.',
      heading: 'تم تأكيد الطلب',
      intro: 'تم تأكيد طلبك الآن. إليك الملخص الكامل مع جميع المبالغ.',
      orderNumber: 'الطلب',
      items: 'المنتجات',
      shippingAddress: 'عنوان التوصيل',
      notes: 'ملاحظات',
      subtotal: 'المجموع الفرعي',
      tax: 'الضريبة',
      timber: 'الطابع الجبائي',
      transport: 'النقل',
      total: 'الإجمالي',
      priceHT: 'السعر HT',
      priceTTC: 'السعر TTC',
      discount: 'الخصم',
      action: 'تتبع الطلب',
    },
    orderReceived: {
      subject: 'تم استلام الطلب #{orderNumber}',
      preview: 'استلمنا طلبك وسنعود إليك قريبا.',
      heading: 'تم استلام طلبك',
      intro: 'طلبك حاليا في انتظار التأكيد من فريقنا. سنوافيك قريبا بالتفاصيل النهائية.',
      orderNumber: 'الطلب',
      items: 'المنتجات المطلوبة',
      notes: 'ملاحظات',
      priceHT: 'السعر HT',
      priceTTC: 'السعر TTC',
      action: 'عرض الطلب',
    },
    orderStatus: {
      subject: 'تحديث حالة الطلب #{orderNumber}',
      preview: 'تم تحديث حالة طلبك.',
      heading: 'تم تحديث حالة الطلب',
      intro: 'تم تغيير حالة طلبك. اطلع على آخر تحديث أدناه.',
      orderNumber: 'الطلب',
      currentStatus: 'الحالة الحالية',
      action: 'تتبع الطلب',
      statuses: {
        [OrderStatus.PENDING]: 'في الانتظار',
        [OrderStatus.CONFIRMED]: 'مؤكد',
        [OrderStatus.PROCESSING]: 'قيد التحضير',
        [OrderStatus.SHIPPED]: 'تم الشحن',
        [OrderStatus.DELIVERED]: 'تم التسليم',
        [OrderStatus.CANCELLED]: 'ملغي',
        [OrderStatus.REFUNDED]: 'تم الاسترجاع',
      },
    },
  },
} as const;

function withBranding(branding?: EmailBranding) {
  if (!branding) return { ...DEFAULT_BRANDING };

  const cleaned = Object.fromEntries(
    Object.entries(branding).filter(([, value]) => value !== undefined && value !== ''),
  ) as EmailBranding;

  return { ...DEFAULT_BRANDING, ...cleaned };
}

function getLocale(input?: EmailLocale): EmailLocale {
  return input === 'ar' ? 'ar' : 'fr';
}

function isArabic(locale: EmailLocale) {
  return locale === 'ar';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount: number, locale: EmailLocale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
    style: 'currency',
    currency: 'TND',
    minimumFractionDigits: 2,
  }).format(amount);
}

function replaceToken(template: string, tokens: Record<string, string | number>) {
  return Object.entries(tokens).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template,
  );
}

function renderLogo(branding: Required<EmailBranding>) {
  if (!branding.logoUrl) {
    return `<div style="font-size:30px;font-weight:900;color:#0f172a;letter-spacing:-0.02em;">${escapeHtml(branding.brandName)}</div>`;
  }

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td style="vertical-align:middle;padding:0 14px 0 0;">
          <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.brandName)}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:contain;border:0;outline:none;text-decoration:none;" />
        </td>
        <td style="vertical-align:middle;">
          <div style="font-size:30px;font-weight:900;line-height:1.05;color:#0f172a;letter-spacing:-0.03em;">${escapeHtml(branding.brandName)}</div>
          <div style="margin-top:6px;font-size:13px;font-weight:700;color:${branding.primaryColor};">Vente en gros produit divers</div>
        </td>
      </tr>
    </table>`;
}

function renderAction(action: EmailAction | undefined, branding: Required<EmailBranding>) {
  if (!action) return '';

  return `
    <tr>
      <td style="padding:0 32px 28px 32px;">
        <a href="${escapeHtml(action.href)}" style="display:inline-block;background:${branding.primaryColor};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:999px;">${escapeHtml(action.label)}</a>
      </td>
    </tr>
  `;
}

function renderSection(title: string, body: string, branding: Required<EmailBranding>) {
  return `
    <tr>
      <td style="padding:0 32px 20px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:${branding.accentColor};border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:18px 20px 8px 20px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${branding.primaryColor};">${escapeHtml(title)}</td>
          </tr>
          <tr>
            <td style="padding:0 20px 18px 20px;font-size:15px;line-height:1.7;color:#0f172a;">${body}</td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderEmailLayout(options: {
  locale: EmailLocale;
  branding: Required<EmailBranding>;
  previewText: string;
  heading: string;
  intro: string;
  greeting: string;
  customerName?: string;
  sections?: string[];
  action?: EmailAction;
  footnote?: string;
}) {
  const { locale, branding, previewText, heading, intro, greeting, customerName, sections = [], action, footnote } = options;
  const rtl = isArabic(locale);
  const salutation = customerName ? `${greeting} ${customerName}` : greeting;

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:linear-gradient(180deg, #f4fffd 0%, ${branding.backgroundColor} 48%, #eef6f8 100%);font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:transparent;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:30px;overflow:hidden;box-shadow:0 22px 60px rgba(1,187,167,0.16);border:1px solid #c7f3ee;">
            <tr>
              <td style="padding:10px 0;background:${branding.primaryColor};"></td>
            </tr>
            <tr>
              <td style="padding:30px 34px 24px 34px;background:radial-gradient(circle at 92% 0%, rgba(1,187,167,0.18) 0%, rgba(1,187,167,0) 44%),linear-gradient(135deg, ${branding.accentColor} 0%, #ffffff 76%);">
                ${renderLogo(branding)}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 34px 8px 34px;font-size:15px;line-height:1.8;color:#516072;">${escapeHtml(salutation)},</td>
            </tr>
            <tr>
              <td style="padding:0 34px 8px 34px;font-size:42px;line-height:1.08;font-weight:900;color:#0f172a;letter-spacing:-0.04em;">${escapeHtml(heading)}</td>
            </tr>
            <tr>
              <td style="padding:0 34px 28px 34px;font-size:17px;line-height:1.8;color:#3d4c63;">${escapeHtml(intro)}</td>
            </tr>
            ${sections.join('')}
            ${renderAction(action, branding)}
            ${footnote ? `<tr><td style="padding:0 32px 24px 32px;font-size:13px;line-height:1.7;color:#64748b;">${escapeHtml(footnote)}</td></tr>` : ''}
            <tr>
              <td style="padding:24px 34px 32px 34px;border-top:1px solid #d6ece8;background:#fbfffe;font-size:13px;line-height:1.8;color:#64748b;">
                <div style="font-weight:700;color:#0f172a;margin-bottom:6px;">${escapeHtml(CONTENT[locale].signOff)}</div>
                <div>${escapeHtml(CONTENT[locale].team)}</div>
                <div>${escapeHtml(CONTENT[locale].support)} <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:${branding.primaryColor};text-decoration:none;">${escapeHtml(branding.supportEmail)}</a></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextEmail(parts: string[]) {
  return parts.filter(Boolean).join('\n\n');
}

function formatAddress(address: IAddress) {
  return [address.street, address.postalCode, address.city, address.state, address.country]
    .filter(Boolean)
    .join(', ');
}

function renderOrderItemsTable(itemsLabel: string, items: OrderLine[], locale: EmailLocale, branding: Required<EmailBranding>) {
  const copy = CONTENT[locale].orderConfirmation;
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;">${escapeHtml(item.name)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#475569;text-align:center;">${item.quantity}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;text-align:${isArabic(locale) ? 'left' : 'right'};white-space:nowrap;">${escapeHtml(formatCurrency(item.priceHT * item.quantity, locale))}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;text-align:${isArabic(locale) ? 'left' : 'right'};white-space:nowrap;">${escapeHtml(formatCurrency((item.discountedPrice ?? item.priceTTC) * item.quantity, locale))}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;text-align:${isArabic(locale) ? 'left' : 'right'};white-space:nowrap;">${item.discountPercentage ? `${item.discountPercentage}%` : '-'}</td>
        </tr>`,
    )
    .join('');

  return renderSection(
    itemsLabel,
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 10px 0;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;">${escapeHtml(itemsLabel)}</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:center;">Qt.</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:${isArabic(locale) ? 'left' : 'right'};">${escapeHtml(copy.priceHT)}</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:${isArabic(locale) ? 'left' : 'right'};">${escapeHtml(copy.priceTTC)}</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:${isArabic(locale) ? 'left' : 'right'};">${escapeHtml(copy.discount)}</td>
      </tr>
      ${rows}
    </table>`,
    branding,
  );
}

function renderOrderItemsCompactTable(itemsLabel: string, items: Array<Pick<IOrderItem, 'name' | 'quantity' | 'priceHT' | 'priceTTC' | 'discountedPrice'>>, locale: EmailLocale, branding: Required<EmailBranding>) {
  const copy = CONTENT[locale].orderReceived;
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;">${escapeHtml(item.name)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;text-align:center;font-weight:700;">${item.quantity}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;text-align:right;white-space:nowrap;">${escapeHtml(formatCurrency(item.priceHT * item.quantity, locale))}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #dbe4ea;font-size:14px;color:#0f172a;text-align:right;white-space:nowrap;">${escapeHtml(formatCurrency((item.discountedPrice ?? item.priceTTC) * item.quantity, locale))}</td>
        </tr>`,
    )
    .join('');

  return renderSection(
    itemsLabel,
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 10px 0;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;">${escapeHtml(itemsLabel)}</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:center;">Qt.</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:right;">${escapeHtml(copy.priceHT)}</td>
        <td style="padding:0 8px 10px 8px;font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:right;">${escapeHtml(copy.priceTTC)}</td>
      </tr>
      ${rows}
    </table>`,
    branding,
  );
}

function renderTotalsTable(labels: { subtotal: string; tax: string; timber: string; transport: string; total: string }, values: { subtotal: number; tax: number; timber: number; transport?: number; total: number }, locale: EmailLocale, branding: Required<EmailBranding>) {
  const lines = [
    { label: labels.subtotal, value: values.subtotal },
    { label: labels.tax, value: values.tax },
    { label: labels.timber, value: values.timber },
    ...(typeof values.transport === 'number' ? [{ label: labels.transport, value: values.transport }] : []),
    { label: labels.total, value: values.total, strong: true },
  ];

  const rows = lines.map((line) => `
    <tr>
      <td style="padding:8px 0;font-size:${line.strong ? '16px' : '14px'};font-weight:${line.strong ? '800' : '500'};color:#0f172a;">${escapeHtml(line.label)}</td>
      <td style="padding:8px 0;font-size:${line.strong ? '16px' : '14px'};font-weight:${line.strong ? '800' : '600'};color:#0f172a;text-align:${isArabic(locale) ? 'left' : 'right'};white-space:nowrap;">${escapeHtml(formatCurrency(line.value, locale))}</td>
    </tr>`).join('');

  return renderSection(labels.total, `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>`, branding);
}

export function renderVerificationCodeEmail(input: VerificationCodeEmailInput): RenderedEmail {
  const locale = getLocale(input.locale);
  const copy = CONTENT[locale].verification;
  const branding = withBranding(input.branding);
  const previewText = input.previewText ?? copy.preview;
  const expiresLine = replaceToken(copy.expires, { minutes: input.expiresInMinutes ?? 15 });
  const subject = copy.subject;

  const html = renderEmailLayout({
    locale,
    branding,
    previewText,
    heading: copy.heading,
    intro: copy.intro,
    greeting: CONTENT[locale].greeting,
    customerName: input.customerName,
    sections: [
      renderSection(copy.codeLabel, `<div style="font-size:32px;font-weight:900;letter-spacing:0.2em;color:${branding.primaryColor};">${escapeHtml(input.code)}</div><div style="margin-top:12px;color:#475569;">${escapeHtml(expiresLine)}</div>`, branding),
    ],
    action: input.actionUrl ? { label: copy.action, href: input.actionUrl } : undefined,
    footnote: copy.footnote,
  });

  const text = renderTextEmail([
    `${CONTENT[locale].greeting}${input.customerName ? ` ${input.customerName}` : ''},`,
    copy.heading,
    copy.intro,
    `${copy.codeLabel}: ${input.code}`,
    expiresLine,
    input.actionUrl ? `${copy.action}: ${input.actionUrl}` : '',
    copy.footnote,
  ]);

  return { subject, html, text };
}

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const locale = getLocale(input.locale);
  const copy = CONTENT[locale].welcome;
  const branding = withBranding(input.branding);
  const previewText = input.previewText ?? copy.preview;
  const subject = copy.subject;

  const html = renderEmailLayout({
    locale,
    branding,
    previewText,
    heading: copy.heading,
    intro: copy.intro,
    greeting: CONTENT[locale].greeting,
    customerName: input.customerName,
    action: input.accountUrl ? { label: copy.action, href: input.accountUrl } : undefined,
    footnote: copy.footnote,
  });

  const text = renderTextEmail([
    `${CONTENT[locale].greeting}${input.customerName ? ` ${input.customerName}` : ''},`,
    copy.heading,
    copy.intro,
    input.accountUrl ? `${copy.action}: ${input.accountUrl}` : '',
    copy.footnote,
  ]);

  return { subject, html, text };
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const locale = getLocale(input.locale);
  const copy = CONTENT[locale].reset;
  const branding = withBranding(input.branding);
  const previewText = input.previewText ?? copy.preview;
  const subject = copy.subject;
  const expiresLine = replaceToken(copy.expires, { minutes: input.expiresInMinutes ?? 30 });
  const details = [
    input.code
      ? `<div style="font-size:30px;font-weight:900;letter-spacing:0.18em;color:${branding.primaryColor};margin-bottom:12px;">${escapeHtml(input.code)}</div>`
      : '',
    `<div style="color:#475569;">${escapeHtml(expiresLine)}</div>`,
  ].join('');

  const html = renderEmailLayout({
    locale,
    branding,
    previewText,
    heading: copy.heading,
    intro: copy.intro,
    greeting: CONTENT[locale].greeting,
    customerName: input.customerName,
    sections: [input.code ? renderSection(copy.codeLabel, details, branding) : renderSection(copy.heading, details, branding)],
    action: input.resetUrl ? { label: copy.action, href: input.resetUrl } : undefined,
    footnote: copy.footnote,
  });

  const text = renderTextEmail([
    `${CONTENT[locale].greeting}${input.customerName ? ` ${input.customerName}` : ''},`,
    copy.heading,
    copy.intro,
    input.code ? `${copy.codeLabel}: ${input.code}` : '',
    expiresLine,
    input.resetUrl ? `${copy.action}: ${input.resetUrl}` : '',
    copy.footnote,
  ]);

  return { subject, html, text };
}

export function renderOrderConfirmationEmail(input: OrderConfirmationEmailInput): RenderedEmail {
  const locale = getLocale(input.locale);
  const copy = CONTENT[locale].orderConfirmation;
  const branding = withBranding(input.branding);
  const previewText = input.previewText ?? copy.preview;
  const subject = replaceToken(copy.subject, { orderNumber: input.orderNumber });
  const summaryLabels = {
    subtotal: copy.subtotal,
    tax: copy.tax,
    timber: copy.timber,
    transport: copy.transport,
    total: copy.total,
  };

  const html = renderEmailLayout({
    locale,
    branding,
    previewText,
    heading: copy.heading,
    intro: copy.intro,
    greeting: CONTENT[locale].greeting,
    customerName: input.customerName,
    sections: [
      renderSection(copy.orderNumber, `<strong>#${input.orderNumber}</strong>`, branding),
      renderOrderItemsTable(copy.items, input.items, locale, branding),
      renderSection(copy.shippingAddress, escapeHtml(formatAddress(input.shippingAddress)), branding),
      ...(input.notes ? [renderSection(copy.notes, escapeHtml(input.notes), branding)] : []),
      renderTotalsTable(summaryLabels, input, locale, branding),
    ],
    action: input.orderUrl ? { label: copy.action, href: input.orderUrl } : undefined,
  });

  const itemLines = input.items.map((item) => `- ${item.name} x${item.quantity}: ${formatCurrency(item.priceTTC * item.quantity, locale)}`);
  const text = renderTextEmail([
    `${CONTENT[locale].greeting}${input.customerName ? ` ${input.customerName}` : ''},`,
    copy.heading,
    `${copy.orderNumber}: #${input.orderNumber}`,
    copy.items,
    ...itemLines,
    `${copy.shippingAddress}: ${formatAddress(input.shippingAddress)}`,
    input.notes ? `${copy.notes}: ${input.notes}` : '',
    `${copy.subtotal}: ${formatCurrency(input.subtotal, locale)}`,
    `${copy.tax}: ${formatCurrency(input.tax, locale)}`,
    `${copy.timber}: ${formatCurrency(input.timber, locale)}`,
    typeof input.transport === 'number' ? `${copy.transport}: ${formatCurrency(input.transport, locale)}` : '',
    `${copy.total}: ${formatCurrency(input.total, locale)}`,
    input.orderUrl ? `${copy.action}: ${input.orderUrl}` : '',
  ]);

  return { subject, html, text };
}

export function renderOrderStatusEmail(input: OrderStatusEmailInput): RenderedEmail {
  const locale = getLocale(input.locale);
  const copy = CONTENT[locale].orderStatus;
  const branding = withBranding(input.branding);
  const previewText = input.previewText ?? copy.preview;
  const subject = replaceToken(copy.subject, { orderNumber: input.orderNumber });
  const statusLabel = copy.statuses[input.status];

  const html = renderEmailLayout({
    locale,
    branding,
    previewText,
    heading: copy.heading,
    intro: copy.intro,
    greeting: CONTENT[locale].greeting,
    customerName: input.customerName,
    sections: [
      renderSection(copy.orderNumber, `<strong>#${input.orderNumber}</strong>`, branding),
      renderSection(copy.currentStatus, `<div style="font-size:24px;font-weight:800;color:${branding.primaryColor};">${escapeHtml(statusLabel)}</div>${input.summary ? `<div style="margin-top:10px;color:#475569;">${escapeHtml(input.summary)}</div>` : ''}`, branding),
    ],
    action: input.trackingUrl ? { label: copy.action, href: input.trackingUrl } : undefined,
  });

  const text = renderTextEmail([
    `${CONTENT[locale].greeting}${input.customerName ? ` ${input.customerName}` : ''},`,
    copy.heading,
    `${copy.orderNumber}: #${input.orderNumber}`,
    `${copy.currentStatus}: ${statusLabel}`,
    input.summary ?? '',
    input.trackingUrl ? `${copy.action}: ${input.trackingUrl}` : '',
  ]);

  return { subject, html, text };
}

export function renderOrderReceivedEmail(input: OrderReceivedEmailInput): RenderedEmail {
  const locale = getLocale(input.locale);
  const copy = CONTENT[locale].orderReceived;
  const branding = withBranding(input.branding);
  const previewText = input.previewText ?? copy.preview;
  const subject = replaceToken(copy.subject, { orderNumber: input.orderNumber });

  const html = renderEmailLayout({
    locale,
    branding,
    previewText,
    heading: copy.heading,
    intro: copy.intro,
    greeting: CONTENT[locale].greeting,
    customerName: input.customerName,
    sections: [
      renderSection(copy.orderNumber, `<strong>#${input.orderNumber}</strong>`, branding),
      renderOrderItemsCompactTable(copy.items, input.items, locale, branding),
      ...(input.notes ? [renderSection(copy.notes, escapeHtml(input.notes), branding)] : []),
    ],
    action: input.orderUrl ? { label: copy.action, href: input.orderUrl } : undefined,
  });

  const itemLines = input.items.map((item) => `- ${item.name} x${item.quantity}`);
  const text = renderTextEmail([
    `${CONTENT[locale].greeting}${input.customerName ? ` ${input.customerName}` : ''},`,
    copy.heading,
    copy.intro,
    `${copy.orderNumber}: #${input.orderNumber}`,
    copy.items,
    ...itemLines,
    input.notes ? `${copy.notes}: ${input.notes}` : '',
    input.orderUrl ? `${copy.action}: ${input.orderUrl}` : '',
  ]);

  return { subject, html, text };
}