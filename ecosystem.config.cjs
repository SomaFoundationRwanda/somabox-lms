// Settings come from the repository's single .env (see .env.example), checked by
// @somabox/config; pm2 refuses to start with a clear message if one is wrong.
const { readConfig } = require('@somabox/config');
const { ports } = readConfig();
const port = (name) => String(ports[name]);

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
        PORT: port('BACKEND_PORT'),
        AI_GATEWAY_PORT: port('AI_GATEWAY_PORT')
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: port('BACKEND_PORT'),
        AI_GATEWAY_PORT: port('AI_GATEWAY_PORT')
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
      args: `start -p ${port('FRONTEND_PORT')}`,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: port('FRONTEND_PORT')
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: port('FRONTEND_PORT')
      },
      max_memory_restart: '1536M',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      time: true
    },
    {
      // Offline AI model (llama.cpp server). Reads host/model from ai/config.yaml; port from .env.
      name: 'soma-x-ai-runtime',
      cwd: './ai',
      script: 'runtime/start_runtime.sh',
      interpreter: 'bash',
      env: { AI_RUNTIME_PORT: port('AI_RUNTIME_PORT') },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      error_file: './logs/ai-runtime-error.log',
      out_file: './logs/ai-runtime-out.log',
      time: true
    },
    {
      // AI gateway in front of the model; the backend reaches it on AI_GATEWAY_PORT.
      name: 'soma-x-ai-gateway',
      cwd: './ai/gateway',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', AI_GATEWAY_PORT: port('AI_GATEWAY_PORT'), AI_RUNTIME_PORT: port('AI_RUNTIME_PORT') },
      env_development: { NODE_ENV: 'development', AI_GATEWAY_PORT: port('AI_GATEWAY_PORT'), AI_RUNTIME_PORT: port('AI_RUNTIME_PORT') },
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
