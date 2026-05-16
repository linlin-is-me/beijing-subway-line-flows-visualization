/**
 * Loads and indexes hourly flow data (bj_subway_flows.json).
 * Aggregates: hourly → daily → monthly → yearly.
 */

const HOUR_SLOTS = [
  '5:00-6:00','6:00-7:00','7:00-8:00','8:00-9:00','9:00-10:00',
  '10:00-11:00','11:00-12:00','12:00-13:00','13:00-14:00','14:00-15:00',
  '15:00-16:00','16:00-17:00','17:00-18:00','18:00-19:00','19:00-20:00',
  '20:00-21:00','21:00-22:00','22:00-23:00'
];

const DataLoader = (() => {
  let dateIndex   = new Map(); // "YYYY-MM-DD" → { line: total }
  let hourIndex   = new Map(); // "YYYY-MM-DD|HH:00-HH:00" → { line: value }
  let monthIndex  = new Map(); // "YYYY-MM" → { line: sum }
  let yearIndex   = new Map(); // "YYYY" → { line: sum }
  let daysByMonth = new Map(); // "YYYY-MM" → ["YYYY-MM-DD", ...]
  let sortedDays  = [];
  let sortedMonths = [];
  let sortedYears  = [];

  async function load() {
    if (dateIndex.size) return buildResult();

    const resp = await fetch('flows_data/bj_subway_flows.json');
    if (!resp.ok) throw new Error(`Failed to load: ${resp.status}`);
    const raw = await resp.json();

    for (const entry of raw) {
      const date = entry.date;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      const [y, m] = date.split('-');
      const monthKey = `${y}-${m}`;

      // Aggregate daily total from hourly slots
      const dayTotal = {};
      for (const [line, hours] of Object.entries(entry.lines)) {
        let sum = 0;
        for (const slot of HOUR_SLOTS) {
          const v = hours[slot] || 0;
          sum += v;
          // Hourly index: key = "date|slot"
          hourIndex.set(`${date}|${slot}`, hourIndex.get(`${date}|${slot}`) || {});
          hourIndex.get(`${date}|${slot}`)[line] = v;
        }
        dayTotal[line] = sum;
      }
      dateIndex.set(date, dayTotal);

      // Days per month
      if (!daysByMonth.has(monthKey)) daysByMonth.set(monthKey, []);
      daysByMonth.get(monthKey).push(date);

      // Month aggregation
      if (!monthIndex.has(monthKey)) monthIndex.set(monthKey, {});
      const mAcc = monthIndex.get(monthKey);
      for (const [line, val] of Object.entries(dayTotal)) {
        mAcc[line] = (mAcc[line] || 0) + val;
      }

      // Year aggregation
      if (!yearIndex.has(y)) yearIndex.set(y, {});
      const yAcc = yearIndex.get(y);
      for (const [line, val] of Object.entries(dayTotal)) {
        yAcc[line] = (yAcc[line] || 0) + val;
      }
    }

    sortedDays   = Array.from(dateIndex.keys()).sort();
    sortedMonths = Array.from(monthIndex.keys()).sort();
    sortedYears  = Array.from(yearIndex.keys()).sort();
    // Sort days within each month
    for (const days of daysByMonth.values()) days.sort();

    return buildResult();
  }

  function buildResult() {
    return {
      days: sortedDays, months: sortedMonths, years: sortedYears,
      getFlowByDay, getFlowByMonth, getFlowByYear, getFlowByHour,
      getDaysOfMonth, HOUR_SLOTS
    };
  }

  function getFlowByDay(date)    { return dateIndex.get(date) ?? null; }
  function getFlowByMonth(month) { return monthIndex.get(month) ?? null; }
  function getFlowByYear(year)   { return yearIndex.get(year) ?? null; }
  function getFlowByHour(date, slot) { return hourIndex.get(`${date}|${slot}`) ?? null; }
  function getDaysOfMonth(month) { return daysByMonth.get(month) ?? []; }

  return { load, getFlowByDay, getFlowByMonth, getFlowByYear, getFlowByHour, getDaysOfMonth, HOUR_SLOTS };
})();
