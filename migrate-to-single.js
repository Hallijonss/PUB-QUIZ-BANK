// scripts/migrate-to-single.js
// Run from repo root: node scripts/migrate-to-single.js
// Reads manifest.json + data/*.json, writes data/questions.json

const fs = require("fs/promises");
const path = require("path");

function extractNumberFromLegacyId(id) {
  // Handles: "misc-023", "sports-004", "0009", etc.
  const m = String(id).match(/(\d+)\s*$/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function padId(n, width = 4) {
  return String(n).padStart(width, "0");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function main() {
  const repoRoot = process.cwd();

  const manifestPath = path.join(repoRoot, "manifest.json");
  const manifest = await readJson(manifestPath);

  if (!manifest?.categories || !Array.isArray(manifest.categories)) {
    throw new Error("manifest.json must have { categories: [...] }");
  }

  // Collect all questions in deterministic order:
  // - manifest category order
  // - within each file, sort by numeric part of legacy id
  let combined = [];

  for (const cat of manifest.categories) {
    const key = cat.key;
    const file = cat.file; // e.g. "data/misc.json"

    if (!key || !file) {
      throw new Error(`Bad manifest entry: ${JSON.stringify(cat)}`);
    }

    const filePath = path.join(repoRoot, file);
    const arr = await readJson(filePath);

    if (!Array.isArray(arr)) {
      throw new Error(`${file} is not a JSON array`);
    }

    // Sort within category by legacy numeric id for stable migration
    arr.sort((a, b) => {
      const na = extractNumberFromLegacyId(a?.id);
      const nb = extractNumberFromLegacyId(b?.id);
      return na - nb;
    });

    for (const q of arr) {
      if (!q?.question || !q?.answer) {
        // allow empty answer? you can relax this if you want
        // but most of your bank uses question+answer
      }

      combined.push({
        // id assigned later
        legacyId: q.id,
        category: key,
        question: q.question ?? "",
        answer: q.answer ?? "",
        difficulty: q.difficulty ?? 2,
        author: q.author ?? "Halli",
        tags: Array.isArray(q.tags) ? q.tags : []
      });
    }
  }

  // Assign global IDs
  const width = Math.max(4, String(combined.length).length);
  combined = combined.map((q, idx) => ({
    id: padId(idx + 1, width),
    ...q
  }));

  const outPath = path.join(repoRoot, "data", "questions.json");
  await fs.writeFile(outPath, JSON.stringify(combined, null, 2) + "\n", "utf-8");

  console.log(`✅ Wrote ${combined.length} questions to data/questions.json`);
  console.log(`ℹ️ Each item has: id (global), legacyId, category, question, answer, difficulty, author, tags`);
}

main().catch((err) => {
  console.error("❌ Migration failed:");
  console.error(err);
  process.exit(1);
});