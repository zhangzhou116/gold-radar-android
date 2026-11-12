(function(root) {
  'use strict';
  const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
  const valid = d => d && !d.error && Array.isArray(d.points) && d.points.length >= 25;
  const closes = d => d.points.map(p=>p.c).filter(x=>Number.isFinite(x)&&x>0);
  function rsi(values,n=14) {
    if(values.length<n+1)return null;
    let gain=0,loss=0;
    for(let i=values.length-n;i<values.length;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
    if(gain===0&&loss===0)return 50;
    return loss===0?100:100-100/(1+gain/loss);
  }
  function stats(data) {
    if(!valid(data))return null;
    const c=closes(data);if(c.length<25)return null;
    const p=c[c.length-1], ma20=mean(c.slice(-20)),ma60=c.length>=60?mean(c.slice(-60)):null;
    const r=c.slice(-21).map((x,i,a)=>i?Math.log(x/a[i-1]):null).slice(1);
    const m=mean(r),vol=Math.sqrt(r.reduce((s,x)=>s+(x-m)**2,0)/(r.length-1));
    return {price:p,ma20,ma60,rsi:rsi(c),vol,change5:(p/c[c.length-6]-1)*100,
      high20:Math.max(...c.slice(-20)),low20:Math.min(...c.slice(-20)),observations:c.length};
  }
  function fresh(d,now=Date.now()) {return !!d&&!d.error&&Number.isFinite(d.asOf)&&d.asOf<=now+3600000&&now-d.asOf<=4*86400000;}
  function analyze(data,now=Date.now()) {
    const g=stats(data.gold),d=stats(data.dollar),y=stats(data.yield);
    const factors=[];
    if(g&&fresh(data.gold,now)){
      const diff=(g.price/g.ma20-1)*100;
      factors.push({name:'黄金趋势',dir:diff>0.5?1:diff< -0.5?-1:0,detail:`价格较 20 日均线 ${diff>=0?'+':''}${diff.toFixed(2)}%；均线反映已有趋势。`});
      if(g.ma60!==null)factors.push({name:'中期结构',dir:g.ma20/g.ma60>1.005?1:g.ma20/g.ma60<0.995?-1:0,detail:`20 日均线 ${g.ma20.toFixed(2)}，60 日均线 ${g.ma60.toFixed(2)}。`});
    }
    if(d&&fresh(data.dollar,now))factors.push({name:'美元环境',dir:d.change5< -0.3?1:d.change5>0.3?-1:0,detail:`美元指数近 5 个交易日 ${d.change5>=0?'+':''}${d.change5.toFixed(2)}%。美元走强通常压制美元计价黄金，但并非固定关系。`});
    if(y&&fresh(data.yield,now)){
      const c=closes(data.yield),bp=(c[c.length-1]-c[c.length-6])*100;
      factors.push({name:'利率环境',dir:bp< -5?1:bp>5?-1:0,detail:`美债 10 年期名义收益率近 5 个交易日 ${bp>=0?'+':''}${bp.toFixed(1)} 基点。名义利率只是代理，不能替代实际利率或降息概率。`});
    }
    const bulls=factors.filter(x=>x.dir>0).length,bears=factors.filter(x=>x.dir<0).length;
    let title='等待足够数据',tone='neutral',summary='需要有效黄金日线，以及美元或利率历史数据。网络失败时不会生成方向判断。';
    const usable=!!g&&fresh(data.gold,now)&&factors.length>=3;
    if(usable){
      if(bulls>=3&&bulls>bears){title='当前因素偏多';tone='up';summary='趋势与跨市场因素较为一致。关注美元反弹、利率上行或价格跌回均线，是否使判断失效。';}
      else if(bears>=3&&bears>bulls){title='当前因素偏空';tone='down';summary='趋势与跨市场因素偏向压力。关注美元走弱、利率回落或价格重新站上均线，是否使判断失效。';}
      else{title='多空因素分歧';summary='当前指标没有形成一致方向。等待趋势、美元和利率之间的分歧收敛。';}
    }
    const flags=[];
    if(g&&g.rsi>=70)flags.push('RSI ≥ 70：近期涨幅集中，追涨时需考虑回撤；超买不等于立即下跌。');
    if(g&&g.rsi<=30)flags.push('RSI ≤ 30：近期跌幅集中，可能反弹；超卖不等于立即上涨。');
    if(g&&g.vol>0.02)flags.push('近 20 日单日波动标准差超过 2%，价格波动较大。');
    if(data.gold&&!fresh(data.gold,now))flags.push('黄金历史数据过旧或时间异常，本次不发布方向判断。');
    if(g&&data.snapshot&&!data.snapshot.error&&fresh(data.snapshot,now)&&Math.abs(data.snapshot.price/g.price-1)>0.03)flags.push('国内报价源与 Yahoo 日线末值差异超过 3%，可能来自时点、合约或报价口径差异，请核对来源。');
    return {g,d,y,factors,bulls,bears,title,tone,summary,usable,flags};
  }
  const api={stats,rsi,fresh,analyze};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoldEngine=api;
})(typeof window==='undefined'?globalThis:window);
