import { useState, useRef, useEffect } from "react";
import { describeOp } from "./yamlPatch.js";

const SUGGESTIONS = ["Add a container", "Rename a container", "Remove a container"];
const MAX_COMPOSER_ROWS = 4;
const AGENT_NAME = "Agent";

// A proposed patch, shown inside a message. Nothing changes until "Apply changes".
function PatchCard({ patch, status, onApply, onDiscard, canApply }) {
  return (
    <div className={`patch ${status}`}>
      {patch.map((o, i) => (
        <div key={i} className={`op ${o.op}`}>
          <b>{o.op === "add" ? "+" : o.op === "remove" ? "−" : "~"}</b>
          <code>{describeOp(o)}</code>
        </div>
      ))}
      {status === "pending" ? (
        <div className="actions">
          <button className="primary" onClick={onApply} disabled={!canApply}>Apply changes</button>
          <button className="ghost" onClick={onDiscard}>Discard</button>
        </div>
      ) : (
        <div className="state">{status === "applied" ? "Applied" : "Discarded"}</div>
      )}
    </div>
  );
}

export default function ChatPanel({
  messages, loading, onSend, onApply, onDiscard, onUndo, canUndo, mockMode,
  yamlValid = true,
}) {
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const textRef = useRef(null);

  // A block body, not a concise arrow: React treats an effect's return value as
  // a cleanup function, so returning the scrollIntoView result is a mistake.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = (text) => {
    const t = text.trim();
    // yamlValid is checked here rather than only on the button, because Enter
    // and the quick-action chips both reach submit() without going through
    // canSubmit. One guard covers every entry point.
    if (!t || loading || !yamlValid) return;
    onSend(t);
    setInput("");
  };

  // Grow with the content up to a few lines, then scroll internally. Keeps the
  // transcript visible without the composer eating the pane on long messages.
  const resize = () => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_ROWS * 24 + 2)}px`;
  };

  // Enter sends; Shift+Enter inserts a newline.
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  // Unparseable YAML cannot produce a meaningful patch, so it blocks sending.
  // The composer textarea stays enabled: the user has to be able to fix it.
  const canSubmit = input.trim() !== "" && !loading && yamlValid;

  return (
    <section className="pane chat">
      <header>
        <h2>Ask for a change</h2>
        <div className="header-actions">
          {mockMode && <span className="badge">Mock mode</span>}
          <button className="ghost" onClick={onUndo} disabled={!canUndo}>Undo last apply</button>
        </div>
      </header>

      <div className="quick-actions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => submit(s)} disabled={loading || !yamlValid}>{s}</button>
        ))}
      </div>

      <div className="messages" role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="empty">
            <p>Describe what you want to change in the YAML. You review every change before it is applied.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === "assistant" && <div className="who">{AGENT_NAME}</div>}
            <div className="bubble">
              <p>{m.text}</p>
              {m.patch && (
                <PatchCard patch={m.patch} status={m.status} canApply={yamlValid}
                  onApply={() => onApply(m.id)} onDiscard={() => onDiscard(m.id)} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="msg assistant">
            <div className="who">{AGENT_NAME}</div>
            <div className="bubble"><p className="typing">Thinking…</p></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        {!yamlValid && <p className="composer-warning">Fix the YAML parse error before sending.</p>}
        <textarea
          ref={textRef}
          rows={1}
          value={input}
          placeholder="e.g. Add a container called UI2"
          onChange={(e) => { setInput(e.target.value); resize(); }}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button className="primary" onClick={() => submit(input)} disabled={!canSubmit}>Send</button>
      </div>
    </section>
  );
}
