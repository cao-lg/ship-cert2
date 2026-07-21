// 自检脚本：验证日期识别逻辑
// 模拟OCR输出，验证findDateGroups和类型识别
import { recognizeDatesFromUnified } from './src/utils/dateRecognizer.ts';

// 模拟一个页面的OCR结果（设备坐标，左上角原点）
const mockItems = [
  // 第一行：valid until
  { str: 'This', x0: 50, y: 100, width: 30, height: 12, page: 1 },
  { str: 'certificate', x0: 90, y: 100, width: 60, height: 12, page: 1 },
  { str: 'is', x0: 160, y: 100, width: 15, height: 12, page: 1 },
  { str: 'valid', x0: 185, y: 100, width: 35, height: 12, page: 1 },
  { str: 'until', x0: 230, y: 100, width: 30, height: 12, page: 1 },
  { str: '01', x0: 280, y: 100, width: 20, height: 12, page: 1 },
  { str: 'June', x0: 310, y: 100, width: 35, height: 12, page: 1 },
  { str: '2031', x0: 355, y: 100, width: 30, height: 12, page: 1 },
  
  // 第二行：签发日期
  { str: 'Completion', x0: 50, y: 130, width: 70, height: 12, page: 1 },
  { str: 'date', x0: 130, y: 130, width: 30, height: 12, page: 1 },
  { str: 'of', x0: 170, y: 130, width: 15, height: 12, page: 1 },
  { str: 'the', x0: 195, y: 130, width: 20, height: 12, page: 1 },
  { str: 'survey', x0: 225, y: 130, width: 40, height: 12, page: 1 },
  { str: '02', x0: 310, y: 130, width: 20, height: 12, page: 1 },
  { str: 'June', x0: 340, y: 130, width: 35, height: 12, page: 1 },
  { str: '2026', x0: 385, y: 130, width: 30, height: 12, page: 1 },
  
  // 第三行：Issued at
  { str: 'Issued', x0: 50, y: 160, width: 45, height: 12, page: 1 },
  { str: 'at', x0: 105, y: 160, width: 15, height: 12, page: 1 },
  { str: 'Mokpo', x0: 130, y: 160, width: 40, height: 12, page: 1 },
  { str: '02', x0: 480, y: 160, width: 20, height: 12, page: 1 },
  { str: 'June', x0: 510, y: 160, width: 35, height: 12, page: 1 },
  { str: '2026', x0: 555, y: 160, width: 30, height: 12, page: 1 },
];

console.log('=== 测试日期识别逻辑 ===\n');

const dates = recognizeDatesFromUnified(mockItems, 0.7);

console.log(`识别到 ${dates.length} 个日期：\n`);

for (const d of dates) {
  console.log(`类型: ${d.type} (${d.date})`);
  console.log(`  置信度: ${(d.confidence * 100).toFixed(0)}%`);
  console.log(`  位置: x=${d.position.x.toFixed(0)}, y=${d.position.y.toFixed(0)}, w=${d.position.width.toFixed(0)}, h=${d.position.height.toFixed(0)}`);
  console.log();
}

// 验证
console.log('=== 验证结果 ===');

const expiry = dates.find(d => d.type === 'EXPIRY');
const issue = dates.find(d => d.type === 'ISSUE');

let pass = true;

if (expiry) {
  console.log(`✅ 有效期: ${expiry.date} (期望 2031-06-01)`);
  if (expiry.date !== '2031-06-01') {
    console.log(`   ❌ 日期不对！`);
    pass = false;
  }
  // 验证坐标：01 June 2031 在 x=280, y=100
  const expectedX = 280;
  const expectedY = 100;
  if (Math.abs(expiry.position.x - expectedX) > 15) {
    console.log(`   ❌ x坐标不对: 实际 ${expiry.position.x.toFixed(0)}, 期望 ~${expectedX}`);
    pass = false;
  } else {
    console.log(`   ✅ x坐标正确: ${expiry.position.x.toFixed(0)}`);
  }
  if (Math.abs(expiry.position.y - expectedY) > 15) {
    console.log(`   ❌ y坐标不对: 实际 ${expiry.position.y.toFixed(0)}, 期望 ~${expectedY}`);
    pass = false;
  } else {
    console.log(`   ✅ y坐标正确: ${expiry.position.y.toFixed(0)}`);
  }
} else {
  console.log('❌ 没有识别到有效期！');
  pass = false;
}

if (issue) {
  console.log(`✅ 签发日期: ${issue.date}`);
} else {
  console.log('ℹ️  没有签发日期（正常，因为我们现在不画框）');
}

console.log();
console.log(pass ? '✅ 自检通过！' : '❌ 自检失败，需要修复！');
