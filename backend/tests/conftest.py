import sys
from pathlib import Path

# Add backend directory to sys.path so modules like services and main can be imported cleanly
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest

@pytest.fixture(scope="session", autouse=True)
def restore_database_after_tests():
    yield
    try:
        from services.vector_store import get_collection_count
        from main import index_all_disk_documents
        if get_collection_count() == 0:
            index_all_disk_documents()
    except Exception:
        pass
