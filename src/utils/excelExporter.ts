import ExcelJS from 'exceljs';
import { CertFile, CERT_TYPE_INFO, CERT_MERGE_ORDER, SubCertificate, RecognizedDate } from '@/types';

// 获取证书的显示类型代码（如 1101-船舶国籍证书）
function getCertTypeDisplay(certType: CertFile['certType']): string {
  const info = CERT_TYPE_INFO[certType];
  return `${info.code}-${info.label}`;
}

// 获取日期值
function getDateValue(dates: RecognizedDate[], type: RecognizedDate['type']): string {
  const date = dates.find((d) => d.type === type)?.date;
  return date || '';
}

// 格式化日期为 YYYY/MM/DD（匹配Excel模板格式）
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // 已经是 YYYY-MM-DD 格式，转换为 YYYY/MM/DD
  return dateStr.replace(/-/g, '/');
}

// 导出证书汇总Excel - 匹配模板格式
export async function exportExcel(
  files: CertFile[],
  options?: { useSubCertificates?: boolean }
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('船舶证书信息');

  // 匹配Excel模板的列结构
  const headers = [
    '*序号',
    '证书类型',
    '证书编号',
    '签发日期',
    '有效日期',
    '年检日期',
    '备注',
  ];

  // 设置列宽（参考模板）
  sheet.columns = [
    { width: 8 },   // 序号
    { width: 35 },  // 证书类型
    { width: 25 },  // 证书编号
    { width: 15 },  // 签发日期
    { width: 15 },  // 有效日期
    { width: 15 },  // 年检日期
    { width: 30 },  // 备注
  ];

  // 添加表头行
  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F2B46' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin', color: { argb: 'FF1B6CA8' } },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // 收集所有证书条目（考虑多证书PDF）
  interface ExportEntry {
    certType: CertFile['certType'];
    certNumber: string;
    issueDate: string;
    expiryDate: string;
    annualDate: string;
    remark: string;
    fileName: string;
  }

  const entries: ExportEntry[] = [];

  for (const file of files) {
    // 如果有子证书，按子证书分别导出
    if (options?.useSubCertificates && file.subCertificates && file.subCertificates.length > 0) {
      for (const sub of file.subCertificates) {
        entries.push({
          certType: sub.certType,
          certNumber: sub.certNumber || file.certNumber,
          issueDate: getDateValue(sub.dates, 'ISSUE'),
          expiryDate: getDateValue(sub.dates, 'EXPIRY'),
          annualDate: getDateValue(sub.dates, 'ANNUAL_SURVEY'),
          remark: `${file.fileName} (第${sub.startIndex + 1}-${sub.endIndex + 1}页)`,
          fileName: file.fileName,
        });
      }
    } else {
      // 单证书PDF或无子证书
      entries.push({
        certType: file.certType,
        certNumber: file.certNumber,
        issueDate: getDateValue(file.dates, 'ISSUE'),
        expiryDate: getDateValue(file.dates, 'EXPIRY'),
        annualDate: getDateValue(file.dates, 'ANNUAL_SURVEY'),
        remark: file.fileName,
        fileName: file.fileName,
      });
    }
  }

  // 按合并顺序排序
  entries.sort((a, b) => {
    const orderA = CERT_MERGE_ORDER.indexOf(a.certType);
    const orderB = CERT_MERGE_ORDER.indexOf(b.certType);
    const idxA = orderA === -1 ? CERT_MERGE_ORDER.length : orderA;
    const idxB = orderB === -1 ? CERT_MERGE_ORDER.length : orderB;
    return idxA - idxB;
  });

  // 添加数据行
  entries.forEach((entry, index) => {
    const row = sheet.addRow([
      index + 1,
      getCertTypeDisplay(entry.certType),
      entry.certNumber,
      formatDate(entry.issueDate),
      formatDate(entry.expiryDate),
      formatDate(entry.annualDate),
      entry.remark,
    ]);

    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.alignment = {
        horizontal: colNumber === 1 ? 'center' : 'left',
        vertical: 'middle',
      };

      // 日期列居中
      if (colNumber >= 4 && colNumber <= 6) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // 过期日期高亮
      if (colNumber === 5 && entry.expiryDate) {
        const expiry = new Date(entry.expiryDate);
        const now = new Date();
        const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry < 0) {
          cell.font = { color: { argb: 'FFFF0000' }, bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' },
          };
        } else if (daysUntilExpiry < 90) {
          cell.font = { color: { argb: 'FFCC6600' }, bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF7E0' },
          };
        }
      }
    });
  });

  // 添加边框
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });
  });

  // 添加说明信息行（参考模板）
  const noteRow = sheet.addRow([]);
  noteRow.getCell(1).value = '说明：';
  noteRow.getCell(2).value = '*序号必填，不可间断；日期格式支持 YYYY/MM/DD 或 YYYYMMDD 或 YYYY-MM-DD';
  noteRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  noteRow.getCell(2).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  sheet.mergeCells(`B${noteRow.number}:G${noteRow.number}`);

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

// 下载Excel文件
export function downloadExcel(buffer: ArrayBuffer, fileName: string = '船舶证书信息.xlsx'): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// 下载PDF文件
export function downloadPdf(buffer: Uint8Array | ArrayBuffer, fileName: string = 'Merged_Ship_Certificates.pdf'): void {
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
