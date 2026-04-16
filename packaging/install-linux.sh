#!/usr/bin/env bash
# GAFA — Linux Installer
# Run this script from inside the extracted gafa/ directory:
#   bash install-linux.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo ""
echo "  ██████╗  █████╗ ███████╗ █████╗ "
echo " ██╔════╝ ██╔══██╗██╔════╝██╔══██╗"
echo " ██║  ███╗███████║█████╗  ███████║"
echo " ██║   ██║██╔══██║██╔══╝  ██╔══██║"
echo " ╚██████╔╝██║  ██║██║     ██║  ██║"
echo "  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝"
echo ""
echo "  Gemma Assisted Fact Analyzer — Linux Installer"
echo "======================================================="
echo ""

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if ! command -v curl &>/dev/null; then
  echo "Error: curl is required but not installed."
  echo "Install it with:  sudo apt install curl   (or dnf / pacman)"
  exit 1
fi

# Detect architecture
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then
  UV_ARCH="x86_64-unknown-linux-gnu"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  UV_ARCH="aarch64-unknown-linux-gnu"
else
  echo "Error: unsupported architecture: $ARCH"
  exit 1
fi

# Resolve the directory that contains this script (the extracted archive root)
SCRIPT_DIR="$(cd "$(dirname "$(realpath "$0")")" && pwd)"

# ---------------------------------------------------------------------------
# Interactive questions
# ---------------------------------------------------------------------------
echo "Please answer the following questions to configure your installation."
echo "(Press Enter to accept the default shown in brackets.)"
echo ""

read -rp "Install directory [${HOME}/gafa]: " INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-${HOME}/gafa}"

echo ""
echo "Variant:"
echo "  1) CPU only  (recommended — ~400 MB download, works on any machine)"
echo "  2) GPU — NVIDIA CUDA 12.1  (~2.5 GB download, requires NVIDIA GPU)"
read -rp "Choice [1]: " VARIANT_CHOICE
if [ "${VARIANT_CHOICE:-1}" = "2" ]; then
  VARIANT="gpu"
else
  VARIANT="cpu"
fi

echo ""
read -rp "LLM model name [gemma4:e4b]: " MODEL
MODEL="${MODEL:-gemma4:e4b}"

echo ""
read -rp "Save files directory [${INSTALL_DIR}/data]: " SAVE_DIR
SAVE_DIR="${SAVE_DIR:-${INSTALL_DIR}/data}"

echo ""
echo "-------------------------------------------------------"
echo "  Install dir : ${INSTALL_DIR}"
echo "  Variant     : ${VARIANT}"
echo "  Model       : ${MODEL}"
echo "  Save dir    : ${SAVE_DIR}"
echo "-------------------------------------------------------"
echo ""
read -rp "Proceed with installation? [Y/n]: " CONFIRM
if [[ "${CONFIRM,,}" == "n" ]]; then
  echo "Installation cancelled."
  exit 0
fi

# ---------------------------------------------------------------------------
# Create directory structure
# ---------------------------------------------------------------------------
echo ""
echo "[1/8] Creating installation directory..."
mkdir -p "${INSTALL_DIR}/bin"
mkdir -p "${INSTALL_DIR}/app"
mkdir -p "${INSTALL_DIR}/assets"
mkdir -p "${SAVE_DIR}"

# ---------------------------------------------------------------------------
# Copy application files
# ---------------------------------------------------------------------------
echo "[2/8] Copying application files..."
cp -r "${SCRIPT_DIR}/src"          "${INSTALL_DIR}/app/"
cp    "${SCRIPT_DIR}/__main__.py"  "${INSTALL_DIR}/app/"
cp    "${SCRIPT_DIR}/server.py"    "${INSTALL_DIR}/app/"
cp    "${SCRIPT_DIR}/requirements-base.txt" "${INSTALL_DIR}/"
cp    "${SCRIPT_DIR}/requirements-cpu.txt"  "${INSTALL_DIR}/"
cp    "${SCRIPT_DIR}/requirements-gpu.txt"  "${INSTALL_DIR}/"
cp    "${SCRIPT_DIR}/launcher.py"      "${INSTALL_DIR}/"
cp    "${SCRIPT_DIR}/post-install.py"  "${INSTALL_DIR}/"
# Copy assets if present (at root in the bundle, under packaging/ in the repo)
if [ -d "${SCRIPT_DIR}/assets" ]; then
  cp -r "${SCRIPT_DIR}/assets/." "${INSTALL_DIR}/assets/"
elif [ -d "${SCRIPT_DIR}/packaging/assets" ]; then
  cp -r "${SCRIPT_DIR}/packaging/assets/." "${INSTALL_DIR}/assets/"
fi

# ---------------------------------------------------------------------------
# Download uv
# ---------------------------------------------------------------------------
echo "[3/8] Downloading uv package manager..."
UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-${UV_ARCH}.tar.gz"
curl -LsSf "${UV_URL}" \
  | tar -xz -C "${INSTALL_DIR}/bin" --strip-components=1 "uv-${UV_ARCH}/uv"
chmod +x "${INSTALL_DIR}/bin/uv"
UV="${INSTALL_DIR}/bin/uv"

# ---------------------------------------------------------------------------
# Install Python 3.12
# ---------------------------------------------------------------------------
echo "[4/8] Installing Python 3.12 (portable)..."
"${UV}" python install 3.12 --install-dir "${INSTALL_DIR}/python"

# ---------------------------------------------------------------------------
# Create virtual environment
# ---------------------------------------------------------------------------
echo "[5/8] Creating virtual environment..."
"${UV}" venv "${INSTALL_DIR}/.venv" --python 3.12

