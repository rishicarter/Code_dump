"""Tests for MockRunner: it must behave like the real Runner where it is used."""

import asyncio

import pytest
from google.genai import types

from src.yaml_agent.mock_runner import MockRunner, build_mock_output
from src.yaml_agent.schema import LlmOutput


def _collect(runner, session_id="s1", text="hello"):
    """Drain run_async and return every event it produced."""

    async def _run():
        return [
            event
            async for event in runner.run_async(
                user_id="u1",
                session_id=session_id,
                new_message=types.Content(role="user", parts=[types.Part(text=text)]),
            )
        ]

    return asyncio.run(_run())


def test_mockRunner_keywordArgumentSignature_isAcceptedByService():
    """The service calls run_async with keyword args only, like the real Runner."""

    async def _run():
        async for _ in runner.run_async(
            user_id="u1",
            session_id="s1",
            new_message=types.Content(role="user", parts=[types.Part(text="add")]),
            invocation_id=None,
            state_delta=None,
        ):
            pass

    runner = MockRunner()
    asyncio.run(_run())


def test_mockRunner_yieldsExactlyOneFinalEvent():
    events = _collect(MockRunner())

    assert len(events) == 1
    assert events[0].is_final_response() is True


def test_mockRunner_eventTextIsParsableLlmOutput():
    events = _collect(MockRunner(), text="add a container")

    parsed = LlmOutput.model_validate_json(events[0].content.parts[0].text)
    assert parsed.patch[0].op == "add"


def test_mockRunner_recordsEachCall():
    runner = MockRunner()
    _collect(runner, session_id="abc", text="add")

    call = runner.calls[-1]
    assert call.user_id == "u1"
    assert call.session_id == "abc"
    assert call.message_text == "add"


def test_mockRunner_raises_whenConfigured():
    runner = MockRunner()
    runner.raises = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        _collect(runner)


def test_buildMockOutput_addMessage_proposesAdd():
    assert build_mock_output("please add a container").patch[0].op == "add"


def test_buildMockOutput_removeOrDelete_proposesRemove():
    assert build_mock_output("remove a container").patch[0].op == "remove"
    assert build_mock_output("delete a container").patch[0].op == "remove"


def test_buildMockOutput_renameOrChange_proposesReplace():
    assert build_mock_output("rename a container").patch[0].op == "replace"
    assert build_mock_output("change the title").patch[0].op == "replace"


def test_buildMockOutput_unknownMessage_proposesNoPatch():
    assert build_mock_output("what is this?").patch == []


def test_mockRunner_withoutSessionService_stillYields():
    """The fake stays usable standalone, without a session store attached."""
    assert _collect(MockRunner())[0].is_final_response() is True