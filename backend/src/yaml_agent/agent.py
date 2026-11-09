import os
from contextvars import ContextVar
from pathlib import Path

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext

from .schema import LlmOutput

PROMPT_PATH = Path(__file__).parent / "prompts" / "yaml_agent.md"
PROMPT_TEMPLATE = PROMPT_PATH.read_text()

# The YAML is passed per request through this variable and injected into the
# system instruction only. It is never added to the user message, so it never
# ends up in session events or conversation history.
current_yaml: ContextVar[str] = ContextVar("current_yaml", default="")


def build_instruction(ctx: ReadonlyContext) -> str:
    # Instruction providers are not run through ADK's {state} templating,
    # so we fill our own placeholder.
    return PROMPT_TEMPLATE.replace("{yaml_text}", current_yaml.get())


root_agent = LlmAgent(
    name="yaml_agent",
    model=os.getenv("YAML_AGENT_MODEL", "gemini-2.5-flash"),
    description="Proposes YAML patches from chat requests.",
    instruction=build_instruction,
    output_schema=LlmOutput,  # structured JSON reply + patch (no tools needed)
)
