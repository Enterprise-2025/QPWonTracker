// kpi.js — KPI + serie per grafici/tabelle
import { workdaysBetween, rampPaceFraction } from './models.js';
import { getCurrentQuarter, getDeals, getConfig } from './store.js';

export function computeKPIs(){
  const q = getCurrentQuarter();
  const cfg = getConfig();
  const start = new Date(q.startDate + "T00:00:00Z");
  const end   = new Date(q.endDate   + "T00:00:00Z");
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const wdTotal = workdaysBetween(start, end, cfg.holidays);
  const clamp   = todayUTC < start ? start : (todayUTC > end ? end : todayUTC);
  const wdSoFar = workdaysBetween(start, clamp, cfg.holidays);
  const fraction = (cfg.paceCurve==='ramp')
    ? rampPaceFraction(start, end, clamp, cfg.holidays)
    : (wdSoFar / Math.max(1, wdTotal));

  const deals = getDeals(q.id);
  const done = deals.filter(d => d.stage === "vinto").reduce((s,d)=>s+(+d.value||0), 0);
  const pipeline = deals.filter(d => d.stage !== "vinto" && d.stage !== "perso").reduce((s,d)=>s+(+d.value||0), 0);
  const forecast = deals.filter(d => d.stage !== "perso").reduce((s,d)=>s+((+d.value||0) * ((+d.probability||0)/100)), 0);

  const paceExpected = q.target * fraction;
  const delta   = done - paceExpected;
  const remaining = Math.max(0, q.target - done);
  const weeks   = Math.max(1, Math.ceil((end - clamp) / (1000*60*60*24*7)));
  const runRate = remaining / weeks;
  const coverage = remaining > 0 ? (pipeline / remaining) : Infinity;

  // piccolo health score sintetico
  const paceScore = Math.max(0, Math.min(100, 50 + (delta / (q.target*0.2))*50));
  const covScore  = coverage >= 2 ? 100 : coverage <= 1 ? 20 : 60;
  const fcScore   = Math.max(0, Math.min(100, (forecast / q.target)*100));
  const health    = Math.round(0.4*paceScore + 0.4*covScore + 0.2*fcScore);

  return { target: q.target, done, pipeline, forecast, paceExpected, delta, coverage, runRate, wdTotal, wdSoFar, health, start, end };
}

export function weeklySeries(){
  const q = getCurrentQuarter();
  const cfg = getConfig();
  const deals = getDeals(q.id);
  const start = new Date(q.startDate + "T00:00:00Z");
  const end   = new Date(q.endDate   + "T00:00:00Z");

  // bucket settimanali 7gg
  const weeks = [];
  let cur = new Date(start);
  while (cur <= end){
    const s = new Date(cur);
    const e = new Date(cur); e.setUTCDate(e.getUTCDate()+6);
    if (e > end) e.setTime(end.getTime());
    weeks.push({ start: new Date(s), end: new Date(e) });
    cur.setUTCDate(cur.getUTCDate()+7);
  }
  const labels = weeks.map((_,i)=>`W${i+1}`);

  // target cumulativo: lineare o ramp in base a config
  const targetCum = [];
  for (let i=0;i<weeks.length;i++){
    const endOfWeek = new Date(weeks[i].end);
    const wdTotal = workdaysBetween(start, end, cfg.holidays);
    const wdSoFar = workdaysBetween(start, endOfWeek, cfg.holidays);
    const fraction = (cfg.paceCurve==='ramp')
      ? rampPaceFraction(start, end, endOfWeek, cfg.holidays)
      : (wdSoFar / Math.max(1, wdTotal));
    targetCum.push(Math.round(q.target * fraction));
  }

  // cumulativo fatto (deal vinti con expectedCloseDate nella settimana)
  const doneWeekly = weeks.map(w => deals
    .filter(d => d.stage==="vinto")
    .filter(d => {
      if (!d.expectedCloseDate) return false;
      const dt = new Date(d.expectedCloseDate + "T00:00:00Z");
      return dt >= w.start && dt <= w.end;
    })
    .reduce((s,d)=>s+(+d.value||0),0)
  );
  const doneCum = [];
  let sumDone = 0;
  for (let i=0;i<doneWeekly.length;i++){ sumDone += doneWeekly[i]; doneCum.push(sumDone); }

  return { labels, targetCum, doneCum, weeks };
}

export function funnelData(){
  const q = getCurrentQuarter();
  const cfg = getConfig();
  const deals = getDeals(q.id);
  const order = Array.isArray(cfg.stageOrder) ? cfg.stageOrder : Object.keys(cfg.stageProbabilities);
  const sums = order.map(st => deals.filter(d=>d.stage===st).reduce((s,d)=>s+(+d.value||0), 0));
  return { labels: order, values: sums };
}

