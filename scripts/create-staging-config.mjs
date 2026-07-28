import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name, pattern, example) {
  const value = argument(name)?.trim();
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} is required (example: ${example}).`);
  }
  return value;
}

const databaseId = requiredArgument(
  "--database-id",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "11111111-2222-3333-4444-555555555555",
);
const databaseName = requiredArgument(
  "--database-name",
  /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/,
  "food-discovery-mvp-staging",
);
const bucketName = requiredArgument(
  "--bucket-name",
  /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
  "food-discovery-mvp-staging",
);

const sourcePath = path.join(
  repositoryRoot,
  "dist",
  "server",
  "wrangler.json",
);
const outputPath = path.join(
  repositoryRoot,
  "dist",
  "server",
  "wrangler.staging.json",
);
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const staging = {
  ...source,
  topLevelName: "food-discovery-mvp-staging",
  name: "food-discovery-mvp-staging",
  d1_databases: source.d1_databases.map((binding) =>
    binding.binding === "DB"
      ? {
          ...binding,
          database_name: databaseName,
          database_id: databaseId,
        }
      : binding,
  ),
  r2_buckets: source.r2_buckets.map((binding) =>
    binding.binding === "MEDIA"
      ? {
          ...binding,
          bucket_name: bucketName,
        }
      : binding,
  ),
};

await writeFile(
  outputPath,
  `${JSON.stringify(staging, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  "Created dist/server/wrangler.staging.json for isolated staging resources.\n",
);
