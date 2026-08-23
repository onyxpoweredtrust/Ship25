// Connectors Mail
// designed and built by onyxlabs.

import { createTransport, type Transporter } from "../../Vendor/Nodemailer/wrapper.mjs";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export interface ZeroMailSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure?: boolean;
}

export function createZeroMailTransport(settings: ZeroMailSettings): MailTransport {
  const transporter: Transporter = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure ?? settings.port === 465,
    auth: { user: settings.user, pass: settings.pass },
  });

  return {
    async send(message) {
      await transporter.sendMail({
        from: settings.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
    },
  };
}
