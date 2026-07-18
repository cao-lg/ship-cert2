import { CertFile, SubCertificate, CERT_TYPE_INFO } from '@/types';
import { parsePdf, renderPageToCanvas } from './pdfParser';
import { ocrFullPdf, OcrResult } from './ocr';
import { recognizeDatesFromText, recognizeDatesFromOcr } from './dateRecognizer';
import { annotatePdf, annotateImagePdf } from './pdfAnnotator';
import { detectCertType, detectCertNumber, detectSubCertificates } from '@/store/certStore';

// 处理单个证书文件：解析、识别、标注
export async function processCertFile(
  file: CertFile,
  onProgress?: (stage: string, progress: number) => void
): Promise<Partial<CertFile>> {
  try {
    // 1. 解析PDF
    onProgress?.('解析PDF...', 0.1);
    const parseResult = await parsePdf(file.pdfBytes);

    // 2. 识别证书类型（用于单证书PDF）
    onProgress?.('识别证书类型...', 0.2);
    const certType = detectCertType(file.fileName, parseResult.textContent);
    const certNumber = detectCertNumber(parseResult.textContent);

    // 3. 识别日期
    let dates;
    let subCertificates: SubCertificate[] | undefined;
    let ocrScale = 3.0;

    if (parseResult.isImageBased) {
      // 图片型PDF：OCR识别
      onProgress?.('OCR识别中...', 0.3);
      const ocrResults = await ocrFullPdf(file.pdfBytes, parseResult.pageCount, (page, total) => {
        onProgress?.(`OCR识别第${page}/${total}页...`, 0.3 + (page / total) * 0.4);
      });
      ocrScale = ocrResults[0]?.scale || 3.0;
      dates = recognizeDatesFromOcr(ocrResults);
    } else {
      // 文本型PDF：直接识别
      onProgress?.('提取日期信息...', 0.4);
      dates = recognizeDatesFromText(parseResult.textItems, parseResult.textContent);

      // 检测多证书PDF
      const detectedSubs = detectSubCertificates(parseResult.textItems, parseResult.pageCount);
      if (detectedSubs.length > 1) {
        subCertificates = detectedSubs.map((sub) => {
          const subTextItems = parseResult.textItems.filter(
            (item) => item.page >= sub.startIndex + 1 && item.page <= sub.endIndex + 1
          );
          const subFullText = subTextItems.map((item) => item.text).join(' ');
          const subDates = recognizeDatesFromText(subTextItems, subFullText);
          const subCertNumber = detectCertNumber(subFullText);
          return { ...sub, dates: subDates, certNumber: subCertNumber };
        });
      }
    }

    // 4. 标注PDF
    onProgress?.('标注PDF...', 0.8);
    let annotatedPdfBytes: Uint8Array | null = null;
    const allDates = subCertificates
      ? subCertificates.flatMap((s) => s.dates)
      : dates;
    if (allDates.length > 0) {
      const datesToAnnotate = allDates.filter(d => d.type === 'EXPIRY' || d.type === 'ANNUAL_SURVEY');
      if (datesToAnnotate.length > 0) {
        if (parseResult.isImageBased) {
          annotatedPdfBytes = await annotateImagePdf(file.pdfBytes, datesToAnnotate, 2.0);
        } else {
          annotatedPdfBytes = await annotatePdf(file.pdfBytes, datesToAnnotate);
        }
      }
    }

    onProgress?.('完成', 1.0);

    return {
      certType,
      certNumber,
      dates,
      subCertificates,
      annotatedPdfBytes,
      isImageBased: parseResult.isImageBased,
      status: 'done',
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

export { renderPageToCanvas };
