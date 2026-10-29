from pathlib import Path
import pytest
from services.document_processor import extract_text_from_pdf, extract_text_from_docx

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def test_extract_pdf_sample():
    sample_pdf = DATA_DIR / "01_NLP_in_Healthcare.pdf"
    assert sample_pdf.exists(), f"Sample PDF missing at {sample_pdf}"

    pages = extract_text_from_pdf(str(sample_pdf))
    assert len(pages) >= 1
    assert pages[0]["page_number"] == 1
    assert "Healthcare" in pages[0]["text"] or "clinical" in pages[0]["text"].lower()


def test_extract_docx_sample():
    sample_docx = DATA_DIR / "02_NLP_in_Education.docx"
    assert sample_docx.exists(), f"Sample DOCX missing at {sample_docx}"

    pages = extract_text_from_docx(str(sample_docx))
    assert len(pages) == 1
    assert pages[0]["page_number"] == 1
    assert "education" in pages[0]["text"].lower() or "learning" in pages[0]["text"].lower()


def test_missing_files_raise_not_found():
    with pytest.raises(FileNotFoundError):
        extract_text_from_pdf("non_existent_document.pdf")

    with pytest.raises(FileNotFoundError):
        extract_text_from_docx("non_existent_document.docx")


def test_corrupted_file_handling(tmp_path):
    corrupted_pdf = tmp_path / "corrupted.pdf"
    corrupted_pdf.write_bytes(b"This is not a real PDF binary stream")

    with pytest.raises(ValueError, match="Failed to open PDF document"):
        extract_text_from_pdf(str(corrupted_pdf))
