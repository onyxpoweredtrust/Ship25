// Two @ Onyx Ship
interface QRCodeOptions {
  type?: "svg" | "png" | "utf8" | "terminal";
}

declare const QRCode: {
  toString(text: string, opts?: QRCodeOptions): Promise<string>;
  toDataURL(text: string, opts?: QRCodeOptions): Promise<string>;
};

export default QRCode;
