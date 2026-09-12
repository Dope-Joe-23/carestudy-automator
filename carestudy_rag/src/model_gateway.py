"""Shared Anthropic model gateway for the drafting pipeline.

Extracted from draft_worker.py so feature modules (care_plan, pharmacology,
chapter 2 recommendations) can call the model without importing the worker
script — importing draft_worker from a feature module creates a circular
import once the worker registers that feature's operations.

Same behaviour as before: env-driven client (ANTHROPIC_API_KEY /
ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL / ANTHROPIC_MODEL), ordered
candidate models with fallbacks, per-model retries, and a RuntimeError that
names every attempted model when all candidates fail.
"""

from __future__ import annotations

import os
import sys
from typing import List

sys.path.insert(0, os.path.dirname(__file__))


def _response_text(response) -> str:
    """Extract text from Anthropic SDK and compatible gateway responses."""
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, (list, tuple)):
        return ""

    parts = []
    for block in content:
        block_type = getattr(block, "type", None)
        text = getattr(block, "text", None)
        if isinstance(block, dict):
            block_type = block.get("type")
            text = block.get("text")
        if (block_type in (None, "text")) and isinstance(text, str):
            parts.append(text)
    return "".join(parts).strip()


def _anthropic_client():
    """Build an Anthropic client from the environment, or raise if unconfigured."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    if not api_key and not auth_token:
        raise RuntimeError("No AI API key is configured.")
    import anthropic

    client_kwargs: dict = {
        "base_url": os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com",
    }
    if auth_token:
        client_kwargs["auth_token"] = auth_token
    else:
        client_kwargs["api_key"] = api_key
    return anthropic.Anthropic(**client_kwargs)


def _candidate_models() -> List[str]:
    """Models to try in order: the configured primary, then any fallbacks."""
    primary_model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    configured_fallbacks = [
        candidate.strip()
        for candidate in os.environ.get("ANTHROPIC_FALLBACK_MODELS", "").split(",")
        if candidate.strip()
    ]
    base_url = os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com"
    fallbacks = configured_fallbacks or (
        ["openrouter/free"]
        if "openrouter.ai" in base_url and primary_model != "openrouter/free"
        else []
    )
    return list(dict.fromkeys([primary_model, *fallbacks]))


def _chat_model(system: str, prompt: str, max_tokens: int = 3500, label: str = "request") -> str:
    """Send one prompt to the configured model, with fallbacks and retries.

    Returns the response text. Raises RuntimeError when every candidate model
    fails or returns empty, so callers can fall back to local logic.
    """
    import time

    client = _anthropic_client()
    max_retries = 2
    model_errors: list[str] = []
    for candidate_model in _candidate_models():
        last_exc: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                response = client.messages.create(
                    model=candidate_model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                )
                answer = _response_text(response)
                if answer:
                    return answer
                # Empty but successful response - retry once before moving on
                if attempt < max_retries:
                    wait = 2 ** attempt
                    print(
                        f"[worker] {label} model {candidate_model} returned empty (attempt {attempt}/{max_retries}), retrying in {wait}s",
                        file=sys.stderr, flush=True,
                    )
                    time.sleep(wait)
                    continue
                stop_reason = getattr(response, "stop_reason", None)
                content_types = [
                    getattr(block, "type", None)
                    for block in (getattr(response, "content", None) or [])
                ]
                model_errors.append(
                    f"{candidate_model}: returned empty response after {max_retries} attempts"
                    f" (stop_reason={stop_reason!r}, content_types={content_types!r})"
                )
                print(
                    f"[worker] {label} model {candidate_model} returned empty after {max_retries} attempts, moving on",
                    file=sys.stderr, flush=True,
                )
                break
            except Exception as exc:
                last_exc = exc
                print(
                    f"[worker] {label} model {candidate_model} failed (attempt {attempt}/{max_retries}): {exc}",
                    file=sys.stderr, flush=True,
                )
                if attempt < max_retries:
                    wait = 2 ** attempt
                    time.sleep(wait)
        if last_exc is not None:
            model_errors.append(f"{candidate_model}: {type(last_exc).__name__}: {last_exc}")
    detail = "; ".join(model_errors) if model_errors else "all models returned empty responses"
    raise RuntimeError(
        f"The AI models returned no usable response for the {label}. Please try again. [{detail}]"
    )
