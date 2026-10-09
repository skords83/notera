CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (id uuid PRIMARY KEY, username text NOT NULL UNIQUE, name text NOT NULL, password text NOT NULL, timezone text NOT NULL DEFAULT 'Europe/Berlin', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sessions (token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE lists (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), inbox boolean NOT NULL DEFAULT false, name text NOT NULL, version integer NOT NULL DEFAULT 1, deleted_at timestamptz);
CREATE UNIQUE INDEX one_inbox ON lists(owner_id) WHERE inbox;
CREATE TABLE memberships (list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(list_id,user_id));
CREATE TABLE tasks (id uuid PRIMARY KEY, list_id uuid NOT NULL REFERENCES lists(id), data jsonb NOT NULL, version integer NOT NULL, field_versions jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE INDEX task_list ON tasks(list_id);
CREATE TABLE preferences (user_id uuid NOT NULL REFERENCES users(id), task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, data jsonb NOT NULL, version integer NOT NULL, field_versions jsonb NOT NULL, PRIMARY KEY(user_id,task_id));
-- The locked clock makes cursor order also commit order, unlike standalone sequences.
CREATE TABLE sync_clock (id integer PRIMARY KEY CHECK(id=1), cursor bigint NOT NULL DEFAULT 0, floor bigint NOT NULL DEFAULT 0);
INSERT INTO sync_clock(id) VALUES(1);
CREATE TABLE changes (cursor bigint PRIMARY KEY, entity text NOT NULL, entity_id uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mutations (user_id uuid NOT NULL REFERENCES users(id), key uuid NOT NULL, digest text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key));
CREATE TABLE devices (user_id uuid NOT NULL REFERENCES users(id), id uuid NOT NULL, cursor bigint NOT NULL, seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id));
-- Reserved independent reminder/push records; Stage B does not yet schedule or send them.
CREATE TABLE reminders (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, remind_at timestamptz NOT NULL, snoozed_until timestamptz, delivered_at timestamptz);
CREATE TABLE push_subscriptions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), subscription jsonb NOT NULL);
INSERT INTO schema_migrations(version) VALUES(1);
