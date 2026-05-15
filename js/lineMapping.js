/**
 * JSON data line name → SVG <g> group ID mapping.
 * Each entry: { svgId, combined, partner? }
 * - combined: true when two data lines share one SVG <g>
 * - partner: name of the other line sharing the same SVG group
 */

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
  "13号线":         { svgId: "L13_L18",     combined: true, partner: "18号线" },
  "14号线":         { svgId: "L14",         combined: false },
  "15号线":         { svgId: "L15",         combined: false },
  "16号线":         { svgId: "L16",         combined: false },
  "17号线":         { svgId: "L17",         combined: false },
  "18号线":         { svgId: "L13_L18",     combined: true, partner: "13号线" },
  "19号线":         { svgId: "L19",         combined: false },
  "房山线":         { svgId: "房山_燕房线", combined: true, partner: "燕房线" },
  "燕房线":         { svgId: "房山_燕房线", combined: true, partner: "房山线" },
  "昌平线":         { svgId: "昌平线",      combined: false },
  "亦庄线":         { svgId: "亦庄线",      combined: false },
  "亦庄T1线":       { svgId: "亦庄T1线",    combined: false },
  "S1线":           { svgId: "S1线",        combined: false },
  "西郊线":         { svgId: "西郊线",      combined: false },
  "首都机场线":     { svgId: "首都机场线",  combined: false },
  "大兴机场线":     { svgId: "大兴机场线",  combined: false }
};

/**
 * Build a reverse index: svgId → { resolver(lineFlows) → tier }
 * Only combined groups need special logic (max of two partners).
 */
function buildSvgGroupTierMap(lineTierMap) {
  const groupTiers = {};
  const processed = new Set();

  for (const [lineName, config] of Object.entries(LINE_MAPPING)) {
    if (processed.has(config.svgId)) continue;
    processed.add(config.svgId);

    if (config.combined) {
      groupTiers[config.svgId] = Math.max(
        lineTierMap[lineName] ?? 1,
        lineTierMap[config.partner] ?? 1
      );
    } else {
      groupTiers[config.svgId] = lineTierMap[lineName] ?? 1;
    }
  }

  return groupTiers;
}

/**
 * Find the SVG group ID with the highest passenger flow.
 * For combined lines, takes the max of the two partners.
 */
function findTopSvgGroup(lineFlowMap) {
  let topSvgId = null;
  let topFlow = -1;

  const processed = new Set();
  for (const [lineName, config] of Object.entries(LINE_MAPPING)) {
    if (processed.has(config.svgId)) continue;
    processed.add(config.svgId);

    let flow = lineFlowMap[lineName] ?? 0;
    if (config.combined) {
      const partnerFlow = lineFlowMap[config.partner] ?? 0;
      flow = Math.max(flow, partnerFlow);
    }

    if (flow > topFlow) {
      topFlow = flow;
      topSvgId = config.svgId;
    }
  }

  return topSvgId;
}
