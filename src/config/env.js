const path = require('path');

function env(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  port: Number(env('PORT', 3000)),
  databaseUrl: env('DATABASE_URL', ''),
  adminEmail: env('ADMIN_EMAIL', 'admin@iksn.demo'),
  adminPassword: env('ADMIN_PASSWORD', 'Change-Me-Immediately'),
  demoPersonnelPassword: env('DEMO_PERSONNEL_PASSWORD', 'Change-Me-For-Demo'),
  passwordPepper: env('PASSWORD_PEPPER', 'development-pepper-change-me'),
  sessionSecret: env('SESSION_SECRET', 'development-session-secret-change-me'),
  devOtpLog: env('DEV_OTP_LOG', 'false') === 'true',
  publicDir: path.join(process.cwd(), 'public'),
  isProduction: env('NODE_ENV', 'development') === 'production'
};

if (config.isProduction && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
}
if (config.isProduction && config.passwordPepper.length < 16) {
  throw new Error('PASSWORD_PEPPER must be sufficiently long in production.');
}

module.exports = config;
