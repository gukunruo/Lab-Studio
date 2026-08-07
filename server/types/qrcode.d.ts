declare module 'qrcode' {
  type QrOptions = { margin?: number; width?: number }
  export function toDataURL(text: string, options?: QrOptions): Promise<string>
  const QRCode: { toDataURL: typeof toDataURL }
  export default QRCode
}
