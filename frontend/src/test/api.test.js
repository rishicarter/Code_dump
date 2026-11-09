import { describe, it, expect, vi, afterEach } from "vitest";
import { sendChat } from "../api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// sendChat is the only network boundary in the browser, so these tests pin the
// request shape and the error behaviour App.handleSend depends on.
describe("sendChat", () => {
  it("test_sendChat_validRequest_postsMessageAndYaml", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "ok", patch: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendChat("add a container", "models: {}");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ message: "add a container", yaml: "models: {}" });
  });

  it("test_sendChat_withSessionId_postsTheSessionId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "ok", patch: null, session_id: "sess-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendChat("add a container", "models: {}", "sess-1");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      message: "add a container",
      yaml: "models: {}",
      session_id: "sess-1",
    });
  });

  it("test_sendChat_successfulResponse_returnsReplyAndPatch", async () => {
    const patch = [{ op: "add", path: "/models/containers/-", value: { id: "UI2" } }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "done", patch }),
    }));

    await expect(sendChat("hi", "a: 1")).resolves.toEqual({ reply: "done", patch });
  });

  it("test_sendChat_responseWithSessionId_isReturnedToCaller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "done", patch: null, session_id: "srv-2" }),
    }));

    await expect(sendChat("hi", "a: 1")).resolves.toEqual({
      reply: "done",
      patch: null,
      session_id: "srv-2",
    });
  });

  it("test_sendChat_serverErrorResponse_throwsWithBffMessage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ reply: "message is required", patch: null }),
    }));

    await expect(sendChat("", "a: 1")).rejects.toThrow("message is required");
  });

  it("test_sendChat_malformedJson_throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token"); },
    }));

    await expect(sendChat("hi", "a: 1")).rejects.toThrow();
  });
});