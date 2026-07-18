import { create } from 'zustand';
import { CertFile, CertType, SubCertificate, CERT_MERGE_ORDER, CERT_TYPE_INFO } from '@/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

interface CertStore {
  files: CertFile[];
  activeFileId: string | null;
  addFile: (file: File) => Promise<CertFile>;
  removeFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<CertFile>) => void;
  setCertType: (id: string, certType: CertType) => void;
  setDate: (fileId: string, dateIndex: number, date: string) => void;
  setActiveFile: (id: string | null) => void;
  getSortedFiles: () => CertFile[];
  getSortedSubCertificates: () => Array<{ file: CertFile; sub: SubCertificate | null }>;
  clearAll: () => void;
}

export const useCertStore = create<CertStore>((set, get) => ({
  files: [],
  activeFileId: null,

  addFile: async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const certFile: CertFile = {
      id: generateId(),
      fileName: file.name,
      fileSize: file.size,
      certType: 'UNKNOWN',
      certNumber: '',
      pdfBytes: arrayBuffer,
      annotatedPdfBytes: null,
      dates: [],
      status: 'pending',
      isImageBased: false,
    };
    set((state) => ({ files: [...state.files, certFile] }));
    return certFile;
  },

  removeFile: (id: string) => {
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      activeFileId: state.activeFileId === id ? null : state.activeFileId,
    }));
  },

  updateFile: (id: string, updates: Partial<CertFile>) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }));
  },

  setCertType: (id: string, certType: CertType) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, certType } : f)),
    }));
  },

  setDate: (fileId: string, dateIndex: number, date: string) => {
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== fileId) return f;
        const newDates = [...f.dates];
        if (newDates[dateIndex]) {
          newDates[dateIndex] = { ...newDates[dateIndex], date };
        }
        return { ...f, dates: newDates };
      }),
    }));
  },

  setActiveFile: (id: string | null) => {
    set({ activeFileId: id });
  },

  getSortedFiles: () => {
    const files = get().files;
    return [...files].sort((a, b) => {
      const orderA = CERT_MERGE_ORDER.indexOf(a.certType);
      const orderB = CERT_MERGE_ORDER.indexOf(b.certType);
      const idxA = orderA === -1 ? CERT_MERGE_ORDER.length : orderA;
      const idxB = orderB === -1 ? CERT_MERGE_ORDER.length : orderB;
      return idxA - idxB;
    });
  },

  // 获取所有子证书（用于多证书PDF），按合并顺序排序
  getSortedSubCertificates: () => {
    const files = get().files.filter((f) => f.status === 'done');
    const result: Array<{ file: CertFile; sub: SubCertificate | null }> = [];

    for (const file of files) {
      if (file.subCertificates && file.subCertificates.length > 0) {
        for (const sub of file.subCertificates) {
          result.push({ file, sub });
        }
      } else {
        result.push({ file, sub: null });
      }
    }

    // 按证书类型排序
    return result.sort((a, b) => {
      const typeA = a.sub?.certType ?? a.file.certType;
      const typeB = b.sub?.certType ?? b.file.certType;
      const orderA = CERT_MERGE_ORDER.indexOf(typeA);
      const orderB = CERT_MERGE_ORDER.indexOf(typeB);
      const idxA = orderA === -1 ? CERT_MERGE_ORDER.length : orderA;
      const idxB = orderB === -1 ? CERT_MERGE_ORDER.length : orderB;
      return idxA - idxB;
    });
  },

  clearAll: () => {
    set({ files: [], activeFileId: null });
  },
}));

// 根据文件名和文本内容自动识别证书类型
// 优化：按优先级排序，更具体的证书类型优先检测
export function detectCertType(fileName: string, textContent: string): CertType {
  const combinedText = (fileName + ' ' + textContent).toLowerCase();

  const priorityOrder: CertType[] = [
    'ISSC',
    'COF',
    'SMC',
    'CLC',
    'DOC',
    'SE',
    'SR',
    'SC',
    'IOPP',
    'TON',
    'LL',
    'MM',
    'REG',
  ];

  for (const type of priorityOrder) {
    const info = CERT_TYPE_INFO[type];
    for (const keyword of info.keywords) {
      if (combinedText.includes(keyword.toLowerCase())) {
        return type;
      }
    }
  }

  return 'UNKNOWN';
}

// 识别证书编号
export function detectCertNumber(textContent: string): string {
  const patterns = [
    /(?:Certificate\s+(?:No|Number)|Cert\.?\s*No|No\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_\/]{4,40})/i,
    /(?:Official\s+Number|OFFICIAL\s+NO)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_\/]{4,40})/i,
    /(BMA-[A-Z]{2,5}-\d{4,6}-\d{2})/i,
    /(JS\d{2}[A-Z]{3}\d{5,7}(?:_\d+)?)/i,
    /(nN\d{6,8}-[a-z]{2,5})/i,
    /(?:No\.?|Number)\s*[:\-]?\s*(\d{5,15})/i,
  ];

  for (const pattern of patterns) {
    const match = textContent.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return '';
}

// 在多证书PDF中识别子证书边界
export function detectSubCertificates(
  textItems: { text: string; page: number }[],
  pageCount: number
): SubCertificate[] {
  const subs: SubCertificate[] = [];

  const pagesText: Record<number, string> = {};
  for (const item of textItems) {
    if (!pagesText[item.page]) pagesText[item.page] = '';
    pagesText[item.page] += item.text + ' ';
  }

  const certStarts: { page: number; type: CertType }[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageText = pagesText[pageNum] || '';

    for (const [type, info] of Object.entries(CERT_TYPE_INFO)) {
      if (type === 'UNKNOWN') continue;
      for (const pattern of info.titlePatterns) {
        const regex = new RegExp(pattern.replace(/\s+/g, '\\s+'), 'i');
        if (regex.test(pageText)) {
          if (!certStarts.some((cs) => cs.page === pageNum && cs.type === type)) {
            certStarts.push({ page: pageNum, type: type as CertType });
          }
          break;
        }
      }
    }
  }

  certStarts.sort((a, b) => a.page - b.page);

  if (certStarts.length === 0) return [];

  for (let i = 0; i < certStarts.length; i++) {
    const start = certStarts[i].page - 1;
    const end = i + 1 < certStarts.length ? certStarts[i + 1].page - 2 : pageCount - 1;
    subs.push({
      id: generateId(),
      certType: certStarts[i].type,
      certNumber: '',
      startIndex: start,
      endIndex: Math.max(start, end),
      dates: [],
    });
  }

  return subs;
}
