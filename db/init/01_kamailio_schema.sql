-- ─────────────────────────────────────────────────────────────
--  Kamailio standard tables (subset needed for this platform)
--  Full schema: kamdbctl create
--  We define the tables we directly use.
-- ─────────────────────────────────────────────────────────────

USE kamailio;

-- SIP subscriber table (customer SIP credentials)
CREATE TABLE IF NOT EXISTS `subscriber` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`    VARCHAR(64)  NOT NULL DEFAULT '',
  `domain`      VARCHAR(64)  NOT NULL DEFAULT '',
  `password`    VARCHAR(64)  NOT NULL DEFAULT '',
  `email_address` VARCHAR(128) NOT NULL DEFAULT '',
  `ha1`         VARCHAR(64)  NOT NULL DEFAULT '',
  `ha1b`        VARCHAR(64)  NOT NULL DEFAULT '',
  -- Platform-specific columns
  `customer_id` INT UNSIGNED,
  `trunk_id`    INT UNSIGNED,
  `max_channels` INT UNSIGNED DEFAULT 2,
  `status`      ENUM('active','suspended') DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username_domain` (`username`, `domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- SIP location (registrations)
CREATE TABLE IF NOT EXISTS `location` (
  `id`        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ruid`      VARCHAR(64)  NOT NULL DEFAULT '',
  `username`  VARCHAR(64)  NOT NULL DEFAULT '',
  `domain`    VARCHAR(64)  DEFAULT NULL,
  `contact`   VARCHAR(512) NOT NULL DEFAULT '',
  `received`  VARCHAR(128) DEFAULT NULL,
  `path`      VARCHAR(512) DEFAULT NULL,
  `expires`   DATETIME     NOT NULL DEFAULT '2030-01-01 00:00:00',
  `q`         FLOAT(10,2)  NOT NULL DEFAULT 1.00,
  `callid`    VARCHAR(255) NOT NULL DEFAULT 'Default-Call-ID',
  `cseq`      INT          NOT NULL DEFAULT 1,
  `last_modified` DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00',
  `flags`     INT          NOT NULL DEFAULT 0,
  `cflags`    INT          NOT NULL DEFAULT 0,
  `user_agent` VARCHAR(255) NOT NULL DEFAULT '',
  `socket`    VARCHAR(64)  DEFAULT NULL,
  `methods`   INT          DEFAULT NULL,
  `instance`  VARCHAR(255) DEFAULT NULL,
  `reg_id`    INT          NOT NULL DEFAULT 0,
  `server_id` INT          NOT NULL DEFAULT 0,
  `connection_id` INT      NOT NULL DEFAULT 0,
  `keepalive` INT          NOT NULL DEFAULT 0,
  `partition` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ruid` (`ruid`),
  KEY `account_contact` (`username`, `domain`, `contact`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Address table (IP-based auth for customer IP trunks)
-- grp=1: customer IP trunks, grp=2: upstream providers (TATA etc.)
CREATE TABLE IF NOT EXISTS `address` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `grp`          SMALLINT     NOT NULL DEFAULT 1,
  `ip_addr`      VARCHAR(48)  NOT NULL,
  `mask`         TINYINT      NOT NULL DEFAULT 32,
  `port`         SMALLINT     NOT NULL DEFAULT 0,
  `tag`          VARCHAR(64)  DEFAULT NULL,
  -- Platform columns
  `customer_id`  INT UNSIGNED,
  `trunk_id`     INT UNSIGNED,
  `max_channels` INT UNSIGNED DEFAULT 2,
  PRIMARY KEY (`id`),
  KEY `ip_addr` (`ip_addr`, `grp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dispatcher table (Asterisk nodes for load balancing)
CREATE TABLE IF NOT EXISTS `dispatcher` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setid`    INT          NOT NULL DEFAULT 0,
  `destination` VARCHAR(192) NOT NULL DEFAULT '',
  `flags`    INT          NOT NULL DEFAULT 0,
  `priority` INT          NOT NULL DEFAULT 0,
  `attrs`    VARCHAR(128) NOT NULL DEFAULT '',
  `description` VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dialog table (active call tracking)
CREATE TABLE IF NOT EXISTS `dialog` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hash_id`       INT UNSIGNED NOT NULL,
  `hash_entry`    INT UNSIGNED NOT NULL,
  `callid`        VARCHAR(255) NOT NULL,
  `from_uri`      VARCHAR(128) NOT NULL,
  `from_tag`      VARCHAR(64)  NOT NULL,
  `to_uri`        VARCHAR(128) NOT NULL,
  `to_tag`        VARCHAR(64)  NOT NULL DEFAULT '',
  `caller_cseq`   VARCHAR(20)  NOT NULL,
  `callee_cseq`   VARCHAR(20)  NOT NULL,
  `caller_route_set` TEXT,
  `callee_route_set` TEXT,
  `caller_contact` VARCHAR(128) NOT NULL,
  `callee_contact` VARCHAR(128) NOT NULL DEFAULT '',
  `caller_sock`   VARCHAR(64)  NOT NULL,
  `callee_sock`   VARCHAR(64)  NOT NULL DEFAULT '',
  `state`         INT          NOT NULL,
  `start_time`    INT          NOT NULL,
  `timeout`       INT          NOT NULL DEFAULT 0,
  `sflags`        INT          NOT NULL DEFAULT 0,
  `iflags`        INT          NOT NULL DEFAULT 0,
  `toroute_name`  VARCHAR(32)  DEFAULT NULL,
  `req_uri`       VARCHAR(128) NOT NULL,
  `xdata`         TEXT,
  PRIMARY KEY (`id`),
  KEY `hash` (`hash_id`, `hash_entry`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dialog vars (stores customer_id per dialog)
CREATE TABLE IF NOT EXISTS `dialog_vars` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hash_id`    INT UNSIGNED NOT NULL,
  `hash_entry` INT UNSIGNED NOT NULL,
  `dialog_key` VARCHAR(128) NOT NULL,
  `dialog_val` VARCHAR(512) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `hash` (`hash_id`, `hash_entry`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Acc table (CDR from Kamailio)
CREATE TABLE IF NOT EXISTS `acc` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `method`     VARCHAR(16)  NOT NULL DEFAULT '',
  `from_tag`   VARCHAR(64)  NOT NULL DEFAULT '',
  `to_tag`     VARCHAR(64)  NOT NULL DEFAULT '',
  `callid`     VARCHAR(255) NOT NULL DEFAULT '',
  `sip_code`   VARCHAR(3)   NOT NULL DEFAULT '',
  `sip_reason` VARCHAR(128) NOT NULL DEFAULT '',
  `time`       DATETIME     NOT NULL,
  `src_user`   VARCHAR(64)  NOT NULL DEFAULT '',
  `src_domain` VARCHAR(128) NOT NULL DEFAULT '',
  `dst_user`   VARCHAR(64)  NOT NULL DEFAULT '',
  `dst_domain` VARCHAR(128) NOT NULL DEFAULT '',
  `src_ip`     VARCHAR(64)  NOT NULL DEFAULT '',
  `customer_id` INT UNSIGNED,
  `trunk_id`   INT UNSIGNED,
  PRIMARY KEY (`id`),
  KEY `callid` (`callid`),
  KEY `customer_id` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Missed calls
CREATE TABLE IF NOT EXISTS `missed_calls` LIKE `acc`;

-- UAC registrations (Kamailio registers to upstream reg-based providers)
CREATE TABLE IF NOT EXISTS `uacreg` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `l_uuid`         VARCHAR(64)  NOT NULL DEFAULT '',
  `l_username`     VARCHAR(64)  NOT NULL DEFAULT '',
  `l_domain`       VARCHAR(128) NOT NULL DEFAULT '',
  `r_username`     VARCHAR(64)  NOT NULL DEFAULT '',
  `r_domain`       VARCHAR(128) NOT NULL DEFAULT '',
  `realm`          VARCHAR(64)  NOT NULL DEFAULT '',
  `auth_username`  VARCHAR(64)  NOT NULL DEFAULT '',
  `auth_password`  VARCHAR(64)  NOT NULL DEFAULT '',
  `auth_ha1`       VARCHAR(64)  NOT NULL DEFAULT '',
  `auth_proxy`     VARCHAR(128) NOT NULL DEFAULT '',
  `expires`        INT          NOT NULL DEFAULT 120,
  `flags`          INT          NOT NULL DEFAULT 0,
  `reg_delay`      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `l_uuid` (`l_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dynamic routing table (upstream carrier routing)
CREATE TABLE IF NOT EXISTS `dr_gateways` (
  `gwid`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`       INT          NOT NULL DEFAULT 0,
  `address`    VARCHAR(128) NOT NULL DEFAULT '',
  `strip`      INT          NOT NULL DEFAULT 0,
  `pri_prefix` VARCHAR(16)  NOT NULL DEFAULT '',
  `attrs`      VARCHAR(255) NOT NULL DEFAULT '',
  `probe_mode` INT          NOT NULL DEFAULT 0,
  `state`      INT          NOT NULL DEFAULT 0,
  `socket`     VARCHAR(128) NOT NULL DEFAULT '',
  `description` VARCHAR(128) NOT NULL DEFAULT '',
  PRIMARY KEY (`gwid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dr_rules` (
  `ruleid`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `groupid`    VARCHAR(255) NOT NULL DEFAULT '',
  `prefix`     VARCHAR(64)  NOT NULL DEFAULT '',
  `timerec`    VARCHAR(255) NOT NULL DEFAULT '',
  `priority`   INT          NOT NULL DEFAULT 0,
  `routeid`    INT          NOT NULL DEFAULT 0,
  `gwlist`     VARCHAR(255) NOT NULL DEFAULT '',
  `attrs`      VARCHAR(255) NOT NULL DEFAULT '',
  `description` VARCHAR(128) NOT NULL DEFAULT '',
  PRIMARY KEY (`ruleid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
