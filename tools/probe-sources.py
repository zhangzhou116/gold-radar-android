#!/usr/bin/env python3
"""Fetch actual public data for local UI QA; never bundle these observations in the APK."""
import concurrent.futures
import datetime
import json
import re
import html
import email.utils
from pathlib import Path
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

def get(url, encoding="utf-8"):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.sina.com.cn/"})
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read(4_000_000).decode(encoding)

def fetch(key):
    try:
        symbols = {"gold": "GC=F", "dollar": "DX-Y.NYB", "yield": "^TNX", "fx": "CNY=X", "oil":"CL=F", "silver":"SI=F", "copper":"HG=F", "stocks":"^GSPC", "vix":"^VIX"}
        now = int(time.time()*1000)
        if key in symbols:
            symbol = symbols[key]
            raw = json.loads(get("https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(symbol, safe="") + "?range=6mo&interval=1d"))["chart"]["result"][0]
            meta = raw["meta"]
            points = [{"t": t*1000, "c": c} for t,c in zip(raw["timestamp"],raw["indicators"]["quote"][0]["close"]) if c is not None and c > 0]
            result = dict(points=points, source="Yahoo Finance", symbol=symbol, fetchedAt=now, asOf=meta["regularMarketTime"]*1000, price=meta["regularMarketPrice"], previous=points[-2]["c"])
        elif key in ("snapshot", "dollarSnapshot"):
            gold = key == "snapshot"
            raw = get("https://qt.gtimg.cn/q=hf_GC" if gold else "https://hq.sinajs.cn/list=DINIW", "gb18030")
            fields = raw.split('"')[1].split(',')
            stamp = (fields[12]+" "+fields[6]) if gold else (fields[10]+" "+fields[0])
            date = datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone(datetime.timedelta(hours=8)))
            result = dict(price=float(fields[0 if gold else 1]), previous=float(fields[7]) if gold else None, asOf=int(date.timestamp()*1000), fetchedAt=now, source="腾讯财经 · 纽约黄金 hf_GC" if gold else "新浪财经 · 美元指数 DINIW")
        else:
            fed = key == "fed"
            query = "地缘 冲突 石油 航运 when:3d" if key == "geo" else "通胀 原油 铜 科技股 美债 when:3d" if key == "industry" else "黄金 美联储 when:3d"
            url = "https://www.federalreserve.gov/feeds/press_all.xml" if fed else "https://news.google.com/rss/search?q="+urllib.parse.quote(query)+"&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
            doc = ET.fromstring(get(url).lstrip('\ufeff'))
            items = [dict(title=el.findtext('title'), url=el.findtext('link'), date=el.findtext('pubDate'), summary=html.unescape(re.sub("<[^>]+>", " ", el.findtext("description") or ""))[:700], source="美联储官网" if fed else el.findtext('source') or "Google News 聚合") for el in sorted(doc.findall('.//item'),key=lambda el:email.utils.parsedate_to_datetime(el.findtext('pubDate')).timestamp(),reverse=True)[:18]]
            result = dict(items=items, fetchedAt=now, source="美联储官方 RSS" if fed else "Google News 中文 RSS")
        return key, result
    except Exception as exc:
        return key, {"error": str(exc)}

if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        data = dict(pool.map(fetch,["gold","dollar","yield","fx","snapshot","dollarSnapshot","news","fed","geo","industry","oil","silver","copper","stocks","vix"]))
    (ROOT/"build").mkdir(exist_ok=True)
    (ROOT/"build/live-data.json").write_text(json.dumps(data,ensure_ascii=False))
    print(json.dumps({k: {"price":v.get("price"), "points":len(v.get("points",[])), "items":len(v.get("items",[])), "error":v.get("error")} for k,v in data.items()},ensure_ascii=False,indent=2))
