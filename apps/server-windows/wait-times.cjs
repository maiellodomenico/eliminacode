'use strict';
function estimateInterval(times, config = {}) {
  const mode = config.wait_mode || 'auto', fallback = Number(config.manual_minutes || 3);
  if (mode === 'manual') return { minutesPerCustomer: fallback, source: 'manual', samples: 0 };
  const ordered = times.map(x => new Date(x).getTime()).filter(Number.isFinite).sort((a,b)=>b-a);
  const intervals=[];
  for(let i=0;i<ordered.length-1 && intervals.length<Number(config.sample_size || 20);i++) {
    const a=new Date(ordered[i]), b=new Date(ordered[i+1]), delta=(a-b)/60000;
    if(a.toDateString()===b.toDateString() && delta>0 && delta<=Number(config.max_gap_minutes || 30)) intervals.push(delta);
  }
  return { minutesPerCustomer: intervals.length ? intervals.reduce((a,b)=>a+b,0)/intervals.length : fallback, source: intervals.length ? 'auto' : 'fallback', samples: intervals.length };
}
module.exports={estimateInterval};
