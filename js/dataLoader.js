/**
 * Loads and indexes segment-based hourly flow data.
 * Aggregates: segment → line → daily → monthly → yearly.
 *
 * NEW schema (v2):
 *   entry.segments → { "6号线_西段(石景山/海淀)": { "7:00-8:00": {inbound,outbound,total}, ... }, ... }
 *
 * Segment → line mapping rule:
 *   Everything before the first '_' is the line name.
 *   e.g. "6号线_西段(石景山/海淀)" → "6号线"
 *        "10号线_北/东段(CBD/中关村)" → "10号线"
 *        "2号线" (no underscore) → "2号线"
 */

const HOUR_SLOTS = [
  '5:00-6:00','6:00-7:00','7:00-8:00','8:00-9:00','9:00-10:00',
  '10:00-11:00','11:00-12:00','12:00-13:00','13:00-14:00','14:00-15:00',
  '15:00-16:00','16:00-17:00','17:00-18:00','18:00-19:00','19:00-20:00',
  '20:00-21:00','21:00-22:00','22:00-23:00'
];

function extractLineName(segmentName) {
  const idx = segmentName.indexOf('_');
  return idx > 0 ? segmentName.substring(0, idx) : segmentName;
}

const DataLoader = (() => {
  let dateIndex    = new Map(); // "YYYY-MM-DD" → { line: total }
  let hourIndex    = new Map(); // "YYYY-MM-DD|slot" → { line: total }
  let monthIndex   = new Map(); // "YYYY-MM" → { line: sum }
  let yearIndex    = new Map(); // "YYYY" → { line: sum }
  let metaIndex    = new Map(); // "YYYY-MM-DD" → { day_type, weather, event }
  let daysByMonth  = new Map(); // "YYYY-MM" → ["YYYY-MM-DD", ...]
  let sortedDays   = [];
  let sortedMonths = [];
  let sortedYears  = [];

  // Raw segment data preserved for future segment-level features
  let rawEntries   = [];       // the original JSON array (segment granularity)

  async function load() {
    if (dateIndex.size) return buildResult();

    const resp = await fetch('flows_data/bj_subway_flows.json');
    if (!resp.ok) throw new Error(`Failed to load: ${resp.status}`);
    rawEntries = await resp.json();

    for (const entry of rawEntries) {
      const date = entry.date;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      const [y, m] = date.split('-');
      const monthKey = `${y}-${m}`;

      // Save metadata
      metaIndex.set(date, {
        day_type: entry.day_type || 'normal',
        weather: entry.weather || 'normal',
        event: entry.event || 'none'
      });

      const segments = entry.segments;
      if (!segments || typeof segments !== 'object') continue;

      // Accumulators for this day: line → sum
      const dayTotals = {};

      for (const [segName, hours] of Object.entries(segments)) {
        if (!hours || typeof hours !== 'object') continue;
        const lineName = extractLineName(segName);

        let segTotal = 0;

        for (const slot of HOUR_SLOTS) {
          const bucket = hours[slot];
          const v = (bucket && typeof bucket.total === 'number') ? bucket.total : 0;
          segTotal += v;

          // Hourly index (line-level aggregation)
          const hourKey = `${date}|${slot}`;
          if (!hourIndex.has(hourKey)) hourIndex.set(hourKey, {});
          const hAcc = hourIndex.get(hourKey);
          hAcc[lineName] = (hAcc[lineName] || 0) + v;
        }

        // Accumulate into day total for this line
        dayTotals[lineName] = (dayTotals[lineName] || 0) + segTotal;
      }

      dateIndex.set(date, dayTotals);

      // Days per month
      if (!daysByMonth.has(monthKey)) daysByMonth.set(monthKey, []);
      daysByMonth.get(monthKey).push(date);

      // Month aggregation
      if (!monthIndex.has(monthKey)) monthIndex.set(monthKey, {});
      const mAcc = monthIndex.get(monthKey);
      for (const [line, val] of Object.entries(dayTotals)) {
        mAcc[line] = (mAcc[line] || 0) + val;
      }

      // Year aggregation
      if (!yearIndex.has(y)) yearIndex.set(y, {});
      const yAcc = yearIndex.get(y);
      for (const [line, val] of Object.entries(dayTotals)) {
        yAcc[line] = (yAcc[line] || 0) + val;
      }
    }

    sortedDays   = Array.from(dateIndex.keys()).sort();
    sortedMonths = Array.from(monthIndex.keys()).sort();
    sortedYears  = Array.from(yearIndex.keys()).sort();
    for (const days of daysByMonth.values()) days.sort();

    return buildResult();
  }

  function buildResult() {
    return {
      days: sortedDays, months: sortedMonths, years: sortedYears,
      getFlowByDay, getFlowByMonth, getFlowByYear, getFlowByHour,
      getDaysOfMonth, getMeta,
      HOUR_SLOTS
    };
  }

  function getFlowByDay(date)       { return dateIndex.get(date) ?? null; }
  function getFlowByMonth(month)    { return monthIndex.get(month) ?? null; }
  function getFlowByYear(year)      { return yearIndex.get(year) ?? null; }
  function getFlowByHour(date,slot) { return hourIndex.get(`${date}|${slot}`) ?? null; }
  function getDaysOfMonth(month)    { return daysByMonth.get(month) ?? []; }
  function getMeta(date)            { return metaIndex.get(date) ?? null; }

  return {
    load, HOUR_SLOTS,
    getFlowByDay, getFlowByMonth, getFlowByYear, getFlowByHour,
    getDaysOfMonth, getMeta
  };
})();
