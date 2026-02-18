FROM node:24 as build
WORKDIR /usr/app/xxscreeps
RUN touch .screepsrc.yaml
COPY package*.json ./
COPY bin bin
RUN npm install
COPY tsconfig*.json ./
COPY src src
RUN echo 'update-notifier=false' >> .npmrc && \
	npm explore @xxscreeps/path-finder -- npm install && \
	npm run build

FROM node:24-slim as run
WORKDIR /usr/app/xxscreeps
COPY --from=build /usr/app/xxscreeps/ ./
EXPOSE 21025
ENV NODE_OPTIONS="--no-node-snapshot"
ENTRYPOINT /bin/sh -c 'npx xxscreeps import --dont-overwrite && npx xxscreeps start'
