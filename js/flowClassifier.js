/**
 * Six-tier classification based on equal quintile (20-percentile) thresholds.
 *
 * Input:  { lineName: flowValue }  (28 values for one date)
 * Output: { lineName: 1|2|3|4|5 }
 * Tier 6 is assigned externally for the top-flow line.
 */

const STROKE_WIDTH_MAP = {
  1: 7,    // 很低
  2: 14,   // 较低
  3: 21,   // 中等
  4: 28,   // 较高
  5: 35,   // 很高
  6: 42    // 最高（当日/月/年/时客流第一的线路）
};

const TIER_LABELS = {
  1: '极度空闲',
  2: '空闲',
  3: '轻度拥挤',
  4: '中度拥挤',
  5: '重度拥挤',
  6: '极度爆满'
};

const TIER_COLORS = {
  1: '#feedde',  // 浅橙 极空闲
  2: '#fdd0a2',  // 淡橙 较空闲
  3: '#fdae6b',  // 橙色 客流平稳
  4: '#fd8d3c',  // 深橙 轻度拥挤
  5: '#e0551f',  // 橘红 中度拥挤
  6: '#8b1a1a'   // 暗红 极度爆满（仅最高线路有闪烁）
};

/**
 * Compute percentile from sorted array.
 * Uses linear interpolation (C=1 method, similar to numpy).
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const n = sorted.length;
  const index = (p / 100) * (n - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const frac = index - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function classifyFlows(flowMap) {
  // Extract all flow values (28 lines)
  const values = Object.values(flowMap)
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (values.length === 0) {
    // fallback: all tier 3
    const result = {};
    for (const name of Object.keys(flowMap)) result[name] = 3;
    return result;
  }

  const sorted = [...values].sort((a, b) => a - b);

  const p20 = percentile(sorted, 20);
  const p40 = percentile(sorted, 40);
  const p60 = percentile(sorted, 60);
  const p80 = percentile(sorted, 80);

  const result = {};
  for (const [name, val] of Object.entries(flowMap)) {
    const v = (typeof val === 'number' && !isNaN(val)) ? val : 0;
    if (v <= p20) result[name] = 1;
    else if (v <= p40) result[name] = 2;
    else if (v <= p60) result[name] = 3;
    else if (v <= p80) result[name] = 4;
    else result[name] = 5;
  }

  return result;
}
