FROM node:26-alpine

WORKDIR /app

# Copy package manifests first for caching
COPY package*.json ./

RUN npm install

# Copy application source code
COPY . .

# Expose BFF port
EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=development

CMD ["npm", "run", "dev"]
