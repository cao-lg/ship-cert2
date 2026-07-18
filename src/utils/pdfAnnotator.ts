import { PDFDocument, rgb } from 'pdf-lib';
import { RecognizedDate, SubCertificate, CERT_MERGE_ORDER, CertType } from '@/types';

// 在PDF上绘制红色标注框
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

  // 收集所有合并条目
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
      // 多证书PDF：按子证书分割
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
      // 单证书PDF
      items.push({
        bytes: file.bytes,
        order: getCertTypeOrder(file.certType),
        certType: file.certType,
      });
    }
  }

  // 按order排序（即按证书类型合并顺序）
  items.sort((a, b) => a.order - b.order);

  for (const item of items) {
    try {
      const srcDoc = await PDFDocument.load(item.bytes);
      const totalPages = srcDoc.getPageIndices();

      // 如果指定了页面范围，只复制该范围
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
