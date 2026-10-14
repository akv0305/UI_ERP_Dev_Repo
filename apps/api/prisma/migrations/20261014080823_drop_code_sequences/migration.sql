-- PD-041: codes are last saved number + 1 under a transaction lock (no gaps).
-- The sequences from 20261013121516_items_master are no longer used.
DROP SEQUENCE IF EXISTS "item_category_code_seq";
DROP SEQUENCE IF EXISTS "item_code_seq";
