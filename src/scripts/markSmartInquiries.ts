import { Types } from "mongoose";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getRecordModel from "../models/record.model";
import { getWhatsappChatModel } from "../models/whatsappChat.model";

type Args = {
  c_name: string;
  tableSlug: string;
  sessionId?: string;
  dryRun?: boolean;
};

function parseArgs(): Args {
  const args: Record<string, string | boolean> = {};
  process.argv.slice(2).forEach((arg) => {
    const [k, v] = arg.includes("=") ? arg.split("=") : [arg.replace(/^--?/, ""), "true"];
    const key = k.replace(/^--?/, "");
    args[key] = v === "true" ? true : v === "false" ? false : v;
  });

  const c_name = String(args.c_name || args.company || "quicklearning");
  const tableSlug = String(args.tableSlug || "prospectos");
  const sessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;
  const dryRun = Boolean(args.dryRun || false);

  return { c_name, tableSlug, sessionId, dryRun };
}

function normalizePhoneVariants(raw: string | number | undefined | null): string[] {
  if (raw == null) return [];
  const val = String(raw).trim();
  if (!val) return [];
  const digits = val.replace(/\s+/g, "");
  const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
  const noPlus = withPlus.replace(/^\+/, "");
  const last10 = noPlus.length > 10 ? noPlus.slice(-10) : noPlus;
  const variants = new Set<string>([
    val,
    digits,
    withPlus,
    noPlus,
    `${noPlus}@c.us`,
    `${withPlus}@c.us`,
    last10,
  ].filter(Boolean) as string[]);
  return Array.from(variants);
}

function findFirstSmartMention(messages: Array<{ direction: string; body: any; createdAt?: Date }>) {
  if (!Array.isArray(messages)) return null as null | { index: number; direction: string; body: any; createdAt?: Date };
  // Ensure chronological order by createdAt if available; fallback to original order
  const msgs = [...messages].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  });
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const text = m?.body != null ? String(m.body) : "";
    if (/smart/i.test(text)) {
      return { index: i, direction: (m.direction || "").toLowerCase(), body: m.body, createdAt: m.createdAt };
    }
  }
  return null;
}

async function main() {
  const { c_name, tableSlug, sessionId, dryRun } = parseArgs();
  console.log(`Starting SMART inquiry marker for c_name='${c_name}', table='${tableSlug}', sessionId='${sessionId || "(any)"}', dryRun=${!!dryRun}`);

  const conn = await getConnectionByCompanySlug(c_name);
  const Record = getRecordModel(conn);
  const Chats = getWhatsappChatModel(conn);

  // Build chat filter
  const chatFilter: any = {};
  if (sessionId) {
    try {
      if (Types.ObjectId.isValid(sessionId)) {
        chatFilter.$or = [
          { "session.id": new Types.ObjectId(sessionId) },
          { "session.id": sessionId },
        ];
      } else {
        chatFilter["session.id"] = sessionId;
      }
    } catch {
      chatFilter["session.id"] = sessionId;
    }
  }

  // Only fetch needed fields
  const chats = await Chats.find(chatFilter, { phone: 1, messages: 1 }).lean();
  console.log(`Loaded ${chats.length} chats to analyze`);

  let updated = 0;
  let matched = 0;
  let inboundFirst = 0;
  let outboundFirst = 0;

  for (const ch of chats) {
    const first = findFirstSmartMention(ch.messages || []);
    if (!first) continue;
    matched++;
    const asker = first.direction === "inbound" ? "inbound" : "outbound";
    if (asker === "inbound") inboundFirst++; else outboundFirst++;

    const variants = normalizePhoneVariants(ch.phone);
    if (variants.length === 0) continue;

    // Build OR conditions for common phone fields in dynamicrecords
    const phoneFields = ["telefono", "phone", "whatsapp", "celular", "tel", "movil", "number"];
    const orConds: any[] = [];
    for (const f of phoneFields) {
      // number is often numeric; try both as string and numeric
      if (f === "number") {
        const numericCandidates = variants
          .map(v => Number(String(v).replace(/\D+/g, "")))
          .filter(n => !Number.isNaN(n));
        if (numericCandidates.length) {
          orConds.push({ [`data.${f}`]: { $in: Array.from(new Set(numericCandidates)) } });
        }
      } else {
        orConds.push({ [`data.${f}`]: { $in: variants } });
      }
    }

    const recordFilter: any = {
      c_name,
      tableSlug,
      $or: orConds,
    };

    const rec = await Record.findOne(recordFilter).lean();
    if (!rec) {
      console.log(`No record found for chat phone='${ch.phone}' (variants=${variants.join(",")}). First SMART by ${asker}.`);
      continue;
    }

    console.log(`Record ${rec._id} matched for phone='${ch.phone}'. First SMART by ${asker}.`);

    if (!dryRun) {
      const setOps: any = {
        "data.p_smart": "P-SMART",
        "data.p_smart_first_asked_by": asker,
        updatedBy: "markSmartInquiries.ts",
        updatedAt: new Date(),
      };
      await Record.updateOne({ _id: rec._id }, { $set: setOps });
      updated++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`- Chats analyzed: ${chats.length}`);
  console.log(`- Chats with 'smart' mention: ${matched}`);
  console.log(`- First mention inbound: ${inboundFirst}`);
  console.log(`- First mention outbound: ${outboundFirst}`);
  console.log(`- Records updated${dryRun ? " (dry run)" : ""}: ${updated}`);
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });


