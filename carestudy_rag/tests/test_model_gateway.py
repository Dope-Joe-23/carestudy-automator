"""Tests for provider selection and Gemini request construction."""
import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import model_gateway as gateway  # noqa: E402


class ModelGatewayTests(unittest.TestCase):
    def test_gemini_primary_uses_openrouter_fallbacks_in_order(self):
        env = {
            "LLM_PROVIDER": "gemini",
            "GEMINI_API_KEY": "google-test-key",
            "GEMINI_MODEL": "gemini-primary",
            "GEMINI_FALLBACK_MODELS": "gemini-secondary",
            "ANTHROPIC_AUTH_TOKEN": "openrouter-test-key",
            "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
            "ANTHROPIC_MODEL": "google/gemma-fallback",
            "ANTHROPIC_FALLBACK_MODELS": "nvidia/fallback,openrouter/free",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(
                gateway._candidate_models(),
                [
                    gateway.ModelCandidate("gemini", "gemini-primary"),
                    gateway.ModelCandidate("gemini", "gemini-secondary"),
                    gateway.ModelCandidate("anthropic", "google/gemma-fallback"),
                    gateway.ModelCandidate("anthropic", "nvidia/fallback"),
                    gateway.ModelCandidate("anthropic", "openrouter/free"),
                ],
            )

    def test_gemini_does_not_require_openrouter_credentials(self):
        with mock.patch.dict(
            os.environ,
            {"LLM_PROVIDER": "gemini", "GEMINI_MODEL": "gemini-primary"},
            clear=True,
        ):
            self.assertEqual(
                gateway._candidate_models(),
                [gateway.ModelCandidate("gemini", "gemini-primary")],
            )

    def test_gemini_request_is_stateless_and_uses_system_instruction(self):
        client = mock.Mock()
        client.interactions.create.return_value = SimpleNamespace(output_text="answer")
        candidate = gateway.ModelCandidate("gemini", "gemini-test")

        with mock.patch.object(gateway, "_client_for", return_value=client):
            answer = gateway._chat_model(
                "system prompt",
                "user prompt",
                max_tokens=123,
                candidates=[candidate],
            )

        self.assertEqual(answer, "answer")
        client.interactions.create.assert_called_once_with(
            model="gemini-test",
            input="user prompt",
            system_instruction="system prompt",
            generation_config={"max_output_tokens": 123, "thinking_level": "low"},
            store=False,
        )

    def test_gemini_client_has_bounded_timeout_and_no_sdk_retries(self):
        with (
            mock.patch.dict(
                os.environ,
                {"GEMINI_API_KEY": "google-test-key"},
                clear=True,
            ),
            mock.patch("google.genai.Client") as client_constructor,
        ):
            gateway._client_for(gateway.ModelCandidate("gemini", "gemini-test"))

        options = client_constructor.call_args.kwargs["http_options"]
        self.assertEqual(options.timeout, gateway.MODEL_REQUEST_TIMEOUT_SECONDS * 1000)
        self.assertEqual(options.retry_options.attempts, 1)

    def test_gemini_extracts_text_from_model_output_steps(self):
        response = SimpleNamespace(
            output_text=None,
            steps=[
                SimpleNamespace(
                    type="model_output",
                    content=[SimpleNamespace(type="text", text="answer from steps")],
                )
            ],
        )
        self.assertEqual(gateway._response_text(response), "answer from steps")

    def test_empty_gemini_response_includes_status_and_step_types(self):
        client = mock.Mock()
        client.interactions.create.return_value = SimpleNamespace(
            output_text="",
            status="incomplete",
            steps=[SimpleNamespace(type="thought", content=[])],
        )
        with (
            mock.patch.object(gateway, "_client_for", return_value=client),
            mock.patch.object(gateway.time, "sleep"),
            self.assertRaisesRegex(
                RuntimeError,
                r"status='incomplete'.*thought",
            ),
        ):
            gateway._chat_model(
                "system",
                "prompt",
                candidates=[gateway.ModelCandidate("gemini", "gemini-test")],
            )

    def test_gemini_request_passes_inline_pdf_content(self):
        client = mock.Mock()
        client.interactions.create.return_value = SimpleNamespace(output_text="answer")

        with mock.patch.object(gateway, "_client_for", return_value=client):
            gateway._chat_model(
                "system",
                "read this",
                document={"data": "cGRm", "media_type": "application/pdf"},
                candidates=[gateway.ModelCandidate("gemini", "gemini-test")],
            )

        request = client.interactions.create.call_args.kwargs
        self.assertEqual(
            request["input"],
            [
                {
                    "type": "document",
                    "data": "cGRm",
                    "mime_type": "application/pdf",
                },
                {"type": "text", "text": "read this"},
            ],
        )
        self.assertFalse(request["store"])

    def test_gemini_failure_uses_openrouter_fallback(self):
        anthropic_client = mock.Mock()
        anthropic_client.messages.create.return_value = SimpleNamespace(
            content=[SimpleNamespace(type="text", text="fallback answer")]
        )
        with (
            mock.patch.dict(
                os.environ,
                {
                    "LLM_PROVIDER": "gemini",
                    "GEMINI_MODEL": "gemini-primary",
                    "ANTHROPIC_AUTH_TOKEN": "openrouter-test-key",
                    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
                    "ANTHROPIC_MODEL": "openrouter/fallback-model",
                },
                clear=True,
            ),
            mock.patch.object(
                gateway,
                "_client_for",
                side_effect=[
                    RuntimeError("Gemini unavailable"),
                    anthropic_client,
                ],
            ),
            mock.patch.object(gateway.time, "sleep"),
        ):
            answer = gateway._chat_model("system", "prompt")

        self.assertEqual(answer, "fallback answer")
        anthropic_client.messages.create.assert_called_once()

    def test_anthropic_client_has_bounded_timeout_and_no_sdk_retries(self):
        with (
            mock.patch.dict(
                os.environ,
                {
                    "ANTHROPIC_AUTH_TOKEN": "openrouter-test-key",
                    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
                },
                clear=True,
            ),
            mock.patch("anthropic.Anthropic") as client_constructor,
        ):
            gateway._client_for(gateway.ModelCandidate("anthropic", "openrouter/test"))

        self.assertEqual(
            client_constructor.call_args.kwargs["timeout"],
            gateway.MODEL_REQUEST_TIMEOUT_SECONDS,
        )
        self.assertEqual(client_constructor.call_args.kwargs["max_retries"], 0)

    def test_gemini_timeout_skips_to_openrouter_without_retrying(self):
        openrouter_client = mock.Mock()
        openrouter_client.messages.create.return_value = SimpleNamespace(
            content=[SimpleNamespace(type="text", text="fallback answer")]
        )
        with (
            mock.patch.dict(
                os.environ,
                {
                    "LLM_PROVIDER": "gemini",
                    "GEMINI_MODEL": "gemini-primary",
                    "ANTHROPIC_AUTH_TOKEN": "openrouter-test-key",
                    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
                    "ANTHROPIC_MODEL": "openrouter/fallback-model",
                },
                clear=True,
            ),
            mock.patch.object(
                gateway,
                "_client_for",
                side_effect=[object(), openrouter_client],
            ),
            mock.patch.object(
                gateway,
                "_request_model",
                side_effect=[
                    httpx.ReadTimeout("Gemini request timed out"),
                    SimpleNamespace(
                        content=[SimpleNamespace(type="text", text="fallback answer")]
                    ),
                ],
            ) as request_model,
        ):
            answer = gateway._chat_model("system", "prompt")

        self.assertEqual(answer, "fallback answer")
        self.assertEqual(request_model.call_count, 2)
        self.assertEqual(request_model.call_args_list[0].args[1].provider, "gemini")
        self.assertEqual(request_model.call_args_list[1].args[1].provider, "anthropic")

    def test_rate_limit_skips_to_the_next_fallback_without_retrying(self):
        class RateLimitError(Exception):
            status_code = 429

        with (
            mock.patch.dict(
                os.environ,
                {
                    "LLM_PROVIDER": "gemini",
                    "GEMINI_API_KEY": "google-test-key",
                    "GEMINI_MODEL": "gemini-primary",
                    "ANTHROPIC_AUTH_TOKEN": "openrouter-test-key",
                    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
                    "ANTHROPIC_MODEL": "openrouter/fallback-model",
                },
                clear=True,
            ),
            mock.patch.object(
                gateway,
                "_client_for",
                side_effect=[object(), object()],
            ),
            mock.patch.object(
                gateway,
                "_request_model",
                side_effect=[
                    RateLimitError("temporarily limited"),
                    SimpleNamespace(
                        content=[SimpleNamespace(type="text", text="fallback answer")]
                    ),
                ],
            ) as request_model,
        ):
            answer = gateway._chat_model("system", "prompt")

        self.assertEqual(answer, "fallback answer")
        self.assertEqual(request_model.call_count, 2)
        self.assertEqual(request_model.call_args_list[0].args[1].provider, "gemini")
        self.assertEqual(request_model.call_args_list[1].args[1].provider, "anthropic")


if __name__ == "__main__":
    unittest.main()
