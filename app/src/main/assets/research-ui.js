'use strict';
let displayedReport=null;
let aiBusy=false,aiConfigured=false,aiLiveSearch=false,pendingPack=null,receipts=[],lastResearchError='';
try{const saved=JSON.parse(localStorage.getItem('gold-research-v1')||'[]');if(Array.isArray(saved))receipts=saved;}catch(_){lastResearchError='研判记录损坏，未覆盖原始存储。';}
function saveReceipts(next){try{localStorage.setItem('gold-research-v1',JSON.stringify(next));receipts=next;return true;}catch(_){lastResearchError='研判记录保存失败：存储空间不足。没有发布无法留档的新判断。';return false;}}
function setResearchBusy(busy){aiBusy=busy;const button=$('aiRun');button.disabled=busy;button.classList.toggle('is-loading',busy);button.setAttribute('aria-busy',String(busy));button.textContent=busy?'正在综合研判…':'开始综合研判 · 付费调用';}
function researchPack(){const pack=GoldResearch.prepare(data);pack.failedFetches=Object.assign({},errors);return pack;}
function labelDirection(d){return d==='bullish'?'偏多':d==='bearish'?'偏空':'观望';}
function renderEvidence(pack){
  const rows=pack.evidence;
  $('evidenceStatus').textContent=`可用 ${rows.filter(x=>x.kind==='market').length} 类行情、${rows.filter(x=>x.kind==='news').length} 条去重新闻。${pack.ready?'可开始研判。':pack.reason}`;
  $('evidenceList').innerHTML=pack.missing.map(x=>`<div class="warning">${esc(x)}</div>`).join('')+rows.map(e=>e.kind==='market'?`<div class="evidence-row"><strong>${esc(e.id)} · ${esc(e.name)}</strong><p>${esc(e.source)} · ${esc(time(e.asOf))}<br>末报价 ${fmt(e.price)} · 5日变化 ${signed(e.change5)}%<br>日线、非分钟行情；期货可能含换月影响。</p></div>`:`<div class="evidence-row"><strong>${esc(e.id)} · ${esc(e.title)}</strong><p>${esc(e.source)} · ${esc(time(e.publishedAt))}<br>${esc(e.summary)}</p><button class="ref-button" data-evidence-url="${esc(e.url)}">打开来源 ↗</button></div>`).join('');
  for(const el of document.querySelectorAll('[data-evidence-url]'))el.addEventListener('click',()=>open(el.dataset.evidenceUrl));
}
function renderReport(record){
  if(!record)return;
  displayedReport=record;
  const r=record.report;
  let html=`<div class="section-heading"><h2>综合研判报告</h2><span>1–5 交易日</span></div><p class="note">${esc(record.provider)} / ${esc(record.model)}<br>生成于 ${esc(time(record.generatedAt))} · 证据截止 ${esc(time(record.pack.generatedAt))}<br>事实引用已做ID结构校验，语义真伪仍需核对原文。</p><div class="report-warning">这是模型推理，不是经验证的预测概率。尚无证据证明达到90%正确率。旧报告不会随当前行情自动改写。</div>`;
  html+=renderDashboard(record);
  if(goldCurrency==='CNY')html+='<p class="note">正文已知黄金价位附人民币折算，其他数字保留原文。人民币看板是国际黄金参考，非国内金店或银行成交价。</p>';
  for(const [key,title] of [['summary','综合结论'],['regime','市场状态'],['newsImpact','近期新闻与动荡'],['crossMarket','其他行业与资产'],['bullCase','多头路径'],['bearCase','空头路径']])html+=`<article class="report-section"><h3>${title}</h3><p>${esc(moneyNarrative(r[key],record))}</p></article>`;
  for(const h of r.horizons.slice().sort((a,b)=>a.days-b.days)){
    html+=`<article class="horizon"><h3><span>未来 ${h.days} 个交易日</span><span class="badge ${h.direction==='bullish'?'up':h.direction==='bearish'?'down':''}">${labelDirection(h.direction)}</span></h3><p>${esc(moneyNarrative(h.reason,record))}</p><p><b>失效条件：</b>${esc(moneyNarrative(h.invalidate,record))}</p><div>${h.evidence.map(id=>`<button class="ref-button" data-report-ref="${esc(id)}">证据 ${esc(id)} ↗</button>`).join('')}</div></article>`;
  }
  for(const [key,title] of [['risks','风险与信息缺口'],['watch','接下来观察什么']])html+=`<article class="report-section"><h3>${title}</h3>${r[key].map(x=>`<p>• ${esc(moneyNarrative(x,record))}</p>`).join('')}</article>`;
  html+=`<article class="report-section"><h3>第二轮复核</h3><p>${esc(moneyNarrative(r.reviewNotes,record))}</p></article><p class="note">${record.liveSearch?'本次流程为live检索→综合分析和反证检查；不等于两个独立专家。':'两次调用来自同一模型，可能共享偏见，不是两个独立专家。'}仅验证字段和引用存在，不能机械证明分析事实正确。</p>`;
  const web=record.pack.evidence.filter(e=>e.category==='web');
  if(web.length)html+='<article class="report-section"><h3>本次 live 检索来源</h3>'+web.map(e=>`<p><button class="ref-button" data-report-ref="${esc(e.id)}">${esc(e.id)} · ${esc(e.title)} ↗</button><br>${esc(e.source)} · 检索于 ${esc(time(e.fetchedAt))}<br>来源发布时间（模型提取，未独立验证）：${esc(e.publicationClaim||'未知')}</p>`).join('')+'</article>';
  $('researchReport').innerHTML=html;
  for(const el of document.querySelectorAll('[data-report-ref]'))el.addEventListener('click',()=>{
    const e=record.pack.byId[el.dataset.reportRef];if(!e)return;
    if(e.kind==='news')open(e.url);else alert(e.name+'\n'+e.source+'\n'+time(e.asOf)+'\n末报价 '+fmt(e.price)+'\n近5日变化 '+signed(e.change5)+'%');
  });
}
function renderHomeResearch(){
  const r=receipts[receipts.length-1];if(!r)return;
  $('homeResearch').innerHTML=`<div class="pill">最近一份综合研判 · 不随行情自动重写</div><h1>${r.report.horizons.map(h=>h.days+'日'+labelDirection(h.direction)).join(' / ')}</h1><p>${esc(moneyNarrative(r.report.summary,r))}</p>${renderPlanSummary(r)}<p class="fine">${esc(time(r.generatedAt))} · ${esc(r.model)} · 未验证90%正确率</p>`;
}
$('homeResearchOpen').addEventListener('click',()=>showPage('analysis'));
function renderHistory(){
  if(!receipts.length){$('forecastHistory').innerHTML='<article class="empty">尚未生成并保存综合研判，暂无可验证的命中率。</article>';return;}
  const metrics=[1,3,5].map(days=>{
    let directions=0,waits=0,correct=0,settled=0;
    for(const r of receipts){const h=r.report.horizons.find(x=>x.days===days);if(!h)continue;if(h.direction==='wait'){waits++;continue;}directions++;const result=(r.results||{})[days];if(result){settled++;if(result.outcome==='correct')correct++;}}
    return `<div>${days}日已到期命中率<strong>${settled?fmt(correct/settled*100,1)+'%':'待验证'}</strong>正确 ${correct} / 到期 ${settled}<br>方向 ${directions} · 观望 ${waits}</div>`;
  });
  $('forecastHistory').innerHTML=`<div class="history-metrics">${metrics.join('')}</div><p class="note">以上是未去除重叠样本的本机观察值，不是独立样本统计，更不是未来正确率。观望不计入命中率，但完整计数。记录总数 ${receipts.length}；尚未到期的判断不参与命中率。</p>`+receipts.slice(-12).reverse().map((r,i)=>`<div class="history-row"><button class="text-button" data-receipt="${receipts.length-1-i}">${esc(time(r.generatedAt))} · 查看报告 ↗</button><p>${r.report.horizons.map(h=>{const v=(r.results||{})[h.days];return h.days+'日'+labelDirection(h.direction)+'：'+(v?(v.outcome==='abstained'?'观望不计分':v.outcome==='correct'?'正确':'错误')+'（'+signed(v.return*100)+'%）':'待结算');}).join(' / ')}</p></div>`).join('');
  for(const el of document.querySelectorAll('[data-receipt]'))el.addEventListener('click',()=>{renderReport(receipts[Number(el.dataset.receipt)]);$('researchReport').scrollIntoView({behavior:'smooth',block:'start'});});
}
window.renderResearch=function(){
  const pack=researchPack();renderEvidence(pack);
  if(receipts.length&&data.gold){const updated=receipts.map(r=>GoldResearch.settle(r,data.gold));if(JSON.stringify(updated)!==JSON.stringify(receipts))saveReceipts(updated);}
  renderHistory();renderHomeResearch();
  if(displayedReport)renderReport(displayedReport);
};
$('aiConfig').addEventListener('click',()=>{if(window.GoldNative&&GoldNative.aiSettings)GoldNative.aiSettings();else alert('请在 Android 应用中配置密钥');});
$('aiRun').addEventListener('click',()=>{
  if(aiBusy)return;
  if(!aiConfigured){$('aiProgress').textContent='先点右上方“配置模型”，在手机里填写自己的 API Key。不要发到聊天里。';return;}
  const pack=researchPack();if(!pack.ready){$('aiProgress').textContent=pack.reason;return;}
  pendingPack=JSON.parse(JSON.stringify(pack));setResearchBusy(true);$('aiProgress').textContent='正在发送证据…';
  // byId is a local lookup, not a second copy of evidence in the paid prompt.
  const wire=Object.assign({},pendingPack);delete wire.byId;
  GoldNative.analyze(JSON.stringify(wire));
});
window.onResearchData=function(key,payload){
  if(key==='aiStatus'){aiConfigured=payload.configured;aiLiveSearch=!!payload.liveSearch;$('aiFlow').textContent=aiLiveSearch?'未来1/3/5个交易日：先live联网检索，再综合新闻、行情和反证。最多两次模型调用，检索也可能计费。':'未来1/3/5个交易日：先分析输入证据，再由同一模型复核。最多两次付费调用，不代表独立专家共识。';$('aiConfigStatus').textContent=aiConfigured?`已配置 ${payload.provider} / ${payload.model}；密钥不会显示在网页中。`:'尚未配置 API Key；基础行情与本机指标仍可使用。';return;}
  if(key==='aiProgress'){$('aiProgress').textContent=payload.text;return;}
  if(key==='aiError'){setResearchBusy(false);pendingPack=null;$('aiProgress').textContent='研判失败：'+payload.error+'。之前的报告保持原样。';return;}
  if(key==='aiResult'){
    setResearchBusy(false);
    try{
      if(!pendingPack)throw Error('缺少本次证据快照，未发布研判');
      if(Array.isArray(payload.webEvidence))for(const e of payload.webEvidence){
        if(!/^W[1-8]$/.test(e.id)||pendingPack.byId[e.id]||e.kind!=='news'||typeof e.url!=='string'||!e.url.startsWith('https://')||e.toolVerified!==true)throw Error('联网证据结构不正确');
        pendingPack.byId[e.id]=e;pendingPack.evidence.push(e);
      }
      GoldResearch.validate(payload.report,pendingPack,true);
      const record={liveSearch:!!payload.liveSearch,report:payload.report,draft:payload.draft,provider:payload.provider,model:payload.model,generatedAt:payload.generatedAt,pack:pendingPack,results:{},usageFirst:payload.usageFirst,usageReview:payload.usageReview};
      if(!saveReceipts(receipts.concat([record])))throw Error(lastResearchError);
      renderReport(record);renderHistory();renderHomeResearch();$('aiProgress').textContent='综合研判已完成并留档。引用ID已校验，但尚未证明预测有效。';
    }catch(exc){$('aiProgress').textContent='未发布本次研判：'+exc.message+'。模型调用可能已计费；没有自动重试。';}
    pendingPack=null;
  }
};
setInterval(()=>{if(displayedReport)renderReport(displayedReport);},60000);
if(receipts.length)renderReport(receipts[receipts.length-1]);
renderResearch();
if(window.GoldNative&&GoldNative.aiStatus)GoldNative.aiStatus();else $('aiConfigStatus').textContent='浏览器预览：API Key 仅在 Android 原生配置页输入。';
