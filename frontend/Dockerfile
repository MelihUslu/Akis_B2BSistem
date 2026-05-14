FROM node:20

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
