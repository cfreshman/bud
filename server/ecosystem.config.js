module.exports = {
  apps: [{
    name: 'bud-backend',
    script: 'index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      MONGODB_URI: 'mongodb://localhost:28000/bud'
    }
  }]
}
