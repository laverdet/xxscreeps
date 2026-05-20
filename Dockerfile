FROM node:24-trixie AS build
WORKDIR /xxscreeps
COPY patches ./patches
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .
RUN <<DONE
	set +x
	corepack enable
	pnpm fetch
DONE
COPY . .
RUN <<DONE
	set +x
	pnpm install --frozen-lockfile --offline
	pnpm run build
	npx xxscreeps test
DONE

FROM node:24-trixie-slim
COPY --from=build /xxscreeps /xxscreeps
WORKDIR /data
EXPOSE 21025
ENV NODE_OPTIONS="--no-node-snapshot --experimental-vm-modules --enable-source-maps --no-warnings"
CMD [ "/xxscreeps/node_modules/.bin/xxscreeps" ]
