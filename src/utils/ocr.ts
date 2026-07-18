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
  // 用户空间坐标（PDF坐标，左下角原点）—— 已转换
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  scale: number;
}

// 设备空间（视口/Canvas）→ 用户空间（PDF）
// 用视口变换矩阵求逆，参考 OCR与画框方案说明.md 第4.3节
function deviceToUser(vp: { transform: number[] }, dx: number, dy: number): [number, number] {
  const [a, b, c, d, e, f] = vp.transform;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return [dx, dy];
  const x = (d * (dx - e) - c * (dy - f)) / det;
  const y = (-b * (dx - e) + a * (dy - f)) / det;
  return [x, y];
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
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  // 灰度预处理：去色降噪，提高 OCR 识别准确率（参考完整解决方案代码.md 第4.3节）
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* 部分环境可能不支持 getImageData，忽略 */ }

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

  const words: OcrWord[] = [];

  const rawWords: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
  if (ocrData.blocks && ocrData.blocks.length > 0) {
    for (const block of ocrData.blocks) {
      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              if (line.words) {
                for (const w of line.words) {
                  rawWords.push(w);
                }
              }
            }
          }
        }
      }
    }
  }

  if (rawWords.length > 0) {
    for (const w of rawWords) {
      // OCR bbox 是 Canvas 像素坐标（设备空间，左上角原点）
      // 1. 除以 scale 得到 PDF 设备坐标
      // 2. 用 deviceToUser 转换为用户空间（PDF坐标，左下角原点）
      const dx0 = w.bbox.x0 / scale;
      const dx1 = w.bbox.x1 / scale;
      const dyTop = w.bbox.y0 / scale;  // Canvas y0 = 文字顶部（y小）
      const dyBot = w.bbox.y1 / scale;  // Canvas y1 = 文字底部（y大）
      
      // 四个角点转换
      const pts = [
        [dx0, dyTop], [dx1, dyTop], [dx0, dyBot], [dx1, dyBot]
      ].map(([dx, dy]) => deviceToUser(viewport, dx, dy));
      
      const uxs = pts.map((p) => p[0]);
      const uys = pts.map((p) => p[1]);
      
      words.push({
        text: w.text,
        confidence: w.confidence / 100,
        bbox: {
          x0: Math.min(...uxs),
          y0: Math.min(...uys),  // 用户空间 y 小 = 底部
          x1: Math.max(...uxs),
          y1: Math.max(...uys),  // 用户空间 y 大 = 顶部
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
