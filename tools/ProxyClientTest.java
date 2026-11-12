package cn.local.goldradar;

import org.json.*;

public class ProxyClientTest {
    static int checks;
    static void check(boolean condition,String message){checks++;if(!condition)throw new AssertionError(message);}
    static JSONObject output(String text) throws Exception {
        return new JSONObject().put("status","completed").put("output",new JSONArray().put(new JSONObject().put("type","message").put("content",new JSONArray().put(new JSONObject().put("type","output_text").put("text",text)))));
    }
    public static void main(String[] args) throws Exception {
        JSONObject body=ProxyClient.body("instructions","input","gpt-6.1-sol",false);
        check(body.getString("model").equals("gpt-6.1-sol"),"preserve user's model");
        check(!body.getBoolean("store")&&body.getBoolean("stream"),"non-stored streaming Responses");
        check(!body.has("messages")&&!body.has("max_tokens"),"do not send chat-completions fields");
        check(body.getJSONObject("text").getJSONObject("format").getString("type").equals("json_object"),"final report uses JSON mode");
        check(body.getJSONArray("input").getJSONObject(0).getJSONArray("content").getJSONObject(0).getString("text").contains("JSON"),"JSON mode marker must appear in input, not only instructions");
        JSONObject web=ProxyClient.body("system","input","gpt-6.1-sol",true);
        check(web.getJSONArray("tools").getJSONObject(0).getBoolean("external_web_access"),"enable actual live access");
        check(!web.has("max_tool_calls"),"proxy rejects max_tool_calls");
        check(ProxyClient.completedEvent("[DONE]")==null,"DONE marker is not a completed response");
        check(ProxyClient.completedEvent("{\"type\":\"response.output_text.delta\",\"delta\":\"x\"}")==null,"deltas cannot publish incomplete output");
        check(ProxyClient.completedEvent("{\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}").getString("status").equals("completed"),"completed event unwrapped");
        boolean rejected=false;try{ProxyClient.completedEvent("{\"type\":\"response.failed\"}");}catch(Exception e){rejected=true;}check(rejected,"failed event rejected");
        check(ProxyClient.decode(output("{\"ok\":true}")).getJSONObject("report").getBoolean("ok"),"native Responses output decoded");
        check(ProxyClient.decode(output("```json\n{\"ok\":true}\n```")).getJSONObject("report").getBoolean("ok"),"JSON code fence tolerated");
        JSONObject source=new JSONObject().put("url","https://example.org/fact").put("title","Actual tool source");
        JSONObject response=output("{\"sources\":[{\"url\":\"https://example.org/fact\",\"title\":\"Verified URL\",\"summary\":\"summary\",\"publishedAt\":\"unknown\"},{\"url\":\"https://fabricated.invalid/\",\"title\":\"invented\",\"summary\":\"invented\"}]}");
        response.getJSONArray("output").put(new JSONObject().put("type","web_search_call").put("status","completed").put("action",new JSONObject().put("sources",new JSONArray().put(source))));
        JSONObject decoded=ProxyClient.decode(response);check(decoded.getBoolean("searched"),"actual search event recorded");
        JSONArray evidence=ProxyClient.evidence(decoded,1234);check(evidence.length()==1,"invented URLs excluded from web evidence");
        check(evidence.getJSONObject(0).getString("id").equals("W1")&&evidence.getJSONObject(0).getBoolean("toolVerified"),"native assigns verified web ID");
        check(!evidence.getJSONObject(0).getBoolean("dateVerified"),"model claimed dates are not marked verified");
        rejected=false;try{ProxyClient.evidence(ProxyClient.decode(output("{\"sources\":[]}")),1234);}catch(Exception e){rejected=true;}check(rejected,"no silent fallback if live search wasn't used");
        rejected=false;try{ProxyClient.decode(output("{}").put("status","incomplete"));}catch(Exception e){rejected=true;}check(rejected,"incomplete response cannot publish");
        System.out.println("PASS: "+checks+" native Responses protocol checks; no API calls or credentials used.");
    }
}
