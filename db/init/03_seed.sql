-- ─────────────────────────────────────────────────────────────
--  Seed Data — Dispatcher, Providers, Rate Cards, DIDs sample
-- ─────────────────────────────────────────────────────────────

USE kamailio;

-- ── Dispatcher: Asterisk node (group 1) ──────────────────────
INSERT IGNORE INTO `dispatcher` (`setid`, `destination`, `flags`, `priority`, `description`)
VALUES (1, 'sip:127.0.0.1:5080', 0, 1, 'Asterisk-primary');

-- ── Upstream providers (grp=2 in address for IP-based) ───────
-- TATA Tele: IP-based (add TATA's IP here for permissions)
INSERT IGNORE INTO `address` (`grp`, `ip_addr`, `mask`, `port`, `tag`)
VALUES (2, '203.x.x.x', 32, 5060, 'tata-upstream');

-- ── Providers table ──────────────────────────────────────────
INSERT IGNORE INTO `providers` (`name`, `type`, `host`, `port`, `caller_id`, `priority`)
VALUES ('tata', 'ip', '203.x.x.x', 5060, '+911234567890', 1);

INSERT IGNORE INTO `providers` (`name`, `type`, `host`, `port`, `username`, `password`, `caller_id`, `priority`)
VALUES ('provider2', 'registration', 'sip.provider2.com', 5060, 'your_username', 'your_password', 'your_ddi_number', 2);

-- ── Dynamic routing: India (+91) → TATA (gwid=1) ─────────────
INSERT IGNORE INTO `dr_gateways` (`type`, `address`, `attrs`, `description`)
VALUES (0, 'sip:203.x.x.x:5060', 'tata', 'TATA-primary');

INSERT IGNORE INTO `dr_rules` (`groupid`, `prefix`, `priority`, `gwlist`, `description`)
VALUES ('1', '+91', 10, '1', 'India via TATA');

INSERT IGNORE INTO `dr_rules` (`groupid`, `prefix`, `priority`, `gwlist`, `description`)
VALUES ('1', '+', 5, '1', 'International fallback');

-- ── Default Rate Cards ────────────────────────────────────────
INSERT IGNORE INTO `rate_cards` (`customer_id`, `prefix`, `description`, `rate_per_min`, `billing_increment`)
VALUES
  (NULL, '+91', 'India Mobile',      0.45, 60),
  (NULL, '+911',  'India Landline',    0.45, 60),
  (NULL, '+1',  'USA/Canada',         1.50, 60),
  (NULL, '+44', 'UK',                 1.80, 60),
  (NULL, '+',   'International',      3.00, 60);

-- ── Sample DID Inventory ──────────────────────────────────────
-- Add your actual DIDs here
INSERT IGNORE INTO `did_inventory` (`number`, `country`, `region`, `type`, `monthly_rate`, `provider`, `status`)
VALUES
  ('+919001234567', 'IN', 'Delhi',     'mobile', 500.00, 'tata', 'available'),
  ('+919001234568', 'IN', 'Mumbai',    'mobile', 500.00, 'tata', 'available'),
  ('+919001234569', 'IN', 'Bangalore', 'mobile', 500.00, 'tata', 'available'),
  ('+918001234570', 'IN', 'National',  '1800',   1000.00, 'tata', 'available');

-- ── UAC Registration for Provider2 ───────────────────────────
-- Kamailio registers to Provider2 on behalf of the platform
INSERT IGNORE INTO `uacreg` (
  `l_uuid`, `l_username`, `l_domain`,
  `r_username`, `r_domain`, `realm`,
  `auth_username`, `auth_password`, `auth_proxy`, `expires`
) VALUES (
  'provider2-reg-1',
  'your_username', 'sip.provider2.com',
  'your_username', 'sip.provider2.com', 'sip.provider2.com',
  'your_username', 'your_password',
  'sip:sip.provider2.com:5060', 120
);
