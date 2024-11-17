import { exec } from "child_process";
import "dotenv/config";

// Replace these with your actual connection details
const connectionString = process.env.DATABASE_URL;
const timestamp = Date.now();
const outputPath = ` ./backups/backup-${timestamp}.sql`;

const noDocker = process.env.DUMP_WITHOUT_DOCKER === "true";

const command = noDocker
  ? `pg_dump --dbname="${connectionString}" > ${outputPath}`
  : `docker run --rm -v $(pwd):/backup postgres:latest sh -c 'pg_dump --dbname="${connectionString}" > ${outputPath}'`;

// Set the environment variable for the password if needed
const options = {
  env: { ...process.env, PGPASSWORD: "your_password" },
};

exec(command, options, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error creating dump: ${error.message}`);
    return;
  }

  if (stderr) {
    console.warn(`Standard error: ${stderr}`);
  }

  console.log("Database dump created successfully!");
});
