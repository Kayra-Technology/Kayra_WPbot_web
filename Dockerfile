FROM node:20-slim

# Chrome için gerekli sistem kütüphanelerini yükle
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer'ın kendi Chrome'u indirmemesi için
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Uygulama dizini
WORKDIR /app

# Package dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --omit=dev

# Uygulama dosyalarını kopyala
COPY . .

# Port
EXPOSE 8080

# Başlat
CMD ["npm", "start"]
