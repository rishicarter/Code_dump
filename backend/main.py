from dotenv import load_dotenv

load_dotenv()  # must run before ADK reads GOOGLE_API_KEY

from fastapi import FastAPI

from src.yaml_agent.router import router as yaml_agent_router

app = FastAPI(title="YAML Agent API")

# ---- Router definitions live here ----
app.include_router(yaml_agent_router)


@app.get("/health")
def health():
    return {"status": "ok"}

# Run:  uvicorn main:app --reload --port 8000
