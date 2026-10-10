ALTER TABLE lists ADD COLUMN color text NOT NULL DEFAULT 'auto' CHECK (color IN ('auto','sage','terracotta','ochre','rose','mauve','blue','teal','olive','sand','slate'));
INSERT INTO schema_migrations(version) VALUES(2);
