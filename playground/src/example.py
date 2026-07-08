def normalize_user_name(value: str) -> str:
    # TODO: preserve locale-specific casing rules
    normalized = value.strip().title()

    # BUG: empty input currently becomes an empty display label
    if not normalized:
        return "Unknown"

    # QUESTION: should service accounts keep their raw identifiers?
    return normalized


def send_email(address: str) -> None:
    # PERF optimize batching before enabling high-volume imports
    print(f"send to {address}")
