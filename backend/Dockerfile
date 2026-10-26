FROM node:20

WORKDIR /app

# Prisma'nın kurulum sonrası otomatik generate'i ve telemetri çağrısı build'i askıda bırakabiliyor;
# client aşağıda ayrıca üretiliyor
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true \
    CHECKPOINT_DISABLE=1

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --no-audit --no-fund --foreground-scripts

# Copy the rest of the code
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Generate Prisma client
RUN npx prisma generate

EXPOSE 5001

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "run", "dev"]
