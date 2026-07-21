import { PDFDocument, rgb } from 'pdf-lib';
import { RecognizedDate, SubCertificate, CERT_MERGE_ORDER, CertType } from '@/types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// 在PDF上绘制红色标注框（用户空间坐标，pdf-lib直接画）
// 参考文档第7节：独立内容流，坐标直接用用户空间
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
    const pos = dateInfo.position;

    // pos 存的是用户空间坐标（PDF点，左下角原点）
    // y0 = 底部，y1 = 顶部
    const pad = 4;
    const x = pos.x - pad;
    const y = pos.y - pad;  // pos.y 是底部
    const width = Math.max(pos.width, 20) + pad * 2;
    const heightRect = Math.max(pos.height, 10) + pad * 2;

    // 钳制到页面内
    const { width: pw, height: ph } = page.getSize();
    const xClamped = Math.max(0, Math.min(x, pw));
    const yClamped = Math.max(0, Math.min(y, ph));
    const wClamped = Math.min(width, pw - xClamped);
    const hClamped = Math.min(heightRect, ph - yClamped);

    page.drawRectangle({
      x: xClamped,
      y: yClamped,
      width: wClamped,
      height: hClamped,
      borderColor: rgb(1, 0, 0),
      borderWidth: 2,
      opacity: 0,  // 完全透明填充，不遮挡文字
      borderOpacity: 1,
    });
  }

  return pdfDoc.save();
}

export async function annotateImagePdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  dates: RecognizedDate[],
  scale: number = 3.0
): Promise<Uint8Array> {
  const buffer = new Uint8Array(pdfBytes).slice().buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = pdf.numPages;

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
    const origViewport = page.getViewport({ scale: 1.0 });
    const pageWidth = origViewport.width;
    const pageHeight = origViewport.height;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pageDates = datesByPage.get(pageNum) || [];
    const canvasHeight = viewport.height;
    
    for (const d of pageDates) {
      const pos = d.position;
      const x = pos.x * scale;
      const w = pos.width * scale;
      const h = pos.height * scale;
      const y = canvasHeight - (pos.y + pos.height) * scale;
      
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    const pngData = canvas.toDataURL('image/png');
    const base64 = pngData.split(',')[1];
    const binaryString = atob(base64);
    const pngBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      pngBytes[i] = binaryString.charCodeAt(i);
    }
    const pngImage = await outputPdf.embedPng(pngBytes);

    const newPage = outputPdf.addPage([pageWidth, pageHeight]);
    newPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
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
