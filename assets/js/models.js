export const STAGES = [
  "lead","contatto","discovery","proposta","negoziazione","vinto","perso"
];

export const DEFAULT_STAGE_PROB = {
  lead: 10, contatto: 20, discovery: 30, proposta: 50, negoziazione: 70, vinto: 100, perso: 0
};

export const DEFAULT_CONFIG = {
  theme: "dark",
  currency: "€",
  stageProbabilities: { ...DEFAULT_STAGE_PROB },
  paceCurve: "linear", // or 'ramp'
  thresholds: { coverage: { red: 1, amber: 2 }, underPace: 0.1 },
  holidays: []
};

export function getQuarterDates(year, q){
  const startMonths = {1:0, 2:3, 3:6, 4:9}; // Jan,Apr,Jul,Oct
  const start = new Date(Date.UTC(year, startMonths[q], 1));
  const end = new Date(Date.UTC(year, startMonths[q]+3, 0)); // last day prev month
  return { start, end };
}

export function formatCurrency(n, cur="€"){
  if (n == null || isNaN(n)) return "-";
  try {
    return new Intl.NumberFormat("it-IT", { style:"currency", currency:"EUR", maximumFractionDigits:0 }).format(n).replace("€", cur);
  } catch {
    return cur + " " + Math.round(n).toLocaleString("it-IT");
  }
}

export function fmtDate(d){
  if (!d) return "-";
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = (dt.getMonth()+1).toString().padStart(2,"0");
  const day = dt.getDate().toString().padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export function workdaysBetween(start, end, holidays=[]){
  const hs = new Set(holidays || []);
  const s = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const e = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
  let days = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate()+1)){
    const wd = d.getUTCDay();
    const iso = fmtDate(d);
    if (wd!==0 && wd!==6 && !hs.has(iso)) days++;
  }
  return days;
}

export function getWeekBuckets(start, end){
  const buckets = [];
  let cur = new Date(start);
  while (cur <= end){
    const s = new Date(cur);
    const e = new Date(cur); e.setDate(e.getDate()+6);
    if (e > end) e.setTime(end.getTime());
    buckets.push({ start: new Date(s), end: new Date(e) });
    cur.setDate(cur.getDate()+7);
  }
  return buckets;
}

export function uid(){ return Math.random().toString(36).slice(2,10); }
