// 更新日志配置
// 每次部署更新时修改此文件

export const BUILD_TIMESTAMP = '2026-07-18 16:30:00 UTC';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
