import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const source = path.resolve(process.env.DATA_DIR || "data");
const target = path.resolve(process.argv[2] || "");
if (!process.argv[2] || target === source || target.startsWith(`${source}${path.sep}`)) {
  throw new Error("Pass a backup directory outside DATA_DIR");
}

async function copyTree(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const item of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, item.name);
    const dst = path.join(to, item.name);
    if (item.isDirectory()) {
      await copyTree(src, dst);
      continue;
    }
    if (!item.isFile() || item.name.endsWith("-wal") || item.name.endsWith("-shm")) continue;
    await fs.mkdir(path.dirname(dst), { recursive: true });
    if (item.name.endsWith(".db")) {
      const db = new Database(src, { readonly: true, fileMustExist: true });
      try { await db.backup(dst); } finally { db.close(); }
    } else {
      await fs.copyFile(src, dst);
    }
  }
}

await copyTree(source, target);
console.log(`Backed up NOVA data to ${target}`);
