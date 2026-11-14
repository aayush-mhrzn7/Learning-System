import { APP_NAME, OTP_TTL_MINUTES, appUrl } from "./config";

export const MAIL_LANGUAGES = ["en", "ne", "es", "fr"] as const;
export type MailLanguage = (typeof MAIL_LANGUAGES)[number];

type Copy = {
  welcomeSubject: string;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeButton: string;
  otpSubject: string;
  otpTitle: string;
  otpBody: string;
  otpCodeLabel: string;
  otpButton: string;
  otpExpiry: string;
  otpIgnore: string;
  footer: string;
};

const COPY: Record<MailLanguage, Copy> = {
  en: {
    welcomeSubject: `Welcome to ${APP_NAME}`,
    welcomeTitle: `Welcome to ${APP_NAME}`,
    welcomeBody:
      "Your account is ready. Write notes, visualize ideas, and connect what you learn in one place.",
    welcomeButton: "Open Scholar",
    otpSubject: `Your ${APP_NAME} password reset code`,
    otpTitle: "Reset your password",
    otpBody:
      "Use the code below to reset your password, or click the button and we will fill it in for you.",
    otpCodeLabel: "Your one-time code",
    otpButton: "Click here to reset",
    otpExpiry: `This code expires in ${OTP_TTL_MINUTES} minutes.`,
    otpIgnore: "If you did not request this, you can safely ignore this email.",
    footer: `Sent by ${APP_NAME}`,
  },
  ne: {
    welcomeSubject: `${APP_NAME} मा स्वागत छ`,
    welcomeTitle: `${APP_NAME} मा स्वागत छ`,
    welcomeBody:
      "तपाईंको खाता तयार छ। नोट लेख्नुहोस्, विचार देखाउनुहोस्, र सिकेका कुराहरू एकै ठाउँमा जोड्नुहोस्।",
    welcomeButton: `${APP_NAME} खोल्नुहोस्`,
    otpSubject: `तपाईंको ${APP_NAME} पासवर्ड रिसेट कोड`,
    otpTitle: "पासवर्ड रिसेट गर्नुहोस्",
    otpBody:
      "पासवर्ड रिसेट गर्न तलको कोड प्रयोग गर्नुहोस्, वा बटन थिच्नुहोस् र हामी स्वतः भरिदिनेछौं।",
    otpCodeLabel: "तपाईंको एक पटकको कोड",
    otpButton: "रिसेट गर्न यहाँ थिच्नुहोस्",
    otpExpiry: `यो कोड ${OTP_TTL_MINUTES} मिनेटमा समाप्त हुन्छ।`,
    otpIgnore: "तपाईंले यो अनुरोध नगर्नुभएको भए, यो इमेललाई बेवास्ता गर्न सक्नुहुन्छ।",
    footer: `${APP_NAME} बाट पठाइएको`,
  },
  es: {
    welcomeSubject: `Bienvenido a ${APP_NAME}`,
    welcomeTitle: `Bienvenido a ${APP_NAME}`,
    welcomeBody:
      "Tu cuenta está lista. Escribe notas, visualiza ideas y conecta lo que aprendes en un solo lugar.",
    welcomeButton: `Abrir ${APP_NAME}`,
    otpSubject: `Tu código para restablecer la contraseña de ${APP_NAME}`,
    otpTitle: "Restablece tu contraseña",
    otpBody:
      "Usa el código de abajo para restablecer tu contraseña, o haz clic en el botón y lo completaremos por ti.",
    otpCodeLabel: "Tu código de un solo uso",
    otpButton: "Haz clic aquí para restablecer",
    otpExpiry: `Este código caduca en ${OTP_TTL_MINUTES} minutos.`,
    otpIgnore: "Si no lo solicitaste, puedes ignorar este correo.",
    footer: `Enviado por ${APP_NAME}`,
  },
  fr: {
    welcomeSubject: `Bienvenue sur ${APP_NAME}`,
    welcomeTitle: `Bienvenue sur ${APP_NAME}`,
    welcomeBody:
      "Votre compte est prêt. Écrivez des notes, visualisez vos idées et reliez ce que vous apprenez au même endroit.",
    welcomeButton: `Ouvrir ${APP_NAME}`,
    otpSubject: `Votre code de réinitialisation ${APP_NAME}`,
    otpTitle: "Réinitialisez votre mot de passe",
    otpBody:
      "Utilisez le code ci-dessous pour réinitialiser votre mot de passe, ou cliquez sur le bouton et nous le remplirons pour vous.",
    otpCodeLabel: "Votre code à usage unique",
    otpButton: "Cliquez ici pour réinitialiser",
    otpExpiry: `Ce code expire dans ${OTP_TTL_MINUTES} minutes.`,
    otpIgnore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    footer: `Envoyé par ${APP_NAME}`,
  },
};

export function resolveMailLanguage(
  ...candidates: Array<string | null | undefined>
): MailLanguage {
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const part of candidate.split(",")) {
      const code = part.trim().slice(0, 2).toLowerCase();
      if ((MAIL_LANGUAGES as readonly string[]).includes(code)) {
        return code as MailLanguage;
      }
    }
  }
  return "en";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(
  lang: MailLanguage,
  title: string,
  body: string,
  content: string,
  footer: string,
) {
  return `<!doctype html>
<html lang="${lang}">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;">
<tr><td style="padding:32px 32px 8px;">
<p style="margin:0 0 24px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#71717a;">${APP_NAME}</p>
<h1 style="margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3;">${escapeHtml(title)}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#3f3f46;">${escapeHtml(body)}</p>
</td></tr>
<tr><td style="padding:16px 32px 32px;">${content}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 24px;">${escapeHtml(label)}</a>`;
}

export function welcomeEmail(lang: MailLanguage) {
  const copy = COPY[lang];
  const url = appUrl();
  return {
    subject: copy.welcomeSubject,
    html: layout(
      lang,
      copy.welcomeTitle,
      copy.welcomeBody,
      button(url, copy.welcomeButton),
      copy.footer,
    ),
    text: `${copy.welcomeTitle}\n\n${copy.welcomeBody}\n\n${url}`,
  };
}

export function resetOtpEmail(
  lang: MailLanguage,
  options: { email: string; otp: string; expiresAt: number },
) {
  const copy = COPY[lang];
  const link = new URL("/forgot-password", appUrl());
  link.searchParams.set("email", options.email);
  link.searchParams.set("otp", options.otp);
  link.searchParams.set("exp", String(options.expiresAt));

  const content = `<p style="margin:0 0 8px;font-size:12px;color:#71717a;">${escapeHtml(copy.otpCodeLabel)}</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:600;letter-spacing:0.3em;font-family:ui-monospace,Menlo,Consolas,monospace;">${options.otp}</p>
${button(link.toString(), copy.otpButton)}
<p style="margin:24px 0 4px;font-size:13px;color:#3f3f46;">${escapeHtml(copy.otpExpiry)}</p>
<p style="margin:0;font-size:12px;color:#a1a1aa;">${escapeHtml(copy.otpIgnore)}</p>`;

  return {
    subject: copy.otpSubject,
    html: layout(lang, copy.otpTitle, copy.otpBody, content, copy.footer),
    text: `${copy.otpTitle}\n\n${copy.otpBody}\n\n${copy.otpCodeLabel}: ${options.otp}\n${link.toString()}\n\n${copy.otpExpiry}\n${copy.otpIgnore}`,
  };
}
