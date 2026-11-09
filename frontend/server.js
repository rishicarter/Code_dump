import express from "express";
import cors from "cors";
import axios from "axios";
import { pathToFileURL } from "node:url";

// Simulated round-trip so the UI's loading state is exercised in mock mode.
const MOCK_LATENCY_MS = 600;

// A factory rather than a bare app so tests can spin up an instance with a
// chosen mock mode / upstream without binding a real port.
export function createServer({ mockMode, fastapiUrl }) {
  // Mock mode still hands out a session id so the UI can be developed against
  // mocks without diverging from the real backend's behaviour.
  const mockSessionId = "mock-session";
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ---- Mock: picks a response based on keywords in the message ----
  function mockResponse(message) {
    const m = message.toLowerCase();
    if (m.includes("add")) {
      return {
        reply: "I can add a new container. Review the change below, then apply it.",
        patch: [{ op: "add", path: "/models/containers/-",
                  value: { id: "UI2", description: "Another UI container" } }],
      };
    }
    if (m.includes("remove") || m.includes("delete")) {
      return {
        reply: "I can remove the first container.",
        patch: [{ op: "remove", path: "/models/containers/0" }],
      };
    }
    if (m.includes("replace") || m.includes("rename") || m.includes("change")) {
      return {
        reply: "I can update the description of the first container.",
        patch: [{ op: "replace", path: "/models/containers/0/description", value: "Updated description" }],
      };
    }
    return { reply: "Try: “add a container”, “remove a container” or “rename a container”.", patch: null };
  }

  // Rejects a malformed request before it reaches FastAPI, so a bad payload fails
  // with an actionable 400 here rather than an opaque 502 from the upstream call.
  function validateRequest(body) {
    const { message, yaml } = body ?? {};
    if (typeof message !== "string" || message.trim() === "") {
      return "message must be a non-empty string.";
    }
    if (typeof yaml !== "string") {
      return "yaml must be a string.";
    }
    // session_id is optional: omit it to start fresh, the backend mints one and
    // returns it so the next turn can resume the same conversation.
    if (body.session_id != null && typeof body.session_id !== "string") {
      return "session_id must be a string.";
    }
    return null;
  }

  app.get("/api/health", (req, res) => {
    res.json({ mock: mockMode, fastapiUrl });
  });

  app.post("/api/chat", async (req, res) => {
    const { message, yaml, session_id } = req.body ?? {};

    const invalid = validateRequest(req.body);
    if (invalid) {
      return res.status(400).json({ reply: invalid, patch: null });
    }

    try {
      if (mockMode) {
        await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS)); // fake latency
        return res.json({ ...mockResponse(message), session_id: session_id ?? mockSessionId });
      }
      // CONTRACT: change the path / body / response mapping to match FastAPI
      const payload = { message, yaml };
      if (session_id != null) payload.session_id = session_id;
      const { data } = await axios.post(`${fastapiUrl}/chat`, payload, { timeout: 30_000 });
      // Prefer the server's id: it mints one when we did not send any.
      res.json({ reply: data.reply, patch: data.patch ?? null, session_id: data.session_id ?? session_id ?? null });
    } catch (err) {
      console.error(`[bff] "${message}" failed:`, err.message);
      res.status(502).json({ reply: "The backend is unavailable. Try again.", patch: null });
    }
  });

  return app;
}

// Only listen when run directly, so importing this module in a test is inert.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT || 3001;
  createServer({
    mockMode: process.env.MOCK_MODE !== "false", // flip to false when FastAPI is ready
    fastapiUrl: process.env.FASTAPI_URL || "http://localhost:8000",
  }).listen(port, () => console.log(`BFF on :${port} (mock=${process.env.MOCK_MODE !== "false"})`));
}
