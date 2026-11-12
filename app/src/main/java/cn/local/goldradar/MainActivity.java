package cn.local.goldradar;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.content.Intent;
import android.graphics.Color;
import android.webkit.*;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.xml.parsers.*;
import org.w3c.dom.*;

/** Local assets only in the bridge-enabled WebView. Public data goes through fixed HTTPS endpoints. */
public class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(5);
    private final AtomicBoolean refreshing = new AtomicBoolean(false);
    private volatile boolean destroyed;
    private long lastRefresh;
    private ResearchService research;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        research = new ResearchService(this, this::send);
        getWindow().setStatusBarColor(Color.rgb(247,245,239));
        getWindow().setNavigationBarColor(Color.rgb(247,245,239));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247,245,239));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new Bridge(), "GoldNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                if (!"appassets.androidplatform.net".equals(uri.getHost())) return blocked();
                String name = uri.getPath();
                if (name == null || !name.startsWith("/assets/") || name.contains("..")) return blocked();
                name = name.substring(8);
                if ("personal-debug.json".equals(name)) return blocked();
                try {
                    String mime = name.endsWith(".js") ? "application/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(name));
                } catch (IOException exc) { return blocked(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (u.startsWith("https://appassets.androidplatform.net/assets/")) return false;
                openExternal(u); return true;
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247,245,239));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        // WebView does not honor its own padding for fixed HTML elements.
        // Inset the native container so Android 15 status/gesture bars cannot cover the UI.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private void send(String key, JSONObject payload) {
        runOnUiThread(() -> { if (!destroyed) web.evaluateJavascript("window.onNativeData(" + JSONObject.quote(key) + "," + payload.toString() + ")", null); });
    }
    private JSONObject error(Exception exc) {
        JSONObject o = new JSONObject();
        try { o.put("error", exc instanceof SocketTimeoutException ? "数据源连接超时，请检查网络后重试" : "数据源暂不可用：" + exc.getClass().getSimpleName() + (exc.getMessage() == null ? "" : " · " + exc.getMessage())); }
        catch (JSONException ignored) { }
        return o;
    }
    private String get(String url, String encoding) throws Exception {
        URL target = new URL(url);
        if (!"https".equals(target.getProtocol())) throw new IOException("仅支持 HTTPS");
        HttpURLConnection c = (HttpURLConnection) target.openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(15000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 GoldRadar/1.0 personal-research");
        c.setRequestProperty("Referer", "https://finance.sina.com.cn/");
        try {
            int status = c.getResponseCode();
            if (status != 200) throw new IOException("HTTP " + status);
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    if (out.size() > 4000000) throw new IOException("响应超过限制");
                }
                return out.toString(encoding);
            }
        } finally { c.disconnect(); }
    }
    private JSONObject chart(String symbol) throws Exception {
        Exception last = null;
        for (String host : new String[]{"query1.finance.yahoo.com", "query2.finance.yahoo.com"}) {
            try {
                String encoded = URLEncoder.encode(symbol, "UTF-8").replace("+", "%20");
                JSONObject root = new JSONObject(get("https://" + host + "/v8/finance/chart/" + encoded + "?range=6mo&interval=1d", "UTF-8"));
                JSONObject result = root.getJSONObject("chart").getJSONArray("result").getJSONObject(0);
                JSONObject meta = result.getJSONObject("meta");
                JSONArray times = result.getJSONArray("timestamp");
                JSONArray closes = result.getJSONObject("indicators").getJSONArray("quote").getJSONObject(0).getJSONArray("close");
                JSONArray points = new JSONArray();
                // Keep daily OHLC close observations separate from the latest quote.
                for (int i=0; i<times.length() && i<closes.length(); i++) {
                    if (!closes.isNull(i) && closes.getDouble(i) > 0) {
                        points.put(new JSONObject().put("t", times.getLong(i)*1000L).put("c", closes.getDouble(i)));
                    }
                }
                if (points.length() < 2) throw new IOException("历史行情不足");
                JSONObject output = new JSONObject().put("points", points).put("source", "Yahoo Finance").put("symbol", symbol)
                    .put("fetchedAt", System.currentTimeMillis()).put("asOf", meta.getLong("regularMarketTime")*1000L)
                    .put("price", meta.getDouble("regularMarketPrice"));
                // chartPreviousClose is the close BEFORE the whole chart range, not yesterday.
                output.put("previous", points.getJSONObject(points.length()-2).getDouble("c"));
                return output;
            } catch (Exception exc) { last = exc; }
        }
        throw last == null ? new IOException("行情不可用") : last;
    }
    private JSONObject snapshot(String kind) throws Exception {
        boolean gold = kind.equals("snapshot");
        String raw = get(gold ? "https://qt.gtimg.cn/q=hf_GC" : "https://hq.sinajs.cn/list=DINIW", "GB18030");
        int a=raw.indexOf('"'), b=raw.lastIndexOf('"');
        if (a<0 || b<=a) throw new IOException("报价格式变化");
        String[] f=raw.substring(a+1,b).split(",");
        double price = Double.parseDouble(f[gold ? 0 : 1]);
        if (!(price>0)) throw new IOException("报价无效");
        String stamp=gold ? f[12]+" "+f[6] : f[10]+" "+f[0];
        java.text.SimpleDateFormat fmt=new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return new JSONObject().put("price",price).put("asOf",fmt.parse(stamp).getTime()).put("fetchedAt",System.currentTimeMillis())
            .put("source",gold ? "腾讯财经 · 纽约黄金 hf_GC" : "新浪财经 · 美元指数 DINIW")
            .put("previous", gold ? Double.parseDouble(f[7]) : JSONObject.NULL);
    }
    private String tag(Element el, String name) {
        NodeList list=el.getElementsByTagName(name); return list.getLength()==0 ? "" : list.item(0).getTextContent().trim();
    }
    private JSONObject news(String kind) throws Exception {
        boolean fed=kind.equals("fed");
        String query=kind.equals("geo") ? "地缘 冲突 石油 航运 when:3d" : kind.equals("industry") ? "通胀 原油 铜 科技股 美债 when:3d" : "黄金 美联储 when:3d";
        String url=fed ? "https://www.federalreserve.gov/feeds/press_all.xml" : "https://news.google.com/rss/search?q="+URLEncoder.encode(query,"UTF-8")+"&hl=zh-CN&gl=CN&ceid=CN:zh-Hans";
        String raw=get(url,"UTF-8");
        // Android's XML implementation does not support every Xerces feature flag.
        // These feeds never need a DTD; reject declarations before invoking the parser.
        if (raw.contains("<!DOCTYPE") || raw.contains("<!ENTITY")) throw new IOException("拒绝含 DTD 或实体声明的消息源");
        DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();
        Document doc=factory.newDocumentBuilder().parse(new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8)));
        NodeList items=doc.getElementsByTagName("item"); JSONArray rows=new JSONArray();
        List<JSONObject> candidates=new ArrayList<>();
        for (int i=0; i<items.getLength() && i<100; i++) {
            Element el=(Element)items.item(i);
            String title=tag(el,"title"), link=tag(el,"link");
            if (!link.startsWith("https://")) continue;
            String source=tag(el,"source");
            String summary=android.text.Html.fromHtml(tag(el,"description"),android.text.Html.FROM_HTML_MODE_LEGACY).toString().replaceAll("\\s+"," ").trim();
            if(summary.length()>700)summary=summary.substring(0,700);
            candidates.add(new JSONObject().put("title",title).put("url",link).put("date",tag(el,"pubDate")).put("summary",summary).put("source",fed ? "美联储官网" : source.isEmpty() ? "Google News 聚合" : source));
        }
        java.text.SimpleDateFormat rssDate=new java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z",Locale.US);
        candidates.sort((a,b)->{try{return rssDate.parse(b.optString("date")).compareTo(rssDate.parse(a.optString("date")));}catch(Exception exc){return 0;}});
        Set<String> titles=new HashSet<>();
        for(JSONObject item:candidates){if(titles.add(item.optString("title")))rows.put(item);if(rows.length()>=18)break;}
        if (rows.length()==0) throw new IOException("消息源没有返回条目");
        return new JSONObject().put("items",rows).put("source",fed ? "美联储官方 RSS" : "Google News 中文 RSS").put("fetchedAt",System.currentTimeMillis());
    }
    private void openExternal(String value) {
        runOnUiThread(() -> {
            try {
                Uri uri=Uri.parse(value);
                if (!"https".equals(uri.getScheme()) || uri.getHost()==null) return;
                startActivity(new Intent(Intent.ACTION_VIEW,uri));
            } catch (Exception exc) { Toast.makeText(this,"未找到可打开原文的浏览器",Toast.LENGTH_SHORT).show(); }
        });
    }
    public class Bridge {
        @JavascriptInterface public void refresh() {
            synchronized (MainActivity.this) {
                if (refreshing.get() || System.currentTimeMillis()-lastRefresh<10000) { send("busy", new JSONObject()); return; }
                refreshing.set(true); lastRefresh=System.currentTimeMillis();
            }
            Map<String,String> symbols=new LinkedHashMap<>();
            symbols.put("gold","GC=F");symbols.put("dollar","DX-Y.NYB");symbols.put("yield","^TNX");symbols.put("fx","CNY=X");
            symbols.put("oil","CL=F");symbols.put("silver","SI=F");symbols.put("copper","HG=F");symbols.put("stocks","^GSPC");symbols.put("vix","^VIX");
            List<Future<?>> jobs=new ArrayList<>();
            for (Map.Entry<String,String> entry:symbols.entrySet()) jobs.add(pool.submit(() -> {
                try { send(entry.getKey(),chart(entry.getValue())); } catch(Exception exc) { send(entry.getKey(),error(exc)); }
            }));
            for (String key:new String[]{"snapshot","dollarSnapshot","news","fed","geo","industry"}) jobs.add(pool.submit(() -> {
                try { send(key,key.equals("snapshot")||key.equals("dollarSnapshot") ? snapshot(key) : news(key)); }
                catch(Exception exc) { send(key,error(exc)); }
            }));
            // A separate coordinator prevents starvation of the fixed network pool.
            new Thread(() -> {
                for(Future<?> job:jobs) { try { job.get(); } catch(Exception ignored) { } }
                refreshing.set(false);send("done",new JSONObject());
            },"refresh-coordinator").start();
        }
        @JavascriptInterface public void open(String url) { openExternal(url); }
        @JavascriptInterface public void aiSettings() { research.configure(); }
        @JavascriptInterface public void aiStatus() { research.status(); }
        @JavascriptInterface public void analyze(String evidence) { research.run(evidence); }
    }
    @Override public void onBackPressed() { web.evaluateJavascript("window.backToHome()", null); }
    @Override public void onDestroy() { destroyed=true;pool.shutdownNow();web.removeJavascriptInterface("GoldNative");web.destroy();super.onDestroy(); }
}
