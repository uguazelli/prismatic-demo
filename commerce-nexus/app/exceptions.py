from typing import Any


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, resource: str, resource_id: str) -> None:
        super().__init__(404, "not_found", f"{resource} '{resource_id}' was not found")


class ConflictError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(409, "conflict", message)


class AuthenticationError(AppError):
    def __init__(self, message: str = "A valid X-API-Key header is required") -> None:
        super().__init__(401, "invalid_api_key", message)


class ValidationAppError(AppError):
    def __init__(self, message: str, details: Any | None = None) -> None:
        super().__init__(422, "validation_error", message, details)
