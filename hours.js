// Godziny otwarcia: minimalny parser formatu OSM opening_hours i "otwarte teraz" w czasie warszawskim.
// Używany przez mapę (app.js) i landing (landing.js).
window.StolikHours = (() => {
  "use strict";

  const DAY_KEYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  // Minimal OSM opening_hours parser: "Mo-Fr 07:30-20:00; Sa,Su 09:00-18:00"
  function parseHours(str) {
    if (!str) return null;
    const week = DAY_KEYS.map(() => []);
    for (const raw of str.split(";")) {
      const rule = raw.trim();
      if (!rule) continue;
      const m = rule.match(/^([A-Za-z,\-]+)\s+(.+)$/);
      const daysPart = m ? m[1] : "Mo-Su";
      const timePart = m ? m[2] : rule;
      const days = new Set();
      for (const seg of daysPart.split(",")) {
        const [a, b] = seg.split("-");
        const i = DAY_KEYS.indexOf(a), j = b ? DAY_KEYS.indexOf(b) : i;
        if (i < 0 || j < 0) continue;
        for (let k = i; ; k = (k + 1) % 7) { days.add(k); if (k === j) break; }
      }
      const ranges = [];
      if (!/^off$/i.test(timePart)) {
        for (const t of timePart.split(",")) {
          const tm = t.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
          if (!tm) continue;
          const s = +tm[1] * 60 + +tm[2];
          let e = +tm[3] * 60 + +tm[4];
          if (e <= s) e += 1440;
          ranges.push([s, e]);
        }
      }
      for (const d of days) week[d] = ranges;
    }
    return week;
  }

  function warsawNow() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
    return { day, min: +get("hour") * 60 + +get("minute") };
  }

  const hoursCache = new Map();
  const weekOf = (p) => {
    if (!hoursCache.has(p.id)) hoursCache.set(p.id, parseHours(p.hours));
    return hoursCache.get(p.id);
  };

  // true / false / null (unknown)
  function isOpenNow(p) {
    const week = weekOf(p);
    if (!week) return null;
    const { day, min } = warsawNow();
    if (week[day].some(([s, e]) => min >= s && min < e)) return true;
    const prev = week[(day + 6) % 7];
    return prev.some(([, e]) => e > 1440 && min < e - 1440);
  }

  const fmtMin = (m) => {
    m %= 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  function closesAt(p) {
    const week = weekOf(p);
    if (!week) return null;
    const { day, min } = warsawNow();
    const r = week[day].find(([s, e]) => min >= s && min < e)
      || week[(day + 6) % 7].map(([s, e]) => [s - 1440, e - 1440]).find(([, e]) => min < e);
    return r ? fmtMin(r[1]) : null;
  }

  return { weekOf, warsawNow, isOpenNow, closesAt, fmtMin };
})();
