# ==============================================================================
# MOSIP VC Interoperability Playground - Production Unified Dockerfile
# Combines React 19 Frontend + Node 26 / Express 5 Backend into a single container
# Compatible with Render, Railway, Fly.io, Hugging Face Spaces, and Docker Compose
# ==============================================================================

# Stage 1: Build the React Frontend
FROM node:26-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Build the TypeScript Backend
FROM node:26-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
RUN npm run build

# Stage 3: Production Runtime
FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install production dependencies for backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copy compiled backend output
COPY --from=backend-builder /app/backend/dist ./dist

# Copy compiled frontend assets for unified static serving
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=frontend-builder /app/frontend/dist ./dist/public

EXPOSE 4000

# Start production server
CMD ["node", "dist/index.js"]
