package cn.local.goldradar;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Responses protocol for the user's explicitly selected Sub2API host. */
final class ProxyClient {
    static final String BASE = "https://justproxy.dui88.com";

    static HttpURLConnection connection(String path,String token,String actor) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(BASE+path).openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(150000);c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Authorization","Bearer "+token);
        if(actor!=null&&!actor.isEmpty())c.setRequestProperty("x-openai-actor-authorization",actor);
        c.setRequestProperty("Content-Type","application/json");return c;
    }
    static IOException statusError(int code) {
        return new IOException("Sub2API HTTP "+code+(code==401?"：密钥或请求头无效":code==402?"：余额不足":code==429?"：服务限流":"：请检查代理端模型权限、工具支持或网络"));
    }
    static JSONArray models(String token,String actor) throws Exception {
        HttpURLConnection c=connection("/v1/models",token,actor);
        try {
            int code=c.getResponseCode();if(code!=200)throw statusError(code);
            String raw=read(c.getInputStream(),1000000);
            JSONArray source=new JSONObject(raw).getJSONArray("data"),result=new JSONArray();
            for(int i=0;i<source.length();i++) {
                String id=source.getJSONObject(i).optString("id");
                if(id.startsWith("gpt-")&&!id.contains("image")&&!id.equals("gpt-reserve"))result.put(id);
            }
            if(result.length()==0)throw new IOException("服务未返回可选GPT文本模型");return result;
        } finally {c.disconnect();}
    }
    static String read(InputStream input,int limit) throws Exception {
        try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){out.write(buf,0,n);if(out.size()>limit)throw new IOException("服务响应过大");}return out.toString("UTF-8");
        }
    }
    static JSONObject body(String system,String user,String model,boolean search) throws JSONException {
        JSONObject b=new JSONObject().put("model",model).put("instructions",system).put("store",false).put("stream",true).put("max_output_tokens",7000)
            .put("input",new JSONArray().put(new JSONObject().put("role","user").put("content",new JSONArray().put(new JSONObject().put("type","input_text").put("text","请按指令返回 JSON 对象。以下是待分析的输入数据：\n"+user)))));
        if(search)b.put("tools",new JSONArray().put(new JSONObject().put("type","web_search").put("external_web_access",true)))
            .put("tool_choice","required").put("include",new JSONArray().put("web_search_call.action.sources"));
        else b.put("text",new JSONObject().put("format",new JSONObject().put("type","json_object")));
        return b;
    }
    static JSONObject completedEvent(String data) throws Exception {
        if(data.trim().isEmpty()||"[DONE]".equals(data.trim()))return null;
        JSONObject event=new JSONObject(data);String type=event.optString("type");
        if(type.equals("response.completed"))return event.getJSONObject("response");
        if(type.equals("response.failed")||type.equals("response.incomplete")||type.equals("error")){
            JSONObject r=event.optJSONObject("response");
            JSONObject details=r==null?null:r.optJSONObject("incomplete_details");
            String reason=details==null?"":details.optString("reason");
            JSONObject error=r==null?event.optJSONObject("error"):r.optJSONObject("error");
            String code=error==null?event.optString("code"):error.optString("code");
            String suffix="max_output_tokens".equals(reason)?"：输出额度耗尽":code.matches("[A-Za-z0-9_]{1,60}")?"："+code:"";
            String message=error==null?event.optString("message"):error.optString("message");
            message=message.replaceAll("(?i)bearer\\s+\\S+","[credential]").replaceAll("sk-[A-Za-z0-9_-]+","[credential]").replaceAll("https?://\\S+","[service]");
            if(!message.isEmpty())suffix+=" · "+message.substring(0,Math.min(180,message.length()));
            throw new IOException("Responses返回失败或不完整输出"+suffix+"，未发布研判");
        }
        return null;
    }
    static JSONObject decode(JSONObject response) throws Exception {
        if(!"completed".equals(response.optString("status")))throw new IOException("Responses没有完成，未发布研判");
        StringBuilder text=new StringBuilder();JSONArray sources=new JSONArray();boolean searched=false;
        JSONArray output=response.optJSONArray("output");if(output==null)throw new IOException("Responses缺少output");
        Set<String> seen=new HashSet<>();
        for(int i=0;i<output.length();i++){
            JSONObject o=output.getJSONObject(i);
            if(o.optString("type").equals("web_search_call")){
                if("completed".equals(o.optString("status")))searched=true;
                JSONObject action=o.optJSONObject("action");JSONArray rows=action==null?null:action.optJSONArray("sources");
                if(rows!=null)for(int j=0;j<rows.length();j++)addSource(rows.getJSONObject(j),sources,seen);
            }
            if(!"message".equals(o.optString("type")))continue;
            JSONArray content=o.optJSONArray("content");if(content==null)continue;
            for(int j=0;j<content.length();j++){
                JSONObject part=content.getJSONObject(j);
                if("refusal".equals(part.optString("type")))throw new IOException("模型拒绝生成研判");
                if("output_text".equals(part.optString("type")))text.append(part.optString("text"));
                JSONArray annotations=part.optJSONArray("annotations");if(annotations!=null)for(int k=0;k<annotations.length();k++)addSource(annotations.getJSONObject(k),sources,seen);
            }
        }
        String value=text.toString().trim();
        if(value.startsWith("```")){int line=value.indexOf('\n');int end=value.lastIndexOf("```");if(line>=0&&end>line)value=value.substring(line+1,end).trim();}
        if(value.isEmpty())throw new IOException("Responses没有返回文本JSON");
        return new JSONObject().put("report",new JSONObject(value)).put("usage",response.optJSONObject("usage")).put("webCitations",sources).put("searched",searched);
    }
    private static void addSource(JSONObject row,JSONArray target,Set<String> seen) throws JSONException {
        String url=row.optString("url");if(url.startsWith("https://")&&seen.add(url))target.put(new JSONObject().put("url",url).put("title",row.optString("title")));
    }
    static JSONObject call(String system,String user,String token,String actor,String model,boolean search) throws Exception {
        HttpURLConnection c=connection("/v1/responses",token,actor);c.setRequestMethod("POST");c.setDoOutput(true);
        c.setRequestProperty("Accept","text/event-stream");
        c.setRequestProperty("Accept-Encoding","identity");
        try {
            try(OutputStream out=c.getOutputStream()){out.write(body(system,user,model,search).toString().getBytes(StandardCharsets.UTF_8));}
            int code=c.getResponseCode();if(code!=200)throw statusError(code);
            String type=c.getContentType();JSONObject response=null;
            if(type!=null&&type.contains("text/event-stream")){
                try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
                    String line;StringBuilder data=new StringBuilder();int length=0;
                    while((line=reader.readLine())!=null){
                        length+=line.length();if(length>8000000)throw new IOException("Responses事件流过大");
                        if(line.isEmpty()){
                            response=completedEvent(data.toString());data.setLength(0);if(response!=null)break;
                        }else if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).trim());}
                    }
                    if(response==null&&data.length()>0)response=completedEvent(data.toString());
                }
            }else response=new JSONObject(read(c.getInputStream(),3000000));
            if(response==null)throw new IOException("Responses流在完成前断开，未发布研判");
            return decode(response);
        } finally {c.disconnect();}
    }
    static JSONArray evidence(JSONObject searchResult,long now) throws Exception {
        if(!searchResult.optBoolean("searched"))throw new IOException("代理没有执行联网检索；未将其当作live检索结果");
        JSONArray citations=searchResult.getJSONArray("webCitations"),proposed=searchResult.getJSONObject("report").optJSONArray("sources");
        Set<String> allowed=new HashSet<>();for(int i=0;i<citations.length();i++)allowed.add(citations.getJSONObject(i).getString("url"));
        JSONArray result=new JSONArray();Set<String> seen=new HashSet<>();
        if(proposed!=null)for(int i=0;i<proposed.length()&&result.length()<8;i++){
            JSONObject row=proposed.getJSONObject(i);String url=row.optString("url"),summary=row.optString("summary"),title=row.optString("title");
            if(!allowed.contains(url)||!seen.add(url)||summary.isEmpty()||title.isEmpty())continue;
            String host=new URL(url).getHost();
            result.put(new JSONObject().put("id","W"+(result.length()+1)).put("kind","news").put("category","web")
                .put("url",url).put("title",title.substring(0,Math.min(title.length(),400))).put("summary",summary.substring(0,Math.min(summary.length(),1200)))
                .put("source",host+" · live检索摘要").put("publicationClaim",row.optString("publishedAt","未知，未验证日期"))
                .put("toolVerified",true).put("dateVerified",false).put("fetchedAt",now));
        }
        if(result.length()==0)throw new IOException("联网检索未返回可核对的工具来源，未发布综合研判");return result;
    }
}
