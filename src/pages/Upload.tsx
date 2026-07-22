import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, Ship, AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useCertStore } from '@/store/certStore';
import { processCertFile } from '@/utils/processor';
import { CertType, CERT_TYPE_INFO, CertFile } from '@/types';
import { CHANGELOG, getBuildTimestamp } from '@/config/changelog';
import LogPanel from '@/components/LogPanel';

export default function UploadPage() {
  const { files, addFile, removeFile, updateFile, setCertType } = useCertStore();
  const navigate = useNavigate();
  const [showChangelog, setShowChangelog] = useState(false);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfFiles.length === 0) return;

    for (const file of pdfFiles) {
      const certFile = await addFile(file);
      processFile(certFile);
    }
  }, [addFile]);

  const processFile = async (certFile: CertFile) => {
    updateFile(certFile.id, { status: 'processing' });
    const result = await processCertFile(certFile, (stage) => {
      // 可以在这里更新进度
    });
    updateFile(certFile.id, result);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  }, [handleFiles]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const doneCount = files.filter((f) => f.status === 'done').length;

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* 顶部标题区 */}
      <div className="bg-gradient-to-r from-[#0F2B46] to-[#1B6CA8] text-white py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Ship className="w-8 h-8" />
            <h1 className="text-3xl font-bold tracking-tight">船舶证书 PDF 标注工具</h1>
          </div>
          <p className="text-blue-200 text-lg">
            纯前端 · 浏览器本地处理 · 文件不上传服务器
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-6">
        {/* 上传区域 */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="bg-white rounded-xl shadow-lg border-2 border-dashed border-[#1B6CA8]/30 hover:border-[#1B6CA8] transition-colors p-12 text-center cursor-pointer"
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <Upload className="w-12 h-12 mx-auto text-[#1B6CA8] mb-4" />
          <h3 className="text-xl font-semibold text-[#0F2B46] mb-2">拖拽PDF文件到此处上传</h3>
          <p className="text-gray-500 mb-4">或点击选择文件，支持批量上传，仅限PDF格式</p>
          <div className="inline-flex items-center gap-2 bg-[#1B6CA8] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#155A8E] transition-colors">
            <FileText className="w-4 h-4" />
            选择PDF文件
          </div>
          <input
            id="file-input"
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        {/* 文件列表 */}
        {files.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#0F2B46]">
                已上传文件 ({files.length})
              </h2>
              <span className="text-sm text-gray-500">
                已处理 {doneCount}/{files.length}
              </span>
            </div>

            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                >
                  {/* 状态图标 */}
                  <div className="flex-shrink-0">
                    {file.status === 'done' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                    {file.status === 'processing' && <Loader2 className="w-6 h-6 text-[#1B6CA8] animate-spin" />}
                    {file.status === 'pending' && <FileText className="w-6 h-6 text-gray-400" />}
                    {file.status === 'error' && <AlertCircle className="w-6 h-6 text-red-500" />}
                  </div>

                  {/* 文件信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-[#0F2B46] truncate">{file.fileName}</span>
                      {file.isImageBased && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">扫描件</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatSize(file.fileSize)}
                      {file.dates.length > 0 && ` · 识别到 ${file.dates.length} 个日期`}
                      {file.error && <span className="text-red-500 ml-2">{file.error}</span>}
                    </div>
                  </div>

                  {/* 证书类型选择 */}
                  <div className="flex-shrink-0">
                    <select
                      value={file.certType}
                      onChange={(e) => setCertType(file.id, e.target.value as CertType)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1B6CA8] focus:border-transparent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {Object.entries(CERT_TYPE_INFO).map(([type, info]) => (
                        <option key={type} value={type}>
                          {type} - {info.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={() => navigate('/annotate')}
                disabled={doneCount === 0}
                className="flex-1 bg-[#1B6CA8] text-white py-3 rounded-lg font-semibold hover:bg-[#155A8E] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                查看识别结果与标注
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('file-input');
                  input?.click();
                }}
                className="px-6 py-3 border-2 border-[#1B6CA8] text-[#1B6CA8] rounded-lg font-semibold hover:bg-[#1B6CA8]/5 transition-colors"
              >
                继续添加
              </button>
            </div>
          </div>
        )}

        {/* 空状态提示 */}
        {files.length === 0 && (
          <div className="mt-12 text-center text-gray-400">
            <p className="text-sm">支持的证书类型：REG / MM / LL / SC / ISSC / IOPP / TON / SMC / CLC / DOC / COF / SE / SR</p>
          </div>
        )}

        {/* 更新日志 */}
        <div className="mt-8 mb-12">
          <button
            onClick={() => setShowChangelog(!showChangelog)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1B6CA8] transition-colors mx-auto"
          >
            <Clock className="w-4 h-4" />
            <span>构建时间: {getBuildTimestamp()}</span>
            {showChangelog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showChangelog && (
            <div className="max-w-2xl mx-auto mt-4 bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <h3 className="text-base font-semibold text-[#0F2B46] mb-4">更新日志</h3>
              <div className="space-y-4">
                {CHANGELOG.map((entry) => (
                  <div key={entry.version} className="border-l-2 border-[#1B6CA8]/30 pl-4">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-semibold text-[#1B6CA8]">{entry.version}</span>
                      <span className="text-xs text-gray-400">{entry.date}</span>
                    </div>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {entry.changes.map((change, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#1B6CA8] mt-0.5">•</span>
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部版权声明 */}
      <div className="bg-white border-t border-gray-100 py-6 px-6 mt-8">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm text-gray-500 mb-3">
            本工具所有计算均在你的浏览器本地完成，PDF 与证书信息不会离开本机；扫描件 OCR 亦在本地完成，不上传任何图片。
          </p>
          <p className="text-sm text-gray-500">
            © 2026 广东科学技术职业学院 商学院 数据分析技能大师工作室。本工具当前免费提供使用，可用于个人与企业内部的船舶证书整理；未经授权不得用于商业转售或包装为收费服务。识别结果仅供参考，请以证书原件为准。
          </p>
        </div>
      </div>

      <LogPanel />
    </div>
  );
}
