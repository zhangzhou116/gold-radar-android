'use strict';
function renderPlanSummary(record){
  const p=record.report.actionPlan;
  if(!p)return '';
  try{GoldPlan.validate(p,record.pack);}catch(_){return '';}
  const money=moneyContext(record);
  const expired=Date.now()>Math.min(record.generatedAt,record.pack.generatedAt)+p.validForHours*3600000;
  return `<div class="home-plan"><b>${expired?'计划已过期，请重新研判':p.status==='wait'?'现在先等一等':'等待触发，再分批'}</b><p>${esc(moneyNarrative(p.waitFor,record))}</p>${['buy','sell'].map(side=>{const z=p[side][0];return `<p>${side==='buy'?'首档买入':'首档减持'}：${z?`${money.format(z.low)}–${money.format(z.high)} · ${z.percent}%${side==='buy'?'计划资金':'原有持仓'}`:'暂无可靠区间'}</p>`;}).join('')}<small>${money.unit} · 国际期货参考 · 非国内零售价 · 先看触发条件</small></div>`;
}
function renderDashboard(record){
  const r=record.report,p=r.actionPlan,g=record.pack.byId.GOLD;
  if(!p)return '<article class="plan-empty">这份旧报告没有价格与仓位计划。重新研判后显示参考看板。</article>';
  try{GoldPlan.validate(p,record.pack);}catch(_){return '<article class="plan-empty">参考计划校验未通过，不显示价格建议。</article>';}
  const money=moneyContext(record);
  const expired=Date.now()>Math.min(record.generatedAt,record.pack.generatedAt)+p.validForHours*3600000;
  const latest=data.gold,latestFresh=latest&&Number.isFinite(latest.price)&&Date.now()-latest.fetchedAt<3600000&&Date.now()-latest.asOf<3600000;
  const liveMoney=moneyContext(null,latest&&latest.asOf);
  const latestComparable=latestFresh&&Number.isFinite(money.convert(p.referencePrice))&&Number.isFinite(liveMoney.convert(latest.price));
  const deltaLatest=n=>signed((money.convert(n)/liveMoney.convert(latest.price)-1)*100)+'%';
  const delta=n=>signed((n/p.referencePrice-1)*100)+'%';
  const range=z=>money.format(z.low)+'–'+money.format(z.high);
  const refs=ids=>ids.map(id=>`<button class="ref-button" data-report-ref="${esc(id)}">${esc(id)}</button>`).join('');
  let html=`<section class="decision-board"><div class="board-kicker">操作参考看板 · 未来 1–5 交易日</div><h2>${expired?'已过期 · 请重新研判':p.status==='wait'?'现在先等一等':'等条件满足，再分批'}</h2><p>${esc(moneyNarrative(p.headline,record))}</p><div class="board-prices"><div><small>报告参考报价</small><strong>${money.format(p.referencePrice)}</strong><small>${esc(time(g.asOf))}</small></div><div><small>最新期货参考报价</small><strong>${latestFresh?liveMoney.format(latest.price):'待刷新'}</strong><small>${latestFresh?(goldCurrency==='CNY'&&!liveMoney.rate?'最新汇率不可用':esc(time(latest.asOf))):'不使用过旧报价'}</small></div></div><p class="board-unit">${money.unit} · 国际黄金期货换算参考，非国内零售价</p><p class="board-unit">${esc(money.note)}</p>${goldCurrency==='CNY'?`<p class="board-unit">最新价使用最新可用汇率；报告区间按报告汇率折算，不随汇率改写。${esc(liveMoney.note)}</p>`:''}<div class="decision-strip">${r.horizons.map(h=>`<div><small>${h.days} 个交易日</small><b>${labelDirection(h.direction)}</b></div>`).join('')}</div><div class="wait-callout"><b>现在等什么</b><p>${esc(moneyNarrative(p.waitFor,record))}</p></div><p class="note">比例是假设的无杠杆分批示例：买入按计划投入黄金的资金，减持按本次研判时已有黄金持仓；各档均按同一初始基数。不是总资产比例，也不适用于期货保证金。到价仍须满足文字条件。</p>`;
  html+=`<div class="plan-grid">`;
  for(const [side,title,verb,base] of [['buy','分批买入参考','投入','计划资金'],['sell','分批减持参考','减持','原有持仓']]){
    html+=`<article class="plan-side ${side}"><h3>${title}</h3>`;
    if(!p[side].length)html+='<p>依据不足，暂无可靠参考区间。当前不设置这一侧操作。</p>';
    p[side].forEach((z,i)=>{html+=`<div class="price-step"><span class="step-no">${i+1}</span><div><strong>${range(z)}</strong><small>${money.unit}</small><small>距报告价 ${delta(z.low)} 至 ${delta(z.high)}</small>${latestComparable?`<small>距最新价 ${deltaLatest(z.low)} 至 ${deltaLatest(z.high)}</small>`:''}<b>${verb}${base}的 ${z.percent}%${expired?' · 已过期':''}</b><svg class="allocation-track" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label="本档比例 ${z.percent}%"><rect width="100" height="4" fill="#e9e5da"/><rect width="${z.percent}" height="4" fill="${side==='buy'?'#21766a':'#a75f36'}"/></svg><details class="plan-details"><summary>查看触发条件、依据与反证</summary><p><b>触发：</b>${esc(moneyNarrative(z.condition,record))}</p><p><b>依据：</b>${esc(moneyNarrative(z.basis,record))}</p>${refs(z.evidence)}</details></div></div>`;});
    const sum=p[side].reduce((a,z)=>a+z.percent,0);
    html+=`<p class="note">${side==='buy'?'计划投入':'计划减持'}合计 ${sum}% · ${side==='buy'?'预留资金':'剩余原持仓'} ${100-sum}%</p></article>`;
  }
  html+='</div>';
  const values=[p.referencePrice,...g.points.map(x=>x.c),...p.buy.flatMap(z=>[z.low,z.high]),...p.sell.flatMap(z=>[z.low,z.high]),...(p.stopPrice===null?[]:[p.stopPrice])];
  const lo=Math.min(...values)*0.995,hi=Math.max(...values)*1.005;
  const y=n=>24+(hi-n)/(hi-lo)*170;
  const points=g.points.map((v,i)=>`${12+i/Math.max(1,g.points.length-1)*290},${y(v.c)}`).join(' ');
  html+='<article class="price-chart"><h3>价格地图</h3><div class="chart-legend"><span>金色：历史日线</span><span>绿：买入区</span><span>棕：减持区</span><span>红虚线：失效价</span></div><svg viewBox="0 0 400 240" role="img" aria-label="黄金历史日线及模型参考区间，不是未来预测曲线">';
  for(const side of ['buy','sell'])for(const z of p[side])html+=`<rect x="12" y="${y(z.high)}" width="290" height="${Math.max(2,y(z.low)-y(z.high))}" fill="${side==='buy'?'#21766a':'#a75f36'}" opacity=".16"/>`;
  for(const n of [lo,(lo+hi)/2,hi])html+=`<line x1="12" x2="302" y1="${y(n)}" y2="${y(n)}" stroke="#dedbd1"/><text x="311" y="${y(n)+4}" font-size="10" fill="#68736b">${money.format(n)}</text>`;
  if(p.stopPrice!==null)html+=`<line x1="12" x2="302" y1="${y(p.stopPrice)}" y2="${y(p.stopPrice)}" stroke="#b04b40" stroke-dasharray="2 3"/>`;
  html+=`<polyline points="${points}" fill="none" stroke="#ab843b" stroke-width="2.5"/><line x1="12" x2="302" y1="${y(p.referencePrice)}" y2="${y(p.referencePrice)}" stroke="#193b35" stroke-dasharray="4 3"/><text x="14" y="218" font-size="10" fill="#68736b">历史走势 → 报告时点</text></svg><p class="note">${esc(g.source)} · ${money.unit}${goldCurrency==='CNY'?'（整条曲线按报告汇率换算，非人民币历史报价）':''} · 区间由模型基于证据提出，非保证成交价或收益目标。虚线为报告报价，非未来走势。</p></article>`;
  html+=`<div class="wait-callout"><b>何时停止使用此计划</b><p>${p.stopPrice===null?'未设单一失效价':`失效参考价 ${money.format(p.stopPrice)} ${money.unit}（距报告价 ${delta(p.stopPrice)}）`}</p><p>${esc(moneyNarrative(p.invalidate,record))}</p><p>最迟 ${esc(time(Math.min(record.generatedAt,record.pack.generatedAt)+p.validForHours*3600000))} 重新研判；重大消息出现时提前作废。价格跌破失效位不保证能按该价退出。</p></div>${refs(p.evidence)}</section>`;
  return html;
}
