// src/db/database.ts

import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';
import { 
  CREATE_EMBEDDINGS_TABLE, 
  CREATE_AUTH_LOGS_TABLE, 
  CREATE_SYNC_META_TABLE 
} from './schema';
import { runMigrations } from './migrations';

SQLite.enablePromise(true);

let database: SQLiteDatabase | null = null;

export const initDatabase = async (): Promise<SQLiteDatabase> => {
  if (database) return database;

  try {
    database = await SQLite.openDatabase({
      name: 'datalake_guard.db',
      location: 'default',
    });

    console.log('[Database] Initializing tables...');
    await database.executeSql(CREATE_EMBEDDINGS_TABLE);
    await database.executeSql(CREATE_AUTH_LOGS_TABLE);
    await database.executeSql(CREATE_SYNC_META_TABLE);
    await runMigrations(database);
    console.log('[Database] Initialization complete.');

    return database;
  } catch (error) {
    console.error('[Database] Error initializing database:', error);
    throw error;
  }
};

export const getDatabase = async (): Promise<SQLiteDatabase> => {
  if (!database) {
    return await initDatabase();
  }
  return database;
};
