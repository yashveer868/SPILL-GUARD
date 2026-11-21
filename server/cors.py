"""Shared CORS policy for the Spill Sense API."""

import os
from typing import FrozenSet, Sequence

from starlette.applications import Starlette
from starlette.datastructures import Headers
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

PRODUCTION_ORIGINS = ("https://oik-spill.vercel.app",)
DEVELOPMENT_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5500",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8000",
)
PROTECTED_API_PATHS = frozenset(
    {
        "/api/alerts/evaluate",
        "/api/emergency-alerts/transmit",
        "/api/sar-ais/correlate",
        "/api/drift",
        "/api/feedback",
        "/api/match-vessels",
        "/api/rank-suspects",
    }
)


def trusted_origins() -> tuple[str, ...]:
    origins = list(PRODUCTION_ORIGINS)
    if os.getenv("APP_ENV", "").strip().lower() in {"dev", "development", "local"}:
        origins.extend(DEVELOPMENT_ORIGINS)
    return tuple(origins)


class TrustedOriginGuardMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        allowed_origins: Sequence[str],
        protected_paths: FrozenSet[str],
    ) -> None:
        self.app = app
        self.allowed_origins = frozenset(allowed_origins)
        self.protected_paths = protected_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path") in self.protected_paths:
            origin = Headers(scope=scope).get("origin")
            if origin is not None and origin not in self.allowed_origins:
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "Origin is not allowed."},
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)


def configure_cors(app: Starlette) -> None:
    origins = trusted_origins()

    # Register the guard inside CORS so preflights are handled by CORSMiddleware.
    app.add_middleware(
        TrustedOriginGuardMiddleware,
        allowed_origins=origins,
        protected_paths=PROTECTED_API_PATHS,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
