import json
import os
from functools import lru_cache
from uuid import uuid4

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import ValidationError

from .agent import current_yaml, root_agent
from .schema import ChatRequest, ChatResponse, LlmOutput, PatchOp

APP_NAME = "yaml_editor"
USER_ID = "local-user"  # prototype: single user. Replace with a real id later.
FALLBACK_REPLY = "Sorry, I could not produce a valid answer. Please try again."


def _mock_mode_enabled() -> bool:
    return os.getenv("MOCK_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}


class YamlAgentService:
    def __init__(self):
        self.sessions = InMemorySessionService()
        self.runner = self.build_runner()

    def build_runner(self):
        """Real ADK Runner, or a canned one when MOCK_MODE is on.

        Split out into its own method so tests can swap in a MockRunner.
        """
        if _mock_mode_enabled():
            from .mock_runner import MockRunner  # local import keeps mocks optional

            return MockRunner(session_service=self.sessions, app_name=APP_NAME, user_id=USER_ID)
        return Runner(app_name=APP_NAME, agent=root_agent, session_service=self.sessions)

    async def _ensure_session(self, session_id: str):
        session = await self.sessions.get_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        if session is None:
            await self.sessions.create_session(
                app_name=APP_NAME, user_id=USER_ID, session_id=session_id
            )

    async def chat(self, req: ChatRequest) -> ChatResponse:
        # Resolve once, then use this same value everywhere. Resolving late would
        # risk creating the session under a minted id but running the turn under None.
        session_id = req.session_id or str(uuid4())
        await self._ensure_session(session_id)

        # Only the user's message goes into history. The YAML goes via the context var.
        message = types.Content(role="user", parts=[types.Part(text=req.message)])
        token = current_yaml.set(req.yaml)
        final_text = None
        try:
            async for event in self.runner.run_async(
                user_id=USER_ID, session_id=session_id, new_message=message
            ):
                if event.is_final_response() and event.content and event.content.parts:
                    final_text = event.content.parts[0].text
        finally:
            current_yaml.reset(token)

        return self._to_response(final_text, session_id)

    @staticmethod
    def _to_response(final_text: str | None, session_id: str) -> ChatResponse:
        try:
            out = LlmOutput.model_validate_json(final_text or "")
        except ValidationError:
            return ChatResponse(session_id=session_id, reply=FALLBACK_REPLY)

        patch = [
            PatchOp(
                op=p.op,
                path=p.path,
                value=json.loads(p.value_json) if p.value_json is not None else None,
            )
            for p in out.patch
        ]
        return ChatResponse(session_id=session_id, reply=out.reply, patch=patch or None)


@lru_cache
def get_service() -> YamlAgentService:
    return YamlAgentService()  # one shared instance keeps the in-memory sessions alive
