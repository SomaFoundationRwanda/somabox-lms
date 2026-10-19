module.exports = {
  apps: [
    {
      name: 'soma-x-backend',
      cwd: './soma-x-backend',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      max_memory_restart: '1G',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      time: true
    },
    {
      name: 'soma-x-frontend',
      cwd: './soma-x',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      max_memory_restart: '1536M',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      time: true
    },
    {
      // Offline AI model (llama.cpp server). Reads host/port/model from ai/config.yaml.
      name: 'soma-x-ai-runtime',
      cwd: './ai',
      script: 'runtime/start_runtime.sh',
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      error_file: './logs/ai-runtime-error.log',
      out_file: './logs/ai-runtime-out.log',
      time: true
    },
    {
      // AI gateway in front of the model; the backend reaches it via AI_GATEWAY_URL.
      name: 'soma-x-ai-gateway',
      cwd: './ai/gateway',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      env_development: { NODE_ENV: 'development' },
      restart_delay: 3000,
      error_file: './logs/ai-gateway-error.log',
      out_file: './logs/ai-gateway-out.log',
      time: true
    },
    {
      // Nightly backup at 02:30, keeping the last 14. Set BACKUP_DIR to a disk other than the
      // one the database lives on (ideally removable/USB), so a failed disk doesn't take both.
      name: 'soma-x-backup',
      cwd: './soma-x-backend',
      script: 'src/scripts/backup.js',
      args: 'backup --keep 14',
      cron_restart: '30 2 * * *',
      autorestart: false,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      error_file: './logs/backup-error.log',
      out_file: './logs/backup-out.log',
      time: true
    }
  ]
};
