-- ============================================================
-- Export prod public schema as a single SQL blob.
--
-- HOW TO USE:
-- 1. Open PROD Supabase → SQL Editor → New query
-- 2. Paste this entire file
-- 3. Click Run
-- 4. Result: ONE row, ONE column "schema_sql" containing the schema as text
-- 5. Click the cell to expand it (sometimes you need to double-click)
-- 6. Select ALL the text inside the cell (Cmd+A) and copy (Cmd+C)
-- 7. Open SANDBOX Supabase → SQL Editor → New query
-- 8. Paste and Run
--
-- Covers: CREATE TABLE (with columns, types, defaults, NOT NULL, PRIMARY KEY),
-- CREATE INDEX, ADD FOREIGN KEY, GRANTs to service_role + future-table
-- default privileges. Skips CHECK constraints (rare; the app's ensureSchema()
-- handles drift gracefully if anything is missed).
--
-- The GRANT phase is required after Supabase's 2026-10-30 rollout removes
-- the legacy default that auto-granted Data API access. Without these, a
-- freshly-provisioned sandbox would return 42501 on every supabase-js call.
-- See server/migrations/014_explicit_grants.sql for the standalone version.
-- ============================================================

WITH columns_agg AS (
  SELECT
    c.table_name,
    string_agg(
      format('  %I %s%s%s',
        c.column_name,
        CASE
          WHEN c.column_default LIKE 'nextval(%' AND c.data_type = 'bigint' THEN 'bigserial'
          WHEN c.column_default LIKE 'nextval(%' AND c.data_type = 'integer' THEN 'serial'
          WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
          WHEN c.data_type = 'ARRAY' THEN substring(c.udt_name from 2) || '[]'
          WHEN c.data_type = 'character varying' AND c.character_maximum_length IS NOT NULL THEN format('varchar(%s)', c.character_maximum_length)
          WHEN c.data_type = 'character varying' THEN 'varchar'
          WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN format('numeric(%s,%s)', c.numeric_precision, COALESCE(c.numeric_scale, 0))
          WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
          WHEN c.data_type = 'timestamp without time zone' THEN 'timestamp'
          WHEN c.data_type = 'double precision' THEN 'double precision'
          ELSE c.data_type
        END,
        CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
        CASE
          WHEN c.column_default IS NULL THEN ''
          WHEN c.column_default LIKE 'nextval(%' THEN ''  -- serial implies the default
          ELSE ' DEFAULT ' || c.column_default
        END
      ),
      E',\n' ORDER BY c.ordinal_position
    ) AS def
  FROM information_schema.columns c
  JOIN information_schema.tables t ON c.table_name = t.table_name AND c.table_schema = t.table_schema
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  GROUP BY c.table_name
),
pks AS (
  SELECT
    tc.table_name,
    string_agg(format('%I', kcu.column_name), ', ' ORDER BY kcu.ordinal_position) AS cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
  GROUP BY tc.table_name
),
all_ddl AS (
  -- Tables with inlined PKs
  SELECT 1 AS phase, c.table_name AS srt,
    format('CREATE TABLE IF NOT EXISTS public.%I (%s%s%s%s);',
      c.table_name, E'\n', c.def,
      CASE WHEN pk.cols IS NOT NULL THEN format(E',\n  PRIMARY KEY (%s)', pk.cols) ELSE '' END,
      E'\n'
    ) AS sql
  FROM columns_agg c LEFT JOIN pks pk ON pk.table_name = c.table_name

  UNION ALL

  -- Indexes (skip PK-backing ones — they're created with the PK)
  SELECT 2, tablename, indexdef || ';'
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname NOT IN (
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE constraint_type = 'PRIMARY KEY' AND table_schema = 'public'
    )

  UNION ALL

  -- Foreign keys (added last so referenced tables exist first)
  SELECT 3, tc.table_name,
    format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I(%s);',
      tc.table_name,
      tc.constraint_name,
      string_agg(format('%I', kcu.column_name), ', '),
      MAX(ccu.table_name),
      string_agg(format('%I', ccu.column_name), ', ')
    )
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  GROUP BY tc.table_name, tc.constraint_name

  UNION ALL

  -- GRANTs for service_role on every base table (Supabase Data API access).
  -- Required because Supabase is dropping the legacy auto-grant default on
  -- 2026-10-30 — without these, PostgREST returns 42501 on supabase-js calls.
  SELECT 4, t.table_name,
    format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role;', t.table_name)
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'

  UNION ALL

  -- GRANTs on sequences (bigserial/serial columns need USAGE+SELECT).
  SELECT 4, s.sequence_name,
    format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role;', s.sequence_name)
  FROM information_schema.sequences s
  WHERE s.sequence_schema = 'public'

  UNION ALL

  -- ALTER DEFAULT PRIVILEGES — auto-grant future tables created by postgres.
  -- Fixed strings, single row each; placed last so they appear at the end.
  SELECT 5, '_default_priv_tables',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;'

  UNION ALL

  SELECT 5, '_default_priv_sequences',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;'
)
SELECT string_agg(sql, E'\n\n' ORDER BY phase, srt) AS schema_sql
FROM all_ddl;
