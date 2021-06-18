FROM node as build
WORKDIR /usr/app/xxscreeps
RUN touch /usr/app/xxscreeps/.screepsrc.yaml
COPY ./ ./
RUN npm install
RUN npm run build

FROM node:slim as run
WORKDIR /usr/app/xxscreeps
COPY --from=build /usr/app/xxscreeps/ ./
EXPOSE 21025
ENTRYPOINT ["/bin/sh", "-c", "npx xxscreeps import && npx xxscreeps start"]
