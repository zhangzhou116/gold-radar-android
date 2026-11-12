(function(root){
  'use strict';
  function validate(p,pack){
    const gold=pack.byId.GOLD,fail=message=>{throw Error('参考计划：'+message);};
    const text=x=>typeof x==='string'&&x.trim()&&x.length<=3000;
    if(!p||!gold)fail('缺少黄金证据或计划');
    if(!['wait','conditional'].includes(p.status)||!text(p.headline)||!text(p.waitFor)||!text(p.invalidate))fail('缺少行动状态或等待条件');
    if(p.instrument!=='GC=F'||p.unit!=='USD/oz')fail('必须使用黄金连续期货、美元/金衡盎司口径');
    if(!Number.isFinite(p.referencePrice)||Math.abs(p.referencePrice-gold.price)>0.01)fail('参考价必须等于本次GOLD报价');
    if(!Number.isInteger(p.validForHours)||p.validForHours<1||p.validForHours>24)fail('有效期应为1至24小时');
    const refs=ids=>Array.isArray(ids)&&ids.includes('GOLD')&&ids.every(id=>typeof id==='string'&&pack.byId[id]);
    if(!refs(p.evidence))fail('计划需要真实黄金证据引用');
    const validPrice=n=>Number.isFinite(n)&&n>0&&Math.abs(n/gold.price-1)<=0.25;
    const low=Math.min(...gold.points.map(x=>x.c)),high=Math.max(...gold.points.map(x=>x.c));
    for(const side of ['buy','sell']){
      if(!Array.isArray(p[side])||p[side].length>3)fail('每侧最多三档');
      let total=0;
      for(const z of p[side]){
        if(!validPrice(z.low)||!validPrice(z.high)||z.low>z.high)fail('区间价格无效或偏离过大');
        if(!Number.isInteger(z.percent)||z.percent<1||z.percent>100)fail('每档比例应为1至100的整数');
        total+=z.percent;
        if(!text(z.condition)||!text(z.basis)||!refs(z.evidence))fail('每档需要触发条件、依据和证据');
        // Reference levels must remain tied to the supplied daily price history.
        if(z.low<low*0.9||z.high>high*1.1)fail('参考区间缺少历史价格锚点');
      }
      if(total>100)fail('同一侧分批比例合计不能超过100%');
    }
    if(p.status==='conditional'&&!p.buy.length&&!p.sell.length)fail('条件计划缺少参考区间');
    if(p.buy.length&&p.sell.length&&Math.max(...p.buy.map(z=>z.high))>=Math.min(...p.sell.map(z=>z.low)))fail('买入区与减持区不能交叠');
    if(!p.buy.length&&!p.sell.length&&p.stopPrice!==null)fail('无区间时不应伪造失效价');
    if(p.stopPrice!==null&&(!validPrice(p.stopPrice)||(p.buy.length&&p.stopPrice>=Math.min(...p.buy.map(z=>z.low)))))fail('失效价必须低于买入区');
    return p;
  }
  const api={validate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoldPlan=api;
})(typeof window==='undefined'?globalThis:window);
