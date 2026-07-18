/**
 * 核心功能测试脚本 - 日期识别和证书类型检测
 */

import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = '.trae/documents';
const TEST_PDFS = [
  '2.船舶证书-古弗尼尔.pdf',
  '2.船舶证书（航海家）.pdf',
  'COF 2026-11-01.pdf',
];

// 模拟测试数据（从实际证书提取的文本）
const TEST_TEXT_DATA = [
  {
    name: '古弗尼尔-国籍证书',
    text: `REPUBLIC OF MALTA
DEPARTMENT FOR TRANSPORT
MERCHANT SHIPPING DIRECTORATE
CERTIFICATE OF REGISTRY
PROVISIONAL
This is to certify that the ship named GOUVERNEUR of 44634 GT
IS registered in Malta.
Certificate No.: 1182245
Date of Issue: 19 March 2026
Date of Expiry: 18 September 2026`,
  },
  {
    name: '古弗尼尔-IOPP证书',
    text: `INTERNATIONAL OIL POLLUTION PREVENTION CERTIFICATE
FOR CARGO SHIP
Ship's Name: GOUVERNEUR
IMO Number: 1043425
Certificate No.: JS24SNB00107
Issued at: Shanghai
Date of Issue: 19 March 2026
Valid until: 18 March 2031`,
  },
  {
    name: '航海家-构造安全证书',
    text: `CARGO SHIP SAFETY CONSTRUCTION CERTIFICATE
Ship's Name: SAGA VOYAGER
IMO: 9233454
Certificate Number: nN2716324-ccc
Issued in accordance with the provisions of the International Convention
for the Safety of Life at Sea, 1974, as amended.
Date of Issue: 17 January 2026
Expiry Date: 31 December 2026`,
  },
  {
    name: 'COF-液化气证书',
    text: `INTERNATIONAL CERTIFICATE OF FITNESS FOR THE CARRIAGE OF
LIQUEFIED GASES IN BULK
INTERIM
Certificate No.: 2170691
Issued by: Lloyd's Register Asia
Date of Issue: 02 June 2026
Valid until: 01 November 2026`,
  },
];

async function testDateRecognition() {
  console.log('='.repeat(80));
  console.log('日期识别功能测试');
  console.log('='.repeat(80));
  console.log();

  const { recognizeDatesFromText } = await import('./src/utils/dateRecognizer');
  const { DATE_TYPE_INFO } = await import('./src/types');

  let totalDates = 0;
  let correctDates = 0;

  for (const testData of TEST_TEXT_DATA) {
    console.log(`📝 ${testData.name}`);
    console.log('-'.repeat(50));

    // 模拟文本项
    const textItems = testData.text.split('\n').map((line, idx) => ({
      text: line.trim(),
      x: 50,
      y: 50 + idx * 20,
      width: line.length * 8,
      height: 16,
      page: 1,
    }));

    const dates = recognizeDatesFromText(textItems, testData.text);
    
    console.log(`识别到日期: ${dates.length} 个`);
    dates.forEach((d) => {
      totalDates++;
      const dateInfo = DATE_TYPE_INFO[d.type];
      console.log(`  • ${dateInfo.label}: ${d.date} (原文: "${d.rawText}", 置信度: ${Math.round(d.confidence * 100)}%)`);
      // 简单验证：日期格式是否正确
      if (d.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        correctDates++;
      }
    });

    console.log();
  }

  console.log(`总识别数: ${totalDates}, 格式正确数: ${correctDates}, 正确率: ${Math.round((correctDates / totalDates) * 100)}%`);
  console.log();
}

async function testCertTypeDetection() {
  console.log('='.repeat(80));
  console.log('证书类型检测测试');
  console.log('='.repeat(80));
  console.log();

  const { detectCertType } = await import('./src/store/certStore');
  const { CERT_TYPE_INFO } = await import('./src/types');

  const testCases = [
    { name: 'Certificate_of_Registry.pdf', text: 'Certificate of Registry', expected: 'REG' },
    { name: 'Minimum_Safe_Manning.pdf', text: 'Minimum Safe Manning Certificate', expected: 'MM' },
    { name: 'Load_Line.pdf', text: 'International Load Line Certificate', expected: 'LL' },
    { name: 'Safety_Construction.pdf', text: 'Cargo Ship Safety Construction Certificate', expected: 'SC' },
    { name: 'ISSC.pdf', text: 'International Ship Security Certificate', expected: 'ISSC' },
    { name: 'IOPP.pdf', text: 'International Oil Pollution Prevention Certificate', expected: 'IOPP' },
    { name: 'Tonnage.pdf', text: 'International Tonnage Certificate 1969', expected: 'TON' },
    { name: 'SMC.pdf', text: 'Safety Management Certificate SMC', expected: 'SMC' },
    { name: 'CLC.pdf', text: 'Civil Liability Convention Certificate', expected: 'CLC' },
    { name: 'DOC.pdf', text: 'Document of Compliance', expected: 'DOC' },
    { name: 'COF.pdf', text: 'Certificate of Fitness for Carriage of Liquefied Gases', expected: 'COF' },
    { name: 'Equipment.pdf', text: 'Cargo Ship Safety Equipment Certificate', expected: 'SE' },
    { name: 'Radio.pdf', text: 'Cargo Ship Safety Radio Certificate', expected: 'SR' },
    { name: 'Unknown.pdf', text: 'Some other document', expected: 'UNKNOWN' },
  ];

  let correctCount = 0;

  for (const test of testCases) {
    const certType = detectCertType(test.name, test.text);
    const certInfo = CERT_TYPE_INFO[certType];
    
    const isCorrect = certType === test.expected;
    
    if (isCorrect) {
      correctCount++;
      console.log(`✅ ${test.name} -> ${certType} (${certInfo.code}-${certInfo.label})`);
    } else {
      console.log(`❌ ${test.name} -> ${certType} (期望: ${test.expected})`);
    }
  }

  console.log();
  console.log(`检测正确率: ${correctCount}/${testCases.length} = ${Math.round((correctCount / testCases.length) * 100)}%`);
  console.log();
}

async function testDatePatterns() {
  console.log('='.repeat(80));
  console.log('日期格式解析测试');
  console.log('='.repeat(80));
  console.log();

  const { recognizeDatesFromText } = await import('./src/utils/dateRecognizer');

  const dateFormats = [
    'Date of Issue: 19 March 2026',
    'Issued on: January 15, 2026',
    'Expiry Date: 18/09/2026',
    'Valid until: 18-09-2026',
    'Date: 2026-06-02',
    'Issue Date: 17.01.2026',
  ];

  for (const format of dateFormats) {
    const textItems = [{ text: format, x: 50, y: 50, width: 100, height: 16, page: 1 }];
    const dates = recognizeDatesFromText(textItems, format);
    
    if (dates.length > 0) {
      console.log(`✅ "${format}" -> ${dates[0].date}`);
    } else {
      console.log(`❌ "${format}" -> 未识别`);
    }
  }

  console.log();
}

async function runAllTests() {
  await testDateRecognition();
  await testCertTypeDetection();
  await testDatePatterns();
  
  console.log('='.repeat(80));
  console.log('测试完成！');
  console.log('='.repeat(80));
}

runAllTests().catch(console.error);
