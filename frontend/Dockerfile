# Stage 1: build Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ENV NODE_ENV=production
COPY .env.production .env.production
RUN npm run build -- --mode production

# Stage 2: serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html/caldr
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]