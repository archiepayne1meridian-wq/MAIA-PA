"""
MAIA OpenBB Proxy — version-stable launcher.

Why subprocess proxy instead of importing create_app():
  OpenBB's internal module paths changed across 4.x minor versions
  (openbb_core.app.api, openbb_core.app.rest_api, openbb_platform_api.main, ...).
  Rather than guess the import path for whatever pip installs, we use the stable
  public surface: the `openbb-api` CLI entry point that pip registers for every
  4.x version. This is immune to internal restructuring.

Architecture:
  - OpenBB API server: 127.0.0.1:8001 (via openbb-api subprocess, internal only)
  - This proxy:        0.0.0.0:PORT   (Railway's $PORT, public)
    * Checks Bearer-token auth on every request except /health and /docs
    * Forwards authenticated requests to the inner OpenBB server
    * Returns /health regardless of OpenBB's state

Environment variables:
  OPENBB_API_KEY      — required; callers send Authorization: Bearer <key>
  FMP_API_KEY         — set this; Railway blocks yfinance, FMP is the live provider
  OPENBB_FMP_API_KEY  — same key; OpenBB reads this name (we mirror FMP_API_KEY below)
  PORT                — set automatically by Railway (default 8080)
"""
import asyncio
import os
import shutil
import subprocess
import sys
import time

import httpx
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

SECRET = os.getenv("OPENBB_API_KEY")
_OBB_PORT = 8001
PORT = int(os.getenv("PORT", "8080"))

# OpenBB reads provider credentials as OPENBB_<PROVIDER>_API_KEY.
# Mirror the simpler name so Railway env vars stay clean.
if os.getenv("FMP_API_KEY") and not os.getenv("OPENBB_FMP_API_KEY"):
    os.environ["OPENBB_FMP_API_KEY"] = os.environ["FMP_API_KEY"]

app = FastAPI(title="MAIA OpenBB Proxy")

_client: httpx.AsyncClient | None = None
_obb_proc: subprocess.Popen | None = None  # type: ignore[type-arg]

_SKIP_AUTH = frozenset({"/", "/health", "/openapi.json", "/docs", "/redoc"})


@app.on_event("startup")
async def _startup() -> None:
    global _client, _obb_proc

    _client = httpx.AsyncClient(timeout=30.0)

    cli = shutil.which("openbb-api")
    if not cli:
        print(
            "[maia-proxy] ERROR: 'openbb-api' not found in PATH after pip install. "
            "Check that the openbb package registered its CLI entry point.",
            flush=True,
        )
        return

    print(f"[maia-proxy] Found openbb-api at: {cli}", flush=True)
    print(f"[maia-proxy] Starting OpenBB on 127.0.0.1:{_OBB_PORT} ...", flush=True)

    _obb_proc = subprocess.Popen(
        [cli, "--host", "127.0.0.1", "--port", str(_OBB_PORT)],
        stdout=sys.stdout,
        stderr=sys.stderr,
    )

    # OpenBB loads all installed extensions on startup — can take 30-60s.
    deadline = time.time() + 90
    while time.time() < deadline:
        if _obb_proc.poll() is not None:
            print(
                f"[maia-proxy] ERROR: openbb-api exited with code {_obb_proc.returncode}",
                flush=True,
            )
            return
        try:
            r = await _client.get(f"http://127.0.0.1:{_OBB_PORT}/")
            if r.status_code < 500:
                print(f"[maia-proxy] OpenBB ready (HTTP {r.status_code})", flush=True)
                return
        except httpx.ConnectError:
            pass
        await asyncio.sleep(2)

    print("[maia-proxy] WARNING: OpenBB did not respond within 90s", flush=True)


@app.on_event("shutdown")
async def _shutdown() -> None:
    if _obb_proc and _obb_proc.poll() is None:
        _obb_proc.terminate()
    if _client:
        await _client.aclose()


@app.get("/health")
async def health() -> dict:
    obb_alive = _obb_proc is not None and _obb_proc.poll() is None
    return {"status": "ok", "service": "maia-openbb", "openbb_process": obb_alive}


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
)
async def proxy(request: Request, path: str) -> Response:
    # Auth gate — all paths except the skip set require a valid Bearer token.
    if request.url.path not in _SKIP_AUTH and SECRET:
        auth = request.headers.get("Authorization", "")
        if not (auth.startswith("Bearer ") and auth[7:].strip() == SECRET):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    if _client is None:
        return JSONResponse({"detail": "Service initialising"}, status_code=503)

    target = f"http://127.0.0.1:{_OBB_PORT}/{path}"
    if request.url.query:
        target += f"?{request.url.query}"

    # Strip hop-by-hop headers before forwarding.
    forward_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "authorization", "content-length", "transfer-encoding")
    }

    try:
        body = await request.body()
        resp = await _client.request(
            request.method,
            target,
            content=body or None,
            headers=forward_headers,
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
            media_type=resp.headers.get("content-type"),
        )
    except httpx.ConnectError:
        return JSONResponse({"detail": "OpenBB backend unavailable"}, status_code=503)
    except httpx.TimeoutException:
        return JSONResponse({"detail": "OpenBB backend timed out"}, status_code=504)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
