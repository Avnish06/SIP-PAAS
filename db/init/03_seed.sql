-- ─────────────────────────────────────────────────────────────
--  Seed Data — Dispatcher, Providers, Rate Cards, DIDs sample
-- ─────────────────────────────────────────────────────────────

USE kamailio;

-- ── Dispatcher: Asterisk node (group 1) ──────────────────────
INSERT IGNORE INTO `dispatcher` (`setid`, `destination`, `flags`, `priority`, `description`)
VALUES (1, 'sip:127.0.0.1:5080', 0, 1, 'Asterisk-primary');

-- ── Upstream provider IP whitelisted in Kamailio (grp=2) ─────
-- Kamailio allows inbound SIP from Synchrovox without customer auth
INSERT IGNORE INTO `address` (`grp`, `ip_addr`, `mask`, `port`, `tag`)
VALUES (2, '20.193.182.13', 32, 5060, 'synchrovox-upstream');

-- ── Providers table ──────────────────────────────────────────
INSERT IGNORE INTO `providers` (`name`, `type`, `host`, `port`, `username`, `password`, `caller_id`, `priority`)
VALUES (
  'synchrovox',
  'registration',
  '20.193.182.13',
  5060,
  'synchrovoxai_new.com',
  '1kdu9sr0a3w',
  '00919240292847',
  1
);

-- ── Dynamic routing: all calls → Synchrovox (gwid=1) ─────────
INSERT IGNORE INTO `dr_gateways` (`type`, `address`, `attrs`, `description`)
VALUES (0, 'sip:20.193.182.13:5060', 'synchrovox', 'Synchrovox-primary');

INSERT IGNORE INTO `dr_rules` (`groupid`, `prefix`, `priority`, `gwlist`, `description`)
VALUES ('1', '+91', 10, '1', 'India via Synchrovox');

INSERT IGNORE INTO `dr_rules` (`groupid`, `prefix`, `priority`, `gwlist`, `description`)
VALUES ('1', '+', 5, '1', 'International via Synchrovox');

-- ── Default Rate Cards ────────────────────────────────────────
INSERT IGNORE INTO `rate_cards` (`customer_id`, `prefix`, `description`, `rate_per_min`, `billing_increment`)
VALUES
  (NULL, '+91',  'India Mobile',   0.45, 60),
  (NULL, '+911', 'India Landline', 0.45, 60),
  (NULL, '+1',   'USA/Canada',     1.50, 60),
  (NULL, '+44',  'UK',             1.80, 60),
  (NULL, '+',    'International',  3.00, 60);

-- ── Sample DID Inventory ──────────────────────────────────────
INSERT IGNORE INTO `did_inventory` (`number`, `country`, `region`, `type`, `monthly_rate`, `provider`, `status`)
VALUES
  ('+919240292847', 'IN', 'Gujarat', 'mobile', 500.00, 'synchrovox', 'available');

-- ── UAC Registration ─────────────────────────────────────────
-- Synchrovox registration is handled by Asterisk pjsip.conf
-- ([synchrovox-registration]) — Kamailio uacreg is intentionally empty
-- so the two don't race to register the same account.
