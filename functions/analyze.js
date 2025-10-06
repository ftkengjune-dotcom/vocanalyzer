// functions/analyze.js
export const onRequestOptions = async ({ request }) =>
  new Response(null, { headers: corsHeaders(request) });

export const onRequestPost = async ({ request, env }) => {
  const apiKey = (env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return json({ error: "server misconfig: missing OPENAI_API_KEY" }, 500, request);

  try {
    const { word } = await request.json().catch(() => ({}));
    if (!word || typeof word !== "string") {
      return json({ error: "word is required" }, 400, request);
    }

    const payload = {
      model: "gpt-5-mini", // 필요시 gpt-5
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "You are a precise English morphology & etymology tutor. Return strict JSON only." }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text:
`Analyze the English word strictly as JSON with this schema:
{
  "word": string,
  "segments": { "prefix": string|null, "root": string|null, "suffix": string|null, "other_morphemes": string[] },
  "meaning": { "kr": string, "en": string },
  "etymology": string,
  "why_each_part": { "prefix": string, "root": string, "suffix": string },
  "mnemonic_image": string
}
Rules:
- If no clear prefix/suffix, set null.
- Keep it accurate; avoid hallucinating morphemes.
- 'etymology' 1-2 sentences.
- Output JSON only (no code fences).` }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: String(word).trim() }]
        }
      ],
      // ✅ Responses API JSON 모드
      text: { format: { type: "json_object" } },
      // Reasoning 모델은 temperature/top_p 미지원
      max_output_tokens: 600
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return json({ error: "OpenAI error", detail }, 502, request);
    }

    const data = await r.json();
    const textOut = extractText(data).trim() || JSON.stringify(data);

    let obj;
    try { obj = JSON.parse(textOut); }
    catch { obj = { raw: textOut, error: "Model did not return strict JSON" }; }

    return json(obj, 200, request);
  } catch (e) {
    return json({ error: e?.message || "server error" }, 500, request);
  }
};

function extractText(data) {
   // 1) 편의 필드가 있으면 우선 사용
   if (data?.output_text) {
     if (Array.isArray(data.output_text)) return data.output_text.join("\n");
     return String(data.output_text);
   }

   // 2) 표준 output[*].content[*].text 에서 "타입 무시"하고 전부 수집
   const chunks = [];
   const outputs = Array.isArray(data?.output) ? data.output : [];
   for (const item of outputs) {
     const content = Array.isArray(item?.content) ? item.content : [];
     for (const c of content) {
       if (typeof c?.text === "string") chunks.push(c.text);
     }
   }
   if (chunks.length) return chunks.join("\n");

   // 3) 구(舊) 호환: choices[].message.content 형태도 대비
   const choice = data?.choices?.[0];
   if (choice?.message?.content) return String(choice.message.content);

   // 4) 마지막 안전장치: 요약 텍스트/기타 필드 탐색
   if (typeof data?.summary_text === "string") return data.summary_text;

   return "";
 }

function json(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}




