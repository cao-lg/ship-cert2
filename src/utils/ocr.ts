import { createWorker, Worker } from 'tesseract.js';
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
  // Canvas坐标（左上角原点，y向下）—— 原始OCR坐标，不转换
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  // 渲染时的scale，用于后续坐标转换
  scale: number;
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

  const worker = await getOcrWorker();
  const result = await worker.recognize(canvas);

  const ocrData = result.data as unknown as {
    text: string;
    words?: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  };

  const words: OcrWord[] = [];

  if (ocrData.words && ocrData.words.length > 0) {
    for (const w of ocrData.words) {
      // 保留原始Canvas坐标（像素坐标），不转换
      words.push({
        text: w.text,
        confidence: w.confidence / 100,
        bbox: {
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1,
        },
      });
    }
  }

  return {
    text: ocrData.text,
    words,
    scale,
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
