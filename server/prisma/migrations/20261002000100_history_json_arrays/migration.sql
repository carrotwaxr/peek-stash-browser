-- A history an older version stored as a JSON string holding the array's text
-- ("[\"2025-10-25T03:50:32.452Z\"]", json_type text) becomes the array itself,
-- so json_each reads it. Anything that is not such a string is left alone.
PRAGMA foreign_keys=OFF;
BEGIN;
UPDATE "WatchHistory" SET "oHistory" = json_extract("oHistory", '$')
  WHERE json_type("oHistory") = 'text' AND json_valid(json_extract("oHistory", '$')) AND json_type(json_extract("oHistory", '$')) = 'array';
UPDATE "WatchHistory" SET "playHistory" = json_extract("playHistory", '$')
  WHERE json_type("playHistory") = 'text' AND json_valid(json_extract("playHistory", '$')) AND json_type(json_extract("playHistory", '$')) = 'array';
UPDATE "ImageViewHistory" SET "oHistory" = json_extract("oHistory", '$')
  WHERE json_type("oHistory") = 'text' AND json_valid(json_extract("oHistory", '$')) AND json_type(json_extract("oHistory", '$')) = 'array';
UPDATE "ImageViewHistory" SET "viewHistory" = json_extract("viewHistory", '$')
  WHERE json_type("viewHistory") = 'text' AND json_valid(json_extract("viewHistory", '$')) AND json_type(json_extract("viewHistory", '$')) = 'array';
COMMIT;
PRAGMA foreign_keys=ON;
