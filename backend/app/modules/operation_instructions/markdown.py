from html.parser import HTMLParser
from typing import cast

from markdown_it import MarkdownIt


def _renderer() -> MarkdownIt:
    renderer = MarkdownIt(
        "commonmark",
        {"html": False, "linkify": False, "typographer": False},
    )
    renderer.enable("table")
    return renderer


def render_markdown(content: str) -> str:
    """Render Markdown while treating embedded HTML as text.

    markdown-it also rejects unsafe link protocols such as javascript:. Raw HTML
    remains disabled, so the returned fragment can be embedded by the clients.
    """

    return cast(str, _renderer().render(content))


class _PlainTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"br", "hr"}:
            self.parts.append("\n")
        elif tag == "li":
            self.parts.append("• ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}:
            self.parts.append("\n")
        elif tag in {"td", "th"}:
            self.parts.append("\t")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def markdown_to_text(content: str) -> str:
    parser = _PlainTextParser()
    parser.feed(render_markdown(content))
    lines = [line.rstrip() for line in "".join(parser.parts).splitlines()]
    result: list[str] = []
    for line in lines:
        if line or (result and result[-1]):
            result.append(line)
    return "\n".join(result).strip() + "\n"
