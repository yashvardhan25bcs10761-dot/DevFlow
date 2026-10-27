import { MongoMemoryServer } from 'mongodb-memory-server';
console.log('Pre-downloading MongoDB 7.0.24 binary...');
process.env.MONGOMS_VERSION = '7.0.24';
const server = await MongoMemoryServer.create();
console.log('MongoDB binary ready at:', server.getUri());
await server.stop();
console.log('Done. Binary is cached.');
