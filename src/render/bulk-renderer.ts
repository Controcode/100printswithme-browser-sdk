import Konva from 'konva';
import { BulkRenderOptions, BulkRenderResult, DocumentTemplate } from '../types';
import { renderSingleRecord, preloadTemplateImages } from './render-engine';
import { createJsPDFInstance, addDataUrlToJsPDF } from '../export/pdf-exporter';
import { dataUrlToBlob } from '../export/png-exporter';

const SCALE_MAP: Record<string, number> = {
  draft: 1,     // 72 DPI
  standard: 2,  // 150 DPI
  high: 4,      // 300 DPI
  ultra: 8,     // 600 DPI
};

export class BulkRenderer {
  async renderBulk(template: DocumentTemplate, options: BulkRenderOptions): Promise<BulkRenderResult> {
    const rows = options.rows;
    const totalRecords = rows.length;
    const format = options.format || 'pdf';
    const quality = options.quality || 'high';
    const scale = SCALE_MAP[quality] || 4;
    const mode = options.mode || 'merged';
    const onProgress = options.onProgress;

    const canvasW = template.dimensions?.width || 856;
    const canvasH = template.dimensions?.height || 540;
    const wPt = canvasW * 0.75;
    const hPt = canvasH * 0.75;
    const pdfOrientation = wPt > hPt ? 'l' : 'p';
    const templateName = template.name || '100Prints';

    // Create hidden container for headless Konva
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:10px;height:10px;overflow:hidden;';
    document.body.appendChild(container);

    const stage = new Konva.Stage({
      container,
      width: canvasW,
      height: canvasH,
      listening: false,
    });
    const konvaLayer = new Konva.Layer({ listening: false });
    stage.add(konvaLayer);

    const useJpeg = format === 'pdf';
    const imgFormat = useJpeg ? 'JPEG' : 'PNG';

    let zip: any = null;
    let mergedPdf: any = null;
    let firstPageInChunk = true;

    if (mode === 'merged' && format === 'pdf') {
      mergedPdf = await createJsPDFInstance({ orientation: pdfOrientation, format: [wPt, hPt] });
    } else {
      const JSZip = (await import('jszip')).default;
      zip = new JSZip();
    }

    try {
      const usedNames = new Map<string, number>();

      for (let i = 0; i < totalRecords; i++) {
        const rowData = rows[i];
        
        // Resolve name
        let rawName = String(rowData.Name || rowData.name || `Record_${i + 1}`).replace(/[^\w\d\-_ ]/g, '_').trim();
        const count = usedNames.get(rawName) || 0;
        const recordName = count === 0 ? rawName : `${rawName} (${count})`;
        usedNames.set(rawName, count + 1);

        // Preload assets for this specific row data (keeps RAM footprint low by doing it row-by-row)
        const allLayers = [
          ...(template.frontLayers || []),
          ...(template.backLayers || [])
        ];
        const assetMap = await preloadTemplateImages(allLayers, rowData);

        // Render front
        const frontDataUrl = await renderSingleRecord(
          stage, konvaLayer, template, template.frontLayers || [],
          rowData, assetMap, scale, !!template.showCropMarks, useJpeg
        );

        // Render back (if applicable)
        let backDataUrl: string | null = null;
        if (template.backLayers && template.backLayers.length > 0) {
          backDataUrl = await renderSingleRecord(
            stage, konvaLayer, template, template.backLayers || [],
            rowData, assetMap, scale, !!template.showCropMarks, useJpeg
          );
        }

        // Add to merged PDF or ZIP
        if (mergedPdf) {
          addDataUrlToJsPDF(mergedPdf, frontDataUrl, wPt, hPt, !firstPageInChunk, imgFormat);
          firstPageInChunk = false;
          if (backDataUrl) {
            addDataUrlToJsPDF(mergedPdf, backDataUrl, wPt, hPt, true, imgFormat);
          }
        } else if (zip) {
          if (format === 'png') {
            zip.file(`${recordName}_Front.png`, dataUrlToBlob(frontDataUrl));
            if (backDataUrl) zip.file(`${recordName}_Back.png`, dataUrlToBlob(backDataUrl));
          } else {
            const recPdf = await createJsPDFInstance({ orientation: pdfOrientation, format: [wPt, hPt] });
            addDataUrlToJsPDF(recPdf, frontDataUrl, wPt, hPt, false, imgFormat);
            if (backDataUrl) {
              addDataUrlToJsPDF(recPdf, backDataUrl, wPt, hPt, true, imgFormat);
            }
            const recPdfBlob = recPdf.output('blob');
            zip.file(`${recordName}.pdf`, recPdfBlob);
          }
        }

        if (onProgress) {
          onProgress(i + 1, totalRecords, recordName);
        }

        // Micro yield to keep the UI thread responsive
        if ((i + 1) % 5 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      let finalBlob: Blob;
      let filename: string;

      if (mergedPdf) {
        finalBlob = mergedPdf.output('blob');
        filename = `${templateName}_Export.pdf`;
      } else {
        finalBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
        filename = `${templateName}_Export.zip`;
      }

      return {
        blob: finalBlob,
        filename,
        sizeKB: Math.round(finalBlob.size / 1024)
      };

    } finally {
      konvaLayer.destroy();
      stage.destroy();
      document.body.removeChild(container);
    }
  }
}
