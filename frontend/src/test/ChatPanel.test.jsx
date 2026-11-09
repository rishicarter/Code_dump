import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPanel from "../ChatPanel.jsx";

const patch = [{ op: "add", path: "/models/containers/-", value: { id: "UI2" } }];

function renderPanel(overrides = {}) {
  const props = {
    messages: [],
    loading: false,
    onSend: vi.fn(),
    onApply: vi.fn(),
    onDiscard: vi.fn(),
    onUndo: vi.fn(),
    canUndo: false,
    mockMode: true,
    ...overrides,
  };
  return { props, user: userEvent.setup(), ...render(<ChatPanel {...props} />) };
}

// ChatPanel is the turn-based transcript: the user bubble on the right, the
// agent reply plus its patch card on the left.
describe("ChatPanel", () => {
  it("test_ChatPanel_emptyState_showsSuggestionsAndComposer", () => {
    renderPanel();
    expect(screen.getByPlaceholderText(/add a container/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rename a container/i })).toBeInTheDocument();
  });

  it("test_ChatPanel_suggestionChipClick_sendsThatMessage", async () => {
    const { props, user } = renderPanel();
    await user.click(screen.getByRole("button", { name: /add a container/i }));
    expect(props.onSend).toHaveBeenCalledWith("Add a container");
  });

  it("test_ChatPanel_typingAndEnter_sendsTrimmedMessage", async () => {
    const { props, user } = renderPanel();
    const input = screen.getByPlaceholderText(/add a container/i);
    await user.type(input, "  add a container called UI2  {Enter}");
    expect(props.onSend).toHaveBeenCalledWith("add a container called UI2");
  });

  it("test_ChatPanel_emptyInput_disablesSendButton", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("test_ChatPanel_whitespaceOnlyInput_disablesSendButton", async () => {
    const { user } = renderPanel();
    await user.type(screen.getByPlaceholderText(/add a container/i), "   ");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("test_ChatPanel_whileLoading_disablesComposer", () => {
    renderPanel({ loading: true });
    expect(screen.getByPlaceholderText(/add a container/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("test_ChatPanel_whileLoading_showsThinkingIndicator", () => {
    renderPanel({ loading: true });
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("test_ChatPanel_userMessage_rendersInUserBubble", () => {
    renderPanel({ messages: [{ id: "1", role: "user", text: "add a container" }] });
    const bubble = screen.getByText("add a container").closest(".msg");
    expect(bubble).toHaveClass("user");
  });

  it("test_ChatPanel_assistantMessage_rendersInAssistantBubble", () => {
    renderPanel({ messages: [{ id: "1", role: "assistant", text: "Here you go" }] });
    expect(screen.getByText("Here you go").closest(".msg")).toHaveClass("assistant");
  });

  it("test_ChatPanel_pendingPatch_showsApplyAndDiscard", () => {
    renderPanel({
      messages: [{ id: "1", role: "assistant", text: "ok", patch, status: "pending" }],
    });
    expect(screen.getByRole("button", { name: /apply changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("test_ChatPanel_applyClick_callsOnApplyWithMessageId", async () => {
    const { props, user } = renderPanel({
      messages: [{ id: "msg-7", role: "assistant", text: "ok", patch, status: "pending" }],
    });
    await user.click(screen.getByRole("button", { name: /apply changes/i }));
    expect(props.onApply).toHaveBeenCalledWith("msg-7");
  });

  it("test_ChatPanel_discardClick_callsOnDiscardWithMessageId", async () => {
    const { props, user } = renderPanel({
      messages: [{ id: "msg-7", role: "assistant", text: "ok", patch, status: "pending" }],
    });
    await user.click(screen.getByRole("button", { name: /discard/i }));
    expect(props.onDiscard).toHaveBeenCalledWith("msg-7");
  });

  it("test_ChatPanel_appliedPatch_showsAppliedStateAndNoButtons", () => {
    renderPanel({
      messages: [{ id: "1", role: "assistant", text: "ok", patch, status: "applied" }],
    });
    expect(screen.getByText(/applied/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply changes/i })).not.toBeInTheDocument();
  });

  it("test_ChatPanel_discardedPatch_showsDiscardedState", () => {
    renderPanel({
      messages: [{ id: "1", role: "assistant", text: "nope", patch, status: "discarded" }],
    });
    expect(screen.getByText(/discarded/i)).toBeInTheDocument();
  });

  it("test_ChatPanel_patchOps_showHumanReadableDescription", () => {
    renderPanel({
      messages: [{ id: "1", role: "assistant", text: "ok", patch, status: "pending" }],
    });
    expect(screen.getByText(/add \/models\/containers\/-/)).toBeInTheDocument();
  });

  it("test_ChatPanel_noUndoAvailable_disablesUndoButton", () => {
    renderPanel({ canUndo: false });
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
  });

  it("test_ChatPanel_undoAvailable_enablesUndoButton", async () => {
    const { props, user } = renderPanel({ canUndo: true });
    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(props.onUndo).toHaveBeenCalled();
  });

  it("test_ChatPanel_transcriptRegion_exposesLivePoliteSemantics", () => {
    renderPanel();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
  });

  it("test_ChatPanel_mockMode_showsMockBadge", () => {
    renderPanel({ mockMode: true });
    expect(screen.getByText(/mock mode/i)).toBeInTheDocument();
  });

  it("test_ChatPanel_liveMode_hidesMockBadge", () => {
    renderPanel({ mockMode: false });
    expect(screen.queryByText(/mock mode/i)).not.toBeInTheDocument();
  });
});

// yamlValid=false means the document in the viewer does not parse. Sending it
// could only produce a meaningless patch, so every entry point into submit() is
// closed. The composer stays open so the user can go and fix it.
describe("ChatPanel invalid YAML", () => {
  const pendingPatch = [{
    id: "m1", role: "assistant", text: "Adding.", patch, status: "pending",
  }];

  it("test_ChatPanel_invalidYaml_disablesSendButKeepsTheComposerEditable", async () => {
    const { user } = renderPanel({ yamlValid: false });
    await user.type(screen.getByPlaceholderText(/add a container/i), "hello");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(screen.getByPlaceholderText(/add a container/i)).toBeEnabled();
  });

  it("test_ChatPanel_invalidYaml_disablesEverySuggestionChip", () => {
    renderPanel({ yamlValid: false });
    for (const label of [/add a container/i, /rename a container/i, /remove a container/i]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  it("test_ChatPanel_invalidYaml_showsTheHint", () => {
    renderPanel({ yamlValid: false });
    expect(screen.getByText(/fix the yaml parse error/i)).toBeInTheDocument();
  });

  it("test_ChatPanel_validYaml_showsNoHint", () => {
    renderPanel({ yamlValid: true });
    expect(screen.queryByText(/fix the yaml parse error/i)).not.toBeInTheDocument();
  });

  it("test_ChatPanel_invalidYaml_enterKeyDoesNotSend", async () => {
    const { props, user } = renderPanel({ yamlValid: false });
    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("test_ChatPanel_invalidYaml_disablesApplyOnAPendingPatch", () => {
    renderPanel({ yamlValid: false, messages: pendingPatch });
    expect(screen.getByRole("button", { name: /apply changes/i })).toBeDisabled();
  });

  it("test_ChatPanel_validYaml_leavesApplyEnabled", () => {
    renderPanel({ yamlValid: true, messages: pendingPatch });
    expect(screen.getByRole("button", { name: /apply changes/i })).toBeEnabled();
  });

  it("test_ChatPanel_invalidYaml_stillAllowsDiscardingAPatch", () => {
    // Discarding is always safe: it only drops the proposal.
    renderPanel({ yamlValid: false, messages: pendingPatch });
    expect(screen.getByRole("button", { name: /discard/i })).toBeEnabled();
  });

  it("test_ChatPanel_yamlValidDefaultsToTrue_whenNotProvided", () => {
    // App always passes the prop, but the default keeps the panel usable alone.
    renderPanel();
    expect(screen.getByRole("button", { name: /add a container/i })).toBeEnabled();
  });
});