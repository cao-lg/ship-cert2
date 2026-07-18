import { createWorker, Worker } from 'tesseract.js';
import { renderPageToCanvas } from './pdfParser';
import * as pdfjsLib from 'pdfjs-dist';

let ocrWorker: Worker | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorker) {
    ocrWorker = await createWorker('eng');
  }
  return ocrWorker;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
}

// OCR识别PDF页面
export async function ocrPdfPage(
  pdfData: Uint8Array | ArrayBuffer,
  pageNum: number,
  scale: number = 3.0
): Promise<OcrResult> {
  const canvas = document.createElement('canvas');
  
  const buffer = new Uint8Array(pdfData).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  const pageHeight = viewport.height / scale;

  const worker = await getOcrWorker();
  const result = await worker.recognize(canvas);

  const ocrData = result.data as unknown as {
    text: string;
    words?: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
    lines?: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      words?: Array<{ text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    }>;
  };

  const words: OcrWord[] = [];

  if (ocrData.lines && ocrData.lines.length > 0) {
      for (const line of ocrData.lines) {
        if (line.words && line.words.length > 0) {
          for (const w of line.words) {
            const canvasX0 = w.bbox.x0 / scale;
            const canvasY0 = w.bbox.y0 / scale;
            const canvasX1 = w.bbox.x1 / scale;
            const canvasY1 = w.bbox.y1 / scale;
            
            words.push({
              text: w.text,
              confidence: w.confidence ? w.confidence / 100 : (line.confidence || 0) / 100,
              bbox: {
                x0: canvasX0,
                y0: pageHeight - canvasY1,
                x1: canvasX1,
                y1: pageHeight - canvasY0,
              },
            });
          }
        } else {
          const canvasX0 = line.bbox.x0 / scale;
          const canvasY0 = line.bbox.y0 / scale;
          const canvasX1 = line.bbox.x1 / scale;
          const canvasY1 = line.bbox.y1 / scale;
          
          words.push({
            text: line.text,
            confidence: (line.confidence || 0) / 100,
            bbox: {
              x0: canvasX0,
              y0: pageHeight - canvasY1,
              x1: canvasX1,
              y1: pageHeight - canvasY0,
            },
          });
        }
      }
    } else if (ocrData.words) {
      for (const w of ocrData.words) {
        const canvasX0 = w.bbox.x0 / scale;
        const canvasY0 = w.bbox.y0 / scale;
        const canvasX1 = w.bbox.x1 / scale;
        const canvasY1 = w.bbox.y1 / scale;
        words.push({
          text: w.text,
          confidence: w.confidence / 100,
          bbox: {
            x0: canvasX0,
            y0: pageHeight - canvasY1,
            x1: canvasX1,
            y1: pageHeight - canvasY0,
          },
        });
      }
    }

  return {
    text: ocrData.text,
    words,
  };
}

// OCR识别整个PDF
export async function ocrFullPdf(
  pdfData: Uint8Array | ArrayBuffer,
  pageCount: number,
  onProgress?: (page: number, total: number) => void
): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(i, pageCount);
    const result = await ocrPdfPage(pdfData, i);
    results.push(result);
  }
  return results;
}

// 终止OCR worker释放资源
export async function terminateOcrWorker(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}
