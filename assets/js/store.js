// store.js — stato, persistenza (localStorage) e API
import { DEFAULT_CONFIG, uid, getQuarterDates } from './models.js';

const KEY = 'qt.rewrite.store.v1';
let state = null;

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
export function load(){
  const raw = localStorage.getItem(KEY);
  if (!raw){ state = seedDemo(); save(); return state; }
  try { state = JSON.parse(raw); return state; }
  catch(e){ console.error('Parse error; reseed demo', e); state = seedDemo(); save(); return state; }
}
export function getState(){ if(!state) load(); return state; }

export function seedDemo(){
  const year = new Date().getFullYear();
  const q = Math.floor((new Date().getMonth())/3)+1;
  const { start, end } = getQuarterDates(year, q);
  return {
    config: { ...DEFAULT_CONFIG },
    quarters: [{
      id: `q-${year}-${q}`, year, q,
      startDate: start.toISOString().slice(0,10),
      endDate: end.toISOString().slice(0,10),
      target: 48000, notes: ""
    }],
    currentQuarterId: `q-${year}-${q}`,
    deals: [
      { id: uid(), name:"CRM Enterprise", client:"Aemilia Medical", value: 6000, currency:"€", stage:"proposta", probability:50, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["crm"], notes:"", quarterId:`q-${year}-${q}` },
      { id: uid(), name:"GipoNext VIP", client:"ServiLab", value: 9000, currency:"€", stage:"negoziazione", probability:70, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["pms"], notes:"", quarterId:`q-${year}-${q}` },
      { id: uid(), name:"Visibilità Web", client:"Arese Med", value: 3000, currency:"€", stage:"discovery", probability:30, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["seo"], notes:"", quarterId:`q-${year}-${q}` },
      { id: uid(), name:"MD Phone", client:"Evolving", value: 2400, currency:"€", stage:"vinto", probability:100, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["mdphone"], notes:"", quarterId:`q-${year}-${q}`, closedAt: new Date().toISOString().slice(0,10), winNote:"" },
      { id: uid(), name:"CRM + Visibilità", client:"Dr Max", value: 4500, currency:"€", stage:"contatto", probability:20, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["crm","seo"], notes:"", quarterId:`q-${year}-${q}` },
      { id: uid(), name:"Bundle VIP", client:"Aemilia MC", value: 12000, currency:"€", stage:"lead", probability:10, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["bundle"], notes:"", quarterId:`q-${year}-${q}` },
      { id: uid(), name:"CRM", client:"Evolving 2", value: 3600, currency:"€", stage:"vinto", probability:100, expectedCloseDate: new Date().toISOString().slice(0,10), tags:["crm"], notes:"", quarterId:`q-${year}-${q}`, closedAt: new Date().toISOString().slice(0,10), winNote:"" }
    ]
  };
}

// --- config ---
export function getConfig(){ return getState().config; }
export function setConfig(partial){ state.config = { ...state.config, ...partial }; save(); }

// --- quarters ---
export function getQuarters(){ return getState().quarters; }
export function getCurrentQuarter(){ const id = getState().currentQuarterId; return getState().quarters.find(q => q.id === id); }
export function setCurrentQuarter(id){ state.currentQuarterId = id; save(); }
export function createQuarter(year, q, target, startDate, endDate){
  const id = `q-${year}-${q}`;
  const nq = { id, year, q, target, startDate, endDate, notes:"" };
  const idx = state.quarters.findIndex(x => x.id === id);
  if (idx>=0) state.quarters[idx] = nq; else state.quarters.push(nq);
  setCurrentQuarter(id); return nq;
}

// --- deals ---
export function getDeals(quarterId){ return getState().deals.filter(d => d.quarterId === quarterId); }
export function addDeal(deal){
  deal.id = uid();
  deal.createdAt = new Date().toISOString();
  deal.updatedAt = deal.createdAt;
  getState().deals.push(deal); save(); return deal;
}
export function updateDeal(deal){
  const idx = state.deals.findIndex(d => d.id === deal.id);
  if (idx>=0){ deal.updatedAt = new Date().toISOString(); state.deals[idx] = deal; save(); return deal; }
  return null;
}
export function deleteDeal(id){
  const idx = state.deals.findIndex(d => d.id === id);
  if (idx>=0){ state.deals.splice(idx,1); save(); return true; }
  return false;
}
export function moveDeal(id, toStage){
  const d = state.deals.find(x => x.id === id);
  if (!d) return;
  d.stage = toStage;
  const prob = state.config.stageProbabilities[toStage];
  if (typeof prob === 'number') d.probability = prob;
  d.updatedAt = new Date().toISOString();
  save();
}
export function remapStage(oldName, newName){ state.deals.forEach(d => { if (d.stage === oldName) d.stage = newName; }); save(); }
export function reassignStageTo(oldName, fallback='lead'){ state.deals.forEach(d => { if (d.stage === oldName) d.stage = fallback; }); save(); }

// --- backup ---
export function exportJSON(){ return JSON.stringify(getState(), null, 2); }
export function importJSON(jsonText){
  const data = JSON.parse(jsonText);
  if (!data || !data.quarters || !data.deals) throw new Error("JSON non valido");
  state = data; save();
}

// --- reset ---
export function deleteAll(){ state = seedDemo(); save(); }
export function reseedDemo(){ state = seedDemo(); save(); }

