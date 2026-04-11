import threading
from typing import Optional

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_docling import DoclingLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

class VectorStoreManager:
    """
    Singleton wrapper around a FAISS vector store.
    """
    _instance: Optional["VectorStoreManager"] = None
    _lock: threading.Lock = threading.Lock()

    def __new__(cls) -> "VectorStoreManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialised = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialised:
            return
        self._db: Optional[FAISS] = None
        self._embeddings: OllamaEmbeddings = OllamaEmbeddings(model="embeddinggemma")
        self._rw_lock: threading.RLock = threading.RLock()
        self._ready: bool = False
        self._initialised: bool = True

    def initialize(self, load_path: Optional[str] = None) -> None:
        """
        Must be called once at application startup.

        Args:
            load_path: If provided, loads an existing index from disk.
                       Otherwise creates a fresh empty index.
        """
        with self._rw_lock:
            if self._ready:
                return

            if load_path:
                self._db = FAISS.load_local(
                    load_path,
                    self._embeddings,
                    allow_dangerous_deserialization=True,
                )
            else:
                placeholder = Document(
                    page_content="__init__",
                    metadata={"_placeholder": True},
                )
                self._db = FAISS.from_documents([placeholder], self._embeddings)

            self._ready = True

    def _assert_ready(self) -> None:
        if not self._ready:
            raise RuntimeError(
                "VectorStoreManager is not initialised. "
                "Call vector_store_manager.initialize() inside your app lifespan."
            )

    def get_db(self) -> FAISS:
        self._assert_ready()
        return self._db

    def clear(self) -> None:
        """
        Clears the current vector store and resets it to an empty state.
        Should be used between user sessions to prevent conflicts.
        """
        self._assert_ready()
        with self._rw_lock:
            placeholder = Document(
                page_content="__init__",
                metadata={"_placeholder": True},
            )
            self._db = FAISS.from_documents([placeholder], self._embeddings)

    def add_documents(self, documents: list[Document]) -> list[str]:
        self._assert_ready()
        with self._rw_lock:
            return self._db.add_documents(documents)

    def process_and_add_documents(self, file_paths: list[str]) -> list[str]:
        """
        Extracts content from physical files using Docling, splits the text into chunks,
        and adds them to the vector store.
        """
        self._assert_ready()
        
        all_splits = []
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=75,
        )

        for file_path in file_paths:
            loader = DoclingLoader(file_path)
            docs = loader.load()
            splits = text_splitter.split_documents(docs)
            all_splits.extend(splits)
            
        if not all_splits:
            return []
            
        return self.add_documents(all_splits)

    def similarity_search(self, query: str, k: int = 4) -> list[Document]:
        self._assert_ready()
        return self._db.similarity_search(
            query, k=k, filter={"_placeholder": False}
        )

    def save(self, path: str) -> None:
        self._assert_ready()
        self._db.save_local(path)

# Module-level singleton
vector_store_manager = VectorStoreManager()