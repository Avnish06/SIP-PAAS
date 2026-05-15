-- ─────────────────────────────────────────────────────────────
--  Kamailio module version-table bootstrap
--
--  Every Kamailio module that uses a DB table calls
--  db_check_table_version() at startup. That function reads the
--  `version` table. If it's missing — as it was — the module
--  refuses to load and Kamailio exits 255.
--
--  The values below are the canonical versions for Kamailio 5.7
--  (matches /usr/share/kamailio/mysql/*-create.sql in the image).
-- ─────────────────────────────────────────────────────────────

USE kamailio;

CREATE TABLE IF NOT EXISTS `version` (
    `id` INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY NOT NULL,
    `table_name` VARCHAR(32) NOT NULL,
    `table_version` INT UNSIGNED DEFAULT 0 NOT NULL,
    CONSTRAINT table_name_idx UNIQUE (`table_name`)
);

INSERT IGNORE INTO version (table_name, table_version) VALUES
  ('version',      1),
  ('acc',          5),
  ('missed_calls', 4),
  ('address',      6),
  ('dialog',       7),
  ('dialog_vars',  1),
  ('dispatcher',   4),
  ('dr_gateways',  3),
  ('dr_rules',     3),
  ('location',     9),
  ('subscriber',   7),
  ('uacreg',       5);
