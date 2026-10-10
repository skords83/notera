import { normalizeListColor } from "../shared/listColors";
import { createHash } from "node:crypto";
import {
  mutationSchema,
  taskPatch,
  subtaskPatch,
  completionPatch,
  prefPatch,
  listPatch,
  type Mutation,
  type Task,
} from "../shared/model";
import { Database, type Query, one, change } from "./db";
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: unknown = null,
  ) {
    super(message);
  }
}
function fail(status: number, message: string, detail: unknown = null): never {
  throw new DomainError(status, message, detail);
}
export async function access(tx: Query, user: string, list: string) {
  return (
    (await one(
      tx,
      "SELECT l.* FROM lists l JOIN memberships m ON m.list_id=l.id WHERE l.id=$1 AND m.user_id=$2 AND l.deleted_at IS NULL",
      [list, user],
    )) || fail(403, "Kein Zugriff auf diese Liste.")
  );
}
export function task(row: any): Task {
  return {
    ...row.data,
    id: row.id,
    listId: row.list_id,
    version: row.version,
    createdBy: row.created_by,
    updatedAt: new Date(row.updated_at).toISOString(),
    deleted: !!row.deleted_at,
  };
}
function checkMerge(
  row: any,
  m: Mutation,
  patch: Record<string, unknown>,
  structural: string[] = [],
) {
  if (m.version > row.version)
    fail(409, "Ungültige Objektversion.", { current: row.data });
  const fields = Object.keys(patch).filter(
    (k) =>
      Number(row.field_versions[k] || 0) > m.version &&
      JSON.stringify(row.data[k]) !== JSON.stringify(patch[k]),
  );
  const structuralChange =
    structural.some((k) => Number(row.field_versions[k] || 0) > m.version) ||
    (m.version < row.version &&
      structural.some(
        (k) =>
          k in patch &&
          JSON.stringify(patch[k]) !== JSON.stringify(row.data[k]),
      ));
  if (fields.length || structuralChange)
    fail(409, "Diese Aufgabe wurde auf einem anderen Gerät geändert.", {
      fields: structuralChange ? ["Struktur", ...fields] : fields,
      current: row.data,
      version: row.version,
    });
}
export async function mutate(db: Database, user: string, input: unknown) {
  const m = mutationSchema.parse(input);
  const digest = createHash("sha256").update(JSON.stringify(m)).digest("hex");
  return db.transaction(async (tx) => {
    // Recheck visibility before idempotency replay; never return revoked task data.
    let existing: any;
    let parent: any;
    let before: any;
    if (m.entity === "completion" || m.entity === "subtask") {
      if (m.entity === "subtask")
        existing = await one(tx, "SELECT * FROM subtasks WHERE id=$1", [m.id]);
      const taskId =
        m.entity === "completion"
          ? m.id
          : existing?.task_id || subtaskPatch.parse(m.patch).taskId;
      if (!taskId) fail(400, "Hauptaufgabe fehlt.");
      parent = await one(tx, "SELECT * FROM tasks WHERE id=$1", [taskId]);
      if (!parent)
        fail(
          410,
          "Hauptaufgabe endgültig gelöscht. Lokale Änderung bleibt erhalten.",
        );
      await access(tx, user, parent.list_id);
    }
    if (m.entity === "task") {
      existing = await one(tx, "SELECT * FROM tasks WHERE id=$1", [m.id]);
      if (existing) await access(tx, user, existing.list_id);
      else if (m.version > 0)
        fail(
          410,
          "Aufgabe endgültig gelöscht. Die lokale Änderung bleibt im Konflikt erhalten.",
        );
    }
    if (m.entity === "preference") {
      const parent = await one(tx, "SELECT * FROM tasks WHERE id=$1", [m.id]);
      if (!parent) fail(410, "Aufgabe nicht mehr vorhanden.");
      await access(tx, user, parent.list_id);
      existing = await one(
        tx,
        "SELECT * FROM preferences WHERE user_id=$1 AND task_id=$2",
        [user, m.id],
      );
    }
    if (m.entity === "list") {
      existing = await one(tx, "SELECT * FROM lists WHERE id=$1", [m.id]);
      if (existing) {
        await access(tx, user, m.id);
        if (existing.owner_id !== user)
          fail(403, "Nur der Besitzer darf die Liste verwalten.");
      }
    }
    const old = await one(
      tx,
      "SELECT * FROM mutations WHERE user_id=$1 AND key=$2",
      [user, m.key],
    );
    if (old) {
      if (old.digest !== digest)
        fail(409, "Idempotenzschlüssel bereits für andere Daten verwendet.");
      return old.result;
    }
    let version = 1;
    if (m.entity === "subtask") {
      const p = subtaskPatch.parse(m.patch);
      if (parent.deleted_at)
        fail(
          409,
          "Hauptaufgabe liegt im Papierkorb. Zuerst ausdrücklich wiederherstellen.",
        );
      if (p.taskId && p.taskId !== parent.id)
        fail(
          400,
          "Unteraufgaben können nicht einer anderen Hauptaufgabe zugeordnet werden.",
        );
      if (!existing) {
        if (m.version !== 0) fail(410, "Unteraufgabe nicht mehr vorhanden.");
        if (!p.title || !p.taskId || p.deleted)
          fail(400, "Titel und Hauptaufgabe fehlen.");
      } else {
        if (existing.data.deleted)
          fail(410, "Unteraufgabe entfernt. Lokale Änderung bleibt erhalten.");
        checkMerge(existing, m, p, ["deleted"]);
      }
      const data = {
        title: "",
        done: false,
        deleted: false,
        ...existing?.data,
        ...p,
        taskId: parent.id,
      };
      version = (existing?.version || 0) + 1;
      const fields = { ...existing?.field_versions };
      for (const k of Object.keys(p)) fields[k] = version;
      await tx.query(
        "INSERT INTO subtasks(id,task_id,data,version,field_versions) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,field_versions=EXCLUDED.field_versions",
        [
          m.id,
          parent.id,
          JSON.stringify(data),
          version,
          JSON.stringify(fields),
        ],
      );
      if (
        (!existing || p.done === false) &&
        !data.deleted &&
        parent.data.done
      ) {
        parent.data.done = false;
        parent.data.completedAt = null;
        parent.field_versions.done = parent.version + 1;
        await tx.query(
          "UPDATE tasks SET data=$2,version=version+1,field_versions=$3,updated_at=now() WHERE id=$1",
          [
            parent.id,
            JSON.stringify(parent.data),
            JSON.stringify(parent.field_versions),
          ],
        );
        await change(tx, "task", parent.id);
      }
    } else if (m.entity === "completion") {
      const p = completionPatch.parse(m.patch);
      if (parent.deleted_at) fail(409, "Hauptaufgabe liegt im Papierkorb.");
      const children = (
        await tx.query(
          "SELECT * FROM subtasks WHERE task_id=$1 ORDER BY created_at,id",
          [m.id],
        )
      ).rows;
      const active = children.filter((c) => !c.data.deleted);
      if (p.action !== "undo") {
        checkMerge(parent, m, { done: p.action === "complete" }, [
          "listId",
          "deleted",
        ]);
        const open =
          p.action === "complete" ? active.filter((c) => !c.data.done) : [];
        if (
          p.action === "complete" &&
          JSON.stringify(open.map((c) => c.id).sort()) !==
            JSON.stringify([...new Set(p.openIds)].sort())
        )
          fail(
            409,
            "Offene Unteraufgaben wurden verändert. Bitte Anzahl prüfen und Alles erledigen erneut bestätigen.",
            { current: task(parent), openCount: open.length },
          );
        before = {
          done: parent.data.done,
          completedAt: parent.data.completedAt,
          subtasks: open.map((c) => ({
            id: c.id,
            done: c.data.done,
            version: c.version + 1,
          })),
          version: parent.version + 1,
        };
        for (const c of open) {
          c.data.done = true;
          c.field_versions.done = c.version + 1;
          await tx.query(
            "UPDATE subtasks SET data=$2,version=version+1,field_versions=$3 WHERE id=$1",
            [c.id, JSON.stringify(c.data), JSON.stringify(c.field_versions)],
          );
          await change(tx, "subtask", c.id);
        }
        parent.data.done = p.action === "complete";
        if (parent.data.done !== before.done)
          parent.data.completedAt = parent.data.done
            ? new Date().toISOString()
            : null;
      } else {
        const receipt = await one(
          tx,
          "SELECT result FROM mutations WHERE user_id=$1 AND key=$2",
          [user, p.key],
        );
        const saved = receipt?.result;
        if (!saved?.before || saved.taskId !== m.id)
          fail(400, "Rückgängig-Aktion nicht vorhanden.");
        before = saved.before;
        if (parent.field_versions.done !== before.version)
          fail(
            409,
            "Aufgabenstatus inzwischen verändert. Rückgängig nicht sicher möglich.",
            { current: task(parent) },
          );
        for (const prev of before.subtasks) {
          const c = active.find((c) => c.id === prev.id);
          if (!c || c.field_versions.done !== prev.version)
            fail(
              409,
              "Unteraufgabe inzwischen verändert. Rückgängig nicht sicher möglich.",
            );
        }
        for (const prev of before.subtasks) {
          const c = active.find((c) => c.id === prev.id)!;
          c.data.done = prev.done;
          c.field_versions.done = c.version + 1;
          await tx.query(
            "UPDATE subtasks SET data=$2,version=version+1,field_versions=$3 WHERE id=$1",
            [c.id, JSON.stringify(c.data), JSON.stringify(c.field_versions)],
          );
          await change(tx, "subtask", c.id);
        }
        parent.data.done = before.done;
        parent.data.completedAt = before.completedAt;
        before = undefined;
      }
      version = parent.version + 1;
      parent.field_versions.done = version;
      await tx.query(
        "UPDATE tasks SET data=$2,version=$3,field_versions=$4,updated_at=now() WHERE id=$1",
        [
          m.id,
          JSON.stringify(parent.data),
          version,
          JSON.stringify(parent.field_versions),
        ],
      );
      await change(tx, "task", m.id);
    } else if (m.entity === "list") {
      const p = listPatch.parse(m.patch);
      if (!existing) {
        if (m.version !== 0 || !p.name || p.deleted)
          fail(400, "Listenname fehlt.");
        await tx.query(
          "INSERT INTO lists(id,owner_id,name,color) VALUES($1,$2,$3,$4)",
          [m.id, user, p.name, p.color ?? "auto"],
        );
        await tx.query("INSERT INTO memberships VALUES($1,$2)", [m.id, user]);
      } else {
        if (m.version !== existing.version)
          fail(409, "Die Liste wurde inzwischen verändert.", {
            current: existing,
          });
        if (existing.inbox)
          fail(
            400,
            "Der persönliche Eingang kann nicht verändert oder geteilt werden.",
          );
        version = existing.version + 1;
        if (p.deleted) {
          const content = await one(
            tx,
            "SELECT count(*) AS n FROM tasks WHERE list_id=$1",
            [m.id],
          );
          if (Number(content.n) > 0)
            fail(
              400,
              "Liste enthält noch Aufgaben (auch im Papierkorb). Zuerst verschieben oder endgültige Bereinigung abwarten.",
            );
        }
        await tx.query(
          "UPDATE lists SET name=$2,version=$3,deleted_at=$4,color=$5 WHERE id=$1",
          [
            m.id,
            p.name ?? existing.name,
            version,
            p.deleted ? new Date().toISOString() : null,
            p.color ?? existing.color,
          ],
        );
      }
      if (p.members) {
        const members = [...new Set([user, ...p.members])];
        for (const id of members) {
          if (!(await one(tx, "SELECT id FROM users WHERE id=$1", [id])))
            fail(400, "Unbekannter Benutzer.");
        }
        await tx.query("DELETE FROM memberships WHERE list_id=$1", [m.id]);
        for (const id of members)
          await tx.query("INSERT INTO memberships VALUES($1,$2)", [m.id, id]);
        const assigned = await tx.query(
          "SELECT * FROM tasks WHERE list_id=$1",
          [m.id],
        );
        for (const row of assigned.rows) {
          if (row.data.assignee && !members.includes(row.data.assignee)) {
            row.data.assignee = null;
            row.field_versions.assignee = row.version + 1;
            await tx.query(
              "UPDATE tasks SET data=$2,version=version+1,field_versions=$3,updated_at=now() WHERE id=$1",
              [
                row.id,
                JSON.stringify(row.data),
                JSON.stringify(row.field_versions),
              ],
            );
            await change(tx, "task", row.id);
          }
        }
        await tx.query(
          "DELETE FROM preferences WHERE task_id IN (SELECT id FROM tasks WHERE list_id=$1) AND NOT (user_id=ANY($2::uuid[]))",
          [m.id, members],
        );
        await tx.query(
          "DELETE FROM reminders WHERE task_id IN (SELECT id FROM tasks WHERE list_id=$1) AND NOT (user_id=ANY($2::uuid[]))",
          [m.id, members],
        );
      }
    } else if (m.entity === "task") {
      const p = taskPatch.parse(m.patch);
      if (!existing) {
        if (m.version !== 0 || !p.title || !p.listId || p.deleted)
          fail(400, "Titel und Zielliste fehlen.");
        await access(tx, user, p.listId);
        existing = {
          data: {
            title: p.title,
            notes: "",
            links: [],
            listId: p.listId,
            assignee: null,
            due: null,
            done: false,
            deleted: false,
            completedAt: null,
          },
          field_versions: {},
          version: 0,
        };
      } else {
        checkMerge(existing, m, p, ["listId", "deleted"]);
        if (existing.deleted_at && p.deleted !== false)
          fail(
            409,
            "Aufgabe liegt im Papierkorb. Bearbeitung und Wiederherstellung getrennt entscheiden.",
            { current: existing.data, version: existing.version },
          );
      }
      if (p.done === true) {
        const open = await one(
          tx,
          "SELECT count(*) AS n FROM subtasks WHERE task_id=$1 AND NOT (data->>'deleted')::boolean AND NOT (data->>'done')::boolean",
          [m.id],
        );
        if (Number(open.n))
          fail(
            409,
            `${open.n} offene Unteraufgaben. Bitte Alles erledigen bestätigen.`,
            { current: existing.data, openCount: Number(open.n) },
          );
      }
      const data = { ...existing.data, ...p };
      await access(tx, user, data.listId);
      if (
        data.assignee &&
        !(await one(
          tx,
          "SELECT user_id FROM memberships WHERE list_id=$1 AND user_id=$2",
          [data.listId, data.assignee],
        ))
      )
        fail(400, "Zuweisung nur an aktuelle Listenmitglieder.");
      if ("done" in p && p.done !== existing.data.done)
        data.completedAt = p.done ? new Date().toISOString() : null;
      version = existing.version + 1;
      const fields = { ...existing.field_versions };
      for (const k of Object.keys(p)) fields[k] = version;
      await tx.query(
        "INSERT INTO tasks(id,list_id,data,version,field_versions,created_by,deleted_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET list_id=EXCLUDED.list_id,data=EXCLUDED.data,version=EXCLUDED.version,field_versions=EXCLUDED.field_versions,deleted_at=EXCLUDED.deleted_at,updated_at=now()",
        [
          m.id,
          data.listId,
          JSON.stringify(data),
          version,
          JSON.stringify(fields),
          existing.created_by || user,
          data.deleted ? existing.deleted_at || new Date().toISOString() : null,
        ],
      );
      // Moving a task also removes personal data belonging to users without target access.
      await tx.query(
        "DELETE FROM preferences WHERE task_id=$1 AND user_id NOT IN (SELECT user_id FROM memberships WHERE list_id=$2)",
        [m.id, data.listId],
      );
      await tx.query(
        "DELETE FROM reminders WHERE task_id=$1 AND user_id NOT IN (SELECT user_id FROM memberships WHERE list_id=$2)",
        [m.id, data.listId],
      );
    } else {
      const p = prefPatch.parse(m.patch);
      if (existing) checkMerge(existing, m, p);
      else if (m.version !== 0)
        fail(409, "Persönliche Auswahl wurde entfernt.", { current: null });
      version = (existing?.version || 0) + 1;
      const data = {
        today: null,
        starred: false,
        hideOverdue: null,
        ...existing?.data,
        ...p,
      };
      const fields = { ...existing?.field_versions };
      for (const k of Object.keys(p)) fields[k] = version;
      await tx.query(
        "INSERT INTO preferences(user_id,task_id,data,version,field_versions) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,task_id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,field_versions=EXCLUDED.field_versions",
        [user, m.id, JSON.stringify(data), version, JSON.stringify(fields)],
      );
    }
    const cursor = await change(tx, m.entity, m.id);
    const result = {
      version,
      cursor,
      ...(before ? { before, taskId: m.id } : {}),
    };
    await tx.query(
      "INSERT INTO mutations(user_id,key,digest,result) VALUES($1,$2,$3,$4)",
      [user, m.key, digest, JSON.stringify(result)],
    );
    return result;
  });
}
export async function snapshot(
  db: Database,
  user: string,
  cursor: number,
  device: string,
) {
  return db.transaction(async (tx) => {
    const clock = await one(tx, "SELECT * FROM sync_clock WHERE id=1");
    const lists = (
      await tx.query(
        "SELECT l.* FROM lists l JOIN memberships m ON m.list_id=l.id WHERE m.user_id=$1 AND l.deleted_at IS NULL",
        [user],
      )
    ).rows;
    const resultLists = [];
    for (const l of lists) {
      const members = (
        await tx.query("SELECT user_id FROM memberships WHERE list_id=$1", [
          l.id,
        ])
      ).rows.map((m) => m.user_id);
      resultLists.push({
        id: l.id,
        ownerId: l.owner_id,
        inbox: l.inbox,
        name: l.name,
        color: normalizeListColor(l.color),
        version: l.version,
        members,
      });
    }
    const tasks = (
      await tx.query(
        "SELECT t.* FROM tasks t JOIN memberships m ON m.list_id=t.list_id JOIN lists l ON l.id=t.list_id WHERE m.user_id=$1 AND l.deleted_at IS NULL",
        [user],
      )
    ).rows.map(task);
    const prefs = (
      await tx.query(
        "SELECT p.* FROM preferences p JOIN tasks t ON t.id=p.task_id JOIN memberships m ON m.list_id=t.list_id WHERE p.user_id=$1 AND m.user_id=$1",
        [user],
      )
    ).rows;
    const users = (
      await tx.query(
        "SELECT id,username,name,timezone FROM users ORDER BY name",
      )
    ).rows;
    await tx.query(
      "INSERT INTO devices(user_id,id,cursor) VALUES($1,$2,$3) ON CONFLICT(user_id,id) DO UPDATE SET cursor=EXCLUDED.cursor,seen_at=now()",
      [user, device, clock.cursor],
    );
    return {
      userId: user,
      cursor: Number(clock.cursor),
      reset: cursor < Number(clock.floor) || cursor > Number(clock.cursor),
      lists: resultLists,
      tasks,
      subtasks: (
        await tx.query(
          "SELECT s.* FROM subtasks s JOIN tasks t ON t.id=s.task_id JOIN memberships m ON m.list_id=t.list_id JOIN lists l ON l.id=t.list_id WHERE m.user_id=$1 AND l.deleted_at IS NULL ORDER BY s.created_at,s.id",
          [user],
        )
      ).rows.map((s) => ({
        ...s.data,
        id: s.id,
        taskId: s.task_id,
        version: s.version,
        createdAt: new Date(s.created_at).toISOString(),
      })),
      preferences: Object.fromEntries(
        prefs.map((p) => [p.task_id, { ...p.data, version: p.version }]),
      ),
      users,
    };
  });
}
export async function maintain(db: Database, days = 30) {
  if (!Number.isInteger(days) || days < 1)
    throw new Error("TRASH_DAYS muss positiv sein.");
  return db.transaction(async (tx) => {
    const rows = (
      await tx.query(
        "SELECT id FROM tasks WHERE deleted_at < now()-($1 * interval '1 day')",
        [days],
      )
    ).rows;
    for (const r of rows) {
      await change(tx, "tombstone", r.id);
      await tx.query("DELETE FROM tasks WHERE id=$1", [r.id]);
    }
    // A 90-day journal floor forces old devices onto an authoritative full snapshot.
    const old = await one(
      tx,
      "SELECT max(cursor) AS cursor FROM changes WHERE changed_at < now()-interval '90 days'",
    );
    if (old.cursor) {
      await tx.query(
        "UPDATE sync_clock SET floor=greatest(floor,$1) WHERE id=1",
        [old.cursor],
      );
      await tx.query("DELETE FROM changes WHERE cursor<=$1", [old.cursor]);
    }
    await tx.query("DELETE FROM sessions WHERE expires_at < now()");
    return rows.length;
  });
}
