require('dotenv').config();
const { app, prisma } = require('./app');

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Spill Sense API listening on http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
