/**
 * Loads and indexes hourly flow data.
 * Aggregates: hourly → daily → monthly → yearly.
 *
 * Schema (v3):
 *   entry.lines → { "6号线": { "7:00-8:00": {inbound, outbound, total}, ... }, ... }
 */

const HOUR_SLOTS = [
  '5:00-6:00','6:00-7:00','7:00-8:00','8:00-9:00','9:00-10:00',
  '10:00-11:00','11:00-12:00','12:00-13:00','13:00-14:00','14:00-15:00',
  '15:00-16:00','16:00-17:00','17:00-18:00','18:00-19:00','19:00-20:00',
  '20:00-21:00','21:00-22:00','22:00-23:00'
];

const DataLoader = (() => {
  let dateIndex    = new Map(); // "YYYY-MM-DD" → { line: total }
  let hourIndex    = new Map(); // "YYYY-MM-DD|slot" → { line: total }
  let hourSplit    = new Map(); // "YYYY-MM-DD|slot" → { line: {in,out} } — preserves direction
  let monthIndex   = new Map(); // "YYYY-MM" → { line: sum }
  let yearIndex    = new Map(); // "YYYY" → { line: sum }
  let metaIndex    = new Map(); // "YYYY-MM-DD" → { day_type, weather, event }
  let daysByMonth  = new Map(); // "YYYY-MM" → ["YYYY-MM-DD", ...]
  let sortedDays   = [];
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

      metaIndex.set(date, {
        day_type: entry.day_type || 'normal',
        weather: entry.weather || 'normal',
        event: entry.event || 'none'
      });

      const lines = entry.lines;
      if (!lines || typeof lines !== 'object') continue;

      const dayTotals = {};

      for (const [lineName, hours] of Object.entries(lines)) {
        if (!hours || typeof hours !== 'object') continue;

        let lineTotal = 0;

        for (const slot of HOUR_SLOTS) {
          const bucket = hours[slot];
          const inVal  = (bucket && typeof bucket.inbound  === 'number') ? bucket.inbound  : 0;
          const outVal = (bucket && typeof bucket.outbound === 'number') ? bucket.outbound : 0;
          const totVal = (bucket && typeof bucket.total   === 'number') ? bucket.total   : 0;
          lineTotal += totVal;

          // Hourly total index (maps + rankings)
          const hourKey = `${date}|${slot}`;
          if (!hourIndex.has(hourKey)) hourIndex.set(hourKey, {});
          hourIndex.get(hourKey)[lineName] = (hourIndex.get(hourKey)[lineName] || 0) + totVal;

          // Hourly split index (tidal chart, direction labels)
          if (!hourSplit.has(hourKey)) hourSplit.set(hourKey, {});
          if (!hourSplit.get(hourKey)[lineName]) {
            hourSplit.get(hourKey)[lineName] = { inbound: 0, outbound: 0 };
          }
          hourSplit.get(hourKey)[lineName].inbound  += inVal;
          hourSplit.get(hourKey)[lineName].outbound += outVal;
        }

        dayTotals[lineName] = (dayTotals[lineName] || 0) + lineTotal;
      }

      dateIndex.set(date, dayTotals);

      if (!daysByMonth.has(monthKey)) daysByMonth.set(monthKey, []);
      daysByMonth.get(monthKey).push(date);

      if (!monthIndex.has(monthKey)) monthIndex.set(monthKey, {});
      const mAcc = monthIndex.get(monthKey);
      for (const [line, val] of Object.entries(dayTotals)) {
        mAcc[line] = (mAcc[line] || 0) + val;
      }

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
      getDaysOfMonth, getMeta, getInOutByHour,
      HOUR_SLOTS
    };
  }

  function getFlowByDay(date)       { return dateIndex.get(date) ?? null; }
  function getFlowByMonth(month)    { return monthIndex.get(month) ?? null; }
  function getFlowByYear(year)      { return yearIndex.get(year) ?? null; }
  function getFlowByHour(date,slot) { return hourIndex.get(`${date}|${slot}`) ?? null; }
  function getDaysOfMonth(month)    { return daysByMonth.get(month) ?? []; }
  function getMeta(date)            { return metaIndex.get(date) ?? null; }

  /** Returns { lineName: {inbound, outbound} } for a given date+slot. */
  function getInOutByHour(date, slot) { return hourSplit.get(`${date}|${slot}`) ?? null; }

  return {
    load, HOUR_SLOTS,
    getFlowByDay, getFlowByMonth, getFlowByYear, getFlowByHour,
    getDaysOfMonth, getMeta, getInOutByHour
  };
})();
