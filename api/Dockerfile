FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production --fetch-retries 5 --fetch-retry-mintimeout 20000 --fetch-retry-maxtimeout 120000
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/index.js"]
