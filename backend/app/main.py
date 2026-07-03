from typing import Dict

try:
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
except ImportError:  # pragma: no cover - keeps core importable without optional web deps
    FastAPI = None
    HTTPException = Exception
    BaseModel = object

from .core.runtime import GenesisRuntime


runtime = GenesisRuntime()


if BaseModel is object:
    class CompileRequest:  # type: ignore
        question: str
else:
    class CompileRequest(BaseModel):
        question: str


if FastAPI is not None:
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="Genesis Lab API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5175",
            "http://localhost:5175",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/research/compile")
    def compile_research(payload: CompileRequest):
        try:
            return runtime.compile(payload.question).to_dict()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post("/api/runs")
    def create_run(payload: CompileRequest):
        try:
            run = runtime.create_run(payload.question)
            return {"runId": run.id, "status": run.status}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str):
        try:
            return runtime.run_store.require(run_id).to_dict()
        except KeyError:
            raise HTTPException(status_code=404, detail="未找到该运行记录")

    @app.get("/api/runs/{run_id}/evidence")
    def get_evidence(run_id: str):
        try:
            runtime.run_store.require(run_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="未找到该运行记录")
        return {"items": [item.to_dict() for item in runtime.list_evidence(run_id)]}

    @app.get("/api/runs/{run_id}/report")
    def get_report(run_id: str):
        try:
            return {"markdown": runtime.markdown_report(run_id)}
        except KeyError:
            raise HTTPException(status_code=404, detail="未找到该运行记录")
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
else:
    app = None
