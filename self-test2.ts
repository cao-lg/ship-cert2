import { recognizeDatesFromUnified } from './src/utils/dateRecognizer';

const PAGE_HEIGHT = 800;

const toUserY = (devY: number) => PAGE_HEIGHT - devY;

const line1Dev = [
  { str: 'This', x: 50, y: 100, w: 30, h: 12 },
  { str: 'certificate', x: 90, y: 100, w: 60, h: 12 },
  { str: 'is', x: 160, y: 100, w: 15, h: 12 },
  { str: 'valid', x: 185, y: 100, w: 35, h: 12 },
  { str: 'until', x: 230, y: 100, w: 30, h: 12 },
  { str: '01', x: 280, y: 100, w: 20, h: 12 },
  { str: 'June', x: 310, y: 100, w: 35, h: 12 },
  { str: '2031', x: 355, y: 100, w: 30, h: 12 },
];

const line2Dev = [
  { str: 'Completion', x: 50, y: 130, w: 70, h: 12 },
  { str: 'date', x: 130, y: 130, w: 30, h: 12 },
  { str: 'of', x: 170, y: 130, w: 15, h: 12 },
  { str: 'the', x: 195, y: 130, w: 20, h: 12 },
  { str: 'survey', x: 225, y: 130, w: 40, h: 12 },
  { str: '02', x: 310, y: 130, w: 20, h: 12 },
  { str: 'June', x: 340, y: 130, w: 35, h: 12 },
  { str: '2026', x: 385, y: 130, w: 30, h: 12 },
];

const line3Dev = [
  { str: 'Issued', x: 50, y: 160, w: 45, h: 12 },
  { str: 'at', x: 105, y: 160, w: 15, h: 12 },
  { str: 'Mokpo', x: 130, y: 160, w: 40, h: 12 },
  { str: '02', x: 480, y: 160, w: 20, h: 12 },
  { str: 'June', x: 510, y: 160, w: 35, h: 12 },
  { str: '2026', x: 555, y: 160, w: 30, h: 12 },
];

function toUnified(devItems: typeof line1Dev) {
  return devItems.map(d => ({
    str: d.str,
    x0: d.x,
    y: toUserY(d.y),
    width: d.w,
    height: d.h,
    page: 1,
  }));
}

const mockItems = [
  ...toUnified(line1Dev),
  ...toUnified(line2Dev),
  ...toUnified(line3Dev),
];

console.log('=== 自检 v2：用户空间坐标验证 ===\n');
console.log('页面高度:', PAGE_HEIGHT);
console.log('第一行（设备y=100）用户空间顶部y:', toUserY(100), '底部y:', toUserY(112));
console.log('第二行（设备y=130）用户空间顶部y:', toUserY(130), '底部y:', toUserY(142));
console.log('第三行（设备y=160）用户空间顶部y:', toUserY(160), '底部y:', toUserY(172));
console.log();

const dates = recognizeDatesFromUnified(mockItems, 0.7);

console.log(`识别到 ${dates.length} 个日期：\n`);

for (const d of dates) {
  const yTop = d.position.y + d.position.height;
  const yBot = d.position.y;
  console.log(`类型: ${d.type} (${d.date})`);
  console.log(`  置信度: ${(d.confidence * 100).toFixed(0)}%`);
  console.log(`  用户空间: x=${d.position.x.toFixed(0)}, yBot=${yBot.toFixed(0)}, yTop=${yTop.toFixed(0)}, w=${d.position.width.toFixed(0)}, h=${d.position.height.toFixed(0)}`);
  console.log(`  设备空间: x=${d.position.x.toFixed(0)}, yTop=${(PAGE_HEIGHT - yTop).toFixed(0)}, yBot=${(PAGE_HEIGHT - yBot).toFixed(0)}`);
  console.log();
}

console.log('=== 验证结果 ===');
let pass = true;

const expiry = dates.find(d => d.type === 'EXPIRY');

if (expiry) {
  console.log(`✅ 有效期: ${expiry.date}`);
  
  const expectedDevYTop = 100;
  const expectedDevYBot = 112;
  const actualDevYTop = PAGE_HEIGHT - (expiry.position.y + expiry.position.height);
  const actualDevYBot = PAGE_HEIGHT - expiry.position.y;
  
  if (Math.abs(actualDevYTop - expectedDevYTop) > 15) {
    console.log(`   ❌ 顶部y不对: 实际 ${actualDevYTop.toFixed(0)}, 期望 ~${expectedDevYTop}`);
    pass = false;
  } else {
    console.log(`   ✅ 顶部y正确: 设备空间 ~${actualDevYTop.toFixed(0)}`);
  }
  
  if (Math.abs(actualDevYBot - expectedDevYBot) > 15) {
    console.log(`   ❌ 底部y不对: 实际 ${actualDevYBot.toFixed(0)}, 期望 ~${expectedDevYBot}`);
    pass = false;
  } else {
    console.log(`   ✅ 底部y正确: 设备空间 ~${actualDevYBot.toFixed(0)}`);
  }
} else {
  console.log('❌ 没有识别到有效期！');
  pass = false;
}

console.log();
console.log(pass ? '✅ 自检通过！' : '❌ 自检失败，需要修复！');
