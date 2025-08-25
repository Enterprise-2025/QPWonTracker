let cumulativeChartRef = null;
let funnelChartRef = null;

export function renderCumulativeChart(ctx, labels, target, done){
  if (cumulativeChartRef) { cumulativeChartRef.destroy(); }
  cumulativeChartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Target atteso', data: target, borderWidth:2, tension:.25 },
        { label:'Fatto reale', data: done, borderWidth:2, tension:.25 }
      ]
    },
    options: {
      responsive:true,
      plugins:{ legend:{ display:true } },
      interaction:{ intersect:false, mode:'index' },
      scales:{ y:{ beginAtZero:true } }
    }
  });
}

export function renderFunnelChart(ctx, labels, values){
  if (funnelChartRef) { funnelChartRef.destroy(); }
  funnelChartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label:'Valore', data: values }]
    },
    options: {
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true } }
    }
  });
}
