// app.js — orchestrazione UI (QPQ)
import { formatCurrency, fmtDate, getQuarterDates } from './models.js';
import {
  getState, getConfig, setConfig,
  getQuarters, getCurrentQuarter, setCurrentQuarter, createQuarter,
  getDeals, addDeal, updateDeal, moveDeal, exportJSON, importJSON,
  reseedDemo, deleteAll, deleteDeal, remapStage, reassignStageTo
} from './store.js';
import { computeKPIs, weeklySeries, funnelData } from './kpi.js';
import { renderCumulativeChart, renderFunnelChart } from './charts.js';

// PWA
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
}

const qs  = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
let editingDealId = null;

function setTheme(theme){ if (theme === 'light') document.documentElement.classList.add('light'); else document.documentElement.classList.remove('light'); }
function go(view){
  qsa('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view === view));
  qsa('.view').forEach(v=>v.classList.toggle('active', v.id === 'view-'+view));
  if (view === 'dashboard') { renderKPIs(); renderCharts(); renderWeeksTable(); }
  if (view === 'trattative') { renderKanban(); }
  if (view === 'report') { renderReport(); }
  if (view === 'settings') { fillSettings(); }
}

// ===== HEADER =====
function renderQuarterSelector(){
  const sel = qs('#quarterSelector'); sel.innerHTML = '';
  const quarters = getQuarters().slice().sort((a,b)=> (a.year - b.year) || (a.q - b.q));
  const cur = getCurrentQuarter();

  if (!quarters.length){
    const opt = document.createElement('option');
    opt.textContent = '— Nessun trimestre —';
    opt.disabled = true; opt.selected = true;
    sel.appendChild(opt);
  } else {
    for (const q of quarters){
      const opt = document.createElement('option');
      opt.value = q.id; opt.textContent = `${q.year} • Q${q.q}`;
      if (cur && q.id === cur.id) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  sel.onchange = ()=>{ setCurrentQuarter(sel.value); refreshAll(); };
}

// ===== KPI =====
function kpiBadge(val, thresholds){
  if (val === Infinity) return '<span class="badge ok">∞</span>';
  if (val >= thresholds.amber) return '<span class="badge ok">OK</span>';
  if (val >= thresholds.red) return '<span class="badge warn">Basso</span>';
  return '<span class="badge danger">Critico</span>';
}
function renderKPIs(){
  const grid = qs('#kpiGrid');
  const cfg = getConfig();
  const cur = getCurrentQuarter();
  if (!cur){
    grid.innerHTML = `
      <div class="kpi"><div class="label">Stato</div><div class="value">Nessun trimestre attivo</div></div>
      <div class="kpi"><div class="label">Azione</div><div class="value"><button class="primary" id="createFirstQuarterBtn">Crea trimestre</button></div></div>
    `;
    const btn = qs('#createFirstQuarterBtn'); if (btn) btn.onclick = ()=> go('settings');
    return;
  }
  const k = computeKPIs();
  grid.innerHTML = `
    <div class="kpi"><div class="label">Target</div><div class="value">${formatCurrency(k.target, cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Fatto</div><div class="value">${formatCurrency(k.done, cfg.currency)}</div><div class="delta ${k.delta>=0?'ok':'danger'}">${k.delta>=0? 'sopra' : 'sotto'} pace di ${formatCurrency(Math.abs(k.delta), cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Gap</div><div class="value">${formatCurrency(Math.max(0,k.target-k.done), cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Coverage</div><div class="value">${k.coverage===Infinity ? '∞' : (k.coverage.toFixed(2)+'×')}</div><div>${kpiBadge(k.coverage, cfg.thresholds.coverage)}</div></div>
    <div class="kpi"><div class="label">Forecast (ponderato)</div><div class="value">${formatCurrency(k.forecast, cfg.currency)}</div></div>
    <div class="kpi"><div class="label">Run-rate richiesto</div><div class="value">${formatCurrency(k.runRate, cfg.currency)}/settimana</div></div>
  `;
}

// ===== CHARTS =====
function renderCharts(){
  const wk = weeklySeries();
  renderCumulativeChart(qs('#cumulativeChart')?.getContext('2d'), wk.labels, wk.targetCum, wk.doneCum);
  const f = funnelData();
  renderFunnelChart(qs('#funnelChart')?.getContext('2d'), f.labels, f.values);
}

// ===== WEEKS TABLE =====
function renderWeeksTable(){
  const t = qs('#weeksTable tbody'); if (!t) return; t.innerHTML = '';
  const cur = getCurrentQuarter();
  if (!cur) return;
  const k = computeKPIs();
  const wk = weeklySeries();
  for (let i=0;i<wk.labels.length;i++){
    const w = wk.weeks[i];
    const start = fmtDate(w.start);
    const end = fmtDate(w.end);
    const cumDone = wk.doneCum[i];
    const cumPlan = wk.targetCum[i];
    const delta = cumDone - cumPlan;
    const need = Math.max(0, k.target - cumDone) / Math.max(1, wk.labels.length - i);
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

// ===== KANBAN =====
function renderKanban(){
  const board = qs('#kanbanBoard'); if (!board) return;
  const state = getState();
  const cur = getCurrentQuarter();
  const deals = cur ? getDeals(cur.id) : [];
  const probs = state.config.stageProbabilities;
  const order = Array.isArray(state.config.stageOrder) ? state.config.stageOrder : Object.keys(probs);

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
      <div class="deal-actions">
        <button class="mini-btn" data-act="edit">✎ Modifica</button>
        <button class="mini-btn" data-act="del">🗑 Elimina</button>
      </div>
    `;
    card.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', d.id));
    const body = board.querySelector(`.column-body[data-drop="${d.stage}"]`);
    if (body) body.appendChild(card);

    // actions
    card.querySelector('[data-act="edit"]').onclick = ()=> openEditDealModal(d);
    card.querySelector('[data-act="del"]').onclick = ()=> { if (confirm('Eliminare questo deal?')){ deleteDeal(d.id); refreshAll(); } };
  }

  // Drag & Drop
  qsa('.column-body').forEach(zone => {
    zone.addEventListener('dragover', ev => ev.preventDefault());
    zone.addEventListener('drop', ev => {
      ev.preventDefault();
      const id = ev.dataTransfer.getData('text/plain');
      const stage = zone.dataset.drop;
      if (!cur) return;
      const deal = deals.find(x=>x.id===id);
      if (deal){
        if (stage==='perso'){
          const reason = prompt('Motivo della perdita?', deal.lossReason || '');
          if (reason!=null) deal.lossReason = reason.trim();
          deal.closedAt = new Date().toISOString().slice(0,10);
          updateDeal(deal);
        } else if (stage==='vinto'){
          const note = prompt('Note di vittoria (opzionale):', deal.winNote || '');
          if (note!=null) deal.winNote = note.trim();
          deal.closedAt = new Date().toISOString().slice(0,10);
          updateDeal(deal);
        }
      }
      moveDeal(id, stage);
      refreshAll();
    });
  });
}

// ===== DEAL MODAL =====
function openDealModal(){
  editingDealId = null;
  const cfg = getConfig();
  const sel = qs('#dealStage'); sel.innerHTML = '';
  Object.keys(cfg.stageProbabilities).forEach(st => { const op = document.createElement('option'); op.value = st; op.textContent = st.toUpperCase(); sel.appendChild(op); });
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
function openEditDealModal(deal){
  editingDealId = deal.id;
  const cfg = getConfig();
  const sel = qs('#dealStage'); sel.innerHTML = '';
  Object.keys(cfg.stageProbabilities).forEach(st => { const op = document.createElement('option'); op.value = st; op.textContent = st.toUpperCase(); sel.appendChild(op); });
  qs('#dealName').value = deal.name || '';
  qs('#dealClient').value = deal.client || '';
  qs('#dealValue').value = deal.value || 0;
  qs('#dealStage').value = deal.stage || Object.keys(cfg.stageProbabilities)[0];
  qs('#dealProbability').value = deal.probability ?? (cfg.stageProbabilities[qs('#dealStage').value] ?? 10);
  qs('#dealECD').value = deal.expectedCloseDate || '';
  qs('#dealTags').value = (deal.tags||[]).join(', ');
  qs('#dealNotes').value = deal.notes || '';
  qs('#dealModal').classList.remove('hidden');
}
function closeDealModal(){ qs('#dealModal').classList.add('hidden'); }
function saveDealFromModal(){
  const cur = getCurrentQuarter();
  if (!cur){ alert('Crea prima un trimestre in Impostazioni.'); return; }
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
  if (editingDealId){ deal.id = editingDealId; updateDeal(deal); } else { addDeal(deal); }
  closeDealModal();
  refreshAll();
  go('trattative');
}

// ===== REPORT =====
function renderReport(){
  const cfg = getConfig();
  const cur = getCurrentQuarter();
  if (!cur){
    qs('#reportKPIs').innerHTML = `<div class="kpi"><div class="label">Stato</div><div class="value">Nessun trimestre</div></div>`;
    renderCumulativeChart(qs('#reportCumulativeChart')?.getContext('2d'), [], [], []);
    renderFunnelChart(qs('#reportFunnelChart')?.getContext('2d'), [], []);
    qs('#topWonList').innerHTML = ''; qs('#topPipelineList').innerHTML = '';
    return;
  }

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
  renderCumulativeChart(qs('#reportCumulativeChart')?.getContext('2d'), wk.labels, wk.targetCum, wk.doneCum);
  const f = funnelData();
  renderFunnelChart(qs('#reportFunnelChart')?.getContext('2d'), f.labels, f.values);

  const deals = getDeals(cur.id);
  const won  = deals.filter(d=>d.stage==='vinto').sort((a,b)=>b.value-a.value).slice(0,6);
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
  pdf.save('qpq-quarter-report.pdf');
}

// ===== SETTINGS =====
function fillSettings(){
  const cfg = getConfig();
  const cur = getCurrentQuarter();
  qs('#setTheme').value = cfg.theme;
  qs('#setCurrency').value = cfg.currency;
  qs('#setYear').value = cur?.year ?? new Date().getFullYear();
  qs('#setQuarter').value = String(cur?.q ?? Math.floor(new Date().getMonth()/3)+1);
  qs('#setTarget').value = cur?.target ?? 0;
  qs('#setStartDate').value = cur?.startDate ?? '';
  qs('#setEndDate').value = cur?.endDate ?? '';
  qs('#setHolidays').value = (cfg.holidays||[]).join(', ');
  qs('#setPaceCurve').value = cfg.paceCurve || 'linear';

  renderStagesConfig();
}

function renderStagesConfig(){
  const wrap = qs('#stagesConfig'); wrap.innerHTML = '';
  const cfg = getConfig();
  const order = Array.isArray(cfg.stageOrder) ? cfg.stageOrder : Object.keys(cfg.stageProbabilities);
  for (const stage of order){
    const prob = cfg.stageProbabilities[stage] ?? 0;
    const locked = (stage==='vinto' || stage==='perso');
    const row = document.createElement('div');
    row.className = 'settings-grid';
    row.innerHTML = `
      <label>Stage
        <input type="text" value="${stage}" data-stage ${locked?'readonly':''} data-original="${stage}">
      </label>
      <label>Probabilità (%)
        <input type="number" value="${prob}" min="0" max="100" step="5" data-prob ${stage==='vinto'?'value=100 readonly':''} ${stage==='perso'?'value=0 readonly':''}>
      </label>
      <div class="row-actions">
        <button class="mini-btn" data-move="up"${locked?' disabled':''}>&uarr;</button>
        <button class="mini-btn" data-move="down"${locked?' disabled':''}>&darr;</button>
        <button class="mini-btn" data-del${locked?' disabled':''}>Elimina</button>
      </div>`;
    wrap.appendChild(row);

    const up = row.querySelector('[data-move="up"]');
    const down = row.querySelector('[data-move="down"]');
    const del = row.querySelector('[data-del]');
    if (up) up.onclick = ()=> reorderStage(stage, -1);
    if (down) down.onclick = ()=> reorderStage(stage, +1);
    if (del) del.onclick = ()=>{
      if (locked){ alert('Stage non eliminabile'); return; }
      if (!confirm('Eliminare stage '+stage+'? I deal verranno riassegnati a "lead".')) return;
      const cfg2 = getConfig();
      const probs = { ...cfg2.stageProbabilities }; delete probs[stage];
      const order2 = (cfg2.stageOrder||Object.keys(cfg2.stageProbabilities)).filter(s=>s!==stage);
      setConfig({ stageProbabilities: probs, stageOrder: order2 });
      reassignStageTo(stage, 'lead');
      renderStagesConfig(); refreshAll();
    };
  }
}

function reorderStage(stage, delta){
  const cfg = getConfig();
  const order = Array.isArray(cfg.stageOrder) ? [...cfg.stageOrder] : Object.keys(cfg.stageProbabilities);
  const idx = order.indexOf(stage);
  if (idx<0) return;
  const locked = ['vinto','perso'];
  if (locked.includes(stage)) return;
  const lastMovable = order.length - locked.filter(s=>order.includes(s)).length - 1;
  let target = Math.max(0, Math.min(lastMovable, idx + delta));
  if (target === idx) return;
  order.splice(idx,1); order.splice(target,0,stage);
  setConfig({ stageOrder: order });
  renderStagesConfig(); refreshAll();
}

function onSaveStages(){
  const wrap = qs('#stagesConfig');
  const rows = wrap.querySelectorAll('.settings-grid');
  const newProbs = {}; const newOrder = []; const renames = {};
  rows.forEach(r => {
    const orig = r.querySelector('[data-original]')?.getAttribute('data-original') || r.querySelector('[data-stage]').value;
    const st = r.querySelector('[data-stage]').value.trim().toLowerCase();
    const p = +r.querySelector('[data-prob]').value || 0;
    if (!st) return;
    newProbs[st] = (st==='vinto'?100: (st==='perso'?0: p));
    newOrder.push(st);
    if (orig && orig !== st){ renames[orig] = st; }
  });
  if (!newProbs['vinto'] || !newProbs['perso']){ alert('Gli stage vinto/perso sono obbligatori'); return; }
  setConfig({ stageProbabilities: newProbs, stageOrder: newOrder });
  Object.entries(renames).forEach(([oldName,newName])=> remapStage(oldName,newName));
  refreshAll();
  alert('Stage aggiornati');
}

function onAddStage(){
  const name = (qs('#addStageName').value || '').trim().toLowerCase();
  const prob = +qs('#addStageProb').value || 0;
  if (!name){ alert('Inserisci un nome stage'); return; }
  if (['vinto','perso'].includes(name)){ alert('Nome non valido'); return; }
  const cfg = getConfig();
  const probs = { ...cfg.stageProbabilities };
  if (probs[name] != null){ alert('Stage già esistente'); return; }
  probs[name] = prob;
  const order = Array.isArray(cfg.stageOrder) ? [...cfg.stageOrder] : Object.keys(probs);
  const endLocked = order.filter(s=> s==='vinto' || s==='perso');
  const movable   = order.filter(s=> s!=='vinto' && s!=='perso');
  movable.push(name);
  const newOrder = [...movable, ...endLocked];
  setConfig({ stageProbabilities: probs, stageOrder: newOrder });
  qs('#addStageName').value=''; qs('#addStageProb').value='';
  renderStagesConfig(); refreshAll();
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

// ===== NAV & BINDINGS =====
function bindEvents(){
  qsa('.nav-btn').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.view)));
  qsa('.nav-btn')[0]?.classList.add('active');

  // Deal modal
  qs('#newDealBtn').onclick = openDealModal;
  qs('#closeDealModal').onclick = ()=> qs('#dealModal').classList.add('hidden');
  qs('#cancelDealBtn').onclick = ()=> qs('#dealModal').classList.add('hidden');
  qs('#saveDealBtn').onclick = saveDealFromModal;

  // Settings
  qs('#saveQuarterBtn').onclick = onSaveQuarter;
  qs('#saveStagesBtn').onclick  = onSaveStages;
  qs('#addStageBtn').onclick    = onAddStage;
  qs('#setTheme').onchange      = (e)=>{ setConfig({ theme: e.target.value }); setTheme(e.target.value); };
  qs('#setCurrency').onchange   = (e)=>{ setConfig({ currency: e.target.value }); refreshAll(); };
  qs('#seedDemoBtn').onclick    = ()=>{ reseedDemo(); init(); };
  qs('#resetAllBtn').onclick    = ()=>{ 
    if(confirm('Sicuro di azzerare TUTTO?')){ 
      deleteAll(); 
      alert('Dati azzerati. Crea ora il tuo primo trimestre.');
      init(); 
      go('settings');
    } 
  };
  qs('#saveHolidaysBtn').onclick= ()=>{
    const raw = qs('#setHolidays').value.trim();
    const arr = raw ? raw.split(',').map(s=>s.trim()).filter(Boolean) : [];
    setConfig({ holidays: arr }); refreshAll(); alert('Ferie salvate');
  };
  qs('#setPaceCurve').onchange  = (e)=>{ setConfig({ paceCurve: e.target.value }); refreshAll(); };

  // Export / Import / PDF
  qs('#exportJsonBtn').onclick = ()=>{
    const blob = new Blob([exportJSON()], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'qpq-backup.json'; a.click();
  };
  qs('#importJsonInput').onchange = async (e)=>{
    const file = e.target.files[0]; if (!file) return;
    try{ importJSON(await file.text()); alert('Import OK'); init(); } catch(err){ alert('Errore import: '+err.message); }
  };
  qs('#exportPdfBtn').onclick = exportReportPDF;
}

// ===== INIT =====
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
  getState();      // load or create empty
  renderQuarterSelector();
  bindEvents();
  refreshAll();
  fillSettings();
}
init();
