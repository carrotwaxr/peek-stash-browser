-- Scene and image downloads created before instances were stored cannot be served safely:
-- the file would be fetched from a guessed Stash server. Expire them; the user downloads again.
UPDATE "Download" SET "status" = 'EXPIRED' WHERE "type" IN ('SCENE', 'IMAGE') AND "instanceId" = '';
