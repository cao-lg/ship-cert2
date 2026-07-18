# 船舶证书 PDF 标注：OCR 日期定位与画框方案

> 适用版本：v1.3.10（截至 2026-07-18）
> 核心文件：`src/engine.js`、`src/kb.js`、`src/helpers.js`
> 工具链：pdf.js（取文字+坐标）、pdf-lib（画框+导出）、tesseract.js（OCR，CDN 动态加载）

---

## 1. 整体流程

```
PDF 字节
  │
  ├─ pdf.js 逐页 getTextContent()  →  文字层 items（含坐标 transform[4]/[5]）
  │        │
  │        └─ 该页文字层是否可用？(pageHasUsableText)
  │              ├─ 是（数字版） → 直接用文字层 items
  │              └─ 否（扫描/无文字层） → pdf.js 渲染成图 + tesseract.js OCR
  │                                       → 词(带 bbox) 转 device-coord items
  │
  ├─ buildLines(items)        →  按 y 坐标分行
  ├─ findDateGroups(行内)     →  识别日期，得到每个日期的「日期组」（含矩形坐标）
  ├─ computeBoxes()           →  遍历每行，命中「有效期/年检」短语 → 就近关联最近日期组
  │                              → 红框(过期) / 蓝框(年检)
  ├─ addBoxAsRect()           →  在每页「独立内容流」里用用户空间坐标画矩形
  │
  └─ pdf-lib 写出标注 PDF + Excel 记录
```

关键设计：**文字层与 OCR 的词最终都统一到同一套 coordinates，喂给同一条画框流水线**——这是「双保险」能成立的前提。

---

## 2. 坐标体系（理解一切的前提）

PDF 里有两套坐标系，错配就会「框位置不对」。

| 坐标系 | 原点 | Y 轴 | 说明 |
|--------|------|------|------|
| **用户空间 (User Space)** | 左下角 | 向上为正 | = 媒体框坐标系（MediaBox），pdf-lib 画矩形用的就是它 |
| **设备空间 / 视口 (Viewport)** | 左上角 | 向下为正 | pdf.js `getViewport()` 的渲染空间，含页面 `/Rotate` 与 Y 翻转 |

### 两个致命认知

1. **pdf.js 文字层坐标 `transform[4]/[5]` 已经在「用户空间」，与页面 `/Rotate` 无关。**
   也就是说，旋转页（/Rotate 90°）上，文字层给出的 `x/y` 仍是未旋转时的用户空间坐标。诊断脚本 `diag_rotate.mjs` 实测：90° 旋转页文字 `y=779.9`，落在 `[0, 842]` 区间内，正是用户空间。

2. **OCR 的词是在「旋转后的画布」上识别的，坐标是「视口/设备空间」，必须反算回用户空间。**
   因此 `deviceToUser(vp, dx, dy)` 只用于 OCR 词，文字层坐标直接用、不再转换。

> 旧代码（< v1.3.8）用 `g.x0 * pw`（未旋转页面宽）去算位置——在旋转页上这一步就是错的，框会整体偏移。

---

## 3. 文字层提取（数字版证书）

`processPdf()` 第 556–564 行：

```js
const items = tc.items.map((it) => ({
  str:    it.str,
  x0:     it.transform[4],   // 用户空间 X
  y:      it.transform[5],   // 用户空间 Y（基线，向上为正）
  width:  it.width,
  height: it.height,
})).filter((it) => it.str && it.str.trim().length);
```

- 坐标**直接取自用户空间**，不做任何旋转/缩放修正。
- `width`/`height` 由 pdf.js 给出（已按页面实际尺寸，与旋转无关）。

---

## 4. OCR 双保险（扫描版 / 无文字层）

### 4.1 何时才 OCR？——`pageHasUsableText()`

不到万不得已不 OCR（OCR 慢、且依赖联网）。一页满足以下**任一**即视为「文字层可用」，跳过 OCR：

1. 有意义 token 数 ≥ `MIN_MEANINGFUL_TOKENS`(12) —— 去零宽/控制字符后长度≥2 且含字母/数字/汉字；
2. 命中证书标题关键词（`UNIQUE_TITLES` / `TITLE_HEADS`，如 CERTIFICATE / REGISTRY / 证书）；
3. 已能直接从某个词抽出一个日期（`toIso(...)` 命中）。

三者皆否 → 视为扫描页，走 OCR。

### 4.2 OCR 流程 —— `ocrPageItems()`

```
pdf.js page.getViewport({ scale: OCR_SCALE=3 })   // 渲染分辨率放大 3 倍
  → canvas 渲染该页
  → 灰度预处理（去色不阈值，避免彩色证书丢内容）
  → 持久 tesseract worker 识别（一次性下载语言包，跨页跨文件复用）
  → 返回 words：每个词含 { text, bbox:{x0,y0,x1,y1} }
```

### 4.3 OCR 词 → 与文字层同构的 items —— `ocrWordsToItems()`

OCR 的 `bbox` 来自图像左上角（设备空间），除以 `OCR_SCALE` 得到与 pdf.js 文字层一致的设备坐标；再经 `deviceToUser(vp, ...)` 反算回**用户空间**：

```js
const conv = ocrItems.map((it) => {
  const dx0 = it.x0, dx1 = it.x0 + it.width;
  const dyTop = it.y - it.height, dyBot = it.y;        // 设备: 顶(y小) < 底(y大)
  const pts = [[dx0, dyTop], [dx1, dyTop], [dx0, dyBot], [dx1, dyBot]]
    .map(([dx, dy]) => deviceToUser(vp, dx, dy));       // ← 关键：视口→用户空间
  const uxs = pts.map((p) => p[0]), uys = pts.map((p) => p[1]);
  return {
    str: it.str,
    x0: Math.min(...uxs),
    y:  Math.max(...uys),                                // 用户空间 y 向上：最大 y = 基线
    width: Math.max(...uxs) - Math.min(...uxs),
    height: Math.max(...uys) - Math.min(...uys),
  };
});
```

> `deviceToUser(vp, dx, dy)` 用视口变换矩阵求逆：
> ```js
> const [a,b,c,d,e,f] = vp.transform;   // 例如 90° 旋转页为 [0,1,1,0,0,0]
> const det = a*d - b*c;
> x = (d*(dx-e) - c*(dy-f)) / det;
> y = (-b*(dx-e) + a*(dy-f)) / det;
> ```

### 4.4 OCR 文本清洗 —— `stripWs()`

OCR 常把 `2026 - 09 - 18` 拆成多词、把 `有效 日期` 拆成两词。统一 `cleanInvisible()`（去零宽/控制字符 + NFKC 全角→半角）后**去空格并拢**：

```js
const stripWs = (s) => cleanInvisible(String(s).normalize("NFKC")).replace(/\s+/g, "");
```

这样日期解析与中文短语匹配都能稳定命中。

---

## 5. 日期定位 —— `findDateGroups()`

把一行里的词按「单/三/五 token 滑动窗口」尝试拼成日期，交给 `toIso()` 判定：

| 窗口 | 覆盖格式 |
|------|----------|
| 单 token | `2026-03-19`、`19Mar2026`、中文 `2026年3月19日`、粘连 `19.03.2027` |
| 三 token | `Mar 19 2026`、`19 03 2027`、`2026 年 3 月 19 日` |
| 五 token | `18 . 03 . 2027`（被标点拆散） |

窗口命中后，取窗口内所有 token 的坐标**极值**作为该日期的包围盒：

```js
{
  x0Dev:   Math.min(...arr.map(i => i.x0)),         // 左
  x1Dev:   Math.max(...arr.map(i => i.x0 + i.width)),// 右
  yTopDev: Math.min(...arr.map(i => i.y - i.height)),// 上（y 小）
  yBotDev: Math.max(...arr.map(i => i.y)),          // 下（y 大，基线）
  iso:     <解析出的日期>,
}
```

这就是后续画框用的「日期组」。

---

## 6. 短语就近关联画框 —— `computeBoxes()` + `nearestDate()`

短语与日期常不在同一行（尤其 CCS 版式），所以用「就近关联」而非「同行硬匹配」。

1. 预提取每页每行的日期组，附带行号 `li` 与行中心 Y。
2. 遍历每一行文本 `n = normSp(line.text)`：
   - 命中 `EXPIRY_PHRASES`（`valid until` / `有效期至` / `有效日期` / `到期` …，见 `kb.js`）→ **红框**。
   - 命中 `annual+survey`（`年度检验` / `中间检验` / `annual survey` …）→ **蓝框**（颜色可配：蓝/绿/橙）。
3. `nearestDate()` 在行窗口 ±`WIN`(12) 行内，找**最近且未占用**的日期组：
   - 同行 → 权重最低（最优先）
   - 之后行 → 权重 +30
   - 之前行 → 权重 +80
   - 取加权距离最小者，避免把旁边的日期误框。
4. `used` 集合防止同一日期被多个短语重复框。

```js
if (Math.abs(g.li - li) > WIN) continue;
let score;
if      (g.li === li) score = dy;        // 同行最优先
else if (g.li >  li)  score = 30 + dy;   // 之后行
else                  score = 80 + dy;    // 之前行
```

---

## 7. 画框 —— `addBoxAsRect()`（旋转修复核心）

### 7.1 为什么旧方案框会错/翻转？

旧方案往**源 PDF 的现有内容流末尾**追加矩形，会继承那条流末尾的 CTM——常见是整页 Y 翻转 `[1,0,0,-1,0,H]` 或缩放/平移，导致框纵向翻转或偏移。手工解析内容流求逆 CTM 对任意 PDF 不可靠。

