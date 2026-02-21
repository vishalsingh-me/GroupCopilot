import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";
import path from "path";

async function main() {
  console.log("Running migrations...");

  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "db/migrations"),
  });

  console.log("Migrations complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
