#!/bin/bash
# CineStealr - First Time Setup and Start Script
# Supports macOS (with Metal GPU) and Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/docker/models"

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                      CineStealr                           ║"
    echo "║         AI Scene Description & Prompt Generator           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos";;
        Linux*)     OS="linux";;
        *)          OS="unknown";;
    esac
    echo "$OS"
}

detect_arch() {
    case "$(uname -m)" in
        arm64|aarch64)  ARCH="arm64";;
        x86_64)         ARCH="x86_64";;
        *)              ARCH="unknown";;
    esac
    echo "$ARCH"
}

check_docker() {
    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
        COMPOSE_CMD="podman compose"
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
        COMPOSE_CMD="docker compose"
    else
        return 1
    fi
    return 0
}

download_models() {
    echo ""
    echo -e "${BLUE}=== Downloading AI Models ===${NC}"
    
    mkdir -p "$MODELS_DIR"
    
    # LLaVA model
    if [ ! -f "$MODELS_DIR/llava-v1.5-7b-Q4_K_M.gguf" ]; then
        print_warn "Downloading LLaVA model (3.9GB)..."
        curl -L -o "$MODELS_DIR/llava-v1.5-7b-Q4_K_M.gguf" \
            "https://huggingface.co/second-state/Llava-v1.5-7B-GGUF/resolve/main/llava-v1.5-7b-Q4_K_M.gguf?download=true"
        print_step "LLaVA model downloaded"
    else
        print_step "LLaVA model already exists"
    fi
    
    # mmproj file
    if [ ! -f "$MODELS_DIR/mmproj-model-f16.gguf" ]; then
        print_warn "Downloading vision projector (595MB)..."
        curl -L -o "$MODELS_DIR/mmproj-model-f16.gguf" \
            "https://huggingface.co/second-state/Llava-v1.5-7B-GGUF/resolve/main/llava-v1.5-7b-mmproj-model-f16.gguf?download=true"
        print_step "Vision projector downloaded"
    else
        print_step "Vision projector already exists"
    fi
}

install_llama_cpp_macos() {
    echo ""
    echo -e "${BLUE}=== Installing llama.cpp (Metal GPU) ===${NC}"
    
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew not found. Please install from https://brew.sh"
        exit 1
    fi
    
    if ! command -v llama-server &> /dev/null; then
        print_warn "Installing llama.cpp via Homebrew..."
        brew install llama.cpp
        print_step "llama.cpp installed with Metal support"
    else
        print_step "llama.cpp already installed"
    fi
}

start_native_mode() {
    echo ""
    echo -e "${BLUE}=== Starting in Native Mode (Metal GPU) ===${NC}"
    
    # Start LLM server
    if [ -f "$SCRIPT_DIR/.llm_server.pid" ] && kill -0 "$(cat "$SCRIPT_DIR/.llm_server.pid")" 2>/dev/null; then
        print_step "LLM server already running"
    else
        print_warn "Starting LLM server..."
        "$SCRIPT_DIR/start_llm.sh" &
        sleep 5
        print_step "LLM server started"
    fi
    
    # Start containers
    print_warn "Starting backend and frontend containers..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD -f podman-compose.native.yml up -d --build
    print_step "Containers started"
}

start_container_mode() {
    echo ""
    echo -e "${BLUE}=== Starting in Container Mode ===${NC}"
    
    print_warn "Starting all containers (LLM, backend, frontend)..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD -f podman-compose.yml up -d --build
    print_step "All containers started"
    
    print_warn "Note: Container mode uses CPU only. For GPU acceleration, use native mode on macOS."
}

stop_all() {
    echo ""
    echo -e "${BLUE}=== Stopping CineStealr ===${NC}"
    
    cd "$SCRIPT_DIR"
    
    # Stop containers
    if [ -f podman-compose.native.yml ]; then
        $COMPOSE_CMD -f podman-compose.native.yml down 2>/dev/null || true
    fi
    if [ -f podman-compose.yml ]; then
        $COMPOSE_CMD -f podman-compose.yml down 2>/dev/null || true
    fi
    
    # Stop native LLM
    if [ -f "$SCRIPT_DIR/.llm_server.pid" ]; then
        "$SCRIPT_DIR/start_llm.sh" --stop 2>/dev/null || true
    fi
    
    print_step "All services stopped"
}

