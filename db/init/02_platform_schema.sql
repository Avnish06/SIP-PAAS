-- ─────────────────────────────────────────────────────────────
--  SIP-as-a-Service Platform Tables
--  Customers, Trunks, DIDs, Billing, CDR
-- ─────────────────────────────────────────────────────────────

USE kamailio;

-- ── Customers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `customers` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`        VARCHAR(128) NOT NULL,
  `password_hash` VARCHAR(128) NOT NULL,
  `name`         VARCHAR(128) NOT NULL,
  `company`      VARCHAR(128) DEFAULT NULL,
  `phone`        VARCHAR(20)  DEFAULT NULL,
  `status`       ENUM('active','suspended','pending') NOT NULL DEFAULT 'pending',
  `balance`      DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `currency`     VARCHAR(3)   NOT NULL DEFAULT 'INR',
  `api_key`      VARCHAR(64)  NOT NULL,
  `api_secret`   VARCHAR(128) NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `api_key` (`api_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SIP Trunks (what customers buy) ──────────────────────────
-- A trunk = a set of SIP credentials + channel limit
CREATE TABLE IF NOT EXISTS `trunks` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`   INT UNSIGNED NOT NULL,
  `name`          VARCHAR(64)  NOT NULL,
  `sip_username`  VARCHAR(64)  NOT NULL,
  `sip_password`  VARCHAR(64)  NOT NULL,
  `sip_domain`    VARCHAR(128) NOT NULL,
  `auth_type`     ENUM('digest','ip') NOT NULL DEFAULT 'digest',
  `ip_whitelist`  VARCHAR(512) DEFAULT NULL,  -- comma-separated IPs for IP auth
  `max_channels`  INT UNSIGNED NOT NULL DEFAULT 2,
  `status`        ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  `monthly_rate`  DECIMAL(8,2) NOT NULL DEFAULT 0.00,   -- per channel/month if applicable
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sip_username_domain` (`sip_username`, `sip_domain`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `fk_trunk_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DID Inventory ─────────────────────────────────────────────
-- Phone numbers the platform owns, available to assign to customers
CREATE TABLE IF NOT EXISTS `did_inventory` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `number`       VARCHAR(20)  NOT NULL,          -- E.164 e.g. +919876543210
  `country`      VARCHAR(2)   NOT NULL DEFAULT 'IN',
  `region`       VARCHAR(64)  DEFAULT NULL,
  `type`         ENUM('local','mobile','tollfree','1400','1600') NOT NULL DEFAULT 'local',
  `monthly_rate` DECIMAL(8,2) NOT NULL DEFAULT 500.00,
  `provider`     VARCHAR(32)  NOT NULL DEFAULT 'tata',  -- which upstream this came from
  `status`       ENUM('available','assigned','reserved') NOT NULL DEFAULT 'available',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DID Assignments ───────────────────────────────────────────
-- Links a DID to a customer+trunk
CREATE TABLE IF NOT EXISTS `did_numbers` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `number`       VARCHAR(20)  NOT NULL,
  `customer_id`  INT UNSIGNED NOT NULL,
  `trunk_id`     INT UNSIGNED NOT NULL,
  `status`       ENUM('active','suspended','cancelled') NOT NULL DEFAULT 'active',
  `monthly_rate` DECIMAL(8,2) NOT NULL DEFAULT 500.00,
  `assigned_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `renewal_date` DATE         NOT NULL,
  `forward_to`   VARCHAR(256) DEFAULT NULL,   -- optional: SIP URI or E.164 to forward to
  `webhook_url`  VARCHAR(512) DEFAULT NULL,   -- inbound call webhook
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number` (`number`),
  KEY `customer_id` (`customer_id`),
  KEY `trunk_id` (`trunk_id`),
  CONSTRAINT `fk_did_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_did_trunk` FOREIGN KEY (`trunk_id`) REFERENCES `trunks` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── CDR (Call Detail Records) — from Asterisk ────────────────
CREATE TABLE IF NOT EXISTS `cdr` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `callid`        VARCHAR(255) NOT NULL DEFAULT '',
  `customer_id`   INT UNSIGNED,
  `trunk_id`      INT UNSIGNED,
  `src`           VARCHAR(80)  NOT NULL DEFAULT '',
  `dst`           VARCHAR(80)  NOT NULL DEFAULT '',
  `dcontext`      VARCHAR(80)  NOT NULL DEFAULT '',
  `clid`          VARCHAR(80)  NOT NULL DEFAULT '',
  `channel`       VARCHAR(80)  NOT NULL DEFAULT '',
  `dstchannel`    VARCHAR(80)  NOT NULL DEFAULT '',
  `lastapp`       VARCHAR(80)  NOT NULL DEFAULT '',
  `lastdata`      VARCHAR(80)  NOT NULL DEFAULT '',
  `start_time`    DATETIME,
  `answer_time`   DATETIME,
  `end_time`      DATETIME,
  `duration`      INT          NOT NULL DEFAULT 0,   -- total seconds
  `billsec`       INT          NOT NULL DEFAULT 0,   -- billed seconds
  `disposition`   VARCHAR(45)  NOT NULL DEFAULT '',  -- ANSWERED, BUSY, NO ANSWER
  `amaflags`      INT          NOT NULL DEFAULT 0,
  `accountcode`   VARCHAR(20)  NOT NULL DEFAULT '',
  `uniqueid`      VARCHAR(32)  NOT NULL DEFAULT '',
  `userfield`     VARCHAR(255) NOT NULL DEFAULT '',
  `cost`          DECIMAL(10,4) NOT NULL DEFAULT 0.0000,  -- INR cost of this call
  `rate`          DECIMAL(8,4) NOT NULL DEFAULT 0.0000,   -- rate per minute applied
  `direction`     ENUM('inbound','outbound') NOT NULL DEFAULT 'outbound',
  `provider`      VARCHAR(32)  DEFAULT NULL,               -- which upstream was used
  `billed`        TINYINT(1)   NOT NULL DEFAULT 0,         -- 1 = billing processed
  PRIMARY KEY (`id`),
  KEY `callid` (`callid`),
  KEY `customer_id` (`customer_id`),
  KEY `start_time` (`start_time`),
  KEY `billed` (`billed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Billing Transactions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `billing_transactions` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`  INT UNSIGNED NOT NULL,
  `type`         ENUM('topup','call_charge','did_charge','refund','adjustment') NOT NULL,
  `amount`       DECIMAL(10,4) NOT NULL,          -- positive = credit, negative = debit
  `balance_before` DECIMAL(10,4) NOT NULL,
  `balance_after`  DECIMAL(10,4) NOT NULL,
  `reference_id` VARCHAR(128) DEFAULT NULL,        -- cdr.id, did_numbers.id, etc.
  `description`  VARCHAR(255) DEFAULT NULL,
  `status`       ENUM('pending','completed','failed') NOT NULL DEFAULT 'completed',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `fk_billing_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Rate Cards ────────────────────────────────────────────────
-- Per-customer or global rate overrides
CREATE TABLE IF NOT EXISTS `rate_cards` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`  INT UNSIGNED DEFAULT NULL,   -- NULL = global/default
  `prefix`       VARCHAR(20)  NOT NULL,        -- e.g. '+91', '+1', '+44'
  `description`  VARCHAR(64)  NOT NULL DEFAULT '',
  `rate_per_min` DECIMAL(8,4) NOT NULL,        -- INR per minute
  `billing_increment` INT     NOT NULL DEFAULT 60,  -- seconds
  `min_duration` INT          NOT NULL DEFAULT 0,
  `active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `customer_prefix` (`customer_id`, `prefix`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Upstream Providers ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `providers` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(64)  NOT NULL,
  `type`         ENUM('ip','registration') NOT NULL DEFAULT 'ip',
  `host`         VARCHAR(128) NOT NULL,
  `port`         INT          NOT NULL DEFAULT 5060,
  `username`     VARCHAR(64)  DEFAULT NULL,
  `password`     VARCHAR(64)  DEFAULT NULL,
  `caller_id`    VARCHAR(20)  DEFAULT NULL,
  `status`       ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `priority`     INT          NOT NULL DEFAULT 1,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
