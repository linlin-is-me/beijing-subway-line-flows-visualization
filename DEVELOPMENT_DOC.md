# 北京地铁客流量可视化系统 — 开发文档

## 一、项目概述

构建一个 Web 可视化系统，用户可以从已有的历史客流数据中选择日期，系统根据当日各线路客流量（万人次）动态调整 SVG 地图中对应线路的渲染粗细，直观展示客流分布情况。

**核心逻辑**：客流量越大 → 线路线条越粗；客流量越小 → 线路线条越细。客流量划分为五个档次。

---

## 二、数据源分析

### 2.1 客流数据 (`flows_data/bj_subway_line_flows.json`)

- **总记录数**：2499 天
- **日期范围**：2019-01-01 ~ 2025-12-31
- **全局客流范围**：0.0 ~ 113.6（万人次）
- **线路数量**：28 条

**线路名称清单**：
```
1号线-八通线, 2号线, 3号线, 4号线-大兴线, 5号线,
6号线, 7号线, 8号线, 9号线, 10号线, 11号线, 12号线,
13号线, 14号线, 15号线, 16号线, 17号线, 18号线, 19号线,
房山线, 昌平线, 亦庄线, 燕房线, S1线, 西郊线, 亦庄T1线,
首都机场线, 大兴机场线
```

**数据结构**：
```json
[
  {
    "date": "2025-12-31",
    "lines": {
      "1号线-八通线": 13.6,
      "2号线": 18.3,
      ...
    }
  },
  ...
]
```

### 2.2 SVG 地图 (`Beijing_Subway_System_Map_zh.svg`)

- **尺寸**：2440 × 2440
- **结构**：每条地铁线路是一个 `<g id="线路标识">` 分组，内部包含：
  - `<path>` — 线路轨迹（`fill="none" stroke="颜色" stroke-width="线宽"`）
  - `<circle>` — 站点标记
  - `<path>` — 站点外环（白色遮罩，用于断开站台处的线条）

**线路 `<g>` ID 清单**：
| SVG ID | 对应数据线路 | 说明 |
|--------|-------------|------|
| `L1` | 1号线-八通线 | 单线 |
| `L2` | 2号线 | 单线 |
| `L3` | 3号线 | 单线 |
| `L4` | 4号线-大兴线 | 单线 |
| `L5` | 5号线 | 单线 |
| `L6` | 6号线 | 单线 |
| `L7` | 7号线 | 单线 |
| `L8` | 8号线 | 单线 |
| `L9` | 9号线 | 单线 |
| `L10` | 10号线 | 单线 |
| `L11` | 11号线 | 单线 |
| `L12` | 12号线 | 单线 |
| `L13_L18` | 13号线 + 18号线 | **共线**（两条线路共用轨道） |
| `L14` | 14号线 | 单线 |
| `L15` | 15号线 | 单线 |
| `L16` | 16号线 | 单线 |
| `L17` | 17号线 | 单线 |
| `L19` | 19号线 | 单线 |
| `燕房_房山线` | 燕房线 + 房山线 | **共线**（两条线路共用轨道） |
| `昌平线` | 昌平线 | 单线 |
| `亦庄线` | 亦庄线 | 单线 |
| `亦庄T1线` | 亦庄T1线 | 单线 |
| `S1线` | S1线 | 单线 |
| `西郊线` | 西郊线 | 单线 |
| `首都机场线` | 首都机场线 | 单线 |
| `大兴机场线` | 大兴机场线 | 单线 |

**共线特殊处理**：对于 `L13_L18` 和 `燕房_房山线` 这两个共线组，同一 SVG `<g>` 代表两条数据线路。渲染时需取两条线路中客流量的**较大值**作为该组线宽的依据。

---

## 三、技术方案

### 3.1 技术选型

| 层面 | 选择 | 理由 |
|------|------|------|
| 整体架构 | 纯前端 SPA（HTML + CSS + JS） | 无后端依赖，数据量小（JSON ~1.9MB），可离线使用 |
| SVG 渲染 | 原生 DOM 操作 | 直接修改 SVG 内部 `<path>` 的 `stroke-width` 属性 |
| 日期选择 | 原生 `<input type="date">` | 无需引入 UI 库 |
| 数据处理 | 原生 JavaScript | 仅需 JSON 解析 + 分档计算，无复杂逻辑 |
| 打包 | 可选 Vite / 直接用 Live Server | 纯前端无构建步骤也可运行 |

**推荐方案**：单 HTML 文件 + 原生 JS + 内嵌 SVG，或 HTML 文件通过 `<object>` / `<img>` 引入外部 SVG（见 3.2）。

### 3.2 架构选择：SVG 嵌入方式

**方案 A（推荐）**：通过 `<object>` 标签引入 SVG，JavaScript 通过 `getSVGDocument()` 操作内部 DOM。

```
优点：SVG 文件独立，修改原始 SVG 不影响代码；支持 DOM 操作
缺点：同源策略要求 HTTP 服务（需 Live Server / Vite）
```

**方案 B**：将 SVG 内联在 HTML 中。

```
优点：无跨域问题，可直接操作 DOM
缺点：HTML 文件巨大（原始 SVG ~320KB），不利于维护
```

**推荐采用方案 A**，用 Vite 或 `npx serve` 提供本地 HTTP 服务。

### 3.3 五档线宽映射规则

根据当日全局客流量（28 条线路的 28 个值），按**等分位**（五等分）划分为五个档次：

| 档次 | 含义 | 原始线宽 (5px) 映射 | 映射线宽 |
|------|------|-------------------|---------|
| 1档 | 很低 | 5 × 0.4 | **2px** |
| 2档 | 较低 | 5 × 0.7 | **3.5px** |
| 3档 | 中等 | 5 × 1.0 | **5px** |
| 4档 | 较高 | 5 × 1.5 | **7.5px** |
| 5档 | 很高 | 5 × 2.0 | **10px** |

**分档算法**：
1. 获取当日 28 条线路的客流量值数组 `[v1, v2, ..., v28]`
2. 排序后取 20%、40%、60%、80% 百分位数作为阈值
3. 值 ≤ P20 → 1档（2px）；P20 < 值 ≤ P40 → 2档（3.5px）；以此类推

> 注：原始 SVG 中所有线路路径的 `stroke-width` 均为 5px。

---

## 四、详细设计

### 4.1 文件结构

```
project/
├── index.html                    # 主页面（日期选择器 + SVG 容器 + 图例）
├── css/
│   └── style.css                 # 布局与图例样式
├── js/
│   ├── main.js                   # 入口：事件绑定、协调各模块
│   ├── dataLoader.js             # 加载 & 缓存 JSON 数据
│   ├── flowClassifier.js         # 分档计算（五档）
│   ├── svgRenderer.js            # SVG DOM 操作：修改 stroke-width
│   └── lineMapping.js            # JSON 线路名 ↔ SVG group ID 映射表
├── flows_data/
│   └── bj_subway_line_flows.json # 客流数据
├── Beijing_Subway_System_Map_zh.svg  # 原始 SVG 地图
└── README.md
```

### 4.2 核心模块设计

#### 4.2.1 `lineMapping.js` — 线路映射表

```js
const LINE_MAPPING = {
  "1号线-八通线":   { svgId: "L1",          combined: false },
  "2号线":          { svgId: "L2",          combined: false },
  "3号线":          { svgId: "L3",          combined: false },
  "4号线-大兴线":   { svgId: "L4",          combined: false },
  "5号线":          { svgId: "L5",          combined: false },
  "6号线":          { svgId: "L6",          combined: false },
  "7号线":          { svgId: "L7",          combined: false },
  "8号线":          { svgId: "L8",          combined: false },
  "9号线":          { svgId: "L9",          combined: false },
  "10号线":         { svgId: "L10",         combined: false },
  "11号线":         { svgId: "L11",         combined: false },
  "12号线":         { svgId: "L12",         combined: false },
  "13号线":         { svgId: "L13_L18",     combined: true,  partner: "18号线" },
  "14号线":         { svgId: "L14",         combined: false },
  "15号线":         { svgId: "L15",         combined: false },
  "16号线":         { svgId: "L16",         combined: false },
  "17号线":         { svgId: "L17",         combined: false },
  "18号线":         { svgId: "L13_L18",     combined: true,  partner: "13号线" },
  "19号线":         { svgId: "L19",         combined: false },
  "房山线":         { svgId: "燕房_房山线", combined: true,  partner: "燕房线" },
  "燕房线":         { svgId: "燕房_房山线", combined: true,  partner: "房山线" },
  "昌平线":         { svgId: "昌平线",      combined: false },
  "亦庄线":         { svgId: "亦庄线",      combined: false },
  "亦庄T1线":       { svgId: "亦庄T1线",    combined: false },
  "S1线":           { svgId: "S1线",        combined: false },
  "西郊线":         { svgId: "西郊线",      combined: false },
  "首都机场线":     { svgId: "首都机场线",  combined: false },
  "大兴机场线":     { svgId: "大兴机场线",  combined: false }
};
```

**共线逻辑**：当 SVG ID 的 `combined: true` 时，取两条 `partner` 线路客流量的较大值作为该 SVG 组使用的线宽值。

#### 4.2.2 `dataLoader.js` — 数据加载

```js
// 职责：
// 1. fetch 加载 JSON 文件
// 2. 构建 { date: lineData } 的快速索引 Map
// 3. 返回可用日期列表供 UI 渲染
// 4. 缓存已加载数据，避免重复请求
```

接口：
```js
async function loadFlowData() → { dates: string[], getByDate(date): { line: value } }
```

#### 4.2.3 `flowClassifier.js` — 分档计算

```js
// 输入：{ 线路名: 客流量 } 映射
// 输出：{ 线路名: 1|2|3|4|5 } 档次映射
function classifyFlows(flowMap) → { lineName: tier }

// 分档算法：
// 1. 提取所有非零客流量值
// 2. 计算 P20, P40, P60, P80 百分位数
// 3. 按区间分配档次
// 4. 共线线路取较大值所属的档次
```

线宽映射常量：
```js
const STROKE_WIDTH_MAP = {
  1: 2,    // 很低
  2: 3.5,  // 较低
  3: 5,    // 中等（默认）
  4: 7.5,  // 较高
  5: 10    // 很高
};
```

#### 4.2.4 `svgRenderer.js` — SVG 渲染

```js
// 职责：遍历 SVG 内部的 <g> 元素，根据档次结果修改 path 的 stroke-width

function renderFlow(svgDoc, tierMap) {
  // 1. 遍历 LINE_MAPPING
  // 2. 根据 mapping 确定每条数据线路对应的 SVG group ID
  // 3. 对共线线路：先解析 partner 的档次，取较大值
  // 4. 对每个唯一的 SVG group ID：
  //    a. svgDoc.getElementById(groupId) 获取 <g>
  //    b. 遍历 <g> 内所有 fill="none" 且 stroke!="none" 且 stroke!="#fff" 的 <path>
  //    c. 设置 stroke-width = STROKE_WIDTH_MAP[tier]
}

// 所有 SVG <path> 的 stroke-width 默认值为 5
```

**关键规则**：只修改有颜色描边的 `<path>` 元素（即排除 `stroke="#fff"` 的白色站台遮罩路径）。同时也要跳过 `stroke="none"` 的元素。

#### 4.2.5 `main.js` — 主控制器

```js
// 初始化流程：
// 1. 加载 JSON 数据 (dataLoader)
// 2. 获取日期列表，初始化日期选择器（默认选最近日期）
// 3. 加载 SVG (通过 <object>)
// 4. SVG onload 后，读取当前日期的客流量 → 分档 → 渲染
// 5. 绑定日期切换事件：date change → 分档 → 更新渲染

// 日期选择器配置：
// <input type="date"> min=最早日期 max=最晚日期
```

### 4.3 UI 设计

```
┌────────────────────────────────────────────────┐
│  北京地铁客流量可视化系统                        │
│                                                │
│  选择日期：[ 2025-12-31  ▼ ]                   │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │                                          │  │
│  │          (SVG 地铁线路图)                 │  │
│  │                                          │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  图例：                                         │
│  ━━━   很高 (>P80)    10px                     │
│  ━━━   较高 (P60-P80)  7.5px                   │
│  ━━━   中等 (P40-P60)  5px                     │
│  ━━━   较低 (P20-P40)  3.5px                   │
│  ━━━   很低 (≤P20)     2px                     │
└────────────────────────────────────────────────┘
```

---

## 五、实现步骤

### 第一阶段：项目搭建
1. 初始化项目结构（`index.html`, `css/`, `js/`）
2. 配置本地 HTTP 服务（Vite / `npx serve`）

### 第二阶段：数据层
3. 实现 `dataLoader.js` — 加载 JSON、构建索引
4. 实现 `lineMapping.js` — JSON ↔ SVG ID 映射表
5. 实现 `flowClassifier.js` — 五档分档逻辑

### 第三阶段：渲染层
6. 实现 `svgRenderer.js` — DOM 操作修改 `stroke-width`
7. 验证：手动指定一个日期，console 打印分档结果，确认线路 SVG ID 匹配

### 第四阶段：UI
8. 实现 `index.html` — 日期选择器 + SVG 容器 + 图例
9. 实现 `main.js` — 初始化流程、事件绑定
10. 实现 `style.css` — 布局样式

### 第五阶段：测试与优化
11. 测试所有日期可正常切换
12. 处理边界情况：共线线路、某些日期缺失部分线路数据
13. 性能优化：若 JSON 过大，可考虑按需加载或 Service Worker 缓存

---

## 六、关键注意事项

### 6.1 共线处理
- **L13_L18**：13号线和18号线共用同一轨道，在 SVG 中是同一个 `<g>`。需取两条线中较大的客流量值决定线宽。
- **燕房_房山线**：同理，取燕房线和房山线中较大的客流量值。

### 6.2 SVG Path 筛选
修改 `stroke-width` 时务必跳过：
- `fill` 不为 `"none"` 的 `<path>`（如站点图标）
- `stroke` 为 `"#fff"` 的 `<path>`（站台遮罩，用于断开站台处线条）
- `stroke` 为 `"none"` 的元素

### 6.3 `<object>` 跨域问题
- SVG 通过 `<object>` 引入后，必须通过同源 HTTP 访问才能操作内部 DOM
- **不能用 `file://` 协议直接打开 HTML**，必须启动本地 HTTP 服务

### 6.4 性能
- JSON 文件约 1.9MB，首次加载需一定时间，建议添加 loading 状态
- 分档计算量很小（28 个值排序），无性能瓶颈
- 日期切换只需重新计算分档 + 修改 DOM 属性，无需重新加载 SVG

### 6.5 数据异常
- 部分线路可能出现客流量为 0.0 的情况，分档时归入最低档
- 日期数据中有一个异常值 `"2021-10-003"`，加载时需过滤掉无效日期

---

## 七、额外建议

如果后续需要增强，可考虑以下方向：
- 在每条线路旁显示当日具体客流量数值
- 叠加热力图显示各站点的进出站量
- 支持时间轴动画（逐日播放客流变化趋势）
- 对比模式（选择两个日期并排对比）
- 在 SVG 线路旁边显示 tooltip，hover 时展示当日客流数值
