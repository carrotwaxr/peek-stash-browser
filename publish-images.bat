@echo off
REM Build and publish Docker images for unRAID (Windows version)

REM Configuration
set DOCKER_REGISTRY=carrotwaxr
set VERSION=1.0.0

REM Build and tag image
echo Building peek-stash-browser...
docker build -t %DOCKER_REGISTRY%/peek-stash-browser:%VERSION% -f Dockerfile.production .
docker tag %DOCKER_REGISTRY%/peek-stash-browser:%VERSION% %DOCKER_REGISTRY%/peek-stash-browser:latest

REM Push to registry
echo Pushing image to Docker registry...
docker push %DOCKER_REGISTRY%/peek-stash-browser:%VERSION%
docker push %DOCKER_REGISTRY%/peek-stash-browser:latest

echo ✅ Image published successfully!
echo Peek Stash Browser: %DOCKER_REGISTRY%/peek-stash-browser:%VERSION%
pause