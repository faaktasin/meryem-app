/**
 * meryem-app tests — checks/rules.mjs
 *
 * The login screen only protects the data if the database refuses everyone else. firestore.rules
 * is the text published in the Firebase console; these checks keep it and the client in step:
 *   1. the rules grant access in exactly one place, users/{userId}/**, and only to the signed-in
 *      account whose uid is that userId; any other allow statement is an explicit `if false`;
 *   2. the client reaches Firestore only through userCollection(), i.e. under the signed-in uid,
 *      so rule 1 covers every read and write the app makes.
 * Both are static. Whether the console holds this same text is checked by hand there — nothing in
 * the repo can read the deployed rules (read back from the console and matched on 2026-10-23).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const name = "rules";

const USERS_MATCH = ["/databases/{database}/documents", "/users/{userId}/{document=**}"];
const OWNER_ONLY = "request.auth != null && request.auth.uid == userId";
const USER_COLLECTION = "db.collection('users').doc(auth.currentUser.uid).collection(name)";

/** Every allow statement with the match blocks it sits in, outermost first. */
function allowStatements(src) {
  const text = src.replace(/\/\/[^\n]*/g, "");
  const stack = [];
  const out = [];
  const token = /match\s+(\S+)\s*\{|allow\s+([^:;]+):\s*if\s+([^;]+);|\{|\}/g;
  let m;
  while ((m = token.exec(text))) {
    if (m[1]) stack.push(m[1]);
    else if (m[2]) out.push({ path: stack.slice(), methods: m[2].trim(), condition: m[3].replace(/\s+/g, " ").trim() });
    else if (m[0] === "{") stack.push(null);
    else stack.pop();
  }
  return out;
}

export async function run({ check, root }) {
  const rulesPath = join(root, "firestore.rules");
  const rules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : "";

  await check("rules: firestore.rules allows read/write only on users/{userId}/** and only for that signed-in uid", () => {
    const allows = allowStatements(rules);
    const granting = allows.filter((a) => a.condition !== "false");
    const only = granting[0];
    const ok = /^\s*rules_version\s*=\s*'2';/m.test(rules) &&
      granting.length === 1 &&
      JSON.stringify(only.path.filter(Boolean)) === JSON.stringify(USERS_MATCH) &&
      only.methods.replace(/\s+/g, "") === "read,write" &&
      only.condition === OWNER_ONLY;
    return { ok, detail: `file ${rules ? "present" : "missing"}; allows: ${JSON.stringify(allows)}` };
  });

  await check("rules: the client touches Firestore only through userCollection(), under the signed-in uid", () => {
    const jsDir = join(root, "js");
    const uses = [];
    for (const f of readdirSync(jsDir).filter((n) => n.endsWith(".js"))) {
      const src = readFileSync(join(jsDir, f), "utf8");
      for (const hit of src.matchAll(/\bdb\.(?!enablePersistence\()\w+\([^\n]*|\.collectionGroup\(|firebase\.firestore\(\)/g)) {
        uses.push(`${f}: ${hit[0].trim()}`);
      }
    }
    const expected = ["firebase.js: firebase.firestore()", `firebase.js: ${USER_COLLECTION};`];
    return { ok: JSON.stringify(uses) === JSON.stringify(expected), detail: JSON.stringify(uses) };
  });
}

export const mutants = [
  {
    id: "rules-any-signed-in-account",
    file: "firestore.rules",
    find: "if request.auth != null && request.auth.uid == userId;",
    replace: "if request.auth != null;",
    expect: "rules: firestore.rules allows read/write only on users/{userId}/** and only for that signed-in uid",
  },
  {
    id: "rules-whole-database",
    file: "firestore.rules",
    find: "match /users/{userId}/{document=**} {",
    replace: "match /{userId}/{document=**} {",
    expect: "rules: firestore.rules allows read/write only on users/{userId}/** and only for that signed-in uid",
  },
  {
    id: "rules-second-allow",
    file: "firestore.rules",
    find: "      allow read, write: if request.auth != null && request.auth.uid == userId;\n",
    replace: "      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n    match /shared/{document=**} {\n      allow read: if true;\n",
    expect: "rules: firestore.rules allows read/write only on users/{userId}/** and only for that signed-in uid",
  },
  {
    id: "rules-deny-all-opened",
    file: "firestore.rules",
    find: "allow read, write: if false;",
    replace: "allow read, write: if true;",
    expect: "rules: firestore.rules allows read/write only on users/{userId}/** and only for that signed-in uid",
  },
  {
    id: "rules-client-top-level-collection",
    file: "js/firebase.js",
    find: "return userCollection('habitLog').add(entry);",
    replace: "return db.collection('habitLog').add(entry);",
    expect: "rules: the client touches Firestore only through userCollection(), under the signed-in uid",
  },
  {
    id: "rules-client-fixed-doc",
    file: "js/firebase.js",
    find: "return db.collection('users').doc(auth.currentUser.uid).collection(name);",
    replace: "return db.collection('users').doc('shared').collection(name);",
    expect: "rules: the client touches Firestore only through userCollection(), under the signed-in uid",
  },
];
