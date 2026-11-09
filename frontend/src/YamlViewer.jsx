import { useState, useRef } from "react";
import { validateYaml } from "./yamlValidate.js";

// Splits YAML into comparable lines, dropping the single trailing empty entry
// that every newline-terminated document ends with. Diffing that phantom line
// makes a pure deletion look like a change, so it is excluded. Popping only the
// last element keeps every other index aligned with the rendered rows.
function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// LCS table walk. Comparing line *strings* (the old set-difference approach)
// both misses real edits and falsely highlights repeated lines such as "- name: x".
// A longest-common-subsequence diff marks exactly the lines that changed.
function changedIndices(before, after) {
  const rows = before.length;
  const cols = after.length;

  // lcs[i][j] = length of the longest common subsequence of before[i:] and after[j:]
  const lcs = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const changed = new Set();
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] > lcs[i][j + 1]) {
      // Unambiguously an insertion into the new text.
      changed.add(j);
      j++;
    } else {
      // Either a substitution, or an ambiguous tie. Consuming the old line keeps
      // a following identical line matched instead of reporting a false insert.
      changed.add(j);
      i++;
      j++;
    }
  }
  // Anything left over in the new text is also new.
  for (; j < cols; j++) changed.add(j);
  return changed;
}

// Editable YAML with line numbers. Lines that changed since the last apply are
// marked in the gutter; App owns the text so apply, undo, and chat all read the
// same value this editor writes.
export default function YamlViewer({ text, previous, onChange }) {
  const [copied, setCopied] = useState(false);
  const gutterRef = useRef(null);
  const lines = splitLines(text);
  const parsed = validateYaml(text);

  // An always-on textarea has no per-row highlight, so a line that changed
  // since the last apply is marked only by its gutter number.
  const changed = previous === null || previous === undefined
    ? new Set()
    : changedIndices(splitLines(previous), lines);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // The gutter never scrolls on its own (overflow: hidden), so mirroring the
  // textarea's offset one way cannot feed back into itself.
  const syncScroll = (e) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  return (
    <section className="pane yaml">
      <header>
        <h2>models.yaml</h2>
        {!parsed.ok && (
          <span className="parse-error" tabIndex={0}>
            Parse Error
            <span className="parse-error-detail" role="tooltip">
              <span className="parse-error-message">{parsed.message}</span>
              {parsed.line !== null && (
                <span className="parse-error-where">
                  Line {parsed.line}, Column {parsed.column}
                </span>
              )}
              {parsed.lineText !== null && (
                <code className="parse-error-line">{parsed.lineText}</code>
              )}
            </span>
          </span>
        )}
        <button className="ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </header>
      <div className="body">
        <div className="gutter" ref={gutterRef} aria-hidden="true">
          {lines.map((_, i) => (
            <span key={i} className={changed.has(i) ? "no changed" : "no"}>{i + 1}</span>
          ))}
          {/* A trailing newline still occupies a row, so pad the gutter to match. */}
          <span className="no filler">&nbsp;</span>
        </div>
        <textarea
          className="yaml-input"
          value={text}
          spellCheck={false}
          aria-label="models.yaml"
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
        />
      </div>
    </section>
  );
}
