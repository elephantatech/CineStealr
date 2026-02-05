#!/bin/bash
set -e

MODEL_DIR="docker/models"
mkdir -p "$MODEL_DIR"

echo "Downloading llava-v1.5-7b-Q4_K.gguf..."
curl -L -f -o "$MODEL_DIR/llava-v1.5-7b-Q4_K.gguf" "https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/ggml-model-q4_k.gguf"

echo "Downloading mmproj-model-f16.gguf..."
curl -L -f -o "$MODEL_DIR/mmproj-model-f16.gguf" "https://huggingface.co/cjpais/llava-1.6-mistral-7b-gguf/resolve/main/mmproj-model-f16.gguf"

echo "Download complete. Verifying file sizes..."
ls -lh "$MODEL_DIR"
