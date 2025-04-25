# 1. Используем официальный PHP-образ с Composer и нужными расширениями
FROM php:8.2-cli

# 2. Устанавливаем system зависимости и расширения (если надо)
RUN apt-get update && apt-get install -y \
    unzip \
    libzip-dev \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    && docker-php-ext-install zip

# 3. Устанавливаем Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 4. Копируем файлы проекта
WORKDIR /app
COPY . .

# 5. Устанавливаем зависимости
RUN composer install --no-dev --optimize-autoloader

# 6. Указываем файл запуска
CMD [ "php", "index.php" ]
