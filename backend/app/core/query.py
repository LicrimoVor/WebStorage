from enum import StrEnum


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class AvailabilityFilter(StrEnum):
    ALL = "all"
    IN_STOCK = "in_stock"
    OUT_OF_STOCK = "out_of_stock"
