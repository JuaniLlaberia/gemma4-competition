#!/usr/bin/env python3
"""
GAFA launcher.

Entry point for end-users after installation. Handles:
  - Finding a free port (starting at 8000)
  - Starting Ollama if installed but not running
  - Starting uvicorn in the background
  - Polling /health/ until the server is ready, then opening the browser
  - Showing a tkinter status window (close hides it; [Quit] stops everything)
"""

import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from tkinter import messagebox
import tkinter as tk

# ---------------------------------------------------------------------------
# Paths (all relative to this launcher's location)
# ---------------------------------------------------------------------------
INSTALL_DIR = Path(__file__).parent.resolve()
VENV_PYTHON = INSTALL_DIR / (
    ".venv/Scripts/pythonw.exe" if sys.platform == "win32" else ".venv/bin/python"
)
# Fallback to python.exe on Windows if pythonw.exe is absent (some uv builds omit it)
if sys.platform == "win32" and not VENV_PYTHON.exists():
    VENV_PYTHON = INSTALL_DIR / ".venv/Scripts/python.exe"

APP_DIR = INSTALL_DIR / "app"
ASSETS_DIR = INSTALL_DIR / "assets"
ICON_32 = ASSETS_DIR / "icon-32.png"

HEALTH_ENDPOINT = "/health/"
POLL_INTERVAL = 0.5   # seconds between /health/ polls
POLL_TIMEOUT = 60     # seconds to wait for server to come up

_ollama_proc: subprocess.Popen | None = None  # set if launcher started it
_server_proc: subprocess.Popen | None = None


# ---------------------------------------------------------------------------
# Port helpers
# ---------------------------------------------------------------------------

def find_free_port(start: int = 8000) -> int:
    """Scan upward from `start` until a free TCP port is found."""
    port = start
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
        port += 1


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------

def find_ollama_exe() -> str | None:
    if shutil.which("ollama"):
        return "ollama"
    if sys.platform == "win32":
        import os
        candidate = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Ollama" / "ollama.exe"
        if candidate.exists():
            return str(candidate)
    return None


def ollama_running() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 11434), timeout=2):
            return True
    except OSError:
        return False


def ensure_ollama_running() -> None:
    global _ollama_proc
    if ollama_running():
        return
    try:
        if sys.platform == "win32":
            # On Windows, launch the tray app — it starts the server automatically
            import os
            ollama_app = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Ollama" / "ollama app.exe"
            if ollama_app.exists():
                _ollama_proc = subprocess.Popen([str(ollama_app)])
        else:
            ollama_exe = find_ollama_exe()
            if ollama_exe is not None:
                _ollama_proc = subprocess.Popen(
                    [ollama_exe, "serve"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
    except Exception:
        pass


def kill_any_ollama() -> None:
    """Kill any running Ollama process (regardless of who started it)."""
    if sys.platform == "win32":
        # "ollama app.exe" is the tray/server process name on Windows
        subprocess.run(["taskkill", "/IM", "ollama app.exe", "/F"],
                       capture_output=True)
    else:
        subprocess.run(["pkill", "-f", "ollama serve"], capture_output=True)
    # Also clean up launcher-started process handle
    stop_ollama()


# ---------------------------------------------------------------------------
# Server management
# ---------------------------------------------------------------------------

def start_server(port: int) -> None:
    global _server_proc
    cmd = [
        str(VENV_PYTHON),
        "-m", "uvicorn",
        "server:app",
        "--host", "127.0.0.1",
        "--port", str(port),
    ]
    _server_proc = subprocess.Popen(
        cmd,
        cwd=str(APP_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_for_server(port: int) -> bool:
    """Poll /health/ until the server responds or timeout is reached."""
    import urllib.request
    url = f"http://127.0.0.1:{port}{HEALTH_ENDPOINT}"
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(POLL_INTERVAL)
    return False


def stop_server() -> None:
    if _server_proc is not None and _server_proc.poll() is None:
        _server_proc.terminate()
        try:
            _server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _server_proc.kill()


def stop_ollama() -> None:
    """Stop the Ollama process started by this launcher (if any)."""
    if _ollama_proc is not None and _ollama_proc.poll() is None:
        _ollama_proc.terminate()
        try:
            _ollama_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _ollama_proc.kill()


# ---------------------------------------------------------------------------
# tkinter window
# ---------------------------------------------------------------------------

class StatusWindow:
    def __init__(self, port: int) -> None:
        self.port = port
        self.url = f"http://localhost:{port}"
        self._hidden_notified = False

        self.root = tk.Tk()
        self.root.title("GAFA")
        self.root.resizable(False, False)

        if ICON_32.exists():
            try:
                icon = tk.PhotoImage(file=str(ICON_32))
                self.root.iconphoto(True, icon)
            except Exception:
                pass

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        root = self.root
        root.configure(bg="#1a1a1a")

        # Status row — starts yellow/gray; turns green once server is ready
        status_frame = tk.Frame(root, bg="#1a1a1a")
        status_frame.pack(fill="x", padx=20, pady=(18, 4))

        self._status_dot = tk.Label(
            status_frame, text="●", fg="#eab308", bg="#1a1a1a",
            font=("Helvetica", 14),
        )
        self._status_dot.pack(side="left")

        self._status_text = tk.Label(
            status_frame, text="  Starting server...", fg="#9ca3af", bg="#1a1a1a",
            font=("Helvetica", 12),
        )
        self._status_text.pack(side="left")

        # URL label
        url_label = tk.Label(
            root, text=self.url, fg="#6b7280", bg="#1a1a1a",
            font=("Helvetica", 10), cursor="hand2",
        )
        url_label.pack(padx=20, pady=(4, 2))
        url_label.bind("<Button-1>", lambda _: webbrowser.open(self.url))

        # Ollama reminder
        tk.Label(
            root,
            text="Keep Ollama running while using GAFA.",
            fg="#4b5563", bg="#1a1a1a",
            font=("Helvetica", 9),
        ).pack(padx=20, pady=(2, 8))

        # Buttons
        btn_frame = tk.Frame(root, bg="#1a1a1a")
        btn_frame.pack(padx=20, pady=(0, 18))

        self._open_btn = tk.Button(
            btn_frame,
            text="Open in browser",
            command=lambda: webbrowser.open(self.url),
            bg="#d1d5db", fg="#6b7280",      # dimmed until ready
            activebackground="#e5e7eb",
            relief="flat", bd=0,
            padx=14, pady=6,
            font=("Helvetica", 10, "bold"),
            cursor="hand2",
            state="disabled",
        )
        self._open_btn.pack(side="left", padx=(0, 8))

        tk.Button(
            btn_frame,
            text="Quit",
            command=self._quit,
            bg="#1f2937", fg="#d1d5db",
            activebackground="#374151",
            relief="flat", bd=0,
            padx=14, pady=6,
            font=("Helvetica", 10),
            cursor="hand2",
        ).pack(side="left")

    def set_ready(self) -> None:
        """Switch status to green 'Server running'. Must be called on main thread."""
        self._status_dot.config(fg="#22c55e")
        self._status_text.config(text="  Server running", fg="#e5e7eb")
        self._open_btn.config(
            state="normal", bg="#ffffff", fg="#000000",
        )

    def _on_close(self) -> None:
        """Hide the window instead of closing it."""
        self.root.withdraw()
        if not self._hidden_notified:
            self._hidden_notified = True
            messagebox.showinfo(
                "GAFA",
                "GAFA is still running in the background.\nUse Quit to stop it.",
            )

    def _quit(self) -> None:
        if ollama_running():
            if messagebox.askyesno("GAFA", "Also shut down Ollama?"):
                kill_any_ollama()
            else:
                stop_ollama()   # still clean up launcher-started handle if any
        else:
            stop_ollama()
        stop_server()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    port = find_free_port(8000)

    ensure_ollama_running()
    start_server(port)

    window = StatusWindow(port)

    def _open_when_ready() -> None:
        if wait_for_server(port):
            window.root.after(0, window.set_ready)
            webbrowser.open(f"http://localhost:{port}")
        else:
            window.root.after(0, lambda: messagebox.showerror(
                "GAFA",
                "The server did not start within the expected time.\n"
                "Check that all dependencies are installed correctly.",
            ))

    threading.Thread(target=_open_when_ready, daemon=True).start()

    window.run()


if __name__ == "__main__":
    main()
