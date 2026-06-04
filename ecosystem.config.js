module.exports = {
  apps: [
    {
      name: 'agentix',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/var/www/agentix',
      instances: 2,           // 2 cores on Hostinger Pro (adjust if more)
      exec_mode: 'cluster',   // load balance across instances
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/agentix/error.log',
      out_file:   '/var/log/agentix/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
