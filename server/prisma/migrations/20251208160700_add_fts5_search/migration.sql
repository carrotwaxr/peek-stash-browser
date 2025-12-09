-- Create FTS5 virtual tables for full-text search
-- Note: These are created via raw SQL because Prisma doesn't support virtual tables

CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts USING fts5(
  id UNINDEXED,
  title,
  details,
  code
);

CREATE VIRTUAL TABLE IF NOT EXISTS performer_fts USING fts5(
  id UNINDEXED,
  name,
  aliases
);

CREATE VIRTUAL TABLE IF NOT EXISTS studio_fts USING fts5(
  id UNINDEXED,
  name
);

CREATE VIRTUAL TABLE IF NOT EXISTS tag_fts USING fts5(
  id UNINDEXED,
  name
);

-- Triggers to keep FTS in sync with main tables

CREATE TRIGGER IF NOT EXISTS scene_fts_insert AFTER INSERT ON CachedScene BEGIN
  INSERT INTO scene_fts(id, title, details, code)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(json_extract(new.data, '$.details'), ''), COALESCE(new.code, ''));
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_update AFTER UPDATE ON CachedScene BEGIN
  DELETE FROM scene_fts WHERE id = old.id;
  INSERT INTO scene_fts(id, title, details, code)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(json_extract(new.data, '$.details'), ''), COALESCE(new.code, ''));
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_delete AFTER DELETE ON CachedScene BEGIN
  DELETE FROM scene_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_insert AFTER INSERT ON CachedPerformer BEGIN
  INSERT INTO performer_fts(id, name, aliases)
  VALUES (new.id, COALESCE(new.name, ''), COALESCE(json_extract(new.data, '$.aliases'), ''));
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_update AFTER UPDATE ON CachedPerformer BEGIN
  DELETE FROM performer_fts WHERE id = old.id;
  INSERT INTO performer_fts(id, name, aliases)
  VALUES (new.id, COALESCE(new.name, ''), COALESCE(json_extract(new.data, '$.aliases'), ''));
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_delete AFTER DELETE ON CachedPerformer BEGIN
  DELETE FROM performer_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS studio_fts_insert AFTER INSERT ON CachedStudio BEGIN
  INSERT INTO studio_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS studio_fts_update AFTER UPDATE ON CachedStudio BEGIN
  DELETE FROM studio_fts WHERE id = old.id;
  INSERT INTO studio_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS studio_fts_delete AFTER DELETE ON CachedStudio BEGIN
  DELETE FROM studio_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS tag_fts_insert AFTER INSERT ON CachedTag BEGIN
  INSERT INTO tag_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_fts_update AFTER UPDATE ON CachedTag BEGIN
  DELETE FROM tag_fts WHERE id = old.id;
  INSERT INTO tag_fts(id, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER IF NOT EXISTS tag_fts_delete AFTER DELETE ON CachedTag BEGIN
  DELETE FROM tag_fts WHERE id = old.id;
END;
