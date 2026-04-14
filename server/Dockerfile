FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 4000
CMD ["npm", "start"]
