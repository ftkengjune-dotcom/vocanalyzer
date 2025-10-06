// functions/analyze.js
export const onRequestOptions = async ({ request }) =>
  new Response(null, { headers: corsHeaders(request) });

export const onRequestPost = async ({ request, env }) => {
  // 1) 키 가드
  const apiKey = (env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return json({ error: "server misconfig: missing OPENAI_API_KEY" }, 500, request);
  }

  try {
    // 2) 입력 검증
    const { word } = await request.json().catch(() => ({}));
    if (!word || typeof word !== "string") {
      return json({ error: "word is required" }, 400, request);
    }

    // 3) OpenAI Responses API 호출 (JSON 모드 on)
    const payload = {
      model: "gpt-5-mini", // 필요시 gpt-5로
      input: [
        {
          role: "system",
          content: [
            { type: "text", text: "You are a precise English morphology & etymology tutor. Return strict JSON only." }
          ]
        },
        {
          role: "user",
          content: [
            { type: "text", text:
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
- Output JSON only (no code fences).` }
          ]
        },
        {
          role: "user",
          content: [{ type: "text", text: String(word).trim() }]
        }
      ],
      // ❗ JSON 모드: Responses API는 text.format으로 설정
      text: { format: { type: "json_object" } },
      // Reasoning 모델은 temperature 미지원이니 생략
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

    // 4) 출력 텍스트 안전 추출 (여러 형태 대비)
    const textOut = extractText(data).trim();
    let obj;
    try { obj = JSON.parse(textOut); }
    catch {
      // JSON 모드인데도 실패하면 원문을 보여줌
      obj = { raw: textOut, error: "Model did not return strict JSON" };
    }

    return json(obj, 200, request);

  } catch (e) {
    return json({ error: e?.message || "server error" }, 500, request);
  }
};

function extractText(data) {
  // 1) 편의 필드(output_text)가 있으면 우선
  if (data?.output_text) {
    if (Array.isArray(data.output_text)) return data.output_text.join("\n");
    return String(data.output_text);
  }
  // 2) 표준 구조에서 content 배열의 text 모으기
  const chunks = [];
  const outputs = Array.isArray(data?.output) ? data.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n");
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
