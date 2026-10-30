#!/usr/bin/env bash
set -e

export PATH="/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"

echo "=== Installing llama.cpp server runtime ==="

if command -v llama-server &> /dev/null; then
    echo "llama-server is already available in PATH: $(which llama-server)"
    exit 0
fi

if [ -f "$SCRIPT_DIR/llama-server" ]; then
    echo "llama-server binary already exists in $SCRIPT_DIR"
    exit 0
fi

echo "Building llama.cpp from source into $BUILD_DIR..."
mkdir -p "$BUILD_DIR"
git clone --depth 1 https://github.com/ggerganov/llama.cpp.git "$BUILD_DIR/llama.cpp" || true

cd "$BUILD_DIR/llama.cpp"
cmake -B build
cmake --build build --config Release -j 4 --target llama-server

cp build/bin/llama-server "$SCRIPT_DIR/llama-server"
chmod +x "$SCRIPT_DIR/llama-server"

echo "=== llama-server successfully built and installed to $SCRIPT_DIR/llama-server ==="
