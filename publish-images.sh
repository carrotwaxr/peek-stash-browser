#!/bin/bash
# Build and publish Docker images for unRAID

# Configuration
DOCKER_REGISTRY="carrotwaxr"  # Replace with your Docker Hub username
VERSION="1.0.0"

# Build and tag images
echo "Building peek-stash-browser..."
docker tag ${DOCKER_REGISTRY}/peek-stash-browser:${VERSION} ${DOCKER_REGISTRY}/peek-stash-browser:latest

# Push to registry
echo "Pushing image to Docker registry..."
docker push ${DOCKER_REGISTRY}/peek-stash-browser:${VERSION}
docker push ${DOCKER_REGISTRY}/peek-stash-browser:latest

echo "✅ Image published successfully!"
echo "Peek Stash Browser: ${DOCKER_REGISTRY}/peek-stash-browser:${VERSION}"