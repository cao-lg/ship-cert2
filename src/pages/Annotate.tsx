import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, ArrowRight, Ship, Calendar } from 'lucide-react';
import { useCertStore } from '@/store/certStore';
import { renderPageToCanvas, getPdfPageCount } from '@/utils/pdfParser';
import { annotatePdf, annotateImagePdf } from '@/utils/pdfAnnotator';
import { CertType, CERT_TYPE_INFO, DATE_TYPE_INFO, RecognizedDate, CertFile } from '@/types';

export default function AnnotatePage() {
  const { files, activeFileId, setActiveFile, setCertType, setDate, updateFile } = useCertStore();
  const navigate = useNavigate();

  const doneFiles = files.filter((f) => f.status === 'done');
  const activeFile = doneFiles.find((f) => f.id === activeFileId) ?? doneFiles[0] ?? null;

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [viewAnnotated, setViewAnnotated] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 加载PDF页面
  useEffect(() => {
    if (!activeFile) return;
    getPdfPageCount(activeFile.pdfBytes).then(setTotalPages);
    setCurrentPage(1);
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile || !canvasRef.current) return;
    const pdfBytes = viewAnnotated && activeFile.annotatedPdfBytes
      ? activeFile.annotatedPdfBytes
      : activeFile.pdfBytes;
    renderPageToCanvas(pdfBytes, currentPage, canvasRef.current, scale);
  }, [activeFile, currentPage, scale, viewAnnotated]);

  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const handleZoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

  // 重新标注
  const reAnnotate = useCallback(async (file: CertFile) => {
    if (file.dates.length === 0) return;
    const datesToAnnotate = file.dates.filter(d => d.type === 'EXPIRY' || d.type === 'ANNUAL_SURVEY');
    if (datesToAnnotate.length === 0) return;
    
    const annotated = file.isImageBased
      ? await annotateImagePdf(file.pdfBytes, datesToAnnotate, 5.0)
      : await annotatePdf(file.pdfBytes, datesToAnnotate);
    updateFile(file.id, { annotatedPdfBytes: annotated });
  }, [updateFile]);

  // 日期修改后重新标注
  const handleDateChange = useCallback((fileId: string, dateIndex: number, newDate: string) => {
    setDate(fileId, dateIndex, newDate);
    const file = files.find((f) => f.id === fileId);
    if (file) {
      const updatedDates = [...file.dates];
      updatedDates[dateIndex] = { ...updatedDates[dateIndex], date: newDate };
      const datesToAnnotate = updatedDates.filter(d => d.type === 'EXPIRY' || d.type === 'ANNUAL_SURVEY');
      const annotateFn = file.isImageBased ? annotateImagePdf : annotatePdf;
      const annotateScale = file.isImageBased ? 5.0 : undefined;
      annotateFn(file.pdfBytes, datesToAnnotate, annotateScale).then((annotated) => {
        updateFile(fileId, { annotatedPdfBytes: annotated });
      });
    }
  }, [files, setDate, updateFile]);

  if (doneFiles.length === 0) {
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
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-[#1B6CA8] hover:text-[#155A8E] font-medium text-sm">
          上传
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-[#0F2B46] font-medium text-sm">识别与标注</span>
        <div className="flex-1" />
        <button
          onClick={() => navigate('/export')}
          className="flex items-center gap-2 bg-[#1B6CA8] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#155A8E] transition-colors"
        >
          汇总导出
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧文件列表 */}
        <div className="w-56 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">证书列表</h3>
          </div>
          {doneFiles.map((file) => (
            <button
              key={file.id}
              onClick={() => setActiveFile(file.id)}
              className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 transition-colors ${
                activeFile?.id === file.id
                  ? 'bg-[#1B6CA8]/5 border-l-2 border-l-[#1B6CA8] text-[#0F2B46] font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  file.certType !== 'UNKNOWN' ? 'bg-[#1B6CA8] text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {file.certType}
                </span>
                <span className="truncate">{file.fileName}</span>
              </div>
              {file.dates.length > 0 && (
                <div className="text-xs text-gray-400 mt-0.5 ml-7">
                  {file.dates.length} 个日期
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 中间PDF预览 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* PDF工具栏 */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3">
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-100 rounded" title="缩小">
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm text-gray-600 min-w-[60px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-100 rounded" title="放大">
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <button onClick={handlePrevPage} disabled={currentPage <= 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm text-gray-600">{currentPage} / {totalPages}</span>
            <button onClick={handleNextPage} disabled={currentPage >= totalPages} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={viewAnnotated}
                onChange={(e) => setViewAnnotated(e.target.checked)}
                className="rounded border-gray-300 text-[#1B6CA8] focus:ring-[#1B6CA8]"
              />
              显示标注
            </label>
          </div>

          {/* PDF Canvas */}
          <div className="flex-1 overflow-auto bg-gray-100 flex justify-center p-4">
            <canvas
              ref={canvasRef}
              className="shadow-lg bg-white"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
        </div>

        {/* 右侧识别结果面板 */}
        <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
          {activeFile && (
            <div className="p-4">
              {/* 证书类型 */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">证书类型</h3>
                <select
                  value={activeFile.certType}
                  onChange={(e) => {
                    setCertType(activeFile.id, e.target.value as CertType);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
                >
                  {Object.entries(CERT_TYPE_INFO).map(([type, info]) => (
                    <option key={type} value={type}>
                      {type} - {info.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 日期识别结果 */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  识别结果
                </h3>

                {activeFile.dates.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4 text-center">
                    未识别到日期信息
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeFile.dates.map((dateInfo, idx) => (
                      <DateCard
                        key={`${dateInfo.type}-${idx}`}
                        dateInfo={dateInfo}
                        index={idx}
                        fileId={activeFile.id}
                        onChange={handleDateChange}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 证书信息摘要 */}
              <div className="bg-[#F7F8FA] rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>文件名</span>
                  <span className="text-[#0F2B46] font-medium truncate ml-2 max-w-[150px]" title={activeFile.fileName}>
                    {activeFile.fileName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>PDF类型</span>
                  <span className={activeFile.isImageBased ? 'text-amber-600' : 'text-green-600'}>
                    {activeFile.isImageBased ? '图片型（OCR）' : '文本型'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>识别日期数</span>
                  <span>{activeFile.dates.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 日期卡片组件
function DateCard({
  dateInfo,
  index,
  fileId,
  onChange,
}: {
  dateInfo: RecognizedDate;
  index: number;
  fileId: string;
  onChange: (fileId: string, index: number, date: string) => void;
}) {
  const info = DATE_TYPE_INFO[dateInfo.type];
  const confidenceColor = dateInfo.confidence >= 0.8 ? 'text-green-600' : dateInfo.confidence >= 0.5 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="border border-gray-100 rounded-lg p-3 hover:border-[#1B6CA8]/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#1B6CA8]">{info.label}</span>
        <span className={`text-xs ${confidenceColor}`}>
          {Math.round(dateInfo.confidence * 100)}%
        </span>
      </div>
      <input
        type="date"
        value={dateInfo.date}
        onChange={(e) => onChange(fileId, index, e.target.value)}
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
      />
      {dateInfo.rawText && (
        <div className="mt-1.5 text-xs text-gray-400 truncate" title={dateInfo.rawText}>
          原文: {dateInfo.rawText}
        </div>
      )}
      <div className="mt-1 text-xs text-gray-400">
        第 {dateInfo.page} 页
      </div>
    </div>
  );
}
