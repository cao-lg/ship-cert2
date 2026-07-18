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
  pdfData: Uint8Array | ArrayBuffer,
  pageNum: number,
  scale: number = 2.0
): Promise<OcrResult> {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(pdfData, pageNum, canvas, scale);
  const pageHeight = canvas.height / scale;

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

  // 使用lines数据（比words更可靠，有明确的行结构）
  const words: OcrWord[] = [];

  if (ocrData.lines && ocrData.lines.length > 0) {
    for (const line of ocrData.lines) {
      const lineY0 = line.bbox.y0 / scale;
      const lineY1 = line.bbox.y1 / scale;
      const lineHeight = lineY1 - lineY0;
      const lineBottom = pageHeight - lineY1; // PDF坐标：行底部
      const lineTop = pageHeight - lineY0; // PDF坐标：行顶部

      if (line.words && line.words.length > 0) {
        for (const w of line.words) {
          const x0 = w.bbox.x0 / scale;
          const x1 = w.bbox.x1 / scale;
          words.push({
            text: w.text,
            confidence: w.confidence ? w.confidence / 100 : (line.confidence || 0) / 100,
            bbox: {
              x0,
              y0: lineBottom,  // 行底部
              x1,
              y1: lineTop,     // 行顶部
            },
          });
        }
      } else {
        // 如果行没有words，就把整行作为一个word
        const x0 = line.bbox.x0 / scale;
        const x1 = line.bbox.x1 / scale;
        words.push({
          text: line.text,
          confidence: (line.confidence || 0) / 100,
          bbox: {
            x0,
            y0: lineBottom,
            x1,
            y1: lineTop,
          },
        });
      }
    }
  } else if (ocrData.words) {
    // 回退到words
    for (const w of ocrData.words) {
      const x0 = w.bbox.x0 / scale;
      const y0 = w.bbox.y0 / scale;
      const x1 = w.bbox.x1 / scale;
      const y1 = w.bbox.y1 / scale;
      words.push({
        text: w.text,
        confidence: w.confidence / 100,
        bbox: {
          x0,
          y0: pageHeight - y1,  // 底部
          x1,
          y1: pageHeight - y0,  // 顶部
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
