-- Structural tombstone: identity is retained across task/subtask tables.
-- No task content is archived here, converted rows have empty data.
ALTER TABLE tasks ADD COLUMN converted_to uuid;
CREATE UNIQUE INDEX task_conversion_identity ON tasks(converted_to) WHERE converted_to IS NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT task_conversion_same_identity CHECK (converted_to IS NULL OR converted_to=id);
INSERT INTO schema_migrations(version) VALUES(5);
