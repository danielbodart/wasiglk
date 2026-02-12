#!/usr/bin/env bash
# Run regression tests for wasiglk server interpreters
#
# Usage:
#   ./run-regtest.sh                    # Run all tests
#   ./run-regtest.sh advent.ulx         # Run tests for a specific game
#   ./run-regtest.sh advent.ulx prologue  # Run a specific test section
#
# Uses native interpreter builds by default. Set INTERP_DIR to override.
# Set PLATFORM=wasm to use wasmtime with WASM builds.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INTERP_DIR="${INTERP_DIR:-$SCRIPT_DIR/../zig-out/bin}"
PLATFORM="${PLATFORM:-native}"
TIMEOUT="${TIMEOUT:-30}"

# Map game file extensions to interpreter names
get_interpreter() {
    local game="$1"
    case "$game" in
        *.ulx) echo "glulxe" ;;
        *.z[0-9]) echo "bocfel" ;;
        *.hex) echo "hugo" ;;
        *) echo "unknown" ;;
    esac
}

# Build the interpreter command
get_interp_cmd() {
    local interp="$1"
    if [ "$PLATFORM" = "wasm" ]; then
        echo "wasmtime run --dir=. $INTERP_DIR/$interp.wasm --"
    else
        echo "$INTERP_DIR/$interp"
    fi
}

run_test() {
    local regtest_file="$1"
    local test_section="${2:-}"
    local game
    game=$(grep '^\*\* game:' "$regtest_file" | head -1 | sed 's/\*\* game: *//')

    if [ -z "$game" ]; then
        echo "ERROR: No game file specified in $regtest_file"
        return 1
    fi

    local interp_name
    interp_name=$(get_interpreter "$game")
    if [ "$interp_name" = "unknown" ]; then
        echo "SKIP: Unknown game format for $game"
        return 0
    fi

    local interp_cmd
    interp_cmd=$(get_interp_cmd "$interp_name")

    # Check interpreter exists
    local interp_path
    if [ "$PLATFORM" = "wasm" ]; then
        interp_path="$INTERP_DIR/$interp_name.wasm"
    else
        interp_path="$INTERP_DIR/$interp_name"
    fi
    if [ ! -f "$interp_path" ]; then
        echo "SKIP: Interpreter $interp_path not found"
        return 0
    fi

    local args=(-i "$interp_cmd" --rem -t "$TIMEOUT")
    args+=("$regtest_file")
    if [ -n "$test_section" ]; then
        args+=("$test_section")
    fi

    echo "--- Testing: $(basename "$regtest_file") ${test_section:+(section: $test_section)} with $interp_name ---"
    python3 "$SCRIPT_DIR/regtest.py" "${args[@]}"
}

# Run from the tests directory so game files are found
cd "$SCRIPT_DIR"

# Main
failed=0
passed=0

if [ $# -gt 0 ]; then
    # Run specific test
    game_filter="$1"
    section="${2:-}"

    # Find matching regtest file
    found=0
    for regtest_file in "$SCRIPT_DIR"/*.regtest; do
        if [[ "$(basename "$regtest_file")" == *"$game_filter"* ]]; then
            found=1
            if run_test "$regtest_file" "$section"; then
                passed=$((passed + 1))
            else
                failed=$((failed + 1))
            fi
        fi
    done
    if [ "$found" -eq 0 ]; then
        echo "No regtest files matching '$game_filter'"
        exit 1
    fi
else
    # Run all tests (skip profiler tests)
    for regtest_file in "$SCRIPT_DIR"/*.regtest; do
        base=$(basename "$regtest_file")
        # Skip profiler-specific tests
        if [[ "$base" == *profiler* ]]; then
            continue
        fi
        if run_test "$regtest_file"; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
        fi
    done
fi

echo ""
echo "=== Results: $passed passed, $failed failed ==="

if [ "$failed" -gt 0 ]; then
    exit 1
fi
