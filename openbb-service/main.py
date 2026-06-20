"""
MAIA OpenBB Service — wraps OpenBB Platform's REST API with Bearer-token auth.

Environment variables:
  OPENBB_API_KEY      — required; callers (MAIA) must send Authorization: Bearer <key>
  FMP_API_KEY         — set this; Railway blocks yfinance, FMP is the fallback provider
  OPENBB_FMP_API_KEY  — same key; OpenBB reads it under this name (we mirror FMP_API_KEY below)
  PORT                — set automatically by Railway (default 8080)
"""
import os
import uvicorn
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

SECRET = os.getenv("OPENBB_API_KEY")

# OpenBB reads FMP credentials as OPENBB_FMP_API_KEY; mirror from the simpler name if set.
if os.getenv("FMP_API_KEY") and not os.getenv("OPENBB_FMP_API_KEY"):
    os.environ["OPENBB_FMP_API_KEY"] = os.environ["FMP_API_KEY"]


class BearerAuth(BaseHTTPMiddleware):
    _SKIP = frozenset({"/", "/health", "/openapi.json", "/docs", "/redoc"})

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self._SKIP or not SECRET:
            return await call_next(request)
        auth = request.headers.get("Authorization", "")
        if not (auth.startswith("Bearer ") and auth[7:].strip() == SECRET):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


# OpenBB REST API app — import path varies across minor versions; try both.
try:
    from openbb_core.app.api import create_app          # v4.3+
except ImportError:
    from openbb_core.app.rest_api import create_app     # older v4.x  # type: ignore[no-redef]

app = create_app()
app.add_middleware(BearerAuth)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "maia-openbb"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
