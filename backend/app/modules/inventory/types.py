from enum import StrEnum


class MovementType(StrEnum):
    RECEIPT = "receipt"
    CONSUMPTION = "consumption"
    PRODUCTION = "production"
    SALE = "sale"
    ADJUSTMENT = "adjustment"
    WRITE_OFF = "write_off"


class ManualMovementType(StrEnum):
    RECEIPT = "receipt"
    CONSUMPTION = "consumption"
    ADJUSTMENT = "adjustment"
    WRITE_OFF = "write_off"
