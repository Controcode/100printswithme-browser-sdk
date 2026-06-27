import type { jsPDF } from 'jspdf';

export async function createJsPDFInstance(options: {
  orientation: 'p' | 'l';
  format: [number, number];
}): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({
    orientation: options.orientation,
    unit: 'pt',
    format: options.format,
    compress: true,
  });
}

export function addDataUrlToJsPDF(
  pdf: jsPDF,
  dataUrl: string,
  wPt: number,
  hPt: number,
  addNewPage: boolean,
  imgFormat: 'JPEG' | 'PNG',
): void {
  if (addNewPage) pdf.addPage([wPt, hPt]);
  pdf.addImage(dataUrl, imgFormat, 0, 0, wPt, hPt, undefined, 'FAST');
}
