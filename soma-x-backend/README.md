# Soma-X Backend

A modular Node.js backend for managing and syncing educational content.

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm

### 2. Configuration
- Copy the example environment file:
  ```bash
  cp .env.example .env
  ```
- Install dependencies:
  ```bash
  npm install
  ```

### 3. Setup & Initialization
Since the database files and large assets are ignored by Git (to keep the repo size small), you **must** run the setup script once after cloning:
```bash
npm run setup
```
This will initialize the SQLite database structures and required folders.

### 4. Nodemon Installation
```bash
npm install -g nodemon
```
This will install nodemon globally, which is required for development.

### 5. Create .env file
```bash
cp .env.example .env
```
Fill in the values for the environment variables.

### 6. Running the Project
```bash
# Development mode
npm run dev
