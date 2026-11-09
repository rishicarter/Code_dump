"""Schema-level tests: validation rules and the LLM output contract."""

import pytest
from pydantic import ValidationError

from src.yaml_agent.schema import ChatRequest, LlmOutput, LlmPatchOp, PatchOp


def test_chatRequest_sessionIdIsOptional():
    request = ChatRequest(message="add", yaml="a: 1")

    assert request.session_id is None


def test_chatRequest_acceptsASuppliedSessionId():
    assert ChatRequest(session_id="abc", message="add", yaml="a: 1").session_id == "abc"


@pytest.mark.parametrize("blank", ["", "   ", "\n\t "])
def test_chatRequest_blankMessage_isRejected(blank):
    """Matches the BFF's validateRequest so the two layers agree."""
    with pytest.raises(ValidationError):
        ChatRequest(message=blank, yaml="a: 1")


def test_chatRequest_yamlMayBeEmpty():
    """An empty document is valid; the agent simply proposes nothing."""
    assert ChatRequest(message="add", yaml="").yaml == ""


def test_chatRequest_missingMessage_isRejected():
    with pytest.raises(ValidationError):
        ChatRequest(yaml="a: 1")


def test_patchOp_requiresAKnownOperation():
    with pytest.raises(ValidationError):
        PatchOp(op="delete", path="/a")


def test_patchOp_valueDefaultsToNone():
    assert PatchOp(op="remove", path="/a/0").value is None


def test_llmOutput_parsesAPatchWithJsonValues():
    parsed = LlmOutput.model_validate_json(
        '{"reply":"ok","patch":[{"op":"add","path":"/a/-","value_json":"{\\"id\\": \\"x\\"}"}]}'
    )

    assert parsed.reply == "ok"
    assert parsed.patch[0].value_json == '{"id": "x"}'


def test_llmOutput_emptyPatchList_isValid():
    assert LlmOutput.model_validate_json('{"reply":"hi","patch":[]}').patch == []


def test_llmPatchOp_valueJsonDefaultsToNone():
    assert LlmPatchOp(op="remove", path="/a/0").value_json is None