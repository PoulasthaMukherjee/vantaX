"""
Certificate generation utilities.

Generates simple PDF certificates without external dependencies.
"""

from __future__ import annotations

from datetime import datetime


def _pdf_escape_text(value: str) -> str:
    """
    Escape text for use inside a PDF literal string ( ... ).

    PDF strings are byte-oriented; we replace non-Latin-1 chars with '?'.
    """
    safe = value.encode("latin-1", "replace").decode("latin-1")
    return safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_minimal_pdf(content_stream: bytes) -> bytes:
    """
    Build a minimal single-page PDF.

    The content stream should contain valid PDF page drawing commands.
    """
    objs: list[bytes] = []

    # 1. Catalog
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    # 2. Pages
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    # 3. Page
    objs.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
    )
    # 4. Contents
    objs.append(
        b"<< /Length "
        + str(len(content_stream)).encode("ascii")
        + b" >>\nstream\n"
        + content_stream
        + b"\nendstream"
    )
    # 5. Font (Helvetica)
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    out = bytearray()
    out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    offsets: list[int] = [0]
    for i, obj in enumerate(objs, start=1):
        offsets.append(len(out))
        out.extend(f"{i} 0 obj\n".encode("ascii"))
        out.extend(obj)
        if not obj.endswith(b"\n"):
            out.extend(b"\n")
        out.extend(b"endobj\n")

    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objs) + 1}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))

    out.extend(b"trailer\n")
    out.extend(f"<< /Size {len(objs) + 1} /Root 1 0 R >>\n".encode("ascii"))
    out.extend(b"startxref\n")
    out.extend(f"{xref_pos}\n".encode("ascii"))
    out.extend(b"%%EOF\n")

    return bytes(out)


def generate_certificate_pdf(
    *,
    title: str,
    recipient_name: str,
    event_title: str,
    score: float,
    issued_at: datetime,
) -> bytes:
    """
    Generate a simple PDF certificate.
    """
    lines = [
        ("Certificate", 34),
        (title, 20),
        ("", 12),
        ("Awarded to", 14),
        (recipient_name, 24),
        ("", 12),
        (f"For participation in {event_title}", 14),
        (f"Score: {score:.2f}", 14),
        (f"Issued: {issued_at.strftime('%Y-%m-%d')}", 12),
    ]

    # Build a basic text-only PDF content stream.
    # Coordinates are in points; origin is bottom-left.
    content_lines: list[str] = ["BT", "/F1 12 Tf", "72 700 Td"]
    y_step = 28

    first = True
    for text, font_size in lines:
        if first:
            content_lines.append(f"/F1 {font_size} Tf")
            first = False
        else:
            content_lines.append(f"0 -{y_step} Td")
            content_lines.append(f"/F1 {font_size} Tf")

        if text:
            content_lines.append(f"({_pdf_escape_text(text)}) Tj")
        else:
            # Blank line
            content_lines.append("() Tj")

    content_lines.append("ET")
    content_stream = "\n".join(content_lines).encode("ascii", "strict")
    return _build_minimal_pdf(content_stream)
