/*
 * Runs once on first boot of the mongo container (empty data volume).
 * Creates the least-privilege application user and the indexes the API relies
 * on, so the first query is not a collection scan.
 */
/* global db, print */

const dbName = process.env.MONGO_APP_DB || 'ias';
const appUser = process.env.MONGO_APP_USERNAME || 'ias_app';
const appPassword = process.env.MONGO_APP_PASSWORD || 'ias_app_password';

const iasDb = db.getSiblingDB(dbName);

if (iasDb.getUser(appUser) === null) {
  iasDb.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: dbName }]
  });
  print(`[ias-mongo] created application user "${appUser}" on "${dbName}"`);
}

iasDb.createCollection('users');
iasDb.createCollection('companies');
iasDb.createCollection('devices');
iasDb.createCollection('readings');
iasDb.createCollection('alerts');
iasDb.createCollection('auditlogs');
iasDb.createCollection('snapshots');

iasDb.users.createIndex({ email: 1 }, { unique: true });
iasDb.companies.createIndex({ code: 1 }, { unique: true });
iasDb.devices.createIndex({ deviceId: 1 }, { unique: true });
iasDb.devices.createIndex({ company: 1 });
iasDb.readings.createIndex({ company: 1, ts: -1 });
iasDb.readings.createIndex({ deviceId: 1, ts: -1 });
iasDb.alerts.createIndex({ company: 1, status: 1, ts: -1 });
iasDb.auditlogs.createIndex({ ts: -1 });
iasDb.auditlogs.createIndex({ user: 1, ts: -1 });
iasDb.snapshots.createIndex({ company: 1, camera: 1, ts: -1 });

print('[ias-mongo] initialisation complete');
