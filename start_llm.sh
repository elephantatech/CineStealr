#!/bin/bash
# start_llm.sh - Start LLaVA LLM server with Metal GPU acceleration for Apple Silicon
# This runs natively on macOS to leverage the M-series GPU (10-20x faster than container)
#
# Usage:
#   ./start_llm.sh          # Start native LLM server
#   ./start_llm.sh --stop   # Stop if running
#
# The backend will automatically connect to this on port 8080

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/docker/models"
PORT=8080
PID_FILE="$SCRIPT_DIR/.llm_server.pid"

# Function to stop the server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Stopping LLM server (PID: $PID)..."
            kill "$PID"
            rm -f "$PID_FILE"
            echo "✓ Server stopped"
        else
            echo "Server not running (stale PID file)"
            rm -f "$PID_FILE"
        fi
    else
        echo "No PID file found. Checking for process on port $PORT..."
        PID=$(lsof -ti :$PORT 2>/dev/null || true)
        if [ -n "$PID" ]; then
            echo "Stopping process on port $PORT (PID: $PID)..."
            kill "$PID"
            echo "✓ Server stopped"
        else
            echo "No server running on port $PORT"
        fi
    fi
}

# Handle --stop flag
if [ "$1" = "--stop" ]; then
    stop_server
    exit 0
fi

# Check if port is in use (maybe by container)
if lsof -i :$PORT >/dev/null 2>&1; then
    echo "⚠️  Port $PORT is already in use!"
    echo "   Stop the containerized LLM first with:"
    echo "   podman stop cinestealr_llm"
    echo ""
    read -p "Do you want to stop it now? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        podman stop cinestealr_llm 2>/dev/null || true
        sleep 2
    else
        exit 1
    fi
fi

# Check if llama-server is installed
if ! command -v llama-server &> /dev/null; then
    echo "llama-server not found. Installing llama.cpp via Homebrew..."
    echo "This will enable Metal GPU acceleration on your M5 chip."
    brew install llama.cpp
fi

# Check for model files
if [ ! -f "$MODELS_DIR/llava-v1.5-7b-Q4_K_M.gguf" ]; then
    echo "Error: LLaVA model not found at $MODELS_DIR/llava-v1.5-7b-Q4_K_M.gguf"
    exit 1
fi

if [ ! -f "$MODELS_DIR/mmproj-model-f16.gguf" ]; then
    echo "Error: Multimodal projector not found at $MODELS_DIR/mmproj-model-f16.gguf"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🚀 Starting LLaVA with Metal GPU Acceleration               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Port: $PORT                                                   ║"
echo "║  GPU: Apple Metal (M5)                                       ║"
echo "║  Model: llava-v1.5-7b-Q4_K                                   ║"
echo "║                                                              ║"
echo "║  Stop with: ./start_llm.sh --stop  or  Ctrl+C               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Run llama-server with Metal GPU support
# -ngl 99 = offload all layers to GPU (Metal)
# -c 4096 = context size (LLaVA images need ~3000 tokens)
# -np 1 = single slot for sequential processing
llama-server \
    -m "$MODELS_DIR/llava-v1.5-7b-Q4_K_M.gguf" \
    --mmproj "$MODELS_DIR/mmproj-model-f16.gguf" \
    --host 0.0.0.0 \
    --port $PORT \
    -ngl 99 \
    -c 4096 \
    -np 1 &

# Save PID for later stopping
echo $! > "$PID_FILE"
wait
