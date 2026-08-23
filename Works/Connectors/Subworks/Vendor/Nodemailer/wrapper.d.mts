// Two @ Onyx Ship
export interface Transporter {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
}

export declare function createTransport(options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}): Transporter;
