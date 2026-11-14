"""Shared Gemini and Anthropic-compatible model gateway."""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(__file__))


@dataclass(frozen=True)
class ModelCandidate:
    provider: str
    model: str

    @property
    def label(self) -> str:
        return f"{self.provider}/{self.model}"


def has_model_credentials() -> bool:
    provider = os.environ.get("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        return any(
            os.environ.get(name)
            for name in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")
        )
    if provider in ("anthropic", "openrouter"):
        return bool(
            os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        )
    return any(
        os.environ.get(name)
        for name in ("GEMINI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")
    )


def _split_models(name: str) -> list[str]:
    return [model.strip() for model in os.environ.get(name, "").split(",") if model.strip()]


def _candidate_models() -> list[ModelCandidate]:
    """Return the configured primary provider followed by its available fallbacks."""
    provider = os.environ.get("LLM_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        primary = os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen").strip()
        candidates = [
            ModelCandidate("gemini", model)
            for model in [primary, *_split_models("GEMINI_FALLBACK_MODELS")]
            if model
        ]

        has_openrouter_credentials = bool(
            os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")
        )
        configured_fallbacks = _split_models("ANTHROPIC_FALLBACK_MODELS")
        fallback_models = []
        if has_openrouter_credentials:
            configured_model = os.environ.get("ANTHROPIC_MODEL", "").strip()
            if configured_model:
                fallback_models.append(configured_model)
            fallback_models.extend(configured_fallbacks)
            base_url = os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com"
            if (
                not configured_fallbacks
                and "openrouter.ai" in base_url
                and "openrouter/free" not in fallback_models
            ):
                fallback_models.append("openrouter/free")
        elif configured_fallbacks:
            fallback_models.extend(configured_fallbacks)
        candidates.extend(
            ModelCandidate("anthropic", model) for model in fallback_models
        )
    elif provider in ("anthropic", "openrouter"):
        primary = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6").strip()
        configured_fallbacks = _split_models("ANTHROPIC_FALLBACK_MODELS")
        base_url = os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com"
        fallback_models = configured_fallbacks or (
            ["openrouter/free"]
            if "openrouter.ai" in base_url and primary != "openrouter/free"
            else []
        )
        candidates = [
            ModelCandidate("anthropic", model)
            for model in [primary, *fallback_models]
            if model
        ]
    else:
        raise RuntimeError(
            f"Unsupported LLM_PROVIDER {provider!r}; use 'gemini' or 'anthropic'."
        )

    unique_candidates = []
    seen = set()
    for candidate in candidates:
        key = (candidate.provider, candidate.model)
        if key not in seen:
            seen.add(key)
            unique_candidates.append(candidate)
    if not unique_candidates:
        raise RuntimeError("No LLM models are configured.")
    return unique_candidates


def sanitize_surrogates(text: str) -> str:
    """Replace lone UTF-16 surrogates so the text can be encoded as UTF-8."""
    if not isinstance(text, str):
        return text
    try:
        text.encode("utf-8")
        return text
    except UnicodeEncodeError:
        return text.encode("utf-8", "replace").decode("utf-8")


def _response_text(response) -> str:
    """Extract text from Google GenAI and Anthropic SDK responses."""
    for attribute in ("output_text", "text"):
        output = (
            response.get(attribute)
            if isinstance(response, dict)
            else getattr(response, attribute, None)
        )
        if isinstance(output, str) and output.strip():
            return output.strip()

    content = (
        response.get("content")
        if isinstance(response, dict)
        else getattr(response, "content", None)
    )
    if isinstance(content, str):
        return content.strip()
    parts = []
    if isinstance(content, (list, tuple)):
        for block in content:
            block_type = (
                block.get("type")
                if isinstance(block, dict)
                else getattr(block, "type", None)
            )
            text = (
                block.get("text")
                if isinstance(block, dict)
                else getattr(block, "text", None)
            )
            if block_type in (None, "text") and isinstance(text, str):
                parts.append(text)
    if parts:
        return "".join(parts).strip()

    steps = (
        response.get("steps")
        if isinstance(response, dict)
        else getattr(response, "steps", None)
    )
    if isinstance(steps, (list, tuple)):
        for step in steps:
            step_type = (
                step.get("type")
                if isinstance(step, dict)
                else getattr(step, "type", None)
            )
            if step_type != "model_output":
                continue
            blocks = (
                step.get("content")
                if isinstance(step, dict)
                else getattr(step, "content", None)
            )
            if not isinstance(blocks, (list, tuple)):
                continue
            for block in blocks:
                block_type = (
                    block.get("type")
                    if isinstance(block, dict)
                    else getattr(block, "type", None)
                )
                text = (
                    block.get("text")
                    if isinstance(block, dict)
                    else getattr(block, "text", None)
                )
                if block_type == "text" and isinstance(text, str):
                    parts.append(text)
    return "".join(parts).strip()


def _response_diagnostic(response) -> str:
    """Summarize provider response metadata without logging generated content."""
    get_value = (
        response.get
        if isinstance(response, dict)
        else lambda name, default=None: getattr(response, name, default)
    )
    details = []
    status = get_value("status")
    if status is not None:
        details.append(f"status={status!r}")

    errors = get_value("errors")
    if errors:
        error_types = [
            str(error.get("type") if isinstance(error, dict) else getattr(error, "type", type(error).__name__))
            for error in errors
        ]
        details.append(f"errors={error_types!r}")

    steps = get_value("steps")
    if isinstance(steps, (list, tuple)):
        summaries = []
        for step in steps:
            step_type = (
                step.get("type")
                if isinstance(step, dict)
                else getattr(step, "type", None)
            )
            content = (
                step.get("content")
                if isinstance(step, dict)
                else getattr(step, "content", None)
            )
            content_types = [
                block.get("type")
                if isinstance(block, dict)
                else getattr(block, "type", None)
                for block in content
            ] if isinstance(content, (list, tuple)) else []
            summaries.append(f"{step_type}:{content_types}")
        details.append(f"steps={summaries!r}")

    stop_reason = get_value("stop_reason")
    if stop_reason is not None:
        details.append(f"stop_reason={stop_reason!r}")
    return f" ({', '.join(details)})" if details else ""


def _client_for(candidate: ModelCandidate):
    if candidate.provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is required for Gemini models.")
        from google import genai

        return genai.Client(api_key=api_key)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    if not api_key and not auth_token:
        raise RuntimeError(
            "ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is required for "
            "Anthropic-compatible fallback models."
        )

    import anthropic

    client_kwargs: dict = {
        "base_url": os.environ.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com",
    }
    if auth_token:
        client_kwargs["auth_token"] = auth_token
    else:
        client_kwargs["api_key"] = api_key
    return anthropic.Anthropic(**client_kwargs)


def _request_model(
    client,
    candidate: ModelCandidate,
    system: str,
    prompt: str,
    max_tokens: int,
    document: dict | None,
):
    if candidate.provider == "gemini":
        model_input: str | list[dict[str, str]] = prompt
        if document is not None:
            model_input = [
                {
                    "type": "document",
                    "data": document["data"],
                    "mime_type": document.get("media_type") or "application/pdf",
                },
                {"type": "text", "text": prompt},
            ]
        generation_config = {
            "max_output_tokens": max_tokens,
            "thinking_level": os.environ.get("GEMINI_THINKING_LEVEL", "low"),
        }
        return client.interactions.create(
            model=candidate.model,
            input=model_input,
            system_instruction=system,
            generation_config=generation_config,
            store=False,
        )

    content: object = prompt
    if document is not None:
        content = [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": document.get("media_type") or "application/pdf",
                    "data": document["data"],
                },
            },
            {"type": "text", "text": prompt},
        ]
    return client.messages.create(
        model=candidate.model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
    )


def _chat_model(
    system: str,
    prompt: str,
    max_tokens: int = 3500,
    label: str = "request",
    document: dict | None = None,
    candidates: list[ModelCandidate] | None = None,
) -> str:
    """Send a prompt through Gemini and configured fallbacks, returning text."""
    system = sanitize_surrogates(system)
    prompt = sanitize_surrogates(prompt)

    max_retries = 2
    model_errors: list[str] = []
    for candidate in candidates or _candidate_models():
        try:
            client = _client_for(candidate)
        except Exception as exc:
            model_errors.append(
                f"{candidate.label}: {type(exc).__name__}: {exc}"
            )
            print(
                f"[worker] {label} model {candidate.label} could not be configured: {exc}",
                file=sys.stderr,
                flush=True,
            )
            continue

        last_exc: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                response = _request_model(
                    client,
                    candidate,
                    system,
                    prompt,
                    max_tokens,
                    document,
                )
                answer = _response_text(response)
                if answer:
                    return answer
                if attempt < max_retries:
                    wait = 2 ** attempt
                    print(
                        f"[worker] {label} model {candidate.label} returned empty "
                        f"(attempt {attempt}/{max_retries}), retrying in {wait}s",
                        file=sys.stderr,
                        flush=True,
                    )
                    time.sleep(wait)
                    continue
                model_errors.append(
                    f"{candidate.label}: returned empty response after "
                    f"{max_retries} attempts{_response_diagnostic(response)}"
                )
                break
            except Exception as exc:
                last_exc = exc
                print(
                    f"[worker] {label} model {candidate.label} failed "
                    f"(attempt {attempt}/{max_retries}): {exc}",
                    file=sys.stderr,
                    flush=True,
                )
                status = getattr(exc, "status_code", None)
                exc_text = str(exc)
                if status == 429:
                    model_errors.append(
                        f"{candidate.label}: provider rate limited the request (429): {exc}"
                    )
                    last_exc = None
                    break
                if (
                    status == 404
                    or "not_found_error" in exc_text
                    or "No endpoints found" in exc_text
                    or "model is unavailable" in exc_text
                ):
                    model_errors.append(
                        f"{candidate.label}: model is unavailable on the provider; "
                        "update its model setting"
                    )
                    last_exc = None
                    break
                if attempt < max_retries:
                    time.sleep(2 ** attempt)
        if last_exc is not None:
            model_errors.append(
                f"{candidate.label}: {type(last_exc).__name__}: {last_exc}"
            )

    detail = "; ".join(model_errors) if model_errors else "all models returned empty responses"
    raise RuntimeError(
        f"The AI models returned no usable response for the {label}. "
        f"Please try again. [{detail}]"
    )
