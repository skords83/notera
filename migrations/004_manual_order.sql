ALTER TABLE tasks ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN order_version integer NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE subtasks ADD COLUMN order_version integer NOT NULL DEFAULT 0;
WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY list_id ORDER BY updated_at,id) AS n FROM tasks) UPDATE tasks SET position=ranked.n FROM ranked WHERE tasks.id=ranked.id;
WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY task_id ORDER BY created_at,id) AS n FROM subtasks) UPDATE subtasks SET position=ranked.n FROM ranked WHERE subtasks.id=ranked.id;
INSERT INTO schema_migrations(version) VALUES(4);
