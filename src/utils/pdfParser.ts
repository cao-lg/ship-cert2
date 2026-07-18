import * as pdfjsLib from 'pdfjs-dist';
import { TextItem } from '@/types';

// 设置worker路径
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface ParseResult {
  textContent: string;
  textItems: TextItem[];
  isImageBased: boolean;
  pageCount: number;
}

// 解析PDF文本内容
export async function parsePdf(arrayBuffer: ArrayBuffer): Promise<ParseResult> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;
  const allTextItems: TextItem[] = [];
  let fullText = '';
  let meaningfulTextCount = 0;
  let totalItems = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const str = (item as { str: string }).str;
      totalItems++;

      if (str.trim().length > 1) {
        meaningfulTextCount++;
      }

      const transform = (item as { transform: number[] }).transform;
      const itemHeight = Math.abs(transform[3]) || 12;
      const itemWidth = Math.abs(transform[0] * str.length) || str.length * 8;

      allTextItems.push({
        text: str,
        x: transform[4],
        y: viewport.height - transform[5] - itemHeight,
        width: itemWidth,
        height: itemHeight,
        page: pageNum,
      });

      fullText += str + ' ';
    }
    fullText += '\n';
  }

  // 判断是否为图片型PDF：有效文本少于20%
  const isImageBased = totalItems === 0 || meaningfulTextCount / totalItems < 0.3;

  return {
    textContent: fullText,
    textItems: allTextItems,
    isImageBased,
    pageCount,
  };
}

// 渲染PDF页面到Canvas
export async function renderPageToCanvas(
  arrayBuffer: ArrayBuffer,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<void> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
}

// 获取PDF页数
export async function getPdfPageCount(arrayBuffer: ArrayBuffer): Promise<number> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}

export { pdfjsLib };
