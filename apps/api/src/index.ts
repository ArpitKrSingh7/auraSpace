import { createApp } from './app';
const { app, media, config } = createApp();
async function start() {
  await media.ensureBucket();
  await app.listen({ host: config.HOST, port: config.PORT });
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
