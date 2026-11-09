import YAML from "yaml";

// The only three mutations the FastAPI service is allowed to request.
const SUPPORTED_OPS = ["add", "replace", "remove"];

// Splits a JSON pointer into its segments, undoing the RFC 6901 escaping that
// lets a key contain "/" ("~1") or "~" ("~0"). Splitting before unescaping is
// what stops "b~1c" from being torn apart at the escaped slash.
function pointerSegments(path) {
  return path.split("/").filter(Boolean).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

// Walks to the container that holds the final key, so the caller can mutate it.
function resolveParent(doc, keys) {
  let parent = doc;
  for (const key of keys) {
    if (parent === null || typeof parent !== "object") {
      throw new Error(`Patch path does not exist: ${keys.join("/")}`);
    }
    parent = parent[key];
  }
  if (parent === null || typeof parent !== "object") {
    throw new Error(`Patch path does not exist: ${keys.join("/")}`);
  }
  return parent;
}

// "-" appends; anything else must be a real, in-range index. Without the range
// check, splice(NaN) silently targets index 0 and a bad patch would corrupt the
// document while reporting success.
function toArrayIndex(segment, length) {
  if (segment === "-") return length;
  const index = Number(segment);
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new Error(`Invalid array index: "${segment}"`);
  }
  return index;
}

// Applies a list of { op, path, value } to YAML text and returns new YAML text.
// path is a JSON pointer: "/models/containers/-" ("-" = append to list).
// Throws on a malformed operation so the UI can discard the patch and tell the
// user why, rather than silently applying half of it.
export function applyPatch(yamlText, ops) {
  const doc = YAML.parse(yamlText) ?? {};

  for (const { op, path, value } of ops) {
    if (!SUPPORTED_OPS.includes(op)) {
      throw new Error(`Unsupported op: "${op}"`);
    }

    const keys = pointerSegments(path);
    const last = keys.pop();
    if (last === undefined) throw new Error(`Patch path is empty: "${path}"`);

    const parent = resolveParent(doc, keys);

    if (Array.isArray(parent)) {
      const index = toArrayIndex(last, parent.length);
      if (op === "add") parent.splice(index, 0, value);
      if (op === "replace") parent[index] = value;
      if (op === "remove") parent.splice(index, 1);
    } else {
      if (op === "remove") {
        if (!(last in parent)) throw new Error(`Cannot remove missing key: "${path}"`);
        delete parent[last];
        continue;
      }
      // "replace" targets an existing key; "add" creates or overwrites one.
      if (op === "replace" && !(last in parent)) {
        throw new Error(`Cannot replace missing key: "${path}"`);
      }
      parent[last] = value;
    }
  }
  return YAML.stringify(doc);
}

// One-line human description of an op, used in the change card.
export const describeOp = ({ op, path, value }) =>
  `${op} ${path}` + (value !== undefined ? `  ${JSON.stringify(value)}` : "");
