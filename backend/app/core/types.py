from decimal import Decimal
from typing import Annotated

from pydantic import Field

Quantity = Annotated[Decimal, Field(max_digits=20, decimal_places=6)]
Money = Annotated[Decimal, Field(max_digits=20, decimal_places=2, ge=0)]
