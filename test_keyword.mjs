import { toIso, toIsoPartial, normSp } from './src/utils/textUtils.ts';

const DATE_TYPE_INFO = {
  ISSUE: { keywords: ['Date of Issue', 'Issued at', 'Issued on', 'Issue Date', 'Issued', 'Issue', 'Issued Date', 'Certificate issued this', 'Certificate issued', 'completion date of survey on which this certificate is based', 'issud', 'Provisionally registered on', 'registered on', 'Issued at ... on', 'on which this certificate is based', 'on'] },
  EXPIRY: { keywords: ['Date of Expiry', 'Expiry', 'Valid Until', 'Valid Till', 'Valid To', 'Expiration', 'Expiring', 'this Certificate is valid until', 'accepted as valid until', 'Expiry Date', 'Expires', 'expires on', 'certificate expires', 'valid until the', 'Valid until', 'is valid until', 'valid until'] },
  ANNUAL_SURVEY: { keywords: ['Annual Survey', 'Intermediate Survey', 'Annual inspection', 'Annual Date', 'annual and intermediate survey', 'Completion date of survey', 'Completion date'] },
};

function findDateType(lineText) {
  const lineNorm = normSp(lineText);
  console.log(`  规范化行文本: "${lineNorm}"`);
  
  let bestType = null;
  let bestScore = -Infinity;
  
  for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
    for (const keyword of info.keywords) {
      const kwNorm = normSp(keyword);
      if (!kwNorm) continue;
      
      if (lineNorm.includes(kwNorm)) {
        const score = 50 + Math.min(kwNorm.length / 10, 3);
        console.log(`    匹配关键词 "${keyword}" (${kwNorm}), 类型 ${dateType}, 得分 ${score}`);
        if (score > bestScore) {
          bestScore = score;
          bestType = dateType;
        }
      }
    }
  }
  
  if (bestType && bestScore > 0) {
    console.log(`  => 识别为: ${bestType} (得分: ${bestScore})`);
  } else {
    console.log(`  => 未识别到日期类型`);
  }
  
  return bestType;
}

console.log('=== 测试关键词匹配 ===\n');

const testCases = [
  'This certificate is valid until: 01 December 2026',
  'This certificate is valid until 01 November 2026',
  'Issued at Mokpo on 02 June 2026',
  'Completion date of survey on which this certificate is based 02 June 2026',
];

for (const tc of testCases) {
  console.log(`测试行: "${tc}"`);
  findDateType(tc);
  console.log();
}
