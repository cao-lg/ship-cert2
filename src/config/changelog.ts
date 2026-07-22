// 更新日志配置
// 构建时间由构建脚本自动生成

export function getBuildTimestamp(): string {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/\//g, '-') + ' 北京时间';
}

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3.18.0',
    date: '2026-07-22 10:00',
    changes: [
      '【关键修复】修复"is valid until"和"Issued at ... on"日期类型识别失败问题',
      '优化normSp函数：移除标点符号（.:,;!?'），避免标点影响匹配',
      '新增keywordMatches函数：支持通配符*匹配（如"Issued * on"匹配"Issued at Mokpo on"）',
      '更新关键词："Issued ... on"改为"Issued * on"，"Issued at ... on"改为"Issued at * on"',
      '新增关键词："certificate is valid until"',
    ],
  },
  {
    version: 'v3.17.0',
    date: '2026-07-22 09:30',
    changes: [
      '【重构】将toIso拆分为toIso(完整日期)和toIsoPartial(不完整日期)，从根源解决Month Year被误判为完整日期的问题',
      '【重构】移除isMonthYearOnly函数，findDateGroups三阶段逻辑更简洁',
      '【优化】toIso不再硬编码填充day=01，Month Year仅在Phase 3 fallback中处理',
    ],
  },
  {
    version: 'v3.10.6',
    date: '2026-07-21 22:45',
    changes: [
      '【功能】在页面上添加日志显示区域，便于查看调试日志',
      '【功能】更新日志日期添加时间戳',
    ],
  },
  {
    version: 'v3.10.5',
    date: '2026-07-21 22:30',
    changes: [
      '【更新】更新完整更新日志，包含所有版本记录',
    ],
  },
  {
    version: 'v3.10.4',
    date: '2026-07-21 22:15',
    changes: [
      '【调试】添加buildLines调试日志，分析日期词的行归属问题',
    ],
  },
  {
    version: 'v3.10.3',
    date: '2026-07-21 22:00',
    changes: [
      '【关键修复】添加"Month Year"格式支持（如"June 2031"）',
      '原因：OCR可能识别不到日期数字，只有月份和年份',
      '解决：即使缺少日期，也能解析为当月第一天',
      '添加findDateGroups调试日志',
    ],
  },
  {
    version: 'v3.10.2',
    date: '2026-07-21 21:45',
    changes: [
      '【调试】添加有效日期区域所有词的日志，分析OCR识别结果',
    ],
  },
  {
    version: 'v3.10.1',
    date: '2026-07-21 21:30',
    changes: [
      '【调试】添加OCR日期相关词日志，追踪每个日期词的坐标',
    ],
  },
  {
    version: 'v3.10.0',
    date: '2026-07-21 21:15',
    changes: [
      '【关键修复】修复OCR坐标异常过滤',
      '原因：部分OCR词的Y坐标异常大（超出页面范围）',
      '解决：添加边界检查，跳过超出页面范围的异常坐标',
      '【稳定性】添加页面处理错误捕获，避免"Invalid page request"崩溃',
    ],
  },
  {
    version: 'v3.9.9',
    date: '2026-07-21 21:00',
    changes: [
      '【关键修复】修复OCR坐标转换错误',
      '原因：先除以scale再转换Y坐标，导致坐标计算错误',
      '解决：先转换Y坐标（设备空间→用户空间），再除以scale',
      '修复后坐标范围正确（0-页面高度）',
    ],
  },
  {
    version: 'v3.9.8',
    date: '2026-07-21 20:45',
    changes: [
      '【调试】添加详细PDF标注日志，便于定位图片型PDF标注位置问题',
    ],
  },
  {
    version: 'v3.9.7',
    date: '2026-07-21 20:30',
    changes: [
      '【关键修复】修复findDateGroups跨行匹配问题',
      '原因：只按X坐标排序，导致跨行匹配日期（如把页面上方的"December"和页面下方的"2026"组合）',
      '解决：先按Y坐标排序，添加isSameLine函数检查同行',
      '确保日期只在同行内组合',
    ],
  },
  {
    version: 'v3.9.6',
    date: '2026-07-21 20:15',
    changes: [
      '【修复】构建时间改为动态获取北京时间',
      '使用new Date().toLocaleString()获取准确的北京时间',
    ],
  },
  {
    version: 'v3.9.5',
    date: '2026-07-21 20:00',
    changes: [
      '【关键修复】修复OCR识别和标注时scale不一致问题',
      '原因：OCR识别时scale=5.0，标注时scale=2.0，导致标注位置偏移2.5倍',
      '解决：标注时scale改为5.0，与OCR识别一致',
    ],
  },
  {
    version: 'v3.9.4',
    date: '2026-07-21 19:45',
    changes: [
      '【关键修复】修复图片型PDF标注不显示的问题',
      '问题：图片型（OCR）PDF识别到日期但标注框不显示',
      '修复：',
      '1. 改用atob直接解码base64获取PNG字节，替代fetch(dataURL)方式，提高兼容性',
      '2. 修复Annotate页面手动修改日期后的重新标注逻辑，正确区分图片型和文本型',
      '3. 手动修改日期时只标注有效日期和年检日期（与初始处理一致）',
    ],
  },
  {
    version: 'v3.8.1',
    date: '2026-07-21',
    changes: [
      '【关键修复】修复buildLines行顺序颠倒导致日期识别错误',
      '原因：排序逻辑导致页面底部的行排在前面，关键词与日期无法正确关联',
      '解决：改为先升序排列后反转，确保行从上到下正确排序',
      '彻底解决ISSC证书中"May 12, 2028"未被识别的问题',
    ],
  },
  {
    version: 'v2.4.0',
    date: '2026-07-18',
    changes: [
      '修复Tesseract.js v6 OCR无法获取words坐标的问题',
      '原因：Tesseract.js v6默认仅返回text，需显式启用blocks输出',
      '修改：worker.recognize() 添加第三个参数 { blocks: true }',
      '适配：从blocks→paragraphs→lines→words层级提取词坐标',
      '彻底解决图片型PDF识别出日期但画不出框的问题',
    ],
  },
  {
    version: 'v2.3.0',
    date: '2026-07-18',
    changes: [
      '修复框出现在左下角的根因：找不到位置时用了默认坐标(0,0)',
      '找不到位置时不画框，避免错误标注',
      '重写OCR日期位置匹配算法：以年份为锚点向左右扩展',
      '采用deviceToUser矩阵转换坐标（业界验证方案）',
      '增加匹配评分机制，只有高置信度匹配才画框',
      '修复日期格式4的变量引用错误',
    ],
  },
  {
    version: 'v1.6.0',
    date: '2026-07-18',
    changes: [
      'OCR坐标改用lines数据，更准确的行级定位',
      '优化OCR日期位置查找：基于年份+月份的行匹配',
      '移除默认坐标：找不到位置就不显示框，避免错误位置',
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026-07-18',
    changes: [
      '重写日期坐标匹配算法，修复标注框位置错误',
      '优先匹配包含日期数字的文本项，避免误匹配页眉页脚',
      '使用pdf.js实际文本宽度替代估算值',
      '扩展日期关键词：支持expires on、certificate expires等',
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-07-18',
    changes: [
      '修复标注框位置偏移问题：重写日期坐标匹配算法',
      '统一PDF坐标系：文本和OCR都使用PDF原生坐标',
      '优化日期位置查找：支持token匹配和按行匹配两种策略',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-07-18',
    changes: [
      '修复detached ArrayBuffer错误',
      '统一使用Uint8Array存储PDF数据',
      '每次传递给PDF.js前创建独立副本',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-07-18',
    changes: [
      '支持Excel模板全部13种证书类型',
      '新增SMC/CLC/DOC/COF/SE/SR证书类型',
      '优化证书类型检测优先级',
      '添加PDF兼容性和速度测试',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-07-18',
    changes: [
      '初始版本发布',
      '支持PDF上传和自动识别',
      '红色框标注日期位置',
      'Excel汇总导出',
      'PDF合并导出',
    ],
  },
];
