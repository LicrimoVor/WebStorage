import io
import re
import zipfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from xml.sax.saxutils import escape


class CellKind(StrEnum):
    TEXT = "text"
    NUMBER = "number"
    QUANTITY = "quantity"
    MONEY = "money"
    DATE = "date"
    DATETIME = "datetime"


@dataclass(frozen=True, slots=True)
class ExportColumn:
    key: str
    title: str
    kind: CellKind = CellKind.TEXT
    width: int = 20


@dataclass(frozen=True, slots=True)
class ExportSheet:
    title: str
    columns: Sequence[ExportColumn]
    rows: Sequence[Mapping[str, object | None]]


INVALID_XML = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
EXCEL_EPOCH = datetime(1899, 12, 30)


def column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def clean_text(value: object) -> str:
    return INVALID_XML.sub("", str(value))


def excel_serial(value: date | datetime) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(UTC).replace(tzinfo=None)
        normalized = value
    else:
        normalized = datetime(value.year, value.month, value.day)
    delta = normalized - EXCEL_EPOCH
    serial = (
        Decimal(delta.days)
        + Decimal(delta.seconds) / Decimal(86_400)
        + Decimal(delta.microseconds) / Decimal(86_400_000_000)
    )
    return format(serial, "f")


def style_id(kind: CellKind, *, header: bool = False) -> int:
    if header:
        return 1
    return {
        CellKind.TEXT: 0,
        CellKind.NUMBER: 0,
        CellKind.DATE: 2,
        CellKind.DATETIME: 3,
        CellKind.MONEY: 4,
        CellKind.QUANTITY: 5,
    }[kind]


def cell_xml(reference: str, value: object | None, kind: CellKind) -> str:
    style = style_id(kind)
    style_attr = f' s="{style}"' if style else ""
    if value is None:
        return f'<c r="{reference}"{style_attr}/>'
    if kind == CellKind.TEXT:
        content = escape(clean_text(value))
        return (
            f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">'
            f"{content}</t></is></c>"
        )
    if kind in {CellKind.DATE, CellKind.DATETIME}:
        if not isinstance(value, (date, datetime)):
            raise TypeError(f"{kind.value} cell requires date or datetime")
        numeric = excel_serial(value)
    elif isinstance(value, bool):
        numeric = "1" if value else "0"
    elif isinstance(value, Decimal):
        numeric = format(value, "f")
    else:
        numeric = str(value)
    return f'<c r="{reference}"{style_attr}><v>{escape(numeric)}</v></c>'


def worksheet_xml(sheet: ExportSheet) -> str:
    last_column = column_name(len(sheet.columns))
    last_row = max(1, len(sheet.rows) + 1)
    widths = "".join(
        f'<col min="{index}" max="{index}" width="{column.width}" customWidth="1"/>'
        for index, column in enumerate(sheet.columns, start=1)
    )
    header_cells = "".join(
        (
            f'<c r="{column_name(index)}1" s="1" t="inlineStr"><is><t>'
            f"{escape(clean_text(column.title))}</t></is></c>"
        )
        for index, column in enumerate(sheet.columns, start=1)
    )
    body_rows: list[str] = []
    for row_index, row in enumerate(sheet.rows, start=2):
        cells = "".join(
            cell_xml(
                f"{column_name(column_index)}{row_index}",
                row.get(column.key),
                column.kind,
            )
            for column_index, column in enumerate(sheet.columns, start=1)
        )
        body_rows.append(f'<row r="{row_index}">{cells}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:{last_column}{last_row}"/>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" '
        'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>'
        f"<cols>{widths}</cols>"
        f'<sheetData><row r="1">{header_cells}</row>{"".join(body_rows)}</sheetData>'
        f'<autoFilter ref="A1:{last_column}{last_row}"/>'
        '</worksheet>'
    )


def workbook_xml(sheets: Sequence[ExportSheet]) -> str:
    sheet_nodes = "".join(
        f'<sheet name="{escape(clean_text(sheet.title))}" sheetId="{index}" '
        f'r:id="rId{index}"/>'
        for index, sheet in enumerate(sheets, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{sheet_nodes}</sheets></workbook>"
    )


def workbook_relationships(sheets: Sequence[ExportSheet]) -> str:
    relationships = "".join(
        '<Relationship '
        f'Id="rId{index}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet{index}.xml"/>'
        for index, _ in enumerate(sheets, start=1)
    )
    styles_id = len(sheets) + 1
    relationships += (
        '<Relationship '
        f'Id="rId{styles_id}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f"{relationships}</Relationships>"
    )


def content_types(sheets: Sequence[ExportSheet]) -> str:
    sheet_overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index, _ in enumerate(sheets, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" '
        'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        f"{sheet_overrides}</Types>"
    )


ROOT_RELATIONSHIPS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="xl/workbook.xml"/></Relationships>'
)

STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<numFmts count="4">'
    '<numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>'
    '<numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/>'
    '<numFmt numFmtId="166" formatCode="# ##0.00"/>'
    '<numFmt numFmtId="167" formatCode="0.######"/>'
    '</numFmts>'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
    '<fills count="3"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4C6EF5"/>'
    '<bgColor indexed="64"/></patternFill></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="6">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/>'
    '</cellStyles></styleSheet>'
)


def build_workbook(sheets: Sequence[ExportSheet]) -> bytes:
    if not sheets:
        raise ValueError("workbook requires at least one sheet")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types(sheets))
        archive.writestr("_rels/.rels", ROOT_RELATIONSHIPS)
        archive.writestr("xl/workbook.xml", workbook_xml(sheets))
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_relationships(sheets))
        archive.writestr("xl/styles.xml", STYLES)
        for index, sheet in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", worksheet_xml(sheet))
    return buffer.getvalue()
