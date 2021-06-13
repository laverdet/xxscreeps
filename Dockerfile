FROM node
WORKDIR /usr/app/xxscreeps
COPY ./ ./
RUN touch /usr/app/xxscreeps/.screepsrc.yaml
RUN npm install
RUN npm run build
EXPOSE 21025
ENTRYPOINT ["npm", "run", "import-and-start"]