/*
 * Runs once on first boot of the mongo container (empty data volume).
 * Creates the least-privilege application user and the index the API
 * relies on. Only a `users` collection exists here - flow-meter readings
 * stay in-memory (the ESP32/simulator is the source of truth for those).
 */
/* global db, print */

const dbName = process.env.MONGO_APP_DB || 'alia';
const appUser = process.env.MONGO_APP_USERNAME || 'alia_app';
const appPassword = process.env.MONGO_APP_PASSWORD || 'alia_app_password';

const aliaDb = db.getSiblingDB(dbName);

if (aliaDb.getUser(appUser) === null) {
  aliaDb.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: dbName }]
  });
  print(`[alia-mongo] created application user "${appUser}" on "${dbName}"`);
}

aliaDb.createCollection('users');
aliaDb.users.createIndex({ email: 1 }, { unique: true });

print('[alia-mongo] initialisation complete');
