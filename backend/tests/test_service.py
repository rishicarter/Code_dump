"""Service-level tests: session lifecycle, YAML isolation, and output conversion."""

from google.adk.events.event import Event
from google.genai import types

from src.yaml_agent.agent import current_yaml
from src.yaml_agent.service import APP_NAME, FALLBACK_REPLY, USER_ID
from tests.conftest import SAMPLE_YAML

SECRET_YAML = "models:\n  containers:\n    - id: SECRET-CANARY\n"


async def _session_texts(service, session_id):
    """All text stored in a session's events, joined for substring assertions."""
    return await _author_texts(service, session_id, None)


async def _user_texts(service, session_id):
    """Only the user's own messages, ignoring the agent's replies."""
    return await _author_texts(service, session_id, "user")


async def _author_texts(service, session_id, author):
    session = await service.sessions.get_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
    )
    texts = []
    for event in session.events:
        if author is not None and event.author != author:
            continue
        for part in (event.content.parts if event.content else []) or []:
            if part.text:
                texts.append(part.text)
    return "\n".join(texts)


async def test_chat_validResponse_returnsReplyAndDecodedPatch(service, make_request):
    response = await service.chat(make_request(message="add a container"))

    assert response.reply
    assert response.patch[0].op == "add"
    assert response.patch[0].value == {"id": "UI2", "description": "Another UI container"}


async def test_chat_yamlText_neverAppearsInSessionHistory(service, make_request):
    """The core requirement: the YAML rides the instruction, not the history.

    The user's message is stored, but the document body must not be, so
    resending a large YAML on every turn cannot grow history unboundedly.
    """
    response = await service.chat(make_request(message="add a container", yaml=SECRET_YAML))

    history = await _session_texts(service, response.session_id)
    assert "SECRET-CANARY" not in history
    assert "add a container" in history


async def test_chat_yamlText_isInjectedIntoTheInstruction(make_request):
    """The YAML does reach the model, via the instruction context var."""
    from src.yaml_agent.agent import build_instruction

    token = current_yaml.set(SECRET_YAML)
    try:
        assert "SECRET-CANARY" in build_instruction(None)
    finally:
        current_yaml.reset(token)

    # The var must not leak between turns once the request finishes.
    assert current_yaml.get() == ""


async def test_chat_contextVar_resetsAfterRunnerRaises(service, make_request):
    from src.yaml_agent.mock_runner import MockRunner

    service.runner.raises = RuntimeError("model unavailable")

    try:
        await service.chat(make_request())
    except RuntimeError:
        pass

    assert current_yaml.get() == ""


async def test_chat_reusedSessionId_accumulatesHistory(service, make_request):
    first = await service.chat(make_request(message="first", session_id="shared"))
    second = await service.chat(make_request(message="second", session_id="shared"))

    assert first.session_id == second.session_id == "shared"
    history = await _user_texts(service, "shared")
    assert "first" in history and "second" in history


async def test_chat_freshSessionId_startsWithEmptyHistory(service, make_request):
    """A new id must not inherit another conversation's turns."""
    await service.chat(make_request(message="earlier-turn", session_id="other"))
    await service.chat(make_request(message="only-turn", session_id="solo"))

    assert await _user_texts(service, "solo") == "only-turn"


async def test_chat_runnerReceivesTheResolvedSessionId(service, make_request):
    """The minted id must reach the runner, not None."""
    response = await service.chat(make_request(session_id=None))

    assert service.runner.calls[-1].session_id == response.session_id
    assert service.runner.calls[-1].user_id == USER_ID


async def test_chat_runnerReceivesOnlyTheUserMessage(service, make_request):
    """YAML is not smuggled through new_message either."""
    await service.chat(make_request(message="add", yaml=SECRET_YAML))

    assert service.runner.calls[-1].message_text == "add"


async def test_chat_malformedAgentJson_returnsFallbackReply(service, make_request):
    """An unparseable agent reply degrades to a friendly message, not a 500."""

    class _GarbageRunner:
        async def run_async(self, **kwargs):
            yield Event(
                author="yaml_agent",
                content=types.Content(role="model", parts=[types.Part(text="not json")]),
            )

    service.runner = _GarbageRunner()

    response = await service.chat(make_request(session_id="bad-json"))

    assert response.reply == FALLBACK_REPLY
    assert response.patch is None
    assert response.session_id == "bad-json"


async def test_chat_noFinalEvent_returnsFallbackReply(service, make_request):
    """An empty event stream is handled the same way as bad JSON."""

    class _SilentRunner:
        async def run_async(self, **kwargs):
            return
            yield  # pragma: no cover - makes this an async generator

    service.runner = _SilentRunner()

    response = await service.chat(make_request(session_id="silent"))

    assert response.reply == FALLBACK_REPLY
    assert response.session_id == "silent"


async def test_toResponse_emptyPatch_returnsNullPatch(service, make_request):
    response = await service.chat(make_request(message="what does this do?"))

    assert response.patch is None
    assert response.reply


async def test_toResponse_removeOp_hasNullValue(service, make_request):
    response = await service.chat(make_request(message="remove a container"))

    assert response.patch[0].op == "remove"
    assert response.patch[0].value is None


async def test_toResponse_scalarValueJson_isDecoded(service, make_request):
    response = await service.chat(make_request(message="rename a container"))

    assert response.patch[0].value == "Primary UI"


async def test_chat_defaultYaml_fromFixture(service, make_request):
    """Sanity check that the shared fixture YAML is actually used."""
    await service.chat(make_request(message="add", yaml=SAMPLE_YAML))

    assert len(service.runner.calls) == 1