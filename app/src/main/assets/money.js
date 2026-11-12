(function(root){
  'use strict';
  const OUNCE=31.1034768;
  function rate(fx,at,goldAt){
    if(!fx||!Number.isFinite(fx.price)||fx.price<=0)return null;
    if(!Number.isFinite(fx.asOf)||!Number.isFinite(fx.fetchedAt)||!Number.isFinite(goldAt))return null;
    if(at-fx.fetchedAt>86400000||at-fx.asOf>86400000||fx.fetchedAt-at>3600000||fx.asOf-at>3600000||Math.abs(goldAt-fx.asOf)>86400000)return null;
    return fx.price;
  }
  function convert(price,currency,fxRate){
    if(!Number.isFinite(price))return null;
    if(currency==='USD')return price;
    return Number.isFinite(fxRate)&&fxRate>0?price*fxRate/OUNCE:null;
  }
  const api={rate,convert,OUNCE};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoldMoney=api;
})(typeof window==='undefined'?globalThis:window);
