import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema";

// Lazy connection: avoid throwing at module-load so `next build` can collect
// page data without DATABASE_URL being present. First query forces init.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function getDb() {
  if (globalForDb.drizzleDb) return globalForDb.drizzleDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client =
    globalForDb.pgClient ?? postgres(url, { prepare: false, max: 1 });
  if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;
  const instance = drizzle(client, { schema });
  if (process.env.NODE_ENV !== "production") globalForDb.drizzleDb = instance;
  return instance;
}

// Proxy defers real initialization until the first property access,
// mirroring the original `db` shape (db.select, db.insert, etc.).
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop, recv) {
    const real = getDb();
    const val = Reflect.get(real as object, prop, recv);
    return typeof val === "function" ? val.bind(real) : val;
  },
});
export { schema };
