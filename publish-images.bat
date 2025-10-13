@echo off
REM Build and publish Docker images for unRAID (Windows version)

REM Configuration
set DOCKER_REGISTRY=your-dockerhub-username
set VERSION=1.0.0

REM Build and tag images
echo Building stash-player-backend...
docker build -t %DOCKER_REGISTRY%/stash-player-backend:%VERSION% ./server
docker tag %DOCKER_REGISTRY%/stash-player-backend:%VERSION% %DOCKER_REGISTRY%/stash-player-backend:latest

echo Building stash-player-frontend...
docker build -t %DOCKER_REGISTRY%/stash-player-frontend:%VERSION% ./client
docker tag %DOCKER_REGISTRY%/stash-player-frontend:%VERSION% %DOCKER_REGISTRY%/stash-player-frontend:latest

REM Push to registry
echo Pushing images to Docker registry...
docker push %DOCKER_REGISTRY%/stash-player-backend:%VERSION%
docker push %DOCKER_REGISTRY%/stash-player-backend:latest
docker push %DOCKER_REGISTRY%/stash-player-frontend:%VERSION%
docker push %DOCKER_REGISTRY%/stash-player-frontend:latest

echo ✅ Images published successfully!
echo Backend: %DOCKER_REGISTRY%/stash-player-backend:%VERSION%
echo Frontend: %DOCKER_REGISTRY%/stash-player-frontend:%VERSION%
pause