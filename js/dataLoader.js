/**
 * Loads and indexes the flow data JSON.
 * Returns: { dates: string[], getFlowByDate(date): { lineName: value } }
 */

const DataLoader = (() => {
  let dateIndex = null;    // Map<date, { lineName: flow }>
  let sortedDates = null;  // string[] sorted ascending

  async function load() {
    if (dateIndex) return { dates: sortedDates, getFlowByDate };

    const resp = await fetch('flows_data/bj_subway_line_flows.json');
    if (!resp.ok) throw new Error(`Failed to load flow data: ${resp.status}`);
    const raw = await resp.json();

    dateIndex = new Map();
    const invalidPattern = /[^0-9\-]/; // skip malformed dates like "2021-10-003"

    for (const entry of raw) {
      const date = entry.date;
      if (!date || invalidPattern.test(date)) continue;

      // fix date format if needed (e.g. "2021-10-003" → skip; "2025-12-31" → keep)
      const parts = date.split('-');
      if (parts.length !== 3) continue;
      if (parts[1].length !== 2 || parts[2].length !== 2) continue;

      dateIndex.set(date, entry.lines);
    }

    sortedDates = Array.from(dateIndex.keys()).sort();
    return { dates: sortedDates, getFlowByDate };
  }

  function getFlowByDate(date) {
    return dateIndex?.get(date) ?? null;
  }

  return { load, getFlowByDate };
})();