show_status() {
    echo ""
    echo -e "${BLUE}=== Service Status ===${NC}"
    
    # Check LLM
    if curl -s http://localhost:8080/health &>/dev/null; then
        print_step "LLM Server: Running on http://localhost:8080"
    else
        print_warn "LLM Server: Not running"
    fi
    
    # Check Backend
    if curl -s http://localhost:8000/health &>/dev/null; then
        print_step "Backend: Running on http://localhost:8000"
    else
        print_warn "Backend: Not running"
    fi
    
    # Check Frontend
    if curl -s http://localhost:5173 &>/dev/null; then
        print_step "Frontend: Running on http://localhost:5173"
    else
        print_warn "Frontend: Not running"
    fi
}

show_help() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  setup       First-time setup (download models, install dependencies)"
    echo "  start       Start all services"
    echo "  stop        Stop all services"
    echo "  status      Show service status"
    echo "  help        Show this help message"
    echo ""
    echo "Options:"
    echo "  --native    Use native LLM with Metal GPU (macOS only, default on macOS)"
    echo "  --container Use containerized LLM (CPU only, default on Linux)"
    echo "  --docker    Use Docker instead of Podman"
    echo "  --podman    Use Podman (default)"
    echo ""
    echo "Examples:"
    echo "  $0 setup              # First-time setup"
    echo "  $0 start              # Start with auto-detected best mode"
    echo "  $0 start --native     # Force native mode (Metal GPU)"
    echo "  $0 start --container  # Force container mode (CPU)"
    echo "  $0 stop               # Stop all services"
}

# Parse arguments
COMMAND="${1:-help}"
MODE=""
FORCE_DOCKER=""

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --native)
            MODE="native"
            shift
            ;;
        --container)
            MODE="container"
            shift
            ;;
        --docker)
            FORCE_DOCKER="docker"
            shift
            ;;
        --podman)
            FORCE_DOCKER="podman"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Main
print_banner

OS=$(detect_os)
ARCH=$(detect_arch)
echo -e "Detected: ${GREEN}$OS${NC} on ${GREEN}$ARCH${NC}"

# Check container runtime
if ! check_docker; then
    print_error "Neither Docker nor Podman found. Please install one."
    exit 1
fi

# Override container command if specified
if [ "$FORCE_DOCKER" = "docker" ]; then
    CONTAINER_CMD="docker"
    COMPOSE_CMD="docker compose"
elif [ "$FORCE_DOCKER" = "podman" ]; then
    CONTAINER_CMD="podman"
    COMPOSE_CMD="podman compose"
fi

echo -e "Using: ${GREEN}$CONTAINER_CMD${NC}"

# Auto-detect mode if not specified
if [ -z "$MODE" ]; then
    if [ "$OS" = "macos" ] && [ "$ARCH" = "arm64" ]; then
        MODE="native"
        echo -e "Mode: ${GREEN}Native (Metal GPU)${NC}"
    else
        MODE="container"
        echo -e "Mode: ${GREEN}Container (CPU)${NC}"
    fi
fi

case $COMMAND in
    setup)
        download_models
        if [ "$OS" = "macos" ]; then
            install_llama_cpp_macos
        fi
        print_step "Setup complete! Run '$0 start' to launch CineStealr."
        ;;
    start)
        if [ "$MODE" = "native" ]; then
            if [ "$OS" != "macos" ]; then
                print_error "Native mode requires macOS with Apple Silicon"
                exit 1
            fi
            start_native_mode
        else
            start_container_mode
        fi
        echo ""
        echo -e "${GREEN}CineStealr is ready!${NC}"
        echo -e "Open ${BLUE}http://localhost:5173${NC} in your browser"
        ;;
    stop)
        stop_all
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
