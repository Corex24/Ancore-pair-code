FROM node:lts-bullseye

RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /usr/src/app
COPY package.json ./
RUN npm install && npm install -g qrcode-terminal pm2
COPY . .
EXPOSE 8000
CMD ["npm", "start"]
