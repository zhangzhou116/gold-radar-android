(function(root){
  'use strict';
  const Engine=typeof module!=='undefined'&&module.exports?require('./engine.js'):root.GoldEngine;
  const SYMBOLS={gold:'GC=F 黄金连续期货（非现货）',dollar:'美元指数',yield:'美债10年名义收益率（非实际利率）',oil:'WTI原油连续期货',silver:'白银连续期货',copper:'铜连续期货',stocks:'标普500（风险资产代理）',vix:'VIX（美股隐含波动率，非黄金恐慌指数）',fx:'USD/CNY'};
  const IDS={gold:'GOLD',dollar:'USD',yield:'RATE',oil:'OIL',silver:'SILVER',copper:'COPPER',stocks:'STOCKS',vix:'VIX',fx:'FX'};
  function prepare(data,now=Date.now()){
    const evidence=[],missing=[],byId={};
    for(const key of Object.keys(SYMBOLS)){
      const d=data[key],s=Engine.stats(d);
      if(!s||!Engine.fresh(d,now)||now-d.fetchedAt>86400000){missing.push(SYMBOLS[key]+'：缺失或非最近24小时获取');continue;}
      const row={id:IDS[key],kind:'market',name:SYMBOLS[key],source:d.source,symbol:d.symbol,asOf:d.asOf,fetchedAt:d.fetchedAt,price:d.price,
        dailyLast:s.price,change5:s.change5,ma20:s.ma20,ma60:s.ma60,rsi14:s.rsi,volatility20:s.vol,points:d.points.slice(-30)};
      evidence.push(row);byId[row.id]=row;
    }
    const seen=new Set();let newsCount=0;
    for(const key of ['news','geo','industry','fed']){
      const feed=data[key];let added=0;
      if(feed&&Array.isArray(feed.items)&&now-feed.fetchedAt<=86400000){
        const sorted=feed.items.slice().sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
        for(const item of sorted){
          const published=Date.parse(item.date);
          if(!Number.isFinite(published)||published>now+3600000||now-published>7*86400000)continue;
          const normalized=String(item.title).replace(/\s+/g,'').toLowerCase();if(seen.has(normalized))continue;seen.add(normalized);
          if(added>=8)break;
          const row={id:'N'+(++newsCount),kind:'news',category:key,title:String(item.title).slice(0,400),summary:String(item.summary||'来源未提供正文摘要；仅有标题，不应推断正文').slice(0,700),source:item.source,url:item.url,publishedAt:published,fetchedAt:feed.fetchedAt,official:key==='fed'};
          evidence.push(row);byId[row.id]=row;added++;
        }
      }
      if(!added)missing.push(({news:'黄金新闻',geo:'地缘局势',industry:'跨行业消息',fed:'美联储公告'})[key]+'：最近7天没有有效证据');
    }
    missing.push('实际利率、ETF申赎资金流、全球央行购金、CFTC持仓及可靠宏观事件日历未接入；不得假定这些数据已知。');
    const cross=evidence.filter(x=>x.kind==='market'&&!['GOLD','FX'].includes(x.id)).length;
    const ready=!!byId.GOLD&&cross>=3&&newsCount>=3;
    return {ready,reason:ready?'':'需要24小时内获取的有效黄金日线、至少3类跨市场日线，以及最近7天至少3条新闻。请先刷新并检查来源。',
      evidence,missing,byId,generatedAt:now,task:'分析国际黄金/黄金期货未来1、3、5个交易日；同源新闻转载不能视作独立佐证。资料限公开RSS标题摘要与日线，不具备全文检索或分钟行情。'};
  }
  function validate(report,pack,requirePlan=false){
    const textFields=['summary','regime','newsImpact','crossMarket','bullCase','bearCase','reviewNotes'];
    for(const key of textFields)if(typeof report[key]!=='string'||!report[key].trim()||report[key].length>8000)throw Error('研判缺少有效字段：'+key);
    for(const key of ['risks','watch'])if(!Array.isArray(report[key])||!report[key].length||report[key].some(x=>typeof x!=='string'||!x.trim()||x.length>3000))throw Error('研判缺少风险或后续观察');
    if(!Array.isArray(report.horizons)||report.horizons.length!==3)throw Error('研判必须包含1、3、5日三个周期');
    const found=new Set();
    for(const h of report.horizons){
      if(![1,3,5].includes(h.days)||found.has(h.days))throw Error('研判周期不正确');found.add(h.days);
      if(!['bullish','bearish','wait'].includes(h.direction)||typeof h.reason!=='string'||!h.reason.trim()||typeof h.invalidate!=='string'||!h.invalidate.trim())throw Error('方向或失效条件不完整');
      if(!Array.isArray(h.evidence)||!h.evidence.length||h.evidence.some(id=>typeof id!=='string'||!pack.byId[id]))throw Error('研判引用了不存在的证据');
      const refs=h.evidence.map(id=>pack.byId[id]);
      if(h.direction!=='wait'&&(!refs.some(x=>x.kind==='market')||!refs.some(x=>x.kind==='news')))throw Error('有方向判断必须同时引用行情和新闻');
    }
    // Do not allow an uncalibrated numeric probability/accuracy to appear as a result.
    const text=JSON.stringify(report);
    if(/\d+(?:\.\d+)?\s*[%％]\s*(?:概率|胜率|准确率|把握)|(?:概率|胜率|准确率|把握|置信度)\s*(?:为|是|达到|[:：])?\s*\d+(?:\.\d+)?\s*[%％]/.test(text))throw Error('模型输出未经校准的概率或准确率，已拒绝发布');
    if(requirePlan||report.actionPlan){
      const Plan=typeof module!=='undefined'&&module.exports?require('./action-plan.js'):root.GoldPlan;
      Plan.validate(report.actionPlan,pack);
      if(report.horizons.every(h=>h.direction==='wait')&&report.actionPlan.status!=='wait')throw Error('观望判断不能呈现当前操作计划');
    }
    return report;
  }
  function nyDate(t){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));
    const get=k=>parts.find(x=>x.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');
  }
  function settle(receipt,gold,now=Date.now()){
    if(!gold||!Array.isArray(gold.points))return receipt;
    const today=nyDate(now),decision=nyDate(receipt.generatedAt);
    // Only observations on later NY calendar dates can be an entry; current day's
    // incomplete bar is excluded. This intentionally delays entry and evaluation.
    const points=gold.points.filter(p=>nyDate(p.t)>decision&&nyDate(p.t)<today).sort((a,b)=>a.t-b.t);
    if(!points.length)return receipt;
    const results=Object.assign({},receipt.results||{});
    for(const h of receipt.report.horizons){
      if(results[h.days]||points.length<=h.days)continue;
      const entry=points[0],exit=points[h.days],ret=exit.c/entry.c-1;
      results[h.days]={entryAt:entry.t,exitAt:exit.t,entry:entry.c,exit:exit.c,return:ret,
        outcome:h.direction==='wait'?'abstained':h.direction==='bullish'?(ret>0.003?'correct':'wrong'):(ret< -0.003?'correct':'wrong'),settledAt:now};
    }
    return Object.assign({},receipt,{results});
  }
  const api={prepare,validate,settle,nyDate,SYMBOLS,IDS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoldResearch=api;
})(typeof window==='undefined'?globalThis:window);
