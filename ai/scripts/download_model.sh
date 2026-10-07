#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$AI_DIR/models"

mkdir -p "$MODELS_DIR"

MODEL_FILE="Qwen2.5-7B-Instruct-Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf"
TARGET_PATH="$MODELS_DIR/$MODEL_FILE"

# Remove invalid tiny files if present
if [ -f "$TARGET_PATH" ]; then
    FILE_SIZE=$(wc -c < "$TARGET_PATH" | tr -d ' ')
    if [ "$FILE_SIZE" -lt 1000000 ]; then
        echo "Removing previous incomplete file ($FILE_SIZE bytes)..."
        rm -f "$TARGET_PATH"
    else
        echo "Model file already exists at $TARGET_PATH ($FILE_SIZE bytes)"
        exit 0
    fi
fi

# Clean up lowercase target if present
rm -f "$MODELS_DIR/qwen2.5-7b-instruct-q4_k_m.gguf"

echo "=== Downloading $MODEL_FILE (Off-grid deployment model, ~4.7 GB) ==="
echo "URL: $MODEL_URL"
echo "Target: $TARGET_PATH"

if command -v curl &> /dev/null; then
    curl -L -C - --progress-bar -o "$TARGET_PATH" "$MODEL_URL"
elif command -v wget &> /dev/null; then
    wget -c -O "$TARGET_PATH" "$MODEL_URL"
else
    echo "Error: Neither curl nor wget is available."
    exit 1
fi

echo "=== Download complete: $TARGET_PATH ==="
