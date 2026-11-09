"""Tests for the agent definition and its prompt wiring."""

from pathlib import Path

from src.yaml_agent.agent import PROMPT_PATH, PROMPT_TEMPLATE, build_instruction, current_yaml, root_agent
from src.yaml_agent.schema import LlmOutput

SAMPLE_YAML = "models:\n  containers:\n    - id: UI1\n"


def test_promptFile_existsAtExpectedPath():
    assert PROMPT_PATH.exists()
    assert PROMPT_PATH.name == "yaml_agent.md"


def test_promptTemplate_containsYamlPlaceholder():
    assert "{yaml_text}" in PROMPT_TEMPLATE


def test_promptTemplate_documentsEveryPatchOp():
    for op in ("add", "remove", "replace"):
        assert op in PROMPT_TEMPLATE


def test_buildInstruction_embedsTheCurrentYaml():
    token = current_yaml.set(SAMPLE_YAML)
    try:
        instruction = build_instruction(None)
    finally:
        current_yaml.reset(token)

    assert SAMPLE_YAML in instruction
    assert "{yaml_text}" not in instruction


def test_buildInstruction_emptyYaml_stillValid():
    assert "{yaml_text}" not in build_instruction(None)


def test_rootAgent_hasExpectedNameAndSchema():
    assert root_agent.name == "yaml_agent"
    assert root_agent.output_schema is LlmOutput


def test_currentYaml_defaultsToEmptyString():
    """A leaked context var would poison the next turn's instruction."""
    assert current_yaml.get() == ""


def test_promptTemplate_isNotEmpty():
    assert len(PROMPT_TEMPLATE.strip()) > 50


def test_promptTemplate_isUnderThePromptsFolder():
    assert PROMPT_PATH.parent.name == "prompts"
    assert isinstance(PROMPT_PATH, Path)