/**
 * Loads and indexes the flow data JSON.
 * Provides three granularities: daily, monthly, yearly.
 * Monthly/yearly values are sums of daily flows for the period.
 */

const DataLoader = (() => {
  let dateIndex = null;     // Map<"YYYY-MM-DD", { lineName: flow }>
  let monthIndex = null;   // Map<"YYYY-MM",   { lineName: sum }>
  let yearIndex = null;    // Map<"YYYY",      { lineName: sum }>
  let sortedDays = null;
  let sortedMonths = null;
  let sortedYears = null;

  async function load() {
    if (dateIndex) return buildResult();

    const resp = await fetch('flows_data/bj_subway_line_flows.json');
    if (!resp.ok) throw new Error(`Failed to load flow data: ${resp.status}`);
    const raw = await resp.json();

    dateIndex = new Map();
    monthIndex = new Map();
    yearIndex = new Map();

    for (const entry of raw) {
      const date = entry.date;
      if (!date || date.includes('003')) continue; // skip malformed like "2021-10-003"

      const parts = date.split('-');
      if (parts.length !== 3) continue;
      if (parts[1].length !== 2 || parts[2].length !== 2) continue;

      const year = parts[0];
      const month = `${year}-${parts[1]}`;

      dateIndex.set(date, entry.lines);

      // Aggregate into month
      if (!monthIndex.has(month)) monthIndex.set(month, {});
      const mAcc = monthIndex.get(month);
      for (const [line, val] of Object.entries(entry.lines)) {
        mAcc[line] = (mAcc[line] || 0) + val;
      }

      // Aggregate into year
      if (!yearIndex.has(year)) yearIndex.set(year, {});
      const yAcc = yearIndex.get(year);
      for (const [line, val] of Object.entries(entry.lines)) {
        yAcc[line] = (yAcc[line] || 0) + val;
      }
    }

    sortedDays = Array.from(dateIndex.keys()).sort();
    sortedMonths = Array.from(monthIndex.keys()).sort();
    sortedYears = Array.from(yearIndex.keys()).sort();

    return buildResult();
  }

  function buildResult() {
    return { days: sortedDays, months: sortedMonths, years: sortedYears,
             getFlowByDay, getFlowByMonth, getFlowByYear };
  }

  function getFlowByDay(date)    { return dateIndex?.get(date) ?? null; }
  function getFlowByMonth(month) { return monthIndex?.get(month) ?? null; }
  function getFlowByYear(year)   { return yearIndex?.get(year) ?? null; }

  return { load, getFlowByDay, getFlowByMonth, getFlowByYear };
})();
