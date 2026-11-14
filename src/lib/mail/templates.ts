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

const FONT =
  "'SF Pro Text','SF Pro Display','SF Pro',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function layout(
  lang: MailLanguage,
  preheader: string,
  title: string,
  body: string,
  content: string,
  footer: string,
) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme:dark){
.bg{background:#000000 !important;}
.fg{color:#ffffff !important;}
.sub{color:#a3a3a3 !important;}
.mut{color:#737373 !important;}
.bd{border-color:#262626 !important;}
.bd2{border-color:#404040 !important;}
.btn{background:#ffffff !important;}
.btnt{color:#000000 !important;}
}
</style>
<title>${escapeHtml(title)}</title>
</head>
<body class="bg fg" style="margin:0;padding:0;background:#ffffff;font-family:${FONT};color:#000000;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="bg" style="background:#ffffff;">
<tr><td align="center" style="padding:56px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:440px;">
<tr><td class="fg" style="padding:0 0 48px;font-size:12px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#000000;">${APP_NAME}</td></tr>
<tr><td class="fg" style="padding:0 0 16px;font-size:28px;font-weight:600;line-height:1.2;letter-spacing:-0.02em;color:#000000;">${escapeHtml(title)}</td></tr>
<tr><td class="sub" style="padding:0 0 36px;font-size:15px;line-height:1.7;color:#525252;">${escapeHtml(body)}</td></tr>
<tr><td style="padding:0 0 48px;">${content}</td></tr>
<tr><td class="bd mut" style="padding:24px 0 0;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td class="btn" style="background:#000000;">
<a class="btnt" href="${escapeHtml(href)}" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function codeBoxes(otp: string) {
  const cells = otp
    .split("")
    .map(
      (digit) =>
        `<td style="padding:0 4px 0 0;"><div class="bd2 fg" style="width:44px;height:56px;line-height:56px;text-align:center;border:1px solid #d4d4d4;font-family:${MONO};font-size:24px;font-weight:600;color:#000000;">${escapeHtml(digit)}</div></td>`,
    )
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr>${cells}</tr></table>`;
}

export function welcomeEmail(lang: MailLanguage) {
  const copy = COPY[lang];
  const url = appUrl();
  return {
    subject: copy.welcomeSubject,
    html: layout(
      lang,
      copy.welcomeBody,
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

  const content = `<p class="mut" style="margin:0 0 14px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#737373;">${escapeHtml(copy.otpCodeLabel)}</p>
${codeBoxes(options.otp)}
<p class="sub" style="margin:16px 0 32px;font-size:13px;color:#525252;">${escapeHtml(copy.otpExpiry)}</p>
${button(link.toString(), copy.otpButton)}
<p class="mut" style="margin:32px 0 0;font-size:12px;line-height:1.6;color:#737373;">${escapeHtml(copy.otpIgnore)}</p>`;

  return {
    subject: copy.otpSubject,
    html: layout(
      lang,
      `${copy.otpCodeLabel}: ${options.otp}`,
      copy.otpTitle,
      copy.otpBody,
      content,
      copy.footer,
    ),
    text: `${copy.otpTitle}\n\n${copy.otpBody}\n\n${copy.otpCodeLabel}: ${options.otp}\n${link.toString()}\n\n${copy.otpExpiry}\n${copy.otpIgnore}`,
  };
}
