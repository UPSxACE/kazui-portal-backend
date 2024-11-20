import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
const db = drizzle({
  connection: process.env.DATABASE_URL!,
  schema: schema,
});
export default db;
