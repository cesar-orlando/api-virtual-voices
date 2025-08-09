import mongoose, { Connection, Model } from 'mongoose';
import { getQuickLearningConnection, getConnectionByCompanySlug } from '../config/connectionManager';
import getRecordModel from '../models/record.model';

type CanonicalPhone = string;

function parseArg(name: string, fallback?: string): string | undefined {
  const match = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!match) return fallback;
  const [, value] = match.split('=');
  return value;
}

function toDayKey(date: Date): string {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toCanonicalPhone(value: unknown): CanonicalPhone | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const digitsOnly = s.replace(/\D+/g, '');
  return digitsOnly || null;
}

async function main(): Promise<void> {
  const startStr = parseArg('start');
  const endStr = parseArg('end');
  const slugsStr = parseArg('slugs', 'alumnos,prospectos,clientes,sin_contestar,nuevo_ingreso');

  if (!startStr || !endStr) {
    console.error('Usage: ts-node src/scripts/compareChatsVsRecords.ts --start=YYYY-MM-DD --end=YYYY-MM-DD [--slugs=csv]');
    process.exit(1);
  }

  const startDate = startOfDay(new Date(startStr));
  const endDate = endOfDay(new Date(endStr));
  const tableSlugs = slugsStr.split(',').map(s => s.trim()).filter(Boolean);

  const qlConn: Connection = await getQuickLearningConnection();
  const companyConn: Connection = await getConnectionByCompanySlug('quicklearning');

  // Chats model (minimal)
  const chatSchema = new mongoose.Schema({
    phone: String,
  }, { timestamps: true, collection: 'chats' });
  const Chat: Model<any> = qlConn.model('Chat', chatSchema);

  // Dynamic Records
  const Record = getRecordModel(companyConn);

  // Load data in range
  const [chats, records] = await Promise.all([
    Chat.find({ createdAt: { $gte: startDate, $lte: endDate } }).select('phone createdAt').lean(),
    Record.find({
      c_name: 'quicklearning',
      tableSlug: { $in: tableSlugs },
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('createdAt tableSlug data.telefono data.phone data.number').lean()
  ]);

  // Aggregate chats by canonical phone and by day
  const chatCanonToCreated: Map<CanonicalPhone, Date> = new Map();
  const chatsByDay: Map<string, Set<CanonicalPhone>> = new Map();
  const duplicateChatPhones: Map<CanonicalPhone, number> = new Map();

  for (const c of chats) {
    const canon = toCanonicalPhone(c?.phone);
    if (!canon) continue;
    const created = new Date(c.createdAt);
    const key = toDayKey(created);
    if (!chatsByDay.has(key)) chatsByDay.set(key, new Set());
    const daySet = chatsByDay.get(key)!;
    daySet.add(canon);
    if (chatCanonToCreated.has(canon)) {
      duplicateChatPhones.set(canon, (duplicateChatPhones.get(canon) || 1) + 1);
    } else {
      chatCanonToCreated.set(canon, created);
    }
  }

  // Aggregate records by canonical phone and by day
  const recordCanonToCreated: Map<CanonicalPhone, { date: Date, slug: string }[]> = new Map();
  const recordsByDay: Map<string, Set<CanonicalPhone>> = new Map();
  const duplicateRecordPhones: Map<CanonicalPhone, number> = new Map();

  for (const r of records as any[]) {
    const priority = r?.data?.telefono ?? r?.data?.phone ?? r?.data?.number;
    const canon = toCanonicalPhone(priority);
    if (!canon) continue;
    const created = new Date(r.createdAt);
    const key = toDayKey(created);
    if (!recordsByDay.has(key)) recordsByDay.set(key, new Set());
    recordsByDay.get(key)!.add(canon);
    const arr = recordCanonToCreated.get(canon) || [];
    arr.push({ date: created, slug: r.tableSlug });
    recordCanonToCreated.set(canon, arr);
    if (arr.length > 1) duplicateRecordPhones.set(canon, arr.length);
  }

  // Differences per day
  const dayKeys: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    dayKeys.push(toDayKey(d));
  }

  const daily = dayKeys.map(day => {
    const chatSet = chatsByDay.get(day) || new Set<CanonicalPhone>();
    const recSet = recordsByDay.get(day) || new Set<CanonicalPhone>();
    const chatsWithoutRecord: CanonicalPhone[] = [];
    const recordsWithoutChat: CanonicalPhone[] = [];
    chatSet.forEach(p => { if (!recSet.has(p)) chatsWithoutRecord.push(p); });
    recSet.forEach(p => { if (!chatSet.has(p)) recordsWithoutChat.push(p); });
    return {
      day,
      chatsCreated: chatSet.size,
      recordsCreated: recSet.size,
      delta: chatSet.size - recSet.size,
      chatsWithoutRecord: chatsWithoutRecord.slice(0, 50),
      recordsWithoutChat: recordsWithoutChat.slice(0, 50)
    };
  });

  // Overall sets
  const allChatPhones = new Set<CanonicalPhone>(Array.from(chatCanonToCreated.keys()));
  const allRecordPhones = new Set<CanonicalPhone>(Array.from(recordCanonToCreated.keys()));

  const overallChatsWithoutRecord: CanonicalPhone[] = [];
  const overallRecordsWithoutChat: CanonicalPhone[] = [];
  allChatPhones.forEach(p => { if (!allRecordPhones.has(p)) overallChatsWithoutRecord.push(p); });
  allRecordPhones.forEach(p => { if (!allChatPhones.has(p)) overallRecordsWithoutChat.push(p); });

  const summary = {
    range: { start: startDate.toISOString(), end: endDate.toISOString() },
    tableSlugs,
    totals: {
      chats: allChatPhones.size,
      records: allRecordPhones.size,
      delta: allChatPhones.size - allRecordPhones.size
    },
    duplicates: {
      chats: Array.from(duplicateChatPhones.entries()).slice(0, 50).map(([phone, count]) => ({ phone, count })),
      records: Array.from(duplicateRecordPhones.entries()).slice(0, 50).map(([phone, count]) => ({ phone, count }))
    },
    overallDiff: {
      chatsWithoutRecord: overallChatsWithoutRecord.slice(0, 200),
      recordsWithoutChat: overallRecordsWithoutChat.slice(0, 200)
    },
    daily
  };

  console.log(JSON.stringify(summary, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('Error running comparison script:', err);
  process.exit(1);
});

