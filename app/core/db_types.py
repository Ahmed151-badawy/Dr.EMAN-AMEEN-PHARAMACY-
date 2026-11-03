from sqlalchemy import Enum as SAEnum


def str_enum(enum_cls, name: str):
    """
    SQLAlchemy's Enum() stores the Python member NAME (e.g. "CASH") in
    Postgres by default, not the member's .value (e.g. "cash"). Since our
    enums subclass str and the API/frontend deal in lowercase values, force
    storage of .value everywhere with this helper instead of calling
    Enum(...) directly.
    """
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])
