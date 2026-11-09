import { useState, useEffect, useMemo } from "react";
import ChatPanel from "./ChatPanel.jsx";
import YamlViewer from "./YamlViewer.jsx";
import { sendChat, fetchHealth } from "./api.js";
import { applyPatch } from "./yamlPatch.js";
import { validateYaml } from "./yamlValidate.js";

const INITIAL_YAML = `models:
  containers:
    - id: UI1
      description: UI
`;

// How many applies can be undone. Bounded so a long session cannot grow the
// stack without limit; the oldest entry falls off the end.
const UNDO_LIMIT = 20;

// The conversation id lives in sessionStorage so a page reload can resume the
// same conversation. null means "not started yet": the server mints the id and
// we store whatever it hands back.
const SESSION_ID_KEY = "yaml-agent-session-id";

function readStoredSessionId() {
  try {
    return window.sessionStorage.getItem(SESSION_ID_KEY);
  } catch {
    // Private browsing modes can make sessionStorage throw on access.
    return null;
  }
}

function storeSessionId(sessionId) {
  try {
    if (sessionId) window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  } catch {
    // Losing persistence is survivable: we simply start a new conversation.
  }
}

export default function App() {
  const [yamlText, setYamlText] = useState(INITIAL_YAML);
  const [history, setHistory] = useState([]); // stack of YAML snapshots, newest last
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mockMode, setMockMode] = useState(true);
  const [sessionId, setSessionId] = useState(readStoredSessionId);

  // The most recent snapshot is what the viewer highlights against.
  const previousYaml = history.length ? history[history.length - 1] : null;

  // Reparsing on every keystroke is fine at document sizes a person will paste,
  // and useMemo keeps it to once per edit rather than once per rendered child.
  const yamlState = useMemo(() => validateYaml(yamlText), [yamlText]);
  const yamlValid = yamlState.ok;

  useEffect(() => {
    fetchHealth()
      .then((h) => setMockMode(Boolean(h.mock)))
      .catch(() => setMockMode(true)); // unreachable BFF: assume mock, badges are cosmetic
  }, []);

  const patchMessage = (id, changes) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...changes } : m)));

  async function handleSend(text) {
    // Sending unparseable YAML can only produce a confusing patch, so the send
    // button is disabled upstream; this guards the quick-action path too.
    if (!yamlValid) return;
    setMessages((ms) => [...ms, { id: crypto.randomUUID(), role: "user", text }]);
    setLoading(true);
    try {
      const { reply, patch, session_id } = await sendChat(text, yamlText, sessionId);
      // The server may mint the id on our behalf, so adopt whatever it returns.
      if (session_id && session_id !== sessionId) {
        setSessionId(session_id);
        storeSessionId(session_id);
      }
      setMessages((ms) => [...ms, {
        id: crypto.randomUUID(), role: "assistant", text: reply,
        patch: patch ?? null, status: patch ? "pending" : null,
      }]);
    } catch (err) {
      setMessages((ms) => [...ms, {
        id: crypto.randomUUID(), role: "assistant",
        text: err.message || "Could not reach the server.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  // The YAML only changes here, when the user clicks "Apply changes" or types.
  function handleApply(id) {
    const msg = messages.find((m) => m.id === id);
    // Safety net only: ChatPanel disables the button while the YAML is broken,
    // so this should be unreachable. Returning keeps a stuck document from
    // being written over, and leaves the pending patch intact to retry.
    if (!yamlValid) return;
    try {
      const next = applyPatch(yamlText, msg.patch);
      setHistory((h) => [...h, yamlText].slice(-UNDO_LIMIT));
      setYamlText(next);
      patchMessage(id, { status: "applied" });
    } catch (e) {
      patchMessage(id, { status: "discarded", text: `${msg.text} (Could not apply: ${e.message})` });
    }
  }

  function handleUndo() {
    setHistory((h) => {
      if (!h.length) return h;
      setYamlText(h[h.length - 1]); // eslint-disable-line react-hooks/exhaustive-deps
      return h.slice(0, -1);
    });
  }

  return (
    <main className="app">
      <ChatPanel messages={messages} loading={loading} onSend={handleSend}
        onApply={handleApply} onDiscard={(id) => patchMessage(id, { status: "discarded" })}
        onUndo={handleUndo} canUndo={history.length > 0} mockMode={mockMode}
        yamlValid={yamlValid} />
      <YamlViewer text={yamlText} previous={previousYaml} onChange={setYamlText} />
    </main>
  );
}
