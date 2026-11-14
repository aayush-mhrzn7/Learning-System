import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import * as schema from "./schema";

dns.setDefaultResultOrder("ipv4first");
const ipv4Agent = new Agent({ connect: { family: 4 } });
neonConfig.fetchFunction = (url: string, init?: object) =>
  undiciFetch(url, { ...(init ?? {}), dispatcher: ipv4Agent } as Parameters<
    typeof undiciFetch
  >[1]);

type Db = ReturnType<typeof createDb>;

function createDb() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(url);
  return drizzle(sql, { schema });
}

const globalForDb = globalThis as { drizzle?: Db };

function getDb(): Db {
  if (!globalForDb.drizzle) {
    globalForDb.drizzle = createDb();
  }
  return globalForDb.drizzle;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getDb(), prop, receiver);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});
