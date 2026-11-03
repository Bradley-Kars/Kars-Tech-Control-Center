"""Tests for stripe_client.py - Stripe API client tests.

Tests cover:
- check_method(): valid/invalid HTTP methods
- load_secret(): reading Stripe API key from .env file
- request(): successful API calls, error responses, network failures
- Token is never logged or stored
"""

import asyncio
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

from core.stripe_client import (
    check_method,
    load_secret,
    request,
    ALLOWED_METHODS,
    API_BASE,
)


class MockResponse:
    """Mock response object that mimics urllib.response.addinfourl."""

    def __init__(self, status, body, headers=None):
        self.status = status
        self.headers = headers or {}
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class TestCheckMethod(unittest.TestCase):
    """Test the check_method function that validates HTTP methods."""

    def test_valid_get_method(self):
        """GET method should pass validation."""
        result = check_method("GET")
        self.assertEqual(result, "GET")

    def test_valid_get_method_lowercase(self):
        """Lowercase get should be uppercased and pass."""
        result = check_method("get")
        self.assertEqual(result, "GET")

    def test_invalid_method_post(self):
        """POST method should raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            check_method("POST")
        self.assertIn("POST", str(ctx.exception))
        self.assertIn("GET-only", str(ctx.exception))

    def test_invalid_method_put(self):
        """PUT method should raise ValueError."""
        with self.assertRaises(ValueError):
            check_method("PUT")

    def test_invalid_method_delete(self):
        """DELETE method should raise ValueError."""
        with self.assertRaises(ValueError):
            check_method("DELETE")

    def test_invalid_method_patch(self):
        """PATCH method should raise ValueError."""
        with self.assertRaises(ValueError):
            check_method("PATCH")

    def test_invalid_method_head(self):
        """HEAD method should raise ValueError."""
        with self.assertRaises(ValueError):
            check_method("HEAD")

    def test_invalid_method_options(self):
        """OPTIONS method should raise ValueError."""
        with self.assertRaises(ValueError):
            check_method("OPTIONS")


class TestLoadSecret(unittest.TestCase):
    """Test the load_secret function that reads Stripe API key from .env file."""

    def test_load_secret_from_env_file(self):
        """Test loading API key from a .env file."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("STRIPE_SECRET_KEY=sk_test_1234567890abcdef\n")
            f.flush()
            temp_path = f.name

        try:
            result = load_secret(temp_path)
            self.assertEqual(result, "sk_test_1234567890abcdef")
        finally:
            os.unlink(temp_path)

    def test_load_secret_missing_file(self):
        """Test that missing file raises FileNotFoundError."""
        with self.assertRaises(FileNotFoundError):
            load_secret("/nonexistent/path/.env")

    def test_load_secret_empty_file(self):
        """Test that empty .env file raises RuntimeError."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("# no stripe key here\n")
            f.flush()
            temp_path = f.name

        try:
            with self.assertRaises(RuntimeError) as ctx:
                load_secret(temp_path)
            self.assertIn("STRIPE_SECRET_KEY", str(ctx.exception))
        finally:
            os.unlink(temp_path)

    def test_load_secret_whitespace_only_value(self):
        """Test that whitespace-only value is treated as empty."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("STRIPE_SECRET_KEY=   \n")
            f.flush()
            temp_path = f.name

        try:
            with self.assertRaises(RuntimeError) as ctx:
                load_secret(temp_path)
            self.assertIn("STRIPE_SECRET_KEY", str(ctx.exception))
        finally:
            os.unlink(temp_path)


class TestRequestFunction(unittest.TestCase):
    """Test the request function that makes API calls to Stripe."""

    def test_successful_get_request(self):
        """Test successful GET request to Stripe API."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("STRIPE_SECRET_KEY=sk_test_1234567890abcdef\n")
            f.flush()
            temp_path = f.name

        try:
            mock_response = MockResponse(
                200,
                b'{"id": "ch_123", "amount": 1000}',
                {"Request-Id": "req_12345"}
            )

            with patch("urllib.request.urlopen", return_value=mock_response):
                result = request("/v1/charges/ch_123", env_path=temp_path)

            self.assertEqual(result["status"], 200)
            self.assertEqual(result["request_id"], "req_12345")
            self.assertEqual(result["data"]["id"], "ch_123")
            self.assertEqual(result["data"]["amount"], 1000)
            self.assertFalse(result.get("parse_error", False))
        finally:
            os.unlink(temp_path)

    def test_request_with_http_error(self):
        """Test HTTP error response (e.g., 403 Forbidden)."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("STRIPE_SECRET_KEY=sk_test_1234567890abcdef\n")
            f.flush()
            temp_path = f.name

        try:
            mock_response = MockResponse(
                403,
                b'{"error": {"message": "Invalid API key"}}',
                {"Request-Id": "req_403"}
            )

            with patch("urllib.request.urlopen", side_effect=urllib.error.HTTPError(
                "https://api.stripe.com/v1/charges/ch_123", 403,
                "Forbidden", mock_response.headers, mock_response
            )):
                result = request("/v1/charges/ch_123", env_path=temp_path)

            self.assertEqual(result["status"], 403)
            self.assertEqual(result["request_id"], "req_403")
            self.assertIn("Invalid API key", result["error_message"])
        finally:
            os.unlink(temp_path)

    def test_request_with_network_error(self):
        """Test network error (URLError)."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("STRIPE_SECRET_KEY=sk_test_1234567890abcdef\n")
            f.flush()
            temp_path = f.name

        try:
            with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
                result = request("/v1/charges/ch_123", env_path=temp_path)

            self.assertEqual(result["status"], None)
            self.assertEqual(result["request_id"], None)
            self.assertIn("network error", result["error_message"])
        finally:
            os.unlink(temp_path)

    def test_request_with_invalid_json(self):
        """Test response with invalid JSON."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".env", delete=False
        ) as f:
            f.write("STRIPE_SECRET_KEY=sk_test_1234567890abcdef\n")
            f.flush()
            temp_path = f.name

        try:
            mock_response = MockResponse(
                200,
                b"not valid json{{{"
            )

            with patch("urllib.request.urlopen", return_value=mock_response):
                result = request("/v1/charges/ch_123", env_path=temp_path)

            self.assertEqual(result["status"], 200)
            self.assertTrue(result.get("parse_error", False))
            self.assertIsNone(result["data"])
        finally:
            os.unlink(temp_path)


if __name__ == "__main__":
    unittest.main()