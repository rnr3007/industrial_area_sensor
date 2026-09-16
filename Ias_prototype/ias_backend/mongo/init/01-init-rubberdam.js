/*
 * Runs once on first boot of the mongo container (empty data volume).
 * Creates the least-privilege application user and the index the API
 * relies on. Only a `users` collection exists here - the rubber dam
 * prototype has no companies/devices/readings/etc. like the main platform.
 */
/* global db, print */

const dbName = process.env.MONGO_APP_DB || 'rubberdam';
const appUser = process.env.MONGO_APP_USERNAME || 'rubberdam_app';
const appPassword = process.env.MONGO_APP_PASSWORD || 'rubberdam_app_password';

const rdDb = db.getSiblingDB(dbName);

if (rdDb.getUser(appUser) === null) {
  rdDb.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: dbName }]
  });
  print(`[rubberdam-mongo] created application user "${appUser}" on "${dbName}"`);
}

rdDb.createCollection('users');
rdDb.users.createIndex({ email: 1 }, { unique: true });

print('[rubberdam-mongo] initialisation complete');
