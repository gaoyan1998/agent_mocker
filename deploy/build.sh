#!/usr/bin/env sh
set -eu

IMAGE_NAME=${IMAGE_NAME:-agent-mocker}
IMAGE_TAG=${IMAGE_TAG:-latest}
PLATFORM=${PLATFORM:-}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found" >&2
  exit 1
fi

BUILD_ARGS=""
if [ -n "$PLATFORM" ]; then
  BUILD_ARGS="--platform $PLATFORM"
fi

echo "Building ${IMAGE_NAME}:${IMAGE_TAG}"
docker build $BUILD_ARGS -f "$SCRIPT_DIR/Dockerfile" -t "${IMAGE_NAME}:${IMAGE_TAG}" "$ROOT_DIR"

echo "Built ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Run: docker run --rm -p 3000:3000 -v agent-mocker-data:/app/data ${IMAGE_NAME}:${IMAGE_TAG}"
