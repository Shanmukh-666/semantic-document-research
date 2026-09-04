import pymupdf
from docx import Document


def extract_text_from_pdf(file_path: str):
    document = pymupdf.open(file_path)

    pages = []

    for page_number, page in enumerate(document, start=1):
        text = page.get_text()

        pages.append({
            "page_number": page_number,
            "text": text
        })

    document.close()

    return pages


def extract_text_from_docx(file_path: str):
    document = Document(file_path)

    text_parts = []

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()

        if text:
            text_parts.append(text)

    full_text = "\n".join(text_parts)

    return [
        {
            "page_number": 1,
            "text": full_text
        }
    ]