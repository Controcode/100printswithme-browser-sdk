export async function generateBarcodeDataUrl(text: string, fgColor: string, bgColor: string): Promise<string> {
  const JsBarcode = (await import('jsbarcode')).default;
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, text, {
    format: 'CODE128',
    lineColor: fgColor,
    background: bgColor === 'transparent' ? 'rgba(0,0,0,0)' : bgColor,
    displayValue: true,
    margin: 10,
    width: 3,
    height: 100,
  });
  return canvas.toDataURL('image/png');
}
