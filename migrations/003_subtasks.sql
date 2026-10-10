CREATE TABLE subtasks (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  version integer NOT NULL,
  field_versions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX subtask_parent ON subtasks(task_id, created_at, id);
INSERT INTO schema_migrations(version) VALUES(3);
