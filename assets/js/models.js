// models.js — costanti e helper di base

export const STAGES = [
  "lead", "contatto", "discovery", "proposta", "negoziazione", "vinto", "perso"
];

export const DEFAULT_STAGE_PROB = {
  lead: 10, contatto: 20, discovery: 30, proposta: 50, negoziazione: 70, vinto: 100, perso: 0
};

export const DEFAULT_CONFIG = {
  theme: "dark",
  currency: "€",
  stageProbabilities: { ...DEFAULT_STAGE_PROB },
  stageOrder: [...STAGES],           // ordine colonne kanban + funnel
  paceCurve: "linear",               // 'linear' | 'ramp (20/30/50)'
  thresholds: { coverage: { red: 1, amber: 2 }, underPace: 0.1 },
  holidays: []                       // array di stringhe "YYYY-MM-DD"
};

export function getQuarterDates(year, q){
  const startMonths = {1:0, 2:3, 3:6, 4:9};   // Jan/Apr/Jul/Oct
  const start = new Date(Date.UTC(year, startMonths[q], 1));
  const end   = new Date(Date.UTC(year, startMonths[q] + 3, 0)); // ultimo giorno del terzo mese
  return { start, end };
}

export function formatCurrency(n, cur="€"){
  if (n == null || isNaN(n)) return "-";
  try {
    // uso EUR per formattazione, poi sostituisco simbolo visualizzato
    return new Intl.NumberFormat("it-IT", {
      style:"currency", currency:"EUR", maximumFractionDigits:0
    }).format(n).replace("€", cur);
  } catch {
    return cur + " " + Math.round(n).toLocaleString("it-IT");
  }
}

export function fmtDate(d){
  if (!d) return "-";
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth()+1).padStart(2,"0");
  const day = String(dt.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export function workdaysBetween(start, end, holidays=[]){
  const hs = new Set(holidays || []);
  const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const e = new Date(Date.UTC(end.getUTCFullYear(),   end.getUTCMonth(),   end.getUTCDate()));
  let days = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate()+1)){
    const wd = d.getUTCDay();               // 0=Sun ... 6=Sat
    const iso = fmtDate(d);
    if (wd!==0 && wd!==6 && !hs.has(iso)) days++;
  }
  return days;
}

// ---- helper pace “ramp” (20/30/50) ----
export function monthAdd(date, months){
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
export function clampDate(d, start, end){
  const t = d.getTime();
  return new Date(Math.min(Math.max(t, start.getTime()), end.getTime()));
}
export function segmentWorkdaysFraction(start, end, point, holidays){
  const p = clampDate(point, start, end);
  const total = workdaysBetween(start, end, holidays);
  if (total <= 0) return 0;
  const elapsed = workdaysBetween(start, p, holidays);
  return Math.min(1, Math.max(0, elapsed / total));
}
export function rampPaceFraction(start, end, today, holidays){
  const s1 = start, s2 = monthAdd(start, 1), s3 = monthAdd(start, 2);
  const e1 = new Date(s2.getTime()-86400000), e2 = new Date(s3.getTime()-86400000), e3 = end;
  const f1 = segmentWorkdaysFraction(s1, e1, today, holidays);
  const f2 = segmentWorkdaysFraction(s2, e2, today, holidays);
  const f3 = segmentWorkdaysFraction(s3, e3, today, holidays);
  return 0.2*f1 + 0.3*f2 + 0.5*f3;
}

export function uid(){ return Math.random().toString(36).slice(2,10); }
