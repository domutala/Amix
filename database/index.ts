import { DataSource, type DataSourceOptions } from "typeorm";
import entitys from "./entities";
import { Client } from "pg";

export let dataSource: DataSource;

export const databaseConfig = () => {
  const config = {
    type: "postgres",
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "secret",
    database: process.env.DB_NAME || "form",
    port: process.env.DB_PORT || 5432,
    host: process.env.DB_HOST || "localhost",
    synchronize: true,
    logging: false,
    entities: entitys,
  };

  return config as DataSourceOptions;
};

export const initDatabase = async () => {
  try {
    await createDatabaseIfNotExists();
    const config = databaseConfig();

    dataSource = new DataSource(config);
  } catch (error) {
    throw error;
  }

  await dataSource.initialize();
  await dataSource.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

  return dataSource;
};

export async function createDatabaseIfNotExists() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });

  await client.connect();

  const dbName = process.env.DB_NAME;

  const res = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
  );

  if (res.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }

  await client.end();
}
