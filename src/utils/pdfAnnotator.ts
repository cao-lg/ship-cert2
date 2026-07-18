import { PDFDocument, rgb } from 'pdf-lib';
import { RecognizedDate, SubCertificate, CERT_MERGE_ORDER, CertType } from '@/types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// 在PDF上绘制红色标注框（文本型PDF用pdf-lib直接画）
export async function annotatePdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  dates: RecognizedDate[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const dateInfo of dates) {
    const pageIndex = dateInfo.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { height } = page.getSize();
    const pos = dateInfo.position;

    const x = pos.x;
    const y = pos.y;
    const width = Math.max(pos.width, 20);
    const heightRect = Math.max(pos.height, 10);

    page.drawRectangle({
      x,
      y,
      width,
      height: heightRect,
      borderColor: rgb(1, 0, 0),
      borderWidth: 2,
      color: rgb(1, 0, 0),
      opacity: 0.05,
    });
  }

  return pdfDoc.save();
}

// 图片型PDF标注：渲染到Canvas → 直接在Canvas上画框 → 转成PDF
// 这样完全避免坐标转换，OCR的Canvas坐标直接用
export async function annotateImagePdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  dates: RecognizedDate[],
  scale: number = 3.0
): Promise<Uint8Array> {
  const buffer = new Uint8Array(pdfBytes).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = pdf.numPages;

  // 按页分组日期
  const datesByPage = new Map<number, RecognizedDate[]>();
  for (const d of dates) {
    const pageDates = datesByPage.get(d.page) || [];
    pageDates.push(d);
    datesByPage.set(d.page, pageDates);
  }

  const outputPdf = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    // 渲染PDF页面到Canvas
    await page.render({ canvasContext: ctx, viewport }).promise;

    // 在Canvas上直接画红框（用OCR的原始Canvas坐标，无需转换！）
    const pageDates = datesByPage.get(pageNum) || [];
    for (const d of pageDates) {
      const pos = d.position;
      // pos存的就是Canvas像素坐标（OCR原始坐标）
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
    }

    // 把Canvas转成PNG，嵌入新PDF
    const pngData = canvas.toDataURL('image/png');
    const pngBytes = await fetch(pngData).then((r) => r.arrayBuffer());
    const pngImage = await outputPdf.embedPng(pngBytes);

    // 创建与原始页面相同尺寸的PDF页
    const origViewport = page.getViewport({ scale: 1.0 });
    const newPage = outputPdf.addPage([origViewport.width, origViewport.height]);
    newPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
  }

  return outputPdf.save();
}

// 获取证书类型排序值
function getCertTypeOrder(certType: CertType): number {
  const order = CERT_MERGE_ORDER.indexOf(certType);
  return order === -1 ? CERT_MERGE_ORDER.length : order;
}

// 按证书类型顺序合并PDF（支持多证书PDF的子证书分割）
export async function mergePdfsByCertType(
  files: Array<{
    bytes: Uint8Array;
    certType: CertType;
    subCertificates?: SubCertificate[];
  }>
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  interface MergeItem {
    bytes: Uint8Array;
    order: number;
    startIndex?: number;
    endIndex?: number;
    certType: CertType;
  }

  const items: MergeItem[] = [];

  for (const file of files) {
    if (file.subCertificates && file.subCertificates.length > 0) {
      for (const sub of file.subCertificates) {
        items.push({
          bytes: file.bytes,
          order: getCertTypeOrder(sub.certType),
          certType: sub.certType,
          startIndex: sub.startIndex,
          endIndex: sub.endIndex,
        });
      }
    } else {
      items.push({
        bytes: file.bytes,
        order: getCertTypeOrder(file.certType),
        certType: file.certType,
      });
    }
  }

  items.sort((a, b) => a.order - b.order);

  for (const item of items) {
    try {
      const srcDoc = await PDFDocument.load(item.bytes);
      const totalPages = srcDoc.getPageIndices();

      let pageIndices: number[];
      if (item.startIndex !== undefined && item.endIndex !== undefined) {
        pageIndices = totalPages.filter(
          (idx) => idx >= item.startIndex! && idx <= item.endIndex!
        );
      } else {
        pageIndices = totalPages;
      }

      if (pageIndices.length > 0) {
        const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);
        for (const page of copiedPages) {
          mergedPdf.addPage(page);
        }
      }
    } catch (e) {
      console.error('Failed to merge PDF:', e);
    }
  }

  return mergedPdf.save();
}
