FROM node:12

WORKDIR /usr/src/Megalitos

COPY packaje*.json ./

RUN npm install

COPY . .

EXPOSE 8000

CMD [ "node", "src/index.js" ]