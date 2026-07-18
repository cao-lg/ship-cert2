// 更新日志配置
// 每次部署更新时修改此文件

export const BUILD_TIMESTAMP = '2026-07-18 16:00:00 北京时间';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v2.1.0',
    date: '2026-07-18',
    changes: [
      '全新方案：图片型PDF直接在Canvas上画框，彻底避免坐标转换问题',
      'OCR返回原始Canvas像素坐标，标注时直接在Canvas上绘制红框',
      '标注后的页面从Canvas转成PNG嵌入PDF，100%保证框的位置正确',
      '文本型PDF仍使用pdf-lib直接标注',
      '优化同一行判断阈值，适配像素坐标',
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
