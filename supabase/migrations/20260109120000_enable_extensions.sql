-- migration: enable required postgresql extensions
-- description: enables pgcrypto extension for uuid generation and hashing functions
-- tables affected: none (prerequisite for all tables)
-- date: 2026-01-09

-- enable pgcrypto extension for gen_random_uuid() and digest() functions
-- this extension is required for:
-- - generating uuids for primary keys
-- - computing sha256 hashes for content deduplication
create extension if not exists "pgcrypto";

