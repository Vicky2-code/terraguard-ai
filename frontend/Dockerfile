FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# For production, we'd use nginx, but for prototype, we use vite preview
EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host"]
