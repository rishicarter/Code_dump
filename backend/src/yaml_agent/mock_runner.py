"""A stand-in for google.adk.runners.Runner that answers without calling an LLM.

It exists for two reasons:

- The test suite must be deterministic and must never need a GOOGLE_API_KEY.
- Running the app locally should not require Gemini, so `MOCK_MODE=true` swaps
  the real Runner for this one (see service.YamlAgentService.build_runner).

It deliberately yields *real* google.adk.events.Event objects rather than a
look-alike, so the code under test exercises the same `is_final_response()`
and `event.content.parts[0].text` handling it uses with the real Runner.
"""

from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Optional

from google.adk.events.event import Event
from google.genai import types

from .schema import LlmOutput

# Keyed on keywords so the mock mirrors the frontend's mock fixtures
# (frontend/server.js mockResponse), keeping both modes behaviourally alike.
_ADD_CONTAINER = LlmOutput(
    reply="I can add a new container. Review the change below, then apply it.",
    patch=[
        {
            "op": "add",
            "path": "/models/containers/-",
            "value_json": '{"id": "UI2", "description": "Another UI container"}',
        }
    ],
)
_REMOVE_CONTAINER = LlmOutput(
    reply="I can remove that container. Review the change below, then apply it.",
    patch=[{"op": "remove", "path": "/models/containers/0", "value_json": None}],
)
_REPLACE_CONTAINER = LlmOutput(
    reply="I can rename that container. Review the change below, then apply it.",
    patch=[
        {
            "op": "replace",
            "path": "/models/containers/0/description",
            "value_json": '"Primary UI"',
        }
    ],
)
_NO_CHANGE = LlmOutput(
    reply='Try: "add a container", "remove a container" or "rename a container".',
    patch=[],
)


@dataclass
class RecordedCall:
    """What the service passed to the runner for one turn."""

    user_id: str
    session_id: str
    message_text: str


def build_mock_output(message: str) -> LlmOutput:
    """Pick the canned answer for a user message, mirroring the frontend mocks."""
    lowered = message.lower()
    if "add" in lowered:
        return _ADD_CONTAINER
    if "remove" in lowered or "delete" in lowered:
        return _REMOVE_CONTAINER
    if "replace" in lowered or "rename" in lowered or "change" in lowered:
        return _REPLACE_CONTAINER
    return _NO_CHANGE


@dataclass
class MockRunner:
    """Mirrors the slice of Runner that YamlAgentService actually uses."""

    # The real Runner persists turns through the session service; the mock needs
    # a handle on it too, or history-based behaviour would differ under test.
    session_service: Any = None
    app_name: str = ""
    user_id: str = ""
    responses: dict[str, LlmOutput] = field(default_factory=dict)
    calls: list[RecordedCall] = field(default_factory=list)
    # When set, run_async re-raises it. Used to test failure handling.
    raises: Optional[Exception] = None

    def queue_response(self, session_id: str, output: LlmOutput) -> None:
        """Queue an explicit response for the next turn of a session."""
        self.responses[session_id] = output

    async def run_async(
        self,
        *,
        user_id: str,
        session_id: str,
        new_message: Optional[types.Content] = None,
        **_: Any,
    ) -> AsyncGenerator[Event, None]:
        """Persist the turn, then yield a single final event.

        Accepts the extra keyword arguments the real Runner takes so the two
        are interchangeable at the call site.
        """
        message_text = new_message.parts[0].text if new_message and new_message.parts else ""
        self.calls.append(RecordedCall(user_id, session_id, message_text))

        if self.raises is not None:
            raise self.raises

        await self._append_to_history(user_id, session_id, new_message)

        output = self.responses.pop(session_id, None) or build_mock_output(message_text)

        reply_event = Event(
            author="yaml_agent",
            content=types.Content(role="model", parts=[types.Part(text=output.model_dump_json())]),
        )
        await self._append_event(user_id, session_id, reply_event)
        yield reply_event

    async def _append_to_history(
        self, user_id: str, session_id: str, new_message: Optional[types.Content]
    ) -> None:
        """Record the user's turn, which is the only thing that should be stored."""
        if new_message is None:
            return
        await self._append_event(
            user_id, session_id, Event(author="user", content=new_message)
        )

    async def _append_event(self, user_id: str, session_id: str, event: Event) -> None:
        if self.session_service is None:
            return
        session = await self.session_service.get_session(
            app_name=self.app_name, user_id=user_id, session_id=session_id
        )
        if session is None:
            return
        await self.session_service.append_event(session=session, event=event)