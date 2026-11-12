'use strict';
let goldCurrency='CNY';
try{if(localStorage.getItem('gold-currency')==='USD')goldCurrency='USD';}catch(_){}
function moneyContext(record,goldAt){
  const fx=record?record.pack.byId.FX:data.fx;
  const at=record?record.pack.generatedAt:Date.now();
  const sourceAt=goldAt||(record?record.pack.byId.GOLD.asOf:data.gold&&data.gold.asOf);
  const rate=GoldMoney.rate(fx,at,sourceAt);
  const unit=goldCurrency==='CNY'?'人民币／克':'美元／金衡盎司';
  return {rate,unit,fx,convert:n=>GoldMoney.convert(n,goldCurrency,rate),format:n=>fmt(GoldMoney.convert(n,goldCurrency,rate)),
    note:goldCurrency==='USD'?'美元原价，未换算':rate?`1 美元 ≈ ${fmt(rate,4)} 元人民币 · 汇率时间 ${time(fx.asOf)} · ${record?'报告汇率快照':'当前可用汇率'}`:'缺少有效汇率，暂不显示人民币价；可切换美元查看原价'};
}
function syncCurrencyControls(){
  for(const button of document.querySelectorAll('[data-gold-currency]')){const active=button.dataset.goldCurrency===goldCurrency;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
}
function moneyNarrative(text,record){
  if(goldCurrency!=='CNY'||!record||!record.pack.byId.GOLD)return text;
  const money=moneyContext(record);if(!money.rate)return text;
  const g=record.pack.byId.GOLD,p=record.report.actionPlan;
  const anchors=[g.price,g.ma20,g.ma60,...g.points.map(v=>v.c)];
  if(p)anchors.push(p.referencePrice,p.stopPrice,...p.buy.flatMap(z=>[z.low,z.high]),...p.sell.flatMap(z=>[z.low,z.high]));
  return String(text).replace(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g,(raw,index,source)=>{
    const n=Number(raw.replace(/,/g,''));
    if(source[index+raw.length]==='%'||source[index+raw.length]==='％'||!anchors.some(a=>Number.isFinite(a)&&Math.abs(n-a)<0.015))return raw;
    return `约${money.format(n)}元/克（原${raw}美元/盎司）`;
  });
}
for(const button of document.querySelectorAll('[data-gold-currency]'))button.addEventListener('click',()=>{
  goldCurrency=button.dataset.goldCurrency;
  try{localStorage.setItem('gold-currency',goldCurrency);}catch(_){}
  render();
});
