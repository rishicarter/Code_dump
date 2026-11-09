import YAML from "yaml";

// The result shape is fixed either way so callers never branch on undefined.
const CLEAN = { ok: true, message: null, line: null, column: null, lineText: null };

// The library's message ends with " at line L, column C:" followed by the source
// snippet and a caret. The card renders the position and the offending line as
// separate fields, so leaving them in would show everything twice.
function trimMessage(message) {
  return message
    .split(/ at line \d+, column \d+:/)[0]
    .trim();
}

// Turns a YAML parse failure into the bits the UI shows: the library's message,
// the 1-based line/column, and the offending source line so the tooltip can
// quote it back. Returns CLEAN for anything that parses, including "" and "# comment".
export function validateYaml(text) {
  let doc;
  try {
    // parseDocument is lazy but reading .errors forces the parse to run.
    doc = YAML.parseDocument(text ?? "");
  } catch (e) {
    // parseDocument normally reports problems in .errors instead of throwing.
    // If it ever does throw, the document is still unusable, so surface it
    // rather than reporting the text as valid.
    return { ok: false, message: e.message, line: null, column: null, lineText: null };
  }

  // Warnings (duplicate keys, for example) are advisory. Only errors block editing flows.
  const err = doc.errors?.[0];
  if (!err) return CLEAN;

  const pos = err.linePos?.[0];
  const line = pos?.line ?? null;
  const column = pos?.col ?? null;

  // linePos is 1-based, so line - 1 indexes directly into the source lines.
  let lineText = null;
  if (line) {
    const source = (text ?? "").split("\n")[line - 1];
    lineText = source === undefined ? null : source;
  }

  return { ok: false, message: trimMessage(err.message), line, column, lineText };
}