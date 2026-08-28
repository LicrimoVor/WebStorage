from decimal import Decimal

from app.modules.inventory.types import ManualMovementType


def manual_movement_delta(
    movement_type: ManualMovementType, quantity: Decimal
) -> Decimal:
    if quantity == 0:
        raise ValueError("quantity must not be zero")
    if movement_type != ManualMovementType.ADJUSTMENT and quantity < 0:
        raise ValueError("quantity must be positive for this movement type")
    if movement_type in {
        ManualMovementType.CONSUMPTION,
        ManualMovementType.WRITE_OFF,
    }:
        return -quantity
    return quantity
