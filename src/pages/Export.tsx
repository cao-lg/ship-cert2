import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, FileText, Ship, AlertCircle } from 'lucide-react';
import { useCertStore } from '@/store/certStore';
import { exportExcel, downloadExcel, downloadPdf } from '@/utils/excelExporter';
import { mergePdfsByCertType } from '@/utils/pdfAnnotator';
import { CERT_TYPE_INFO, CERT_MERGE_ORDER, DateType, CertFile, SubCertificate } from '@/types';

export default function ExportPage() {
  const { files, getSortedSubCertificates } = useCertStore();
  const navigate = useNavigate();
  const sortedEntries = getSortedSubCertificates().filter((e) => e.file.status === 'done');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const buffer = await exportExcel(files, { useSubCertificates: true });
      downloadExcel(buffer);
    } catch (e) {
      console.error('Excel export failed:', e);
      alert('Excel导出失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setExportingExcel(false);
    }
  };

  const handleMergePdf = async () => {
    setExportingPdf(true);
    try {
      // 使用已排序的证书列表，确保合并顺序正确
      const pdfInputs = sortedEntries.map((e) => ({
        bytes: e.file.annotatedPdfBytes ?? e.file.pdfBytes,
        certType: e.sub?.certType ?? e.file.certType,
        subCertificates: e.file.subCertificates,
      }));

      if (pdfInputs.length === 0) {
        alert('没有可合并的PDF');
        return;
      }

      const merged = await mergePdfsByCertType(pdfInputs);
      downloadPdf(merged, '船舶证书合并_标注版.pdf');
    } catch (e) {
      console.error('PDF merge failed:', e);
      alert('PDF合并失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setExportingPdf(false);
    }
  };

  const getDateValue = (file: CertFile, sub: SubCertificate | null, dateType: DateType): string => {
    const dates = sub?.dates ?? file.dates;
    return dates.find((d) => d.type === dateType)?.date ?? '';
  };

  const getCertType = (file: CertFile, sub: SubCertificate | null) => sub?.certType ?? file.certType;
  const getCertNumber = (file: CertFile, sub: SubCertificate | null) => sub?.certNumber || file.certNumber;

  // 检查证书是否即将过期
  const getExpiryStatus = (dateStr: string): 'expired' | 'warning' | 'ok' | 'none' => {
    if (!dateStr) return 'none';
    const expiry = new Date(dateStr);
    const now = new Date();
    const days = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (days < 0) return 'expired';
    if (days < 90) return 'warning';
    return 'ok';
  };

  if (sortedEntries.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="text-center">
          <Ship className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-500 mb-2">暂无已处理的证书</h2>
          <p className="text-gray-400 mb-4">请先上传并处理PDF文件</p>
          <button
            onClick={() => navigate('/')}
            className="bg-[#1B6CA8] text-white px-6 py-2.5 rounded-lg hover:bg-[#155A8E] transition-colors"
          >
            去上传
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B46]">证书汇总与导出</h1>
            <p className="text-sm text-gray-500 mt-1">
              共 {sortedEntries.length} 份证书条目，按合并顺序排列
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exportingExcel ? '导出中...' : '导出Excel'}
            </button>
            <button
              onClick={handleMergePdf}
              disabled={exportingPdf}
              className="flex items-center gap-2 bg-[#E53E3E] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {exportingPdf ? '合并中...' : '合并PDF下载'}
            </button>
          </div>
        </div>
      </div>

      {/* 合并顺序提示 */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="bg-[#1B6CA8]/5 border border-[#1B6CA8]/20 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#1B6CA8] mb-2">PDF合并顺序</h3>
          <div className="flex flex-wrap gap-2">
            {CERT_MERGE_ORDER.map((type, idx) => {
              const hasCert = sortedEntries.some((e) => getCertType(e.file, e.sub) === type);
              return (
                <span
                  key={type}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    hasCert
                      ? 'bg-[#1B6CA8] text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {idx + 1}. {type} - {CERT_TYPE_INFO[type].label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* 证书汇总表格 */}
      <div className="max-w-7xl mx-auto px-6 mt-6 pb-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0F2B46] text-white">
                  <th className="px-4 py-3 text-left font-semibold w-12">序号</th>
                  <th className="px-4 py-3 text-left font-semibold w-20">代码</th>
                  <th className="px-4 py-3 text-left font-semibold">证书类型</th>
                  <th className="px-4 py-3 text-left font-semibold">证书编号</th>
                  <th className="px-4 py-3 text-left font-semibold">签发日期</th>
                  <th className="px-4 py-3 text-left font-semibold">有效日期</th>
                  <th className="px-4 py-3 text-left font-semibold">年检日期</th>
                  <th className="px-4 py-3 text-center font-semibold w-20">状态</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => {
                  const certType = getCertType(entry.file, entry.sub);
                  const certInfo = CERT_TYPE_INFO[certType];
                  const certNumber = getCertNumber(entry.file, entry.sub);
                  const issueDate = getDateValue(entry.file, entry.sub, 'ISSUE');
                  const expiryDate = getDateValue(entry.file, entry.sub, 'EXPIRY');
                  const annualDate = getDateValue(entry.file, entry.sub, 'ANNUAL_SURVEY');
                  const expiryStatus = getExpiryStatus(expiryDate);
                  const isSubCert = !!entry.sub;

                  return (
                    <tr key={`${entry.file.id}-${entry.sub?.id ?? 'main'}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          certType !== 'UNKNOWN' ? 'bg-[#1B6CA8] text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {certInfo.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[#0F2B46] font-medium">{certInfo.label}</div>
                        {isSubCert && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            源文件: {entry.file.fileName} (第{entry.sub!.startIndex + 1}-{entry.sub!.endIndex + 1}页)
                          </div>
                        )}
                        {!isSubCert && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]" title={entry.file.fileName}>
                            {entry.file.fileName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {certNumber || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="text-gray-700">{issueDate || '-'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={
                            expiryStatus === 'expired' ? 'text-red-600 font-bold' :
                            expiryStatus === 'warning' ? 'text-amber-600 font-semibold' :
                            'text-gray-700'
                          }>
                            {expiryDate || '-'}
                          </span>
                          {expiryStatus === 'expired' && (
                            <span title="已过期">
                              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            </span>
                          )}
                          {expiryStatus === 'warning' && (
                            <span title="即将过期">
                              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {annualDate || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {expiryStatus === 'expired' ? (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">过期</span>
                        ) : expiryStatus === 'warning' ? (
                          <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">临期</span>
                        ) : expiryStatus === 'ok' ? (
                          <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">有效</span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 底部说明 */}
        <div className="mt-6 text-center text-xs text-gray-400 space-y-1">
          <p>Excel文件包含所有证书日期汇总（按模板格式：序号/证书类型/证书编号/签发日期/有效日期/年检日期/备注）</p>
          <p>合并PDF按 REG → MM → LL → SC → ISSC → IOPP → TON 顺序排列，多证书PDF会自动分割</p>
          <p>红色标签 = 已过期 · 黄色标签 = 90天内到期 · 绿色标签 = 有效</p>
        </div>
      </div>
    </div>
  );
}
