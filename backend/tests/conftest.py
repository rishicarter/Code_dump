"""Shared fixtures. Every test runs against a fresh service so sessions never leak."""

import pytest
from fastapi.testclient import TestClient

import main
from src.yaml_agent.mock_runner import MockRunner
from src.yaml_agent.service import YamlAgentService, get_service

SAMPLE_YAML = "models:\n  containers:\n    - id: UI1\n      description: Main UI\n"


@pytest.fixture(autouse=True)
def reset_service_cache():
    """Drop the lru_cache'd service so each test gets its own session store."""
    get_service.cache_clear()
    yield
    get_service.cache_clear()


@pytest.fixture
def service() -> YamlAgentService:
    """A service wired to MockRunner instead of the real ADK Runner."""
    from src.yaml_agent.service import APP_NAME, USER_ID

    instance = YamlAgentService()
    instance.runner = MockRunner(
        session_service=instance.sessions, app_name=APP_NAME, user_id=USER_ID
    )
    return instance


@pytest.fixture
def client(service: YamlAgentService) -> TestClient:
    """TestClient whose /chat endpoint resolves to the mocked service."""
    app = main.app
    app.dependency_overrides[get_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def make_request():
    """Build a ChatRequest with sensible defaults; override any field per test."""
    from src.yaml_agent.schema import ChatRequest

    def _make(**overrides) -> ChatRequest:
        fields = {"message": "add a container", "yaml": SAMPLE_YAML}
        fields.update(overrides)
        return ChatRequest(**fields)

    return _make