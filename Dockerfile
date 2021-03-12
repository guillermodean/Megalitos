FROM node:12

WORKDIR /Megalitos

COPY packaje*.json ./

RUN npm install

COPY . .

CMD [ "npm", "start" ]