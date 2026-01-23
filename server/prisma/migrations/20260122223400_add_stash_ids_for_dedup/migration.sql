-- Add stashIds column for deduplication across instances
-- stash_ids contains JSON array of {endpoint, stash_id} pairs from StashDB

-- StashPerformer
ALTER TABLE StashPerformer ADD COLUMN stashIds TEXT;

-- StashStudio 
ALTER TABLE StashStudio ADD COLUMN stashIds TEXT;

-- StashTag
ALTER TABLE StashTag ADD COLUMN stashIds TEXT;
