.PHONY: clean build run start
IMAGE_NAME="sports-istanbul-appointment-checker"

clean:
	docker ps -a --filter ancestor=$(IMAGE_NAME) -q | xargs -r docker stop
	docker ps -a --filter ancestor=$(IMAGE_NAME) -q | xargs -r docker rm
	docker rmi $(IMAGE_NAME) || true

build:
	echo "Building Docker image $(IMAGE_NAME)..."
	docker build --no-cache -t $(IMAGE_NAME) .
	docker images | grep $(IMAGE_NAME)

run:
	docker run -d $(IMAGE_NAME)

start: clean build run
