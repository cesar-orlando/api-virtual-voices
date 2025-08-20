/*
MongoDB Playground script: Assign advisors to prospect records using round-robin per session.

What it does:
- Reads the `chats` collection, deduping by phone (first by createdAt, then _id).
- Extracts phone (normalized) and session.id from the chosen chat per phone.
- For each chat, finds the matching dynamicrecords document with tableSlug: 'prospectos' and data.number == Number(phone).
- For each session, selects advisors similarly to assignChatToAdvisor (role: 'Asesor') and branch restrictions.
- Uses round-robin based on sessions.metadata.assignmentCounter (stored in `sessions` collection).
- Updates the prospect record's data.asesor and assignment metadata.

How to use:
1) Set DB_NAME below (e.g., 'mitsubishi').
2) Adjust DRY_RUN to true to preview or false to apply.
3) Optionally filter to specific session names by setting ONLY_SESSION_NAMES.
4) Run in MongoDB Shell/Compass Playground.
*/

/* global use, db, ObjectId, print, printjson */

const DB_NAME = 'mitsubishi';
const DRY_RUN = false; // Set to false to write changes
const ONLY_SESSION_NAMES = null; // e.g., ['BDC_COUNTRY']; leave null for all sessions
const LIMIT = 0; // 0 means no limit

use(DB_NAME);

const Chats = db.getCollection('chats');
const Sessions = db.getCollection('sessions');
const Users = db.getCollection('users');
const Records = db.getCollection('dynamicrecords');

function toStr(v) { try { return v == null ? null : String(v); } catch (e) { return null; } }
function cleanPhone(p) { return (p || '').replace('@c.us', ''); }

function getAdvisorsForSession(session) {
  const sessionBranchId = session?.branch?.branchId ? toStr(session.branch.branchId) : null;
  let userFilter = { role: 'Asesor' };
  if (sessionBranchId) {
    // Users with same branchId (string compare on ObjectId)
    userFilter['branch.branchId'] = { $exists: true };
  } else {
    // Users without branch or null branch
    userFilter.$or = [
      { 'branch.branchId': { $exists: false } },
      { 'branch.branchId': null }
    ];
  }

  const advisors = Users.find(userFilter).sort({ name: 1 }).toArray();
  if (sessionBranchId) {
    // Refine by matching branchId string-wise
    return advisors.filter(u => toStr(u?.branch?.branchId) === sessionBranchId);
  }
  return advisors;
}

function pickAdvisorRoundRobin(session, advisors) {
  const counter = session?.metadata?.assignmentCounter || 0;
  const idx = advisors.length ? (counter % advisors.length) : 0;
  const selected = advisors[idx] || null;
  return { selected, nextCounter: counter + 1 };
}

let processed = 0, updated = 0, skipped = 0, noProspect = 0, noAdvisors = 0;
// In-memory counters to simulate rotation during DRY_RUN
const memCounters = {};

// Build a deduped list of chats by phone (first by createdAt, then _id)
const cursor = Chats.aggregate([
  { $match: { phone: { $type: 'string' } } },
  { $addFields: { cleanPhone: { $replaceAll: { input: '$phone', find: '@c.us', replacement: '' } } } },
  ...(ONLY_SESSION_NAMES && Array.isArray(ONLY_SESSION_NAMES) ? [{ $match: { 'session.name': { $in: ONLY_SESSION_NAMES } } }] : []),
  { $sort: { createdAt: 1, _id: 1 } },
  { $group: { _id: '$cleanPhone', doc: { $first: '$$ROOT' } } },
  ...(LIMIT > 0 ? [{ $limit: LIMIT }] : [])
]);

cursor.forEach(item => {
  const chat = item.doc;
  processed++;

  const phoneRaw = chat.phone;
  const phoneClean = cleanPhone(phoneRaw);
  const phoneNum = Number(phoneClean);
  const sessionId = chat?.session?.id || chat?.session?.Id || chat?.sessionId || null;

  if (!sessionId) {
    skipped++;
    print(`[skip] Chat ${chat._id} has no session.id; phone=${phoneRaw}`);
    return;
  }

  const session = Sessions.findOne({ _id: sessionId });
  if (!session) {
    skipped++;
    print(`[skip] Session not found ${sessionId}; phone=${phoneRaw}`);
    return;
  }

  // Get advisors for this session (respecting branch rule + sorted by name)
  const advisors = getAdvisorsForSession(session);
  if (!advisors || advisors.length === 0) {
    noAdvisors++;
    print(`[no advisors] session=${session.name} (${session._id})`);
    return;
  }

  // Find matching prospect by number
  const prospectQuery = { tableSlug: 'prospectos', 'data.number': phoneNum };
  const prospect = Records.findOne(prospectQuery);
  if (!prospect) {
    noProspect++;
    print(`[no prospect] phone=${phoneNum} session=${session.name}`);
  }

  if (DRY_RUN) {
    // Simulate per-assignment rotation using in-memory counters
    const sid = toStr(session._id);
    const prev = memCounters[sid] != null ? memCounters[sid] : (session?.metadata?.assignmentCounter || 0);
    const idx = advisors.length ? (prev % advisors.length) : 0;
    const selected = advisors[idx] || null;
    memCounters[sid] = prev + 1;

    if (!selected) {
      noAdvisors++;
      print(`[no advisors] round-robin failed session=${session.name}`);
      return;
    }

    printjson({
      action: 'ASSIGN',
      phone: phoneNum,
      session: { id: session._id, name: session.name },
      advisor: { id: selected._id, name: selected.name },
      prospectId: prospect ? prospect._id : null
    });
  } else {
    // Atomically increment session counter and compute advisor based on new value
    const updatedSession = Sessions.findOneAndUpdate(
      { _id: session._id },
      { $inc: { 'metadata.assignmentCounter': 1 } },
      { returnNewDocument: true }
    );
    const after = updatedSession?.metadata?.assignmentCounter || 1;
    const idx = advisors.length ? ((after - 1) % advisors.length) : 0;
    const selected = advisors[idx] || null;

    if (!selected) {
      noAdvisors++;
      print(`[no advisors] round-robin failed session=${session.name}`);
      return;
    }

    // Update session metadata for traceability (optional)
    Sessions.updateOne(
      { _id: session._id },
      { $set: { 'metadata.lastAssignmentAt': new Date(), 'metadata.lastAssignedTo': selected.name } }
    );

    // Update prospect record with advisor assignment metadata
    const res = Records.updateOne(
      prospectQuery,
      {
        $set: {
          'data.asesor': { id: selected._id, name: selected.name },
          'data.isVisibleToAll': false,
          'data.assignedAt': new Date(),
          'data.assignedBy': 'round-robin-script'
        }
      }
    );

    if (res.matchedCount === 0) {
      noProspect++;
    } else if (res.modifiedCount > 0) {
      updated++;
    }
  }
});

print('Processed chats:', processed);
print('Updated prospects:', updated);
print('Skipped (no session):', skipped);
print('No prospect found:', noProspect);
print('No advisors:', noAdvisors);