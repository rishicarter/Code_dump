import { describe, it, expect } from "vitest";
import { validateYaml } from "../yamlValidate.js";

// The UI blocks send/apply purely off this result, so the two things that matter
// are: a clean document reports ok, and a broken one carries a message plus a
// line/column we can point at.
describe("validateYaml", () => {
  it("test_validateYaml_validDocument_reportsOkWithNoErrorDetails", () => {
    const result = validateYaml("models:\n  containers:\n    - id: UI1\n      description: UI\n");
    expect(result).toEqual({ ok: true, message: null, line: null, column: null, lineText: null });
  });

  it("test_validateYaml_badIndentation_reportsTheOffendingLineAndColumn", () => {
    const result = validateYaml("models:\n  containers:\n    - id: UI1\n   description: UI\n");
    expect(result.ok).toBe(false);
    // The library points at line 4, the line whose indentation is wrong.
    expect(result.line).toBe(4);
    expect(result.column).toBe(1);
    expect(result.message).toMatch(/same column/i);
    // linePos is 1-based, so line - 1 must index the actual offending source line.
    expect(result.lineText).toBe("   description: UI");
  });

  it("test_validateYaml_unclosedFlowSequence_reportsTheMessage", () => {
    const result = validateYaml("models: [a, b\n");
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.line).toBe(2);
  });

  it("test_validateYaml_tabIndentation_isRejected", () => {
    const result = validateYaml("models:\n\tcontainers: []\n");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/tab/i);
  });

  it("test_validateYaml_duplicateKey_isTreatedAsAnError", () => {
    // Verified against the installed `yaml` v2: duplicate keys land in .errors,
    // not .warnings, so they do block sending.
    const result = validateYaml("a: 1\na: 2\n");
    expect(result.ok).toBe(false);
    expect(result.line).toBe(2);
  });

  it("test_validateYaml_emptyAndCommentOnly_areBothValid", () => {
    expect(validateYaml("").ok).toBe(true);
    expect(validateYaml("# just a comment\n").ok).toBe(true);
  });

  it("test_validateYaml_nullishInput_isValidRatherThanThrowing", () => {
    expect(validateYaml(undefined).ok).toBe(true);
    expect(validateYaml(null).ok).toBe(true);
  });
  it("test_validateYaml_messageOmitsThePositionTheCardRendersSeparately", () => {
    // The library appends " at line L, column C:" plus a snippet and caret.
    // The card shows position and source line as their own rows, so the message
    // must be trimmed or the tooltip repeats everything twice.
    const result = validateYaml("models:\n  containers:\n    - id: UI1\n   description: UI\n");
    expect(result.ok).toBe(false);
    expect(result.message).not.toMatch(/at line \d+, column \d+:/);
    expect(result.message).not.toContain("^");
    expect(result.message).toMatch(/same column/i);
  });
});