# ---------------------------------------------------------------------------
# Install Python packages
# ---------------------------------------------------------------------------
echo "[6/8] Installing Python packages (${VARIANT} variant)..."
echo "      This may take several minutes on first install."
"${UV}" pip install \
  -r "${INSTALL_DIR}/requirements-${VARIANT}.txt" \
  --index-strategy unsafe-best-match \
  --python "${INSTALL_DIR}/.venv/bin/python"

# ---------------------------------------------------------------------------
# Install Ollama (if not present)
# ---------------------------------------------------------------------------
echo "[7/8] Checking for Ollama..."
if ! command -v ollama &>/dev/null; then
  echo "      Ollama not found. Installing via official script..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "      Ollama already installed."
fi

# ---------------------------------------------------------------------------
# Post-install: models + .env
# ---------------------------------------------------------------------------
echo "[8/8] Running post-install setup (pulling models, configuring .env)..."
"${INSTALL_DIR}/.venv/bin/python" "${INSTALL_DIR}/post-install.py" \
  --install-dir "${INSTALL_DIR}" \
  --save-dir    "${SAVE_DIR}" \
  --model       "${MODEL}" \
  --variant     "${VARIANT}"

# ---------------------------------------------------------------------------
# Write gafa.sh launcher wrapper
# ---------------------------------------------------------------------------
cat > "${INSTALL_DIR}/gafa.sh" << 'LAUNCHER_EOF'
#!/usr/bin/env bash
# GAFA launcher wrapper
cd "$(dirname "$(realpath "$0")")"
exec .venv/bin/python launcher.py "$@"
LAUNCHER_EOF
chmod +x "${INSTALL_DIR}/gafa.sh"

# ---------------------------------------------------------------------------
# Write uninstall.sh
# ---------------------------------------------------------------------------
# MODEL, EMBEDDING_MODEL, and SAVE_DIR are baked in at install time
cat > "${INSTALL_DIR}/uninstall.sh" << UNINSTALL_EOF
#!/usr/bin/env bash
# GAFA uninstaller
set -euo pipefail

INSTALL_DIR="\$(dirname "\$(realpath "\$0")")"
OLLAMA_MODEL="${MODEL}"
OLLAMA_EMBEDDING_MODEL="embeddinggemma"
SAVE_DIR="${SAVE_DIR}"

echo "======================================================="
echo "  GAFA Uninstaller"
echo "======================================================="
echo ""

# Optional: remove pulled Ollama models
read -rp "Remove downloaded Ollama models (${MODEL} + embeddinggemma)? [y/N]: " RM_MODELS
if [[ "\${RM_MODELS,,}" == "y" ]]; then
  if command -v ollama &>/dev/null; then
    echo "Removing model: \${OLLAMA_MODEL}"
    ollama rm "\${OLLAMA_MODEL}" 2>/dev/null || echo "  (model not found or already removed)"
    echo "Removing model: \${OLLAMA_EMBEDDING_MODEL}"
    ollama rm "\${OLLAMA_EMBEDDING_MODEL}" 2>/dev/null || echo "  (model not found or already removed)"
  else
    echo "  Ollama not found on PATH — skipping model removal."
  fi
fi

# Optional: uninstall Ollama
read -rp "Uninstall Ollama itself? [y/N]: " RM_OLLAMA
if [[ "\${RM_OLLAMA,,}" == "y" ]]; then
  echo "Removing Ollama..."
  sudo rm -f /usr/local/bin/ollama
  sudo rm -rf /usr/local/lib/ollama
  rm -rf ~/.ollama
  echo "  Ollama removed."
fi

# Remove desktop entries and app directory
echo ""
echo "Removing GAFA..."
rm -f ~/.local/share/applications/gafa.desktop
rm -f ~/Desktop/gafa.desktop
update-desktop-database ~/.local/share/applications 2>/dev/null || true
rm -rf "\${INSTALL_DIR}"

echo ""
echo "GAFA has been uninstalled."
echo "Note: your data directory was NOT deleted. Remove it manually if needed:"
echo "  \${SAVE_DIR}"
UNINSTALL_EOF
chmod +x "${INSTALL_DIR}/uninstall.sh"

# ---------------------------------------------------------------------------
# Desktop integration
# ---------------------------------------------------------------------------
DESKTOP_DIR="${HOME}/.local/share/applications"
mkdir -p "${DESKTOP_DIR}"

cat > "${DESKTOP_DIR}/gafa.desktop" << DESKTOP_EOF
[Desktop Entry]
Name=GAFA
GenericName=Fact Checker
Comment=Gemma Assisted Fact Analyzer
Exec=${INSTALL_DIR}/.venv/bin/python ${INSTALL_DIR}/launcher.py
Icon=${INSTALL_DIR}/assets/icon-512.png
Type=Application
Terminal=false
Categories=Utility;Science;
StartupWMClass=gafa
DESKTOP_EOF

chmod +x "${DESKTOP_DIR}/gafa.desktop"

# Copy to Desktop if directory exists
if [ -d "${HOME}/Desktop" ]; then
  cp "${DESKTOP_DIR}/gafa.desktop" "${HOME}/Desktop/gafa.desktop"
  chmod +x "${HOME}/Desktop/gafa.desktop"
fi

# Refresh desktop database
update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "======================================================="
echo "  GAFA installation complete!"
echo "======================================================="
echo ""
echo "  Launch options:"
echo "    • Double-click the GAFA icon in your application menu"
if [ -d "${HOME}/Desktop" ]; then
echo "    • Double-click the GAFA icon on your Desktop"
fi
echo "    • Run from terminal:  ${INSTALL_DIR}/gafa.sh"
echo ""
echo "  To uninstall:"
echo "    bash ${INSTALL_DIR}/uninstall.sh"
echo ""
