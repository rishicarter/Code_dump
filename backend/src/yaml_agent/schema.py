from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# ---------- API contract (BFF <-> FastAPI) ----------


class ChatRequest(BaseModel):
    # Optional: omit it to start a fresh conversation. Send it back on later
    # requests to resume. The service always echoes the effective id back.
    session_id: Optional[str] = None
    message: str
    yaml: str  # current YAML text, sent on every request

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        """Reject blank messages, mirroring the BFF's validateRequest (frontend/server.js)."""
        if not value.strip():
            raise ValueError("message must be a non-empty string.")
        return value


class PatchOp(BaseModel):
    op: Literal["add", "remove", "replace"]
    path: str  # JSON Pointer, e.g. /models/containers/-
    value: Optional[Any] = None


class ChatResponse(BaseModel):
    # Always populated so the UI can store it and resume the conversation.
    session_id: str
    reply: str
    patch: Optional[list[PatchOp]] = None  # null when no change is proposed


# ---------- LLM structured output (agent output_schema) ----------
# Gemini's schema does not allow free-form "Any" values, so the model returns
# the value as a JSON string and service.py converts it to a real value.


class LlmPatchOp(BaseModel):
    op: Literal["add", "remove", "replace"]
    path: str = Field(description="JSON Pointer into the YAML, '-' appends to a list")
    value_json: Optional[str] = Field(default=None, description="JSON-encoded value, null for remove")


class LlmOutput(BaseModel):
    reply: str = Field(description="Short message to the user")
    patch: list[LlmPatchOp] = Field(description="Empty list when no change is needed")
