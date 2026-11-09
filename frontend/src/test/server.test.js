import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import axios from "axios";
import { createServer } from "../../server.js";

vi.mock("axios");

const mockApp = () => createServer({ mockMode: true, fastapiUrl: "http://fastapi.test" });
const liveApp = () => createServer({ mockMode: false, fastapiUrl: "http://fastapi.test" });

beforeEach(() => {
  vi.mocked(axios.post).mockReset();
});

// The BFF is the only place the FastAPI contract is expressed, so these tests
// pin the request it sends upstream and the response shape it hands the browser.
describe("POST /api/chat in mock mode", () => {
  it("test_chatMock_addRequest_returnsAddPatch", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ message: "add a container", yaml: "a: 1" });
    expect(res.status).toBe(200);
    expect(res.body.patch).toEqual([
      { op: "add", path: "/models/containers/-", value: { id: "UI2", description: "Another UI container" } },
    ]);
  });

  it("test_chatMock_removeRequest_returnsRemovePatch", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ message: "remove a container", yaml: "a: 1" });
    expect(res.body.patch).toEqual([{ op: "remove", path: "/models/containers/0" }]);
  });

  it("test_chatMock_renameRequest_returnsReplacePatch", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ message: "rename the container", yaml: "a: 1" });
    expect(res.body.patch[0].op).toBe("replace");
  });

  it("test_chatMock_unrecognisedRequest_returnsNullPatchWithGuidance", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ message: "hello", yaml: "a: 1" });
    expect(res.body.patch).toBeNull();
    expect(res.body.reply).toMatch(/add a container/i);
  });
});

describe("POST /api/chat validation", () => {
  it("test_chat_missingMessage_returns400", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ yaml: "a: 1" });
    expect(res.status).toBe(400);
    expect(res.body.reply).toMatch(/message/i);
  });

  it("test_chat_blankMessage_returns400", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ message: "   ", yaml: "a: 1" });
    expect(res.status).toBe(400);
  });

  it("test_chat_missingYaml_returns400", async () => {
    const res = await request(mockApp()).post("/api/chat").send({ message: "add" });
    expect(res.status).toBe(400);
    expect(res.body.reply).toMatch(/yaml/i);
  });

  it("test_chat_invalidRequest_doesNotCallFastapi", async () => {
    await request(liveApp()).post("/api/chat").send({ message: "add" });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat against FastAPI", () => {
  it("test_chat_liveMode_forwardsMessageAndYamlUpstream", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { reply: "done", patch: null } });
    await request(liveApp()).post("/api/chat").send({ message: "add", yaml: "a: 1" });
    expect(axios.post).toHaveBeenCalledWith(
      "http://fastapi.test/chat",
      { message: "add", yaml: "a: 1" },
      expect.anything(),
    );
  });

  it("test_chat_liveMode_forwardsSessionIdWhenProvided", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { reply: "done", patch: null } });
    await request(liveApp())
      .post("/api/chat")
      .send({ message: "add", yaml: "a: 1", session_id: "sess-7" });
    expect(axios.post).toHaveBeenCalledWith(
      "http://fastapi.test/chat",
      { message: "add", yaml: "a: 1", session_id: "sess-7" },
      expect.anything(),
    );
  });

  it("test_chat_liveMode_omitsSessionIdWhenAbsent", async () => {
    // Sending session_id: null would be rejected by FastAPI's optional field
    // expectations and would stop the server minting a fresh id.
    vi.mocked(axios.post).mockResolvedValue({ data: { reply: "done", patch: null } });
    await request(liveApp()).post("/api/chat").send({ message: "add", yaml: "a: 1" });
    expect(axios.post.mock.calls[0][1]).not.toHaveProperty("session_id");
  });

  it("test_chat_liveMode_passesThroughSessionIdFromUpstream", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { reply: "ok", patch: null, session_id: "srv-9" } });
    const res = await request(liveApp()).post("/api/chat").send({ message: "add", yaml: "a: 1" });
    expect(res.body.session_id).toBe("srv-9");
  });

  it("test_chat_liveMode_passesThroughPatchFromUpstream", async () => {
    const patch = [{ op: "add", path: "/models/containers/-", value: { id: "UI9" } }];
    vi.mocked(axios.post).mockResolvedValue({ data: { reply: "ok", patch, session_id: "s1" } });
    const res = await request(liveApp()).post("/api/chat").send({ message: "add", yaml: "a: 1" });
    expect(res.body).toEqual({ reply: "ok", patch, session_id: "s1" });
  });

  it("test_chat_liveMode_upstreamWithoutPatch_normalisesToNull", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { reply: "ok" } });
    const res = await request(liveApp()).post("/api/chat").send({ message: "add", yaml: "a: 1" });
    expect(res.body.patch).toBeNull();
  });

  it("test_chat_upstreamUnavailable_returns502", async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await request(liveApp()).post("/api/chat").send({ message: "add", yaml: "a: 1" });
    expect(res.status).toBe(502);
    expect(res.body.patch).toBeNull();
  });

  it("test_chat_nonStringSessionId_returns400", async () => {
    const res = await request(liveApp())
      .post("/api/chat")
      .send({ message: "add", yaml: "a: 1", session_id: 42 });
    expect(res.status).toBe(400);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("GET /api/health", () => {
  it("test_health_mockMode_reportsMockTrue", async () => {
    const res = await request(mockApp()).get("/api/health");
    expect(res.body).toEqual({ mock: true, fastapiUrl: "http://fastapi.test" });
  });

  it("test_health_liveMode_reportsMockFalse", async () => {
    const res = await request(liveApp()).get("/api/health");
    expect(res.body.mock).toBe(false);
  });
});