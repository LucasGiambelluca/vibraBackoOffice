import nodemailer from "nodemailer";

export type Email = { para: string; asunto: string; texto: string };
export type EnviarEmail = (email: Email) => Promise<void>;

/** SMTP según las variables de entorno; sin SMTP_HOST, escribe los emails en la consola. */
export function crearEnviador(): EnviarEmail {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return async ({ para, asunto, texto }) => {
      console.log(`[email sin SMTP] Para: ${para}\nAsunto: ${asunto}\n${texto}`);
    };
  }

  const usuario = process.env.SMTP_USER;
  const transporte = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: usuario ? { user: usuario, pass: process.env.SMTP_PASS } : undefined,
    // Que un SMTP colgado no frene el worker indefinidamente.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  const remitente = process.env.SMTP_FROM || usuario;

  return async ({ para, asunto, texto }) => {
    await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto });
  };
}
