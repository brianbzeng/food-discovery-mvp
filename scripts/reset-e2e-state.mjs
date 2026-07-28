import { rm } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const stateDirectory = path.resolve(repositoryRoot, ".wrangler", "e2e-state");
const relativeStateDirectory = path.relative(repositoryRoot, stateDirectory);

if (
  !relativeStateDirectory ||
  relativeStateDirectory.startsWith("..") ||
  path.isAbsolute(relativeStateDirectory)
) {
  throw new Error("Refusing to reset E2E state outside the repository.");
}

await rm(stateDirectory, { recursive: true, force: true });
