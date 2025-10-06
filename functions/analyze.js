// functions/analyze.js
export const onRequestPost = async ({ request, env }) => {
  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({
      error: "server misconfig: missing OPENAI_API_KEY"
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

export const onRequestOptions = async ({ request }) =>
  new Response(null, { headers: corsHeaders(request) });

export const onRequestPost = async ({ request, env }) => {
  try {
    const { word } = await request.json();
    if (!word || typeof word !== "string") {
      return json({ error: "word is required" }, 400, request);
    }

    const payload = {
      model: "gpt-5-mini",
      input: [
        { role: "system", content: "You are a precise English morphology & etymology tutor. Return strict JSON only." },
        { role: "user", content:
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
- Output JSON only (no code fences).` },
        { role: "user", content: String(word).trim() }
      ],
      temperature: 0.2,
      max_output_tokens: 600
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text().catch(()=>"");
      return json({ error: "OpenAI error", detail }, 502, request);
    }

    const data = await r.json();
    const textOut =
      data?.output?.[0]?.content?.[0]?.text ??
      data?.choices?.[0]?.message?.content ?? "";

    const raw = String(textOut).replace(/^```json|```$/g, "").trim();

    // 항상 JSON으로 응답되도록 시도
    let obj;
    try { obj = JSON.parse(raw); } catch { obj = { raw, error: "Model did not return strict JSON" }; }
    return json(obj, 200, request);

  } catch (e) {
    return json({ error: e?.message || "server error" }, 500, request);
  }
};

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
