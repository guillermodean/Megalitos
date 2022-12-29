FROM node:14.15.4-alpine3.12

WORKDIR /usr/src/Megalitos

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8000

CMD [ "node", "src/index.js" ]