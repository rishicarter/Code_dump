// All backend calls live here. The browser only talks to the BFF.
export async function sendChat(message, yaml, sessionId) {
  // Omit session_id entirely when we have none: the server mints one and sends
  // it back, which is how a new conversation gets started.
  const payload = { message, yaml };
  if (sessionId != null) payload.session_id = sessionId;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // A non-2xx body still carries a human-readable `reply`, so prefer it over a
  // bare status code. Parsing can itself fail, hence the nested guard.
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.reply || `Request failed with status ${res.status}`);
  }
  // A 2xx with an unparseable body would otherwise resolve to null and crash
  // the caller on destructuring, so treat it as a transport failure.
  if (!body) throw new Error("The server returned an unreadable response.");
  return body; // { reply: string, patch: Op[] | null, session_id: string | null }
}

// Lets the chat header show whether responses are mock or really come from FastAPI.
export async function fetchHealth() {
  const res = await fetch("/api/health");
  if (!res.ok) return { mock: true };
  return res.json();
}
