import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { logger } from './logger';

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
  scale: number;
}

export async function ocrPdfPage(
  pdfData: Uint8Array | ArrayBuffer,
  pageNum: number,
  scale: number = 5.0
): Promise<OcrResult> {
  const canvas = document.createElement('canvas');
  
  const buffer = new Uint8Array(pdfData).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const contrast = 1.3;
      const brightness = 0;
      g = ((g - 128) * contrast + 128 + brightness);
      g = Math.max(0, Math.min(255, g));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* 忽略 */ }

  const worker = await getOcrWorker();
  const result = await worker.recognize(canvas, {}, { blocks: true });

  const ocrData = result.data as unknown as {
    text: string;
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          words?: Array<{
            text: string;
            confidence: number;
            bbox: { x0: number; y0: number; x1: number; y1: number };
          }>;
        }>;
      }>;
    }>;
  };

  const vpHeight = viewport.height;
  const userHeight = vpHeight / scale;

  const words: OcrWord[] = [];

  if (ocrData.blocks && ocrData.blocks.length > 0) {
    for (const block of ocrData.blocks) {
      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              if (line.words) {
                for (const w of line.words) {
                  const dx0 = w.bbox.x0 / scale;
                  const dx1 = w.bbox.x1 / scale;
                  const dy0 = w.bbox.y0;
                  const dy1 = w.bbox.y1;
                  
                  const userY0 = (vpHeight - dy1) / scale;
                  const userY1 = (vpHeight - dy0) / scale;

                  if (userY1 < 0 || userY0 > userHeight + 100) {
                    logger.warn(`[OCR] 坐标异常，跳过: y0=${userY0.toFixed(2)}, y1=${userY1.toFixed(2)}, text="${w.text}"`);
                    continue;
                  }
                  
                  words.push({
                    text: w.text,
                    confidence: w.confidence / 100,
                    bbox: {
                      x0: dx0,
                      y0: userY0,
                      x1: dx1,
                      y1: userY1,
                    },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  logger.info(`[OCR] 第${pageNum}页识别完成，共 ${words.length} 个词`);

  return {
    text: ocrData.text,
    words,
    scale,
  };
}

export async function ocrFullPdf(
  pdfData: Uint8Array | ArrayBuffer,
  pageCount: number,
  onProgress?: (page: number, total: number) => void
): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  logger.info(`[OCR] 开始识别 ${pageCount} 页`);
  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(i, pageCount);
    const result = await ocrPdfPage(pdfData, i);
    results.push(result);
  }
  return results;
}

export async function terminateOcrWorker(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}
