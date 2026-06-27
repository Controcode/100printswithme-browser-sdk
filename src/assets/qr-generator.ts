export async function generateQRDataUrl(text: string, fgColor: string, bgColor: string): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(text, {
    color: { dark: fgColor, light: bgColor },
    margin: 1,
    width: 250,
  });
}
