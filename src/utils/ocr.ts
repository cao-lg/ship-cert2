import { createWorker, Worker } from 'tesseract.js';
import { renderPageToCanvas } from './pdfParser';

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
  arrayBuffer: ArrayBuffer,
  pageNum: number,
  scale: number = 2.0
): Promise<OcrResult> {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(arrayBuffer, pageNum, canvas, scale);

  const worker = await getOcrWorker();
  const result = await worker.recognize(canvas);

  // 安全访问words数据（tesseract.js不同版本API差异）
  const data = result.data as unknown as {
    text: string;
    words?: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  };

  const words: OcrWord[] = (data.words || []).map((w) => ({
    text: w.text,
    confidence: w.confidence / 100,
    bbox: {
      x0: w.bbox.x0 / scale,
      y0: w.bbox.y0 / scale,
      x1: w.bbox.x1 / scale,
      y1: w.bbox.y1 / scale,
    },
  }));

  return {
    text: data.text,
    words,
  };
}

// OCR识别整个PDF
export async function ocrFullPdf(
  arrayBuffer: ArrayBuffer,
  pageCount: number,
  onProgress?: (page: number, total: number) => void
): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(i, pageCount);
    const result = await ocrPdfPage(arrayBuffer, i);
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
