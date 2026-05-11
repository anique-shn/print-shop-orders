-- Migration 007: Replace fixed col_1..col_N columns with a dynamic prices JSONB array
-- This removes the column limit entirely — any number of columns per group.

-- Step 1: add col_7/col_8 in case original 007 wasn't run yet
ALTER TABLE decoration_matrix ADD COLUMN IF NOT EXISTS col_7 numeric(8,2);
ALTER TABLE decoration_matrix ADD COLUMN IF NOT EXISTS col_8 numeric(8,2);

-- Step 2: add the prices array column
ALTER TABLE decoration_matrix
  ADD COLUMN IF NOT EXISTS prices jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Step 3: migrate col_1..col_8 into prices array
-- Wrapped in DO $$ so it compiles at execution time (after ADD COLUMN above is committed)
DO $$
BEGIN
  UPDATE decoration_matrix dm
  SET prices = (
    SELECT COALESCE(
      jsonb_agg(
        CASE WHEN val IS NULL THEN 'null'::jsonb ELSE to_jsonb(val) END
        ORDER BY idx
      ),
      '[]'::jsonb
    )
    FROM (VALUES
      (1, dm.col_1), (2, dm.col_2), (3, dm.col_3), (4, dm.col_4),
      (5, dm.col_5), (6, dm.col_6), (7, dm.col_7), (8, dm.col_8)
    ) AS t(idx, val)
    WHERE t.idx <= (SELECT col_count FROM decoration_groups dg WHERE dg.id = dm.group_id)
  )
  WHERE dm.prices = '[]'::jsonb;
END $$;

-- Step 4: drop the fixed columns
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_1;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_2;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_3;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_4;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_5;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_6;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_7;
ALTER TABLE decoration_matrix DROP COLUMN IF EXISTS col_8;

-- Step 5: remove the upper-bound constraint on col_count (no limit now)
ALTER TABLE decoration_groups DROP CONSTRAINT IF EXISTS decoration_groups_col_count_check;
ALTER TABLE decoration_groups ADD CONSTRAINT decoration_groups_col_count_check CHECK (col_count >= 1);
