import 'dotenv/config';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import getTableModel from '../models/table.model';

async function run() {
  const c_name = process.env.MIGRATE_C_NAME || process.argv[2];
  const dryRun = (process.env.DRY_RUN || process.argv[3]) === 'true';
  if (!c_name) {
    console.error('Usage: ts-node src/scripts/backfillTableFieldIds.ts <c_name> [dryRun:true|false]');
    process.exit(1);
  }

  const conn = await getConnectionByCompanySlug(c_name);
  const Table = getTableModel(conn);

  const tables = await Table.find({ c_name }).lean(false);
  let updatedTables = 0;

  for (const table of tables) {
    let changed = false;
    const fields: any[] = (table as any).fields || [];
    console.log(`Processing table ${table.slug} (${table._id}) with ${fields.length} fields...`);
    for (const field of fields) {
        console.log(`Assigning new _id to field ${field.name} in table ${table.slug}`);
        // Assign a new subdocument id by marking modified; Mongoose will generate _id for subdocs automatically
        field._id = undefined; // Explicitly ensure it will be generated
        changed = true;
    }

    if (changed) {
      (table as any).markModified('fields');
      if (!dryRun) {
        await (table as any).save();
      }
      updatedTables++;
      console.log(`Updated field ids for table ${table.slug} (${table._id})`);
    }
  }

  console.log(`Done. Tables scanned: ${tables.length}. Tables updated: ${updatedTables}. Dry run: ${dryRun}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
