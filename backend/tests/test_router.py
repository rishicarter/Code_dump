"""HTTP-level tests for the /chat endpoint and /health."""

from tests.conftest import SAMPLE_YAML


def test_chat_validRequest_returnsReplyPatchAndSessionId(client):
    response = client.post("/chat", json={"message": "add a container", "yaml": SAMPLE_YAML})

    assert response.status_code == 200
    body = response.json()
    assert "UI2" in body["reply"] or body["patch"] is not None
    assert body["patch"][0]["op"] == "add"
    assert body["session_id"]


def test_chat_missingSessionId_responseCarriesServerMintedId(client):
    """Omitting session_id starts a new conversation and returns a usable id."""
    response = client.post("/chat", json={"message": "add a container", "yaml": SAMPLE_YAML})

    assert response.status_code == 200
    assert response.json()["session_id"]


def test_chat_suppliedSessionId_isEchoedBackUnchanged(client):
    response = client.post(
        "/chat",
        json={"session_id": "resume-me-123", "message": "add", "yaml": SAMPLE_YAML},
    )

    assert response.status_code == 200
    assert response.json()["session_id"] == "resume-me-123"


def test_chat_resumedSessionId_reusesTheSameConversation(client):
    """The resume case: the id sent back on turn 2 addresses turn 1's session."""
    first = client.post(
        "/chat",
        json={"session_id": "resume-abc", "message": "add", "yaml": SAMPLE_YAML},
    )
    second = client.post(
        "/chat",
        json={
            "session_id": first.json()["session_id"],
            "message": "remove a container",
            "yaml": SAMPLE_YAML,
        },
    )

    assert second.status_code == 200
    assert second.json()["session_id"] == "resume-abc"
    assert second.json()["patch"][0]["op"] == "remove"


def test_chat_emptyMessage_returns422(client):
    response = client.post("/chat", json={"message": "", "yaml": SAMPLE_YAML})

    assert response.status_code == 422


def test_chat_missingMessage_returns422(client):
    response = client.post("/chat", json={"yaml": SAMPLE_YAML})

    assert response.status_code == 422


def test_chat_unknownSessionId_isCreatedOnDemand(client):
    """An id the server has never seen starts a fresh session rather than 404ing."""
    response = client.post(
        "/chat",
        json={"session_id": "never-seen-before", "message": "add", "yaml": SAMPLE_YAML},
    )

    assert response.status_code == 200
    assert response.json()["session_id"] == "never-seen-before"


def test_health_returnsOkStatus(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}