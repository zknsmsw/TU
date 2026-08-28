// pm2 进程配置（提瓦特交通联合）
// 启动: pm2 start deploy/ecosystem.config.js
// 端口: 3001/3000 是 Nginx（HTTP 跳转 / HTTPS），后端移到内部端口 3002，只给本机 Nginx 访问
module.exports = {
  apps: [
    {
      name: 'teyvat-transit',
      cwd: '/opt/TU/server',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,          // 崩溃自动重启
      max_memory_restart: '300M', // 内存超限自动重启
      env: {
        PORT: '3002',             // 内部端口，仅 Nginx 反代访问（后端已绑定 127.0.0.1）
        COOKIE_SECURE: '1'        // HTTPS 下会话 Cookie 加 Secure 标志
        // 可选：JWT_SECRET: 'openssl rand -base64 48 生成的密钥'
      }
    }
  ]
};
