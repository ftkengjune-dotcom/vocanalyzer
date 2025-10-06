export const onRequestGet = () =>
  new Response(JSON.stringify({ ok: true, now: Date.now() }), {
    headers: { "Content-Type": "application/json" }
  });
