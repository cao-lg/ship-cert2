import { CertFile, SubCertificate, CERT_TYPE_INFO, RecognizedDate } from '@/types';
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
    let dates: RecognizedDate[] = [];
    let subCertificates: SubCertificate[] | undefined;
    let isImageBased = parseResult.isImageBased;
    let ocrScale = 3.0;

    // 先尝试文本识别（即使是图片型PDF也先试试）
    onProgress?.('提取日期信息...', 0.3);
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

    const allTextDates = subCertificates
      ? subCertificates.flatMap((s) => s.dates)
      : dates;

    // 如果文本识别不到日期，或者是图片型PDF，尝试OCR
    if (allTextDates.length === 0 || isImageBased) {
      if (isImageBased || allTextDates.length === 0) {
        onProgress?.('OCR识别中...', 0.4);
        const ocrResults = await ocrFullPdf(file.pdfBytes, parseResult.pageCount, (page, total) => {
          onProgress?.(`OCR识别第${page}/${total}页...`, 0.4 + (page / total) * 0.35);
        });
        ocrScale = ocrResults[0]?.scale || 3.0;
        const ocrDates = recognizeDatesFromOcr(ocrResults);
        
        // 如果OCR识别到更多日期，用OCR结果
        if (ocrDates.length > allTextDates.length) {
          dates = ocrDates;
          isImageBased = true;
          subCertificates = undefined; // OCR不支持多证书检测
        }
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
        if (isImageBased) {
          annotatedPdfBytes = await annotateImagePdf(file.pdfBytes, datesToAnnotate, 5.0);
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
      isImageBased,
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
