FROM node:20-bullseye-slim

# Chrome için gerekli sistem kütüphanelerini yükle
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/*

# Puppeteer ayarları
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Uygulama dizini
WORKDIR /app

# Package dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm ci --omit=dev

# Uygulama dosyalarını kopyala
COPY . .

# config.json için yazma izni
RUN chmod 666 config.json || true

# .wwebjs_auth dizini oluştur
RUN mkdir -p .wwebjs_auth && chmod 777 .wwebjs_auth

# Port (Railway otomatik set eder)
EXPOSE 3000

# Başlat
CMD ["node", "server.js"]
