#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$AI_DIR/config.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found at $CONFIG_FILE"
    exit 1
fi

# Extract values from ai/config.yaml using node inline. Write plain strings: console.log of a
# number is colorized when FORCE_COLOR is set (e.g. under concurrently/pnpm dev).
HOST=$(node -e "const fs = require('fs'), yaml = require('$AI_DIR/gateway/node_modules/js-yaml'); const c = yaml.load(fs.readFileSync('$CONFIG_FILE')); process.stdout.write(String(c.runtime.host || '127.0.0.1'));" 2>/dev/null || echo "127.0.0.1")
PORT=$(node -e "const fs = require('fs'), yaml = require('$AI_DIR/gateway/node_modules/js-yaml'); const c = yaml.load(fs.readFileSync('$CONFIG_FILE')); process.stdout.write(String(c.runtime.port || 8080));" 2>/dev/null || echo "8080")
THREADS=$(node -e "const fs = require('fs'), yaml = require('$AI_DIR/gateway/node_modules/js-yaml'); const c = yaml.load(fs.readFileSync('$CONFIG_FILE')); process.stdout.write(String(c.runtime.threads || 6));" 2>/dev/null || echo "6")
CTX_SIZE=$(node -e "const fs = require('fs'), yaml = require('$AI_DIR/gateway/node_modules/js-yaml'); const c = yaml.load(fs.readFileSync('$CONFIG_FILE')); process.stdout.write(String(c.runtime.context_size || 4096));" 2>/dev/null || echo "4096")
MODEL_FILE=$(node -e "const fs = require('fs'), yaml = require('$AI_DIR/gateway/node_modules/js-yaml'); const c = yaml.load(fs.readFileSync('$CONFIG_FILE')); process.stdout.write(String(c.model.file));" 2>/dev/null || echo "qwen2.5-7b-instruct-q4_k_m.gguf")

MODEL_PATH="$AI_DIR/models/$MODEL_FILE"

LLAMA_SERVER_BIN=""
if command -v llama-server &> /dev/null; then
    LLAMA_SERVER_BIN=$(which llama-server)
elif [ -f "$SCRIPT_DIR/llama-server" ]; then
    LLAMA_SERVER_BIN="$SCRIPT_DIR/llama-server"
else
    echo "Error: llama-server executable not found in PATH or $SCRIPT_DIR/llama-server."
    echo "Run $SCRIPT_DIR/install_runtime.sh first."
    exit 1
fi

if [ ! -f "$MODEL_PATH" ]; then
    echo "Error: Model file not found at $MODEL_PATH."
    echo "Place the GGUF model in $AI_DIR/models/ or run $AI_DIR/scripts/download_model.sh"
    exit 1
fi

# The copied binary links its dylibs via an absolute rpath from the machine it was built on,
# so point the loader at the local build output.
LIB_DIR="$SCRIPT_DIR/build/llama.cpp/build/bin"
if [ -d "$LIB_DIR" ]; then
    export DYLD_LIBRARY_PATH="$LIB_DIR${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
    export LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

echo "=== Starting llama.cpp server runtime ==="
echo "Model: $MODEL_PATH"
echo "Host: $HOST | Port: $PORT | Threads: $THREADS | Context: $CTX_SIZE"

exec "$LLAMA_SERVER_BIN" \
    --model "$MODEL_PATH" \
    --host "$HOST" \
    --port "$PORT" \
    --threads "$THREADS" \
    --ctx-size "$CTX_SIZE"
