#!/bin/bash
# Build and publish Docker images for unRAID

# Configuration
DOCKER_REGISTRY="your-dockerhub-username"  # Replace with your Docker Hub username
VERSION="1.0.0"

# Build and tag images
echo "Building stash-player-backend..."
docker build -t ${DOCKER_REGISTRY}/stash-player-backend:${VERSION} ./server
docker tag ${DOCKER_REGISTRY}/stash-player-backend:${VERSION} ${DOCKER_REGISTRY}/stash-player-backend:latest

echo "Building stash-player-frontend..."
docker build -t ${DOCKER_REGISTRY}/stash-player-frontend:${VERSION} ./client
docker tag ${DOCKER_REGISTRY}/stash-player-frontend:${VERSION} ${DOCKER_REGISTRY}/stash-player-frontend:latest

# Push to registry
echo "Pushing images to Docker registry..."
docker push ${DOCKER_REGISTRY}/stash-player-backend:${VERSION}
docker push ${DOCKER_REGISTRY}/stash-player-backend:latest
docker push ${DOCKER_REGISTRY}/stash-player-frontend:${VERSION} 
docker push ${DOCKER_REGISTRY}/stash-player-frontend:latest

echo "✅ Images published successfully!"
echo "Backend: ${DOCKER_REGISTRY}/stash-player-backend:${VERSION}"
echo "Frontend: ${DOCKER_REGISTRY}/stash-player-frontend:${VERSION}"