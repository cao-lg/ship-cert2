// 更新日志配置
// 每次部署更新时修改此文件

export const BUILD_TIMESTAMP = '2026-07-19 03:15:00 北京时间';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3.2.0',
    date: '2026-07-19',
    changes: [
      '图片型PDF标注方案重构：参考用户提供的方案，直接在Canvas上画框',
      '移除deviceToUser坐标转换，OCR设备坐标直接用，避免转换错误',
      '图片型PDF调用annotateImagePdf：PDF→Canvas渲染→Canvas画框→PNG→PDF',
      '文本型PDF保持原有用pdf-lib标注方案',
      '修正OCR坐标处理：y=bbox.y0（设备空间左上角原点）',
      '画框时乘以scale将设备坐标转为Canvas像素坐标',
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
