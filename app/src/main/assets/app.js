'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const time=t=>Number.isFinite(t)?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' 北京时间':'时间未知';
const signed=(n,d=2)=>(n>=0?'+':'')+fmt(n,d);
const KEYS=['snapshot','gold','dollarSnapshot','dollar','yield','fx','news','fed','geo','industry','oil','silver','copper','stocks','vix'];
const NAMES={snapshot:'腾讯 · 黄金报价',gold:'Yahoo · 黄金日线 GC=F',dollarSnapshot:'新浪 · 美元指数报价',dollar:'Yahoo · 美元指数日线',yield:'Yahoo · 美债名义收益率 ^TNX',fx:'Yahoo · 美元兑人民币 CNY=X',news:'Google News · 中文黄金消息',fed:'美联储 · 官方 RSS',geo:'地缘局势 · 新闻 RSS',industry:'行业趋势 · 新闻 RSS',oil:'Yahoo · WTI 原油',silver:'Yahoo · 白银',copper:'Yahoo · 铜',stocks:'Yahoo · 标普500',vix:'Yahoo · VIX'};
let data={},errors={},received=new Set(),refreshing=false,newsMode='news',currentPage='overview',initialAt=Date.now();
try{const cached=JSON.parse(localStorage.getItem('goldradar-v1')||'{}');if(cached&&typeof cached==='object')for(const k of KEYS)if(cached[k]&&typeof cached[k]==='object')data[k]=cached[k];}catch(_){/* Invalid cache starts empty. */}
function persist(){try{localStorage.setItem('goldradar-v1',JSON.stringify(data));}catch(_){$('status').textContent='本机缓存空间不足；当前行情仍可查看';}}
function cached(k){return !!data[k]&&!received.has(k);}
function cacheMark(k){return cached(k)?' · 历史缓存':'';}
function showPage(name){currentPage=name;for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.id===name);for(const el of document.querySelectorAll('nav button'))el.classList.toggle('active',el.dataset.page===name);window.scrollTo(0,0);}
window.backToHome=()=>{if(currentPage!=='overview')showPage('overview');else $('status').textContent='已在首页，可使用系统手势返回桌面';};
for(const el of document.querySelectorAll('nav button'))el.addEventListener('click',()=>showPage(el.dataset.page));
$('goAnalysis').addEventListener('click',()=>showPage('analysis'));
$('newsGold').addEventListener('click',()=>{newsMode='news';renderNews();});
$('newsFed').addEventListener('click',()=>{newsMode='fed';renderNews();});
$('newsGeo').addEventListener('click',()=>{newsMode='geo';renderNews();});
$('newsIndustry').addEventListener('click',()=>{newsMode='industry';renderNews();});
function open(url){if(!url||!url.startsWith('https://'))return;if(window.GoldNative)GoldNative.open(url);else window.open(url,'_blank','noopener');}
$('original').addEventListener('click',()=>open('https://github.com/JasonBuildAI/GoldMind'));
$('clearCache').addEventListener('click',()=>{if(!confirm('清除本机保存的行情和新闻？之后需要联网重新获取。'))return;localStorage.removeItem('goldradar-v1');data={};errors={};received.clear();render();$('status').textContent='缓存已清除，点击右上角刷新';});
function refresh(){if(refreshing)return;refreshing=true;received.clear();$('refresh').disabled=true;$('refresh').textContent='连接中…';errors={};$('status').textContent='手机正在直连行情与消息源，逐项更新…';if(window.GoldNative)GoldNative.refresh();else{refreshing=false;$('refresh').disabled=false;$('refresh').textContent='↻ 刷新';$('status').textContent='浏览器预览模式；行情需要 Android 本机网络模块';}}
$('refresh').addEventListener('click',refresh);
window.onNativeData=function(key,payload){
  if(key.startsWith('ai') && window.onResearchData){window.onResearchData(key,payload);return;}
  if(key==='busy'){refreshing=false;$('refresh').disabled=false;$('refresh').textContent='↻ 刷新';$('status').textContent='正在更新或刷新过于频繁，请稍后再试';return;}
  if(key==='done'){refreshing=false;$('refresh').disabled=false;$('refresh').textContent='↻ 刷新';renderStatus();return;}
  if(!KEYS.includes(key))return;
  if(payload.error){errors[key]=payload.error;}else{data[key]=payload;received.add(key);delete errors[key];persist();}
  render();
};
function renderStatus(){
  const ok=received.size,fail=Object.keys(errors).length;
  if(refreshing){$('status').textContent=`正在获取 · 已成功 ${ok} 项${fail?' · 暂不可用 '+fail+' 项':''}`;return;}
  $('status').textContent=ok?`本次已更新 ${ok} 项${fail?' · '+fail+' 项失败，详情见「来源」':''} · 分析在本机完成`:Object.keys(data).length?'正在显示历史缓存 · 时间以各数据源标注为准':'暂无可用数据 · 请连接网络后刷新';
}
function renderChart(gold){
  if(!gold || !gold.points || !gold.points.length){$('chart').innerHTML='<text x="180" y="60" fill="#a9b8b0" text-anchor="middle" font-size="12">日线数据尚不可用</text>';$('chartRange').textContent='—';return;}
  const p=gold.points.slice(-60),vals=p.map(x=>x.c),lo=Math.min(...vals),hi=Math.max(...vals),range=hi-lo||1;
  const pts=p.map((v,i)=>[6+i/(p.length-1)*348,100-(v.c-lo)/range*85]);
  const line=pts.map((v,i)=>(i?'L':'M')+v.map(x=>x.toFixed(1)).join(',')).join(' ');
  $('chart').innerHTML=`<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddbc75" stop-opacity=".22"/><stop offset="1" stop-color="#ddbc75" stop-opacity="0"/></linearGradient></defs><path d="${line} L354,113 L6,113 Z" fill="url(#shade)"/><path d="M6,105H354" stroke="#ffffff" stroke-opacity=".10"/><path d="M6,55H354" stroke="#ffffff" stroke-opacity=".07" stroke-dasharray="3,5"/><path d="${line}" fill="none" stroke="#e5c47e" stroke-width="2" stroke-linecap="round"/><circle cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="3.3" fill="#e5c47e"/>`;
  const date=t=>new Date(t).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'});
  $('chartRange').textContent=date(p[0].t)+'—'+date(p[p.length-1].t);
  $('chartCaption').textContent=`${p.length} 个日线观测 · Yahoo${cacheMark('gold')}`;
}
function renderNews(){
  $('newsGold').classList.toggle('selected',newsMode==='news');$('newsFed').classList.toggle('selected',newsMode==='fed');$('newsGeo').classList.toggle('selected',newsMode==='geo');$('newsIndustry').classList.toggle('selected',newsMode==='industry');
  const n=data[newsMode],items=n && n.items;
  if(!items || !items.length){$('newsList').innerHTML=`<article class="empty">${esc(errors[newsMode]||'尚未获取消息，请刷新；部分网络可能无法访问此源。')}</article>`;return;}
  let html=errors[newsMode]?`<div class="warning">${esc(errors[newsMode])}；以下是上次成功获取的缓存。</div>`:'';
  html+=`<p class="note">获取于 ${esc(time(n.fetchedAt))}${esc(cacheMark(newsMode))}</p>`;
  html+=items.map((item,i)=>{const t=Date.parse(item.date),category=/利率|降息|加息|Fed|FOMC|monetary|rate/i.test(item.title)?'政策与利率':/战争|冲突|避险|war|conflict/i.test(item.title)?'风险与避险':/央行|储备|central bank/i.test(item.title)?'央行与储备':'市场动态';return `<article class="news-item" data-news="${i}" tabindex="0" role="link"><div class="news-type">${category} · 标题关键词分类，非影响判断</div><h3>${esc(item.title)}</h3><div class="news-meta"><span>${esc(item.source)}</span><span>${esc(Number.isFinite(t)?time(t):item.date)} ↗</span></div></article>`;}).join('');
  $('newsList').innerHTML=html;
  for(const el of document.querySelectorAll('[data-news]')){el.addEventListener('click',()=>open(items[Number(el.dataset.news)].url));el.addEventListener('keydown',e=>{if(e.key==='Enter')open(items[Number(el.dataset.news)].url);});}
}
function renderSources(){
  $('sources').innerHTML=KEYS.map(k=>{const d=data[k],fail=errors[k],stale=d && d.asOf && !GoldEngine.fresh(d);const state=fail?'本次失败':!d?'待获取':stale?'数据较旧':cached(k)?'历史缓存':'已更新';return `<article class="source"><strong>${esc(NAMES[k])}</strong><span class="state ${fail||stale?'up':'down'}">${state}</span><p>${d?`数据时间：${esc(time(d.asOf||d.fetchedAt))}<br>获取时间：${esc(time(d.fetchedAt))}`:'没有缓存'}</p>${fail?`<p>${esc(fail)}</p>`:''}</article>`;}).join('');
}
function render(){
  syncCurrencyControls();
  const a=GoldEngine.analyze(data),quotes=['snapshot','gold'].filter(k=>data[k]&&Number.isFinite(data[k].price)).sort((x,y)=>data[y].asOf-data[x].asOf),qk=quotes[0],q=data[qk];
  const money=moneyContext(null,q&&q.asOf);$('goldUnit').textContent=money.unit;$('levelsUnit').textContent=money.unit;
  if(q){$('goldPrice').textContent=money.format(q.price);const prev=q.previous,pct=prev?(q.price/prev-1)*100:null;$('goldChange').textContent=pct===null?'涨跌参考暂不可用':`${Number.isFinite(money.convert(q.price-prev))?signed(money.convert(q.price-prev)):'—'} ${money.unit} / ${signed(pct)}% · 美元原价较前收盘`;$('goldTime').textContent=`${q.source}${cacheMark(qk)}\n${time(q.asOf)}${!GoldEngine.fresh(q)?' · 数据较旧':''}\n${money.note}`;}
  else{$('goldPrice').innerHTML='—<small>尚未获取有效报价</small>';$('goldChange').textContent='请检查网络后刷新';$('goldTime').textContent='失败原因见「来源」';}
  renderChart(data.gold);
  const dk=['dollarSnapshot','dollar'].filter(k=>data[k] && data[k].price).sort((x,y)=>data[y].asOf-data[x].asOf)[0],d=data[dk];
  $('dollarPrice').textContent=d?fmt(d.price,3):'—';$('dollarDetail').textContent=d?time(d.asOf)+cacheMark(dk):'等待美元指数数据';
  const y=data.yield;$('yieldPrice').textContent=y?fmt(y.price,3)+'%':'—';$('yieldDetail').textContent=y?time(y.asOf)+cacheMark('yield'):'名义收益率 · 不是实际利率';
  const fx=data.fx;if(q&&fx&&GoldEngine.fresh(q)&&GoldEngine.fresh(fx)&&Math.abs(q.asOf-fx.asOf)<=86400000){$('rmbPrice').textContent='≈ '+fmt(q.price*fx.price/31.1034768)+' 元/克';$('rmbDetail').textContent=`采用期货参考价，非国内零售价；USD/CNY ${fmt(fx.price,4)}（${time(fx.asOf)}${cacheMark('fx')}）。不含国内溢价及费用。`;}else{$('rmbPrice').textContent='— 元/克';$('rmbDetail').textContent='需要有效且时间差不超过 24 小时的金价与 USD/CNY。折算仅供参考，不是国内黄金报价。';}
  $('verdictTitle').textContent=a.title;$('verdictTitle').className=a.tone;$('verdictSummary').textContent=a.summary;
  const cachedFactors=['gold','dollar','yield'].some(k=>cached(k)&&data[k]);
  $('verdictTag').textContent=cachedFactors?'基于缓存 · 本机规则分析':'本机规则分析 · 未经盈利验证';
  $('factorCount').innerHTML=`<span class="up">偏多 ${a.bulls}</span><span class="down">偏空 ${a.bears}</span><span>可用 ${a.factors.length} / 4</span>`;
  $('homeWarnings').innerHTML=a.flags.map(f=>`<div class="warning">${esc(f)}</div>`).join('');
  $('factors').innerHTML=a.factors.length?a.factors.map(f=>`<article><div class="factor-head"><h3>${esc(f.name)}</h3><span class="badge ${f.dir>0?'up':f.dir<0?'down':''}">${f.dir>0?'偏多':f.dir<0?'偏空':'中性'}</span></div><p>${esc(f.detail)}</p></article>`).join(''):'<article class="empty">暂无有效历史因子。单条报价不能替代历史数据或生成趋势判断。</article>';
  if(a.g){const g=a.g;$('levels').classList.remove('empty');$('levels').innerHTML=[['20 日均线',g.ma20,'价格趋势参考'],['60 日均线',g.ma60,'历史不足时不计算'],['20 日收盘高位',g.high20,'不是盘中最高价'],['20 日收盘低位',g.low20,'不是盘中最低价'],['RSI（14）',g.rsi,'简单平均法 · 0–100']].map(([name,v,note])=>`<div class="level-row"><span>${name}<small>${note}</small></span><strong>${name.startsWith('RSI')?fmt(v):money.format(v)}</strong></div>`).join('');const scale=g.vol*Math.sqrt(5);$('scenarios').classList.remove('empty');$('scenarios').innerHTML=`<div class="scenario-row"><div><span>下方 1σ 尺度</span><strong>${money.format(g.price*Math.exp(-scale))}</strong></div><div><span>上方 1σ 尺度</span><strong>${money.format(g.price*Math.exp(scale))}</strong></div></div><p>日线末值 ${money.format(g.price)} ${money.unit} · 近 20 日单日波动 ${fmt(g.vol*100)}%<br>${esc(time(data.gold.asOf))}${esc(cacheMark('gold'))}${GoldEngine.fresh(data.gold)?'':' · 历史数据较旧，仅供回看'}</p>`;}
  else{$('levels').className='levels empty';$('levels').textContent='历史数据不足，无法计算';$('scenarios').className='scenarios empty';$('scenarios').textContent='历史数据不足，无法计算波动尺度';}
  renderNews();renderSources();renderStatus();if(window.renderResearch)window.renderResearch();
}
render();refresh();
// Recheck timestamps after returning to the foreground; no background polling or paid calls.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
