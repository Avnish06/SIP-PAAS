FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm config set fetch-retries 10 && \
    npm config set fetch-retry-mintimeout 30000 && \
    npm config set fetch-retry-maxtimeout 300000 && \
    npm config set fetch-timeout 600000 && \
    npm install
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
