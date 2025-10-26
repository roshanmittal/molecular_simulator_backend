# Use Ubuntu base image
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libmpich-dev \
    libfftw3-dev \
    libjpeg-dev \
    libpng-dev \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN curl -L -o lammps.tar.gz https://github.com/lammps/lammps/archive/stable_23Jun2022.tar.gz \
    && tar -xzf lammps.tar.gz \
    && cd lammps-stable_23Jun2022/src \
    && make serial LINK_SYSTEM="mpicxx" JPG_SYSTEM="libjpeg" PNG_SYSTEM="libpng" SHELL="/bin/bash" \
    && cp lmp_serial /usr/local/bin/lmp \
    && chmod +x /usr/local/bin/lmp \
    && cd /tmp \
    && rm -rf lammps-stable_23Jun2022 lammps.tar.gz

RUN lmp -help || echo "LAMMPS installation check"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]