### 7.2 新方案：独立内容流（零 CTM）

```js
function ensureAnnotStream(libPage) {
  if (_annotStreamReady.has(libPage)) return;
  libPage.getContentStream(false);     // 新建一条空内容流，追加为页面最后一条
  _annotStreamReady.set(libPage, true);
}
```

PDF 规范中，**每条内容流都从默认图形状态（单位 CTM）开始**，与源内容流互不影响。矩形按绝对页面坐标（点，左下原点）直接绘制即精确落在 pdf.js 文字位置，无需解析/抵消任何源 CTM。新建流绘制在最上层，清晰可见。

### 7.3 坐标直接用用户空间，不做 `*pw`

```js
function addBoxAsRect(libPage, g, stroke, fill) {
  const pad = 12;                              // 放大 4 倍（原 pad=3）
  const left   = g.x0Dev - pad;
  const right  = g.x1Dev + pad;
  const bottom = Math.min(g.yTopDev, g.yBotDev) - pad; // y 向上：较小 y = 下边
  const top    = Math.max(g.yTopDev, g.yBotDev) + pad; // 较大 y = 上边
  let x = left, y = bottom, w = right - left, h = top - bottom;

  // 钳制到媒体框内（边缘框因 pad 可能略超出）
  const pw = libPage.getWidth(), ph = libPage.getHeight();
  const xMax = Math.min(x + w, pw), yMax = Math.min(y + h, ph);
  x = Math.max(0, x); y = Math.max(0, y);
  w = Math.max(0, xMax - x); h = Math.max(0, yMax - y);

  libPage.drawRectangle({
    x, y, width: w, height: h,
    borderColor: rgb(...stroke),
    borderWidth: 2.5,
    color: rgb(...fill),
    opacity: 0,          // 完全透明填充，仅保留彩色边框（不遮挡任何文字）
  });
}
```

**为什么旋转页也恒对？** 页面 `/Rotate` 会旋转整页（包括我们的框），而我们的框与文字同处用户空间坐标系，旋转后两者一起转，落点始终一致。

---

## 8. 合并（"合并为一个 PDF"）为何框位置正确

合并走 `mergePdfs()`，逻辑是：每份文件**先各自 `processPdf` 画好框**，再 `copyPages()` 原样复制页面。复制保留原始内容（含已画好的框），不改变坐标。实测（`verify_merge.mjs`）拆分→标注→合并后 25 框位置与单文件完全一致。若合并后看到框错位，几乎都是**浏览器缓存了旧版本产物**，需强刷后重新处理。

---

## 9. 验证手段

- **`test/verify_rect_e2e.mjs`**：用**真实用户空间坐标**当真值（不再用旧错误假设自证），跑两套：
  1. 正向页；
  2. 把前 6 页 `setRotation(90°)` 造一份旋转副本。
  结果：两套均 **25/25 框命中、最远偏差 0.0pt、0 越界**，页数 49→49，源 Annots 73→73 全保留。
- **`test/render_shots.mjs`**：用 `@napi-rs/canvas` 把标注 PDF 的日期页渲染成 PNG，肉眼确认框压在日期上。
- **`test/diag_rotate.mjs`**：打印视口变换矩阵与文字坐标，证伪「文字坐标需再经 vp 转换」的误解。

---

## 10. 版本演进（画框相关）

| 版本 | 改动 | 解决的问题 |
|------|------|-----------|
| v1.3.8 | 旋转页坐标修复：文字直接用用户空间坐标，`deviceToUser` 仅留给 OCR；验证用真实坐标 + 旋转副本 | 「框位置不对」根因（旋转页偏移） |
| v1.3.9 | 填充不透明度 `0.22 → 0.09` | 红底太浓遮挡日期文字 |
| v1.3.10 | 填充 `0.09 → 0`（完全透明），`pad 3 → 12`（框放大 ~4 倍） | 用户要求：透明 + 大框，日期 100% 可读 |

---

## 11. 已知局限与后续

1. **OCR 依赖 CDN**：tesseract.js 从 `cdn.jsdelivr.net` 动态加载，用户机器**离线/网络不通时会静默降级为「仅文字层」**——这是「识别少了」的疑似根因。建议：本地打包 tesseract（wasm + 训练数据进构建产物），或在降级时给明确提示而非静默。
2. **中文标签证书**：默认 `OCR_LANG="eng"`，含中文标签的页需在页面选「中英双语」（加载 ~30MB 中文包）。
3. **极度倾斜/表格错位扫描件**：OCR bbox 精度有限，极端版面可能日期关联偏差；可通过提高 `OCR_SCALE` 缓解。
4. **合并后框错位**：几乎都是浏览器缓存旧产物，强刷重处理即可，非代码问题。
