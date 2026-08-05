# Local dev container for the frontend. Serves the Vite dev server inside a
# container so `docker compose up` works without a local Node install.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]
