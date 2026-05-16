FROM node:24-trixie AS build
WORKDIR /xxscreeps
COPY patches ./patches
COPY package.json pnpm-lock.yaml .npmrc .
RUN <<DONE
	corepack enable pnpm
	pnpm fetch
DONE
COPY . .
RUN <<DONE
	pnpm install --frozen-lockfile --offline
	pnpm run build
DONE

FROM node:24-trixie-slim
COPY --from=build /xxscreeps /xxscreeps
WORKDIR /data
EXPOSE 21025
ENV NODE_OPTIONS="--no-node-snapshot --experimental-vm-modules --enable-source-maps --no-warnings"
ENTRYPOINT [ "/xxscreeps/node_modules/.bin/xxscreeps" ]
