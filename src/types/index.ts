// 证书类型枚举
export type CertType = 'REG' | 'MM' | 'LL' | 'SC' | 'ISSC' | 'IOPP' | 'TON' |
  'SMC' | 'CLC' | 'DOC' | 'COF' | 'SE' | 'SR' | 'UNKNOWN';

// 日期类型枚举
export type DateType = 'ISSUE' | 'EXPIRY' | 'ANNUAL_SURVEY';

// PDF文本项（用于坐标定位）
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

// 识别到的日期信息
export interface RecognizedDate {
  type: DateType;
  date: string; // YYYY-MM-DD 格式
  confidence: number; // 0-1 置信度
  page: number; // 所在页码
  position: { x: number; y: number; width: number; height: number }; // PDF坐标
  rawText: string; // 原始识别文本
}

// 证书文件信息
export interface CertFile {
  id: string;
  fileName: string;
  fileSize: number;
  certType: CertType;
  certNumber: string; // 证书编号
  pdfBytes: Uint8Array;
  annotatedPdfBytes: Uint8Array | null;
  dates: RecognizedDate[];
  status: 'pending' | 'processing' | 'done' | 'error';
  isImageBased: boolean;
  // 多证书支持：一个PDF可能包含多个证书
  subCertificates?: SubCertificate[];
  error?: string;
}

// 子证书（一个PDF可能包含多个证书）
export interface SubCertificate {
  id: string;
  certType: CertType;
  certNumber: string;
  startIndex: number; // 起始页（从0开始）
  endIndex: number; // 结束页
  dates: RecognizedDate[];
}

// 证书合并排序
export const CERT_MERGE_ORDER: CertType[] = [
  'REG', 'MM', 'LL', 'SC', 'ISSC', 'IOPP', 'TON',
  'SMC', 'CLC', 'DOC', 'COF', 'SE', 'SR'
];

// 证书类型信息映射 - 包含中文代码（参考Excel模板）
export const CERT_TYPE_INFO: Record<CertType, {
  label: string;
  labelEn: string;
  code: string; // Excel模板代码
  keywords: string[];
  titlePatterns: string[]; // 证书标题模式（用于多证书PDF分割）
}> = {
  REG: {
    label: '船舶国籍证书',
    labelEn: 'Certificate of Registry',
    code: '1101',
    keywords: ['Certificate of Registry', 'REG', 'Provisional Certificate of Registry', 'Certificate of British Registry'],
    titlePatterns: ['Certificate of Registry', 'Provisional Certificate of Registry'],
  },
  MM: {
    label: '船舶最低安全配员证书',
    labelEn: 'Minimum Safe Manning',
    code: '1102',
    keywords: ['Minimum Safe Manning', 'Safe Manning', 'Minimum Manning'],
    titlePatterns: ['Minimum Safe Manning', 'Safe Manning Document'],
  },
  SMC: {
    label: '安全管理证书',
    labelEn: 'Safety Management Certificate',
    code: '1104',
    keywords: ['Safety Management Certificate', 'SMC', 'International Safety Management', 'ISM Code'],
    titlePatterns: ['Safety Management Certificate', 'SMC'],
  },
  CLC: {
    label: '油污损害民事责任保险或其他财务保证证书',
    labelEn: 'Civil Liability Convention Certificate',
    code: '1105',
    keywords: ['Civil Liability', 'CLC', 'Insurance Certificate', 'Financial Security'],
    titlePatterns: ['Civil Liability Convention', 'Insurance Certificate'],
  },
  TON: {
    label: '海上船舶吨位证书',
    labelEn: 'International Tonnage Certificate',
    code: '1201',
    keywords: ['International Tonnage', 'TON', 'Tonnage Certificate', 'International Tonnage Certificate 1969'],
    titlePatterns: ['International Tonnage', 'Tonnage Certificate'],
  },
  LL: {
    label: '海上船舶载重线证书',
    labelEn: 'International Load Line',
    code: '1202',
    keywords: ['Load Line', 'International Load Line Certificate', 'Load Line Certificate'],
    titlePatterns: ['International Load Line', 'Load Line Certificate'],
  },
  IOPP: {
    label: '海上船舶防止油污证书',
    labelEn: 'International Oil Pollution Prevention',
    code: '1205',
    keywords: ['International Oil Pollution Prevention', 'IOPP', 'IOPP FORM A', 'Form A', 'Oil Pollution Prevention'],
    titlePatterns: ['International Oil Pollution Prevention', 'IOPP Certificate', 'Form A'],
  },
  COF: {
    label: '海上船舶散装运输危险化学品适装证书',
    labelEn: 'Certificate of Fitness for Carriage of Dangerous Chemicals',
    code: '1209',
    keywords: ['Certificate of Fitness', 'COF', 'Dangerous Chemicals', 'Liquefied Gases', 'Carriage of Bulk'],
    titlePatterns: ['Certificate of Fitness', 'COF'],
  },
  DOC: {
    label: '符合证明副本',
    labelEn: 'Document of Compliance',
    code: '2103',
    keywords: ['Document of Compliance', 'Company Certificate'],
    titlePatterns: ['Document of Compliance'],
  },
  SC: {
    label: '货船构造安全证书',
    labelEn: 'Cargo Ship Safety Construction',
    code: '2205',
    keywords: ['Safety Construction', 'Cargo Ship Safety Construction', 'SC'],
    titlePatterns: ['Cargo Ship Safety Construction', 'Safety Construction Certificate'],
  },
  SE: {
    label: '货船设备安全证书',
    labelEn: 'Cargo Ship Safety Equipment',
    code: '2206',
    keywords: ['Safety Equipment', 'Cargo Ship Safety Equipment', 'Equipment Certificate'],
    titlePatterns: ['Cargo Ship Safety Equipment', 'Safety Equipment Certificate'],
  },
  SR: {
    label: '货船无线电安全证书',
    labelEn: 'Cargo Ship Safety Radio',
    code: '2207',
    keywords: ['Safety Radio', 'Cargo Ship Safety Radio', 'GMDSS', 'Radio Certificate'],
    titlePatterns: ['Cargo Ship Safety Radio', 'Safety Radio Certificate'],
  },
  ISSC: {
    label: '国际船舶保安证书',
    labelEn: 'International Ship Security Certificate',
    code: '2222',
    keywords: ['International Ship Security', 'ISSC', 'Ship Security Certificate', 'Continuous Synopsis Record'],
    titlePatterns: ['International Ship Security', 'ISSC'],
  },
  UNKNOWN: {
    label: '未知类型',
    labelEn: 'Unknown',
    code: '0000',
    keywords: [],
    titlePatterns: [],
  },
};

// 日期类型信息映射
export const DATE_TYPE_INFO: Record<DateType, { label: string; labelEn: string; keywords: string[] }> = {
  ISSUE: { label: '签发日期', labelEn: 'Date of Issue', keywords: ['Date of Issue', 'Issued at', 'Issued on', 'Date of Certificate', 'Issue Date', 'Issued', 'Issue', 'Issued Date', 'Certificate issued this', 'Certificate issued', 'completion date of survey on which this certificate is based', 'issud', '发证日期', '签发日期', 'Provisionally registered on', 'registered on'] },
  EXPIRY: { label: '有效日期', labelEn: 'Date of Expiry', keywords: ['Date of Expiry', 'Expiry', 'Valid Until', 'Valid Till', 'Valid To', 'Expiration', 'Expiring', 'this Certificate is valid until', 'accepted as valid until', 'Expiry Date', 'Expires', 'expires on', 'certificate expires', 'valid until the', 'Valid until', '有效期至', '有效日期', '失效日期', '到期', '有效期限', '过期日期'] },
  ANNUAL_SURVEY: { label: '年检日期', labelEn: 'Annual Survey', keywords: ['Annual Survey', 'Intermediate Survey', 'Annual inspection', 'Annual Date', 'annual and intermediate survey', '年度检验', '期间检验', '中间检验', 'Completion date of survey', 'Completion date'] },
};
