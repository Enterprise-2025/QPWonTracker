import { STAGES, DEFAULT_STAGE_PROB, DEFAULT_CONFIG, formatCurrency, fmtDate, getQuarterDates } from './models.js';
import { getState, getConfig, setConfig, getQuarters, getCurrentQuarter, setCurrentQuarter, createQuarter, getDeals, addDeal, updateDeal, moveDeal, exportJSON, importJSON, reseedDemo, deleteAll } from './store.js';
import { computeKPIs, weeklySeries, funnelData } from './kpi.js';
import { renderCumulativeChart, renderFunnelChart } from './charts.js';

// Service worker (PWA)
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  });
}

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

function setTheme(theme){
  if (theme === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('light');
}

function renderQuarterSelector(){
  const sel = qs('#quarterSelector');
  sel.innerHTML = '';
  const quarters = getQuarters();
  quarters.sort((a,b)=> (a.year - b.year) || (a.q - b.q));
  const cur = getCurrentQuarter();
  for (const q of quarters){
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.textContent = `${q.year} • Q${q.q}`;
    if (q.id === cur.id) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => { setCurrentQuarter(sel.value); refreshAll(); };
}

function kpiBadge(val, thresholds){
  if (val === Infinity) return '<span class="badge ok">∞</span>';
  if (val >= thresholds.amber) return '<span class="badge ok">OK</span>';
  if (val >= thresholds.red) return '<span class="badge warn">Basso</span>';
  return '<span class="badge danger">Critico</span>';
}

function renderKPIs(){
  const grid = qs('#kpiGrid');
  const cfg = getConfig();
  const k = computeKPIs();
  grid.innerHTML = `
    <div class="kpi">
      <div class="label">Target</div>
      <div class="value">${formatCurrency(k.target, cfg.currency)}</div>
    </div>
    <div class="kpi">
      <div class="label">Fatto</div>
      <div class="value">${formatCurrency(k.done, cfg.currency)}</div>
      <div class="delta ${k.delta>=0?'ok':'danger'}">${k.delta>=0? 'sopra' : 'sotto'} pace di ${formatCurrency(Math.abs(k.delta), cfg.currency)}</div>
    </div>
    <div class="kpi">
      <div class="label">Gap</div>
      <div class="value">${formatCurrency(Math.max(0,k.target-k.done), cfg.currency)}</div>
    </div>
    <div class="kpi">
      <div class="label">Coverage</div>
      <div class="value">${k.coverage===Infinity ? '∞' : (k.coverage.toFixed(2)+'×')}</div>
      <div>${kpiBadge(k.coverage, cfg.thresholds.coverage)}</div>
    </div>
    <div class="kpi">
      <div class="label">Forecast (ponderato)</div>
      <div class="value">${formatCurrency(k.forecast, cfg.currency)}</div>
    </div>
    <div class="kpi">
      <div class="label">Run-rate richiesto</div>
      <div class="value">${formatCurrency(k.runRate, cfg.currency)}/settimana</div>
    </div>
  `;
}

function renderCharts(){
  const wk = weeklySeries();
  const cumCanvas = qs('#cumulativeChart').getContext('2d');
  renderCumulativeChart(cumCanvas, wk.labels, wk.targetCum, wk.doneCum);

  const f = funnelData();
  const funnelCtx = qs('#funnelChart').getContext('2d');
  renderFunnelChart(funnelCtx, f.labels, f.values);
}

function renderWeeksTable(){
  const t = qs('#weeksTable tbody');
  t.innerHTML = '';
  const k = computeKPIs();
  const wk = weeklySeries();

  let cumDone = 0; let cumPlan = 0;
  for (let i=0;i<wk.labels.length;i++){
    const w = wk.weeks[i];
    const start = fmtDate(w.start);
    const end = fmtDate(w.end);
    cumDone = wk.doneCum[i];
    cumPlan = wk.targetCum[i];
    const delta = cumDone - cumPlan;
    const need = Math.max(0, k.target - cumDone) / Math.max(1, wk.labels.length - i - 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${start}</td>
      <td>${end}</td>
      <td>${formatCurrency(cumDone)}</td>
      <td>${formatCurrency(cumPlan)}</td>
      <td style="color:${delta>=0?'#16a34a':'#ef4444'}">${delta>=0?'+':''}${formatCurrency(delta)}</td>
      <td>${isFinite(need) ? formatCurrency(need)+'/settimana' : '-'}</td>
    `;
    t.appendChild(tr);
  }
}

function renderKanban(){
  const board = qs('#kanbanBoard');
  const state = getState();
  const cur = getCurrentQuarter();
  const deals = getDeals(cur.id);
  const probs = state.config.stageProbabilities;
  const order = Object.keys(probs);

  board.innerHTML = '';
  for (const st of order){
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.stage = st;
    const sum = deals.filter(d=>d.stage===st).reduce((s,d)=>s+ (+d.value||0), 0);
    col.innerHTML = `
      <div class="column-header">
        <span class="title">${st.toUpperCase()}</span>
        <span class="tot">${formatCurrency(sum)}</span>
      </div>
      <div class="column-body" data-drop="${st}"></div>
    `;
    board.appendChild(col);
  }

  for (const d of deals){
    const card = document.createElement('div');
    card.className = 'deal';
    card.draggable = true;
    card.dataset.id = d.id;
    card.innerHTML = `
      <h4>${d.name}</h4>
      <div class="meta">
        <span>${d.client}</span>
        <span>• ${formatCurrency(d.value)}</span>
        <span>• P${d.probability}%</span>
        <span>• ${d.stage}</span>
        <span>• close ${d.expectedCloseDate || '-'}</span>
      </div>
    `;
    card.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', d.id); });
    const body = board.querySelector(\`.column-body[data-drop="\${d.stage}"]\`);
    if (body) body.appendChild(card);
  }

  qsa('.column-body').forEach(zone => {
    zone.addEventListener('dragover', ev => ev.preventDefault());
    zone.addEventListener('drop', ev => {
      ev.preventDefault();
      const id = ev.dataTransfer.getData('text/plain');
      const stage = zone.dataset.drop;
      moveDeal(id, stage);
      refreshAll();
    });
  });
}

function fillSettings(){
  const cfg = getConfig();
  qs('#setTheme').value = cfg.theme;
  qs('#setCurrency').value = cfg.currency;

  const cur = getCurrentQuarter();
  qs('#setYear').value = cur.year;
  qs('#setQuarter').value = String(cur.q);
  qs('#setTarget').value = cur.target;
  qs('#setStartDate').value = cur.startDate;
  qs('#setEndDate').value = cur.endDate;
  qs('#setHolidays').value = (cfg.holidays||[]).join(', ');

  const wrap = qs('#stagesConfig');
  wrap.innerHTML = '';
  const entries = Object.entries(cfg.stageProbabilities);
  for (const [stage, prob] of entries){
    const row = document.createElement('div');
    row.className = 'settings-grid';
    row.innerHTML = `
      <label>Stage
        <input type="text" value="${stage}" data-stage readonly>
      </label>
      <label>Probabilità (%)
        <input type="number" value="${prob}" min="0" max="100" step="5" data-prob>
      </label>`;
    wrap.appendChild(row);
  }
}

function bindEvents(){
  // Navigation
  qsa('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      qsa('.view').forEach(v=>v.classList.remove('active'));
      qs('#view-'+view).classList.add('active');
      if (view === 'dashboard') { renderKPIs(); renderCharts(); renderWeeksTable(); }
      if (view === 'trattative') { renderKanban(); }
      if (view === 'report') { renderReport(); }
      if (view === 'settings') { fillSettings(); }
    });
  });
  qsa('.nav-btn')[0].classList.add('active');

  // New Deal modal
  qs('#newDealBtn').onclick = openDealModal;
  qs('#closeDealModal').onclick = closeDealModal;
  qs('#cancelDealBtn').onclick = closeDealModal;
  qs('#saveDealBtn').onclick = saveDealFromModal;

  // Settings actions
  qs('#saveQuarterBtn').onclick = onSaveQuarter;
  qs('#saveStagesBtn').onclick = onSaveStages;
  qs('#setTheme').onchange = (e)=>{ setConfig({ theme: e.target.value }); setTheme(e.target.value); };
  qs('#setCurrency').onchange = (e)=>{ setConfig({ currency: e.target.value }); refreshAll(); };
  qs('#seedDemoBtn').onclick = ()=>{ reseedDemo(); init(); };
  qs('#resetAllBtn').onclick = ()=>{ if(confirm('Sicuro?')){ deleteAll(); init(); } };

  // Export / Import
  qs('#exportJsonBtn').onclick = ()=>{
    const blob = new Blob([exportJSON()], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quarter-tracker-backup.json';
    a.click();
  };
  qs('#importJsonInput').onchange = async (e)=>{
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try{ importJSON(text); alert('Import OK'); init(); }
    catch(err){ alert('Errore import: '+err.message); }
  };

  // Export PDF
  qs('#exportPdfBtn').onclick = exportReportPDF;
}

function openDealModal(){
  const cfg = getConfig();
  const sel = qs('#dealStage');
  sel.innerHTML = '';
  Object.keys(cfg.stageProbabilities).forEach(st => {
    const op = document.createElement('option');
    op.value = st; op.textContent = st.toUpperCase(); sel.appendChild(op);
  });
  qs('#dealProbability').value = cfg.stageProbabilities[sel.value] ?? 10;
  sel.onchange = ()=>{ qs('#dealProbability').value = cfg.stageProbabilities[sel.value] ?? 10; };

  qs('#dealName').value = '';
  qs('#dealClient').value = '';
  qs('#dealValue').value = '';
  qs('#dealECD').value = '';
  qs('#dealTags').value = '';
  qs('#dealNotes').value = '';

  qs('#dealModal').classList.remove('hidden');
}
function closeDealModal(){ qs('#dealModal').classList.add('hidden'); }

function saveDealFromModal(){
  const cur = getCurrentQuarter();
  const deal = {
    name: qs('#dealName').value.trim(),
    client: qs('#dealClient').value.trim(),
    value: +qs('#dealValue').value || 0,
    currency: getConfig().currency,
    stage: qs('#dealStage').value,
    probability: +qs('#dealProbability').value || 0,
    expectedCloseDate: qs('#dealECD').value || null,
    tags: qs('#dealTags').value.split(',').map(s=>s.trim()).filter(Boolean),
    notes: qs('#dealNotes').value.trim(),
    quarterId: cur.id
  };
  if (!deal.name){ alert('Inserisci un nome deal'); return; }
  addDeal(deal);
  closeDealModal();
  refreshAll();
  // vai alla vista Trattative
  qsa('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-view="trattative"]').classList.add('active');
  qsa('.view').forEach(v=>v.classList.remove('active'));
  qs('#view-trattative').classList.add('active');
  renderKanban();
}

function onSaveQuarter(){
  const y = +qs('#setYear').value;
  const q = +qs('#setQuarter').value;
  const t = +qs('#setTarget').value || 0;
  let s = qs('#setStartDate').value;
  let e = qs('#setEndDate').value;
  if (!s || !e){
    const dates = getQuarterDates(y, q);
    s = dates.start.toISOString().slice(0,10);
    e = dates.end.toISOString().slice(0,10);
  }
  createQuarter(y, q, t, s, e);
  renderQuarterSelector();
  refreshAll();
  alert('Trimestre salvato');
}

function onSaveStages(){
  const wrap = qs('#stagesConfig');
  const rows = wrap.querySelectorAll('.settings-grid');
  const probs = {};
  rows.forEach(r => {
    const st = r.querySelector('[data-stage]').value;
    const p = +r.querySelector('[data-prob]').value || 0;
    probs[st] = p;
  });
  setConfig({ stageProbabilities: probs });
  refreshAll();
  alert('Probabilità aggiornate');
}

function renderReport(){
  const cfg = getConfig();
  const k = computeKPIs();
  qs('#reportKPIs').innerHTML = `
    <div class="kpi"><div class="label">Target</div><div class="value">${formatCurrency(k.target, cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Fatto</div><div class="value">${formatCurrency(k.done, cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Gap</div><div class="value">${formatCurrency(Math.max(0,k.target-k.done), cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Forecast</div><div class="value">${formatCurrency(k.forecast, cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Coverage</div><div class="value">${k.coverage===Infinity?'∞':(k.coverage.toFixed(2)+'×')}</div></div>
    <div class="kpi"><div class="label">Run-rate</div><div class="value">${formatCurrency(k.runRate, cfg.currency)}/settimana</div></div>
  `;

  const wk = weeklySeries();
  const ctx1 = document.getElementById('reportCumulativeChart').getContext('2d');
  renderCumulativeChart(ctx1, wk.labels, wk.targetCum, wk.doneCum);
  const f = funnelData();
  const ctx2 = document.getElementById('reportFunnelChart').getContext('2d');
  renderFunnelChart(ctx2, f.labels, f.values);

  const cur = getCurrentQuarter();
  const deals = getDeals(cur.id);
  const won = deals.filter(d=>d.stage==='vinto').sort((a,b)=>b.value-a.value).slice(0,6);
  const pipe = deals.filter(d=>d.stage!=='vinto' && d.stage!=='perso').sort((a,b)=>b.value-a.value).slice(0,6);

  qs('#topWonList').innerHTML = won.map(d=>`<li>${d.name} — ${d.client} — ${formatCurrency(d.value)}</li>`).join('');
  qs('#topPipelineList').innerHTML = pipe.map(d=>`<li>${d.name} — ${d.client} — ${formatCurrency(d.value)} — ${d.stage}</li>`).join('');
}

async function exportReportPDF(){
  const { jsPDF } = window.jspdf;
  const area = document.getElementById('reportArea');
  const canvas = await html2canvas(area, { scale:2 });
  const img = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ unit:'pt', format:'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const ratio = canvas.height / canvas.width;
  const imgWidth = pageWidth - 40;
  const imgHeight = imgWidth * ratio;
  pdf.addImage(img, 'PNG', 20, 20, imgWidth, imgHeight);
  pdf.save('quarter-report.pdf');
}

function refreshAll(){
  const cfg = getConfig();
  setTheme(cfg.theme);
  renderQuarterSelector();
  renderKPIs();
  renderCharts();
  renderWeeksTable();
  renderKanban();
}

function init(){
  getState(); // load or seed demo
  renderQuarterSelector();
  bindEvents();
  refreshAll();
  fillSettings();
}

init();
