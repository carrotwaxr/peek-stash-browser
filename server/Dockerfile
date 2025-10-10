FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 8000

RUN npm run build

CMD ["npm", "run", "serve"]