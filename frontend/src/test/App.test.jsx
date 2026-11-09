import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.jsx";
import { sendChat, fetchHealth } from "../api.js";

vi.mock("../api.js", () => ({
  sendChat: vi.fn(),
  fetchHealth: vi.fn(),
}));

const ADD_PATCH = [
  { op: "add", path: "/models/containers/-", value: { id: "UI2", description: "Another UI container" } },
];

// The viewer is an editor now, so the pane's content lives in the textarea value
// rather than in rendered <pre> rows.
const yamlPaneText = () => screen.getByLabelText("models.yaml").value;

// Types into the YAML editor, replacing its whole contents.
const setYaml = async (user, text) => {
  const editor = screen.getByLabelText("models.yaml");
  await user.clear(editor);
  await user.click(editor);
  await user.paste(text);
};

beforeEach(() => {
  vi.mocked(sendChat).mockReset();
  vi.mocked(fetchHealth).mockReset();
  vi.mocked(fetchHealth).mockResolvedValue({ mock: true });
});

// App owns the rule the whole prototype exists for: the YAML pane must not
// change until the user explicitly applies a patch.
describe("App apply flow", () => {
  it("test_App_initialRender_showsOriginalYamlInViewer", () => {
    render(<App />);
    expect(yamlPaneText()).toContain("id: UI1");
  });

  it("test_App_sendsMessageAndCurrentYamlToBackend", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "ok", patch: null, session_id: null });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "remove a container{Enter}");

    await waitFor(() => expect(sendChat).toHaveBeenCalled());
    expect(sendChat).toHaveBeenCalledWith(
      "remove a container",
      expect.stringContaining("id: UI1"),
      null,
    );
  });

  it("test_App_serverMintedSessionId_isStoredAndReusedOnNextTurn", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "ok", patch: null, session_id: "srv-1" });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "first{Enter}");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1));
    // The first turn had no id yet, so none was sent.
    expect(sendChat).toHaveBeenLastCalledWith("first", expect.any(String), null);

    await user.type(screen.getByPlaceholderText(/add a container/i), "second{Enter}");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));
    // The id the server minted is echoed back on the next turn, so the
    // conversation resumes instead of restarting.
    expect(sendChat).toHaveBeenLastCalledWith("second", expect.any(String), "srv-1");
  });

  it("test_App_patchResponse_doesNotChangeYamlUntilApplied", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");

    const apply = await screen.findByRole("button", { name: /apply changes/i });
    expect(apply).toBeInTheDocument();
    expect(yamlPaneText()).not.toContain("UI2");
  });

  it("test_App_applyChanges_updatesYamlPaneAndMarksApplied", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    await user.click(await screen.findByRole("button", { name: /apply changes/i }));

    await waitFor(() => expect(yamlPaneText()).toContain("UI2"));
    const card = screen.getByRole("button", { name: /copy/i }).closest("section").parentElement;
    expect(within(card).queryByRole("button", { name: /apply changes/i })).not.toBeInTheDocument();
  });

  it("test_App_applyChanges_sendsUpdatedYamlOnTheNextRequest", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    await user.click(await screen.findByRole("button", { name: /apply changes/i }));
    await waitFor(() => expect(yamlPaneText()).toContain("UI2"));

    vi.mocked(sendChat).mockResolvedValue({ reply: "done", patch: null });
    await user.type(screen.getByPlaceholderText(/add a container/i), "and rename it{Enter}");

    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));
    expect(sendChat.mock.calls[1][1]).toContain("UI2");
  });

  it("test_App_discardPatch_leavesYamlUnchanged", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    await user.click(await screen.findByRole("button", { name: /discard/i }));

    expect(yamlPaneText()).not.toContain("UI2");
    expect(await screen.findByText(/discarded/i)).toBeInTheDocument();
  });

  it("test_App_undoRestoresYamlFromBeforeTheApply", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    await user.click(await screen.findByRole("button", { name: /apply changes/i }));
    await waitFor(() => expect(yamlPaneText()).toContain("UI2"));

    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(yamlPaneText()).not.toContain("UI2");
    expect(yamlPaneText()).toContain("UI1");
  });

  it("test_App_undoDisabled_whenNothingHasBeenApplied", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
  });

  it("test_App_invalidPatch_isDiscardedWithTheReasonAndYamlUnchanged", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({
      reply: "Renaming.",
      patch: [{ op: "replace", path: "/models/containers/0/missing", value: "x" }],
    });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "rename it{Enter}");
    await user.click(await screen.findByRole("button", { name: /apply changes/i }));

    expect(await screen.findByText(/could not apply/i)).toBeInTheDocument();
    expect(yamlPaneText()).not.toContain("missing");
  });

  it("test_App_backendFailure_showsErrorReplyAndKeepsYamlIntact", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockRejectedValue(new Error("The backend is unavailable. Try again."));
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");

    expect(await screen.findByText(/backend is unavailable/i)).toBeInTheDocument();
    expect(yamlPaneText()).toContain("UI1");
  });

  it("test_App_secondRequestWhileLoading_isIgnored", async () => {
    const user = userEvent.setup();
    let release;
    vi.mocked(sendChat).mockImplementation(() => new Promise((r) => { release = r; }));
    render(<App />);

    const input = screen.getByPlaceholderText(/add a container/i);
    await user.type(input, "add a container{Enter}");
    expect(input).toBeDisabled();

    release({ reply: "ok", patch: null });
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1));
  });

  it("test_App_healthCheck_marksHeaderAsMockMode", async () => {
    render(<App />);
    expect(await screen.findByText(/mock mode/i)).toBeInTheDocument();
  });

  it("test_App_healthCheckLiveBackend_hidesMockBadge", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ mock: false });
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/mock mode/i)).not.toBeInTheDocument());
  });
});

const BROKEN_YAML = "models:\n  containers:\n    - id: UI1\n   description: UI\n";

// The editor is a free-text box, so nothing stops a person from breaking the
// document. These cover the rule that follows: a document that does not parse
// cannot be sent to the model or patched over.
describe("App invalid YAML gating", () => {
  it("test_App_typingInTheEditor_updatesTheYamlPane", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setYaml(user, "models:\n  containers: []\n");
    expect(yamlPaneText()).toBe("models:\n  containers: []\n");
  });

  it("test_App_manuallyEditedYaml_isWhatGetsSentOnTheNextRequest", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "ok", patch: null, session_id: null });
    render(<App />);

    await setYaml(user, "models:\n  containers:\n    - id: EDITED\n");
    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");

    await waitFor(() => expect(sendChat).toHaveBeenCalled());
    // The agent must reason about what the user actually has on screen.
    expect(sendChat.mock.calls[0][1]).toContain("id: EDITED");
  });

  it("test_App_brokenYaml_showsTheParseErrorCard", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setYaml(user, BROKEN_YAML);
    expect(await screen.findByText("Parse Error")).toBeInTheDocument();
  });

  it("test_App_brokenYaml_disablesSendAndTheSuggestionChips", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setYaml(user, BROKEN_YAML);

    await waitFor(() => expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled());
    // A one-click chip must not be a way around the guard.
    for (const label of [/add a container/i, /rename a container/i, /remove a container/i]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
    expect(screen.getByText(/fix the yaml parse error/i)).toBeInTheDocument();
  });

  it("test_App_brokenYaml_blocksTheRequestEvenOnEnter", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setYaml(user, BROKEN_YAML);

    // Enter reaches submit() without going through the disabled button, so the
    // guard has to live in the handler too.
    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("test_App_fixingTheYaml_reEnablesSendingAndClearsTheCard", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "ok", patch: null, session_id: null });
    render(<App />);

    // Send is only ever enabled with a non-empty draft, so type one up front:
    // that isolates the YAML gate as the only thing under test.
    const input = screen.getByPlaceholderText(/add a container/i);
    await user.type(input, "add a container");

    await setYaml(user, BROKEN_YAML);
    await waitFor(() => expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled());

    await setYaml(user, "models:\n  containers:\n    - id: UI1\n      description: UI\n");
    await waitFor(() => expect(screen.getByRole("button", { name: /^send$/i })).toBeEnabled());
    expect(screen.queryByText("Parse Error")).not.toBeInTheDocument();
    expect(screen.queryByText(/fix the yaml parse error/i)).not.toBeInTheDocument();
  });

  it("test_App_brokenYaml_disablesApplyOnAPendingPatch", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    // Get a pending patch while the document is still valid...
    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    const apply = await screen.findByRole("button", { name: /apply changes/i });
    expect(apply).toBeEnabled();

    // ...then break the YAML. Applying now would throw inside applyPatch and
    // report a patch failure, hiding the real cause.
    await setYaml(user, BROKEN_YAML);
    await waitFor(() => expect(apply).toBeDisabled());

    await user.click(apply); // a forced click must not slip through
    expect(yamlPaneText()).toBe(BROKEN_YAML);
    expect(screen.queryByText(/could not apply/i)).not.toBeInTheDocument();
  });

  it("test_App_fixingTheYaml_reEnablesApplyOnAPendingPatch", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    const apply = await screen.findByRole("button", { name: /apply changes/i });

    await setYaml(user, BROKEN_YAML);
    await waitFor(() => expect(apply).toBeDisabled());

    await setYaml(user, "models:\n  containers:\n    - id: UI1\n      description: UI\n");
    await waitFor(() => expect(apply).toBeEnabled());
    await user.click(apply);
    await waitFor(() => expect(yamlPaneText()).toContain("UI2"));
  });

  it("test_App_undoStillOnlyReversesAppliedPatches_notManualEdits", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockResolvedValue({ reply: "Adding a container.", patch: ADD_PATCH });
    render(<App />);

    await user.type(screen.getByPlaceholderText(/add a container/i), "add a container{Enter}");
    await user.click(await screen.findByRole("button", { name: /apply changes/i }));
    await waitFor(() => expect(yamlPaneText()).toContain("UI2"));

    // A manual edit is not snapshotted, so Undo restores the pre-apply document
    // rather than the text the user just typed.
    await setYaml(user, "models:\n  containers: []\n");
    await user.click(screen.getByRole("button", { name: /undo/i }));
    expect(yamlPaneText()).toContain("id: UI1");
  });
});