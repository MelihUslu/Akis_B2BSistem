FROM node:20

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 5001

CMD ["npm", "run", "dev"]
