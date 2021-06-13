FROM node as build
WORKDIR /usr/app/xxscreeps
COPY ./ ./
RUN touch /usr/app/xxscreeps/.screepsrc.yaml
RUN npm install
RUN npm run build

FROM node:slim as run
WORKDIR /usr/app/xxscreeps
COPY --from=build /usr/app/xxscreeps/ ./
EXPOSE 21025
ENTRYPOINT ["npm", "run", "import-and-start"]