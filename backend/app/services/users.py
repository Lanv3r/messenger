import re


def is_valid_username(username: str) -> bool:
    pattern = r"^[a-z0-9_]+$"
    return re.fullmatch(pattern, username) is not None
