import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(process.cwd(), ".env"),
  path.join(here, "..", "..", ".env"),
  path.join(here, "..", "..", "..", ".env")
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    console.log(`Loaded env from ${candidate}`);
    break;
  }
}
