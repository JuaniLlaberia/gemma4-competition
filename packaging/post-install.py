#!/usr/bin/env python3
"""
GAFA post-install script.

Called by both the Windows and Linux installers after `uv pip install` completes.
Responsible for:
  - Checking/starting Ollama
  - Pulling the LLM model and the embedding model
  - Pre-downloading docling HuggingFace models
  - Writing the .env file

Usage:
    python post-install.py \
        --install-dir /path/to/install \
        --save-dir /path/to/data \
        --model gemma4:e4b \
        --variant cpu
"""

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

EMBEDDING_MODEL = "embeddinggemma"
OLLAMA_PORT = 11434
OLLAMA_POLL_INTERVAL = 2  # seconds
OLLAMA_POLL_TIMEOUT = 120  # seconds


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------

def find_ollama_exe() -> str | None:
    """Return the path to the ollama executable, or None if not found."""
    if shutil.which("ollama"):
        return "ollama"
    if sys.platform == "win32":
        candidate = os.path.join(
            os.environ.get("LOCALAPPDATA", ""),
            "Programs", "Ollama", "ollama.exe",
        )
        if os.path.exists(candidate):
            return candidate
    return None


def ollama_running() -> bool:
    """Return True if Ollama is already listening on localhost:11434."""
    try:
        with socket.create_connection(("127.0.0.1", OLLAMA_PORT), timeout=2):
            return True
    except OSError:
        return False


def start_ollama(ollama_exe: str) -> subprocess.Popen | None:
    """Start `ollama serve` in the background. Returns the Popen object."""
    print("Starting Ollama server...")
    try:
        proc = subprocess.Popen(
            [ollama_exe, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return proc
    except Exception as exc:
        print(f"Warning: could not start Ollama automatically: {exc}", file=sys.stderr)
        return None


def wait_for_ollama(timeout: int = OLLAMA_POLL_TIMEOUT) -> bool:
    """Poll localhost:11434 until Ollama responds or timeout is reached."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if ollama_running():
            return True
        print("  Waiting for Ollama to start...", flush=True)
        time.sleep(OLLAMA_POLL_INTERVAL)
    return False


def pull_model(ollama_exe: str, model: str) -> None:
    """Pull an Ollama model, streaming progress to stdout."""
    print(f"\nPulling model: {model}")
    result = subprocess.run([ollama_exe, "pull", model])
    if result.returncode != 0:
        print(f"Error: failed to pull model '{model}'.", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Docling model pre-download
# ---------------------------------------------------------------------------

def download_docling_models() -> None:
    """Pre-download docling HuggingFace models so the first run is fast."""
    print("\nDownloading docling layout/OCR models (this may take a while)...")
    try:
        from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline
        StandardPdfPipeline.download_models_hf()
        print("  Docling models downloaded successfully.")
    except Exception as exc:
        print(
            f"Warning: docling model download failed: {exc}\n"
            "You can retry by running this script again.",
            file=sys.stderr,
        )


# ---------------------------------------------------------------------------
# .env writer
# ---------------------------------------------------------------------------

def write_env(install_dir: Path, save_dir: Path, model: str) -> None:
    app_dir = install_dir / "app"
    app_dir.mkdir(parents=True, exist_ok=True)
    env_path = app_dir / ".env"
    env_content = (
        f"SAVE_FILE_DIRECTORY={save_dir}\n"
        f"OLLAMA_MODEL={model}\n"
        f"OLLAMA_BASE_URL=http://localhost:{OLLAMA_PORT}\n"
    )
    env_path.write_text(env_content)
    print(f"\n.env written to: {env_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="GAFA post-install setup")
    parser.add_argument("--install-dir", required=True, type=Path,
                        help="Root installation directory")
    parser.add_argument("--save-dir", required=True, type=Path,
                        help="Directory for user save files")
    parser.add_argument("--model", default="gemma4:e4b",
                        help="Ollama LLM model to pull (default: gemma4:e4b)")
    parser.add_argument("--variant", choices=["cpu", "gpu"], default="cpu",
                        help="Install variant: cpu or gpu")
    args = parser.parse_args()

    install_dir: Path = args.install_dir.resolve()
    save_dir: Path = args.save_dir.resolve()

    print("=" * 60)
    print("GAFA — Post-install setup")
    print("=" * 60)
    print(f"  Install dir : {install_dir}")
    print(f"  Save dir    : {save_dir}")
    print(f"  Model       : {args.model}")
    print(f"  Variant     : {args.variant}")
    print()

    # Ensure save dir exists
    save_dir.mkdir(parents=True, exist_ok=True)

    # ---- Ollama ----
    ollama_exe = find_ollama_exe()
    if ollama_exe is None:
        print(
            "Error: Ollama executable not found.\n"
            "Please install Ollama from https://ollama.com and re-run this script.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Found Ollama at: {ollama_exe}")

    started_ollama = False
    if not ollama_running():
        proc = start_ollama(ollama_exe)
        if proc is not None:
            started_ollama = True
        if not wait_for_ollama():
            print(
                "Error: Ollama did not start within the expected time.\n"
                "Please start Ollama manually and re-run this script.",
                file=sys.stderr,
            )
            sys.exit(1)
    else:
        print("Ollama is already running.")

    # ---- Pull models ----
    pull_model(ollama_exe, args.model)
    pull_model(ollama_exe, EMBEDDING_MODEL)

    # ---- Docling models ----
    download_docling_models()

    # ---- Write .env ----
    write_env(install_dir, save_dir, args.model)

    print("\n" + "=" * 60)
    print("Setup complete! You can now launch GAFA.")
    print("=" * 60)


if __name__ == "__main__":
    main()
