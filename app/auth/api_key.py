import hashlib
import secrets


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return f"dsa_{secrets.token_urlsafe(32)}"


def api_keys_match(left: str, right: str) -> bool:
    return secrets.compare_digest(left, right)
