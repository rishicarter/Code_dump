import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import YamlViewer from "../YamlViewer.jsx";

const BEFORE = `models:
  containers:
    - id: UI1
      description: UI
`;

const AFTER = `models:
  containers:
    - id: UI1
      description: UI
    - id: UI2
      description: Another UI container
`;

// YamlViewer is now an editor: App owns the text and this component reports
// edits through onChange. These tests cover presentation (gutter, error card)
// and that wiring, not state management.
describe("YamlViewer", () => {
  it("test_YamlViewer_rendersOneNumberedRowPerLine", () => {
    render(<YamlViewer text={BEFORE} onChange={vi.fn()} />);
    // 4 real lines plus the trailing-newline filler row.
    expect(document.querySelectorAll(".gutter .no")).toHaveLength(5);
  });

  it("test_YamlViewer_withoutPrevious_marksNoLinesChanged", () => {
    render(<YamlViewer text={BEFORE} onChange={vi.fn()} />);
    expect(document.querySelectorAll(".gutter .no.changed")).toHaveLength(0);
  });

  it("test_YamlViewer_afterAppend_marksOnlyTheNewLinesChanged", () => {
    render(<YamlViewer text={AFTER} previous={BEFORE} onChange={vi.fn()} />);
    const changed = [...document.querySelectorAll(".gutter .no.changed")].map((n) => n.textContent);
    expect(changed).toContain("6");
    expect(changed).not.toContain("4");
  });

  it("test_YamlViewer_identicalText_marksNothingChanged", () => {
    render(<YamlViewer text={BEFORE} previous={BEFORE} onChange={vi.fn()} />);
    expect(document.querySelectorAll(".gutter .no.changed")).toHaveLength(0);
  });

  it("test_YamlViewer_duplicateLineValues_onlyMarksTheEditedOccurrence", () => {
    const prev = "items:\n  - name: x\n  - name: x\n";
    const next = "items:\n  - name: y\n  - name: x\n";
    render(<YamlViewer text={next} previous={prev} onChange={vi.fn()} />);
    const changed = [...document.querySelectorAll(".gutter .no.changed")].map((n) => n.textContent);
    expect(changed).toEqual(["2"]);
  });

  it("test_YamlViewer_showsTheCurrentTextInTheEditor", () => {
    render(<YamlViewer text={BEFORE} onChange={vi.fn()} />);
    // The old assertion was that removed lines are absent from the output. As an
    // editor the component always shows exactly what it was handed.
    expect(screen.getByLabelText("models.yaml")).toHaveValue(BEFORE);
  });

  it("test_YamlViewer_typing_reportsTheNewTextToOnChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<YamlViewer text="a: 1" onChange={onChange} />);
    await user.type(screen.getByLabelText("models.yaml"), "2");
    expect(onChange).toHaveBeenCalledWith("a: 12");
  });

  it("test_YamlViewer_copyButton_copiesTextAndShowsCopied", async () => {
    // userEvent.setup() replaces the clipboard stub from setup.js with its own
    // plain functions, so wrap whatever is installed *after* setup in a spy.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<YamlViewer text={BEFORE} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(BEFORE);
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("test_YamlViewer_rendersLabelForTheDocument", () => {
    render(<YamlViewer text={BEFORE} onChange={vi.fn()} />);
    expect(screen.getByText(/models\.yaml/)).toBeInTheDocument();
  });

  it("test_YamlViewer_invalidYaml_showsTheParseErrorCard", () => {
    render(<YamlViewer text={"models:\n  containers:\n    - id: UI1\n   description: UI\n"} onChange={vi.fn()} />);
    expect(screen.getByText("Parse Error")).toBeInTheDocument();
  });

  it("test_YamlViewer_validYaml_showsNoParseErrorCard", () => {
    render(<YamlViewer text={BEFORE} onChange={vi.fn()} />);
    expect(screen.queryByText("Parse Error")).not.toBeInTheDocument();
  });

  it("test_YamlViewer_parseErrorCard_explainsTheFailureOnHover", () => {
    render(<YamlViewer text={"models:\n\tcontainers: []\n"} onChange={vi.fn()} />);
    const detail = screen.getByRole("tooltip");
    // The card itself only says "Parse Error"; the specifics live in the hover
    // detail, which must name the line, column, and offending source text.
    expect(detail).toHaveTextContent(/tabs are not allowed/i);
    expect(detail).toHaveTextContent("Line 2, Column 1");
    expect(detail).toHaveTextContent("containers: []");
  });

  it("test_YamlViewer_parseErrorCard_isFocusableForKeyboardUsers", () => {
    render(<YamlViewer text={"models: [a, b\n"} onChange={vi.fn()} />);
    expect(screen.getByText("Parse Error").closest(".parse-error")).toHaveAttribute("tabindex", "0");
  });
});