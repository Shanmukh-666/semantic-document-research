from pathlib import Path
from typing import Iterator, List, Dict, Any
import pymupdf
from docx import Document


def iter_text_from_pdf(file_path: str, max_pages: int | None = None) -> Iterator[Dict[str, Any]]:
    """
    Extracts text per page from a PDF file.
    Preserves page number metadata and handles empty or scanned pages.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        doc = pymupdf.open(str(path))
    except Exception as e:
        raise ValueError(f"Failed to open PDF document: {str(e)}")

    try:
        for page_number, page in enumerate(doc, start=1):
            if max_pages is not None and page_number > max_pages:
                raise ValueError(f"Document exceeds the maximum allowed page count ({max_pages}).")
            text = page.get_text()
            yield {
                "page_number": page_number,
                "text": text.strip() if text else ""
            }
    finally:
        try:
            doc.close()
        except Exception:
            pass
        del doc
        import gc
        gc.collect()

def extract_text_from_pdf(file_path: str) -> List[Dict[str, Any]]:
    return list(iter_text_from_pdf(file_path))


def iter_text_from_docx(file_path: str, max_pages: int | None = None) -> Iterator[Dict[str, Any]]:
    """Yields DOCX text records without retaining a second full-document string."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    try:
        doc = Document(str(path))
    except Exception as e:
        raise ValueError(f"Failed to open DOCX document: {str(e)}")

    try:
        if max_pages is not None and max_pages < 1:
            raise ValueError(f"Document exceeds the maximum allowed page count ({max_pages}).")
        for paragraph in doc.paragraphs:
            text = paragraph.text.strip()
            if text:
                yield {"page_number": 1, "text": text}
        for table in doc.tables:
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_cells:
                    yield {"page_number": 1, "text": " | ".join(row_cells)}
    finally:
        del doc
        import gc
        gc.collect()


def extract_text_from_docx(file_path: str) -> List[Dict[str, Any]]:
    """
    Extracts text from a DOCX document including paragraphs and tables.
    Preserves paragraph breaks for chunking.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    return [{"page_number": 1, "text": "\n\n".join(
        page["text"] for page in iter_text_from_docx(file_path)
    )}]


def extract_text_from_txt(file_path: str) -> List[Dict[str, Any]]:
    """
    Extracts text from a plain text (.txt) or markdown (.md) file.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except Exception as e:
        raise ValueError(f"Failed to read text file: {str(e)}")

    return [
        {
            "page_number": 1,
            "text": text.strip()
        }
    ]