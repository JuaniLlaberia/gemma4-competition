#!/usr/bin/env python3
"""
GAFA Linux interactive installer wizard.

Asks the user the four install questions, then drives the rest of the
installation by calling uv and post-install.py.

This script is bundled in the gafa-linux.tar.gz archive and run from there,
NOT from the installed location.  It should be called by install-linux.sh
after uv pip install has already completed (so questionary is available).

Usage:
    python installer-wizard.py \
        --install-dir /resolved/install/dir \
        --save-dir /resolved/save/dir \
        --model gemma4:e4b \
        --variant cpu
"""

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    # installer-wizard.py receives its answers from install-linux.sh via args
    # (the shell script handles the interactive prompts using bash read).
    # This script is the Python-side driver that runs after the shell has
    # collected all answers.
    parser = argparse.ArgumentParser(description="GAFA installer wizard (Linux)")
    parser.add_argument("--install-dir", required=True, type=Path)
    parser.add_argument("--save-dir", required=True, type=Path)
    parser.add_argument("--model", required=True)
    parser.add_argument("--variant", choices=["cpu", "gpu"], required=True)
    args = parser.parse_args()

    install_dir = args.install_dir.resolve()
    save_dir = args.save_dir.resolve()

    venv_python = install_dir / ".venv" / "bin" / "python"
    post_install = install_dir / "post-install.py"

    print("\nRunning post-install setup...")
    result = subprocess.run(
        [
            str(venv_python),
            str(post_install),
            "--install-dir", str(install_dir),
            "--save-dir", str(save_dir),
            "--model", args.model,
            "--variant", args.variant,
        ]
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
