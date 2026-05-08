# SIPaaS — SIP as a Service Platform

> Vobiz-style SIP Trunk + DID management platform built on **Kamailio + Asterisk + RTPEngine**.
> Customers buy SIP trunks, buy DID numbers, configure their PBX, and make calls.
> You route via your existing TATA (IP-based) and other (registration-based) upstream trunks.

---

## Architecture

```
Customer PBX / Softphone
        │  SIP (UDP 5060)
        ▼
  ┌─────────────┐   auth (digest or IP)
  │  Kamailio   │   channel limit check
  │  (SIP edge) │   balance check (Redis)
  └──────┬──────┘
         │
         ▼ (SIP → 5080)
  ┌─────────────┐    CDR → MySQL
  │  Asterisk   │    Dialplan routing
  │  (B2BUA)    │    ARI (REST control)
  └──────┬──────┘
         │           ┌──────────────┐
         ├──────────►│  TATA        │ IP-based trunk
         │           │  (no reg)    │
         │           └──────────────┘
         │           ┌──────────────┐
         └──────────►│  Provider2   │ Registration-based
                     │  (Kamailio   │ (uacreg table)
                     │   UAC regs)  │
                     └──────────────┘

  RTPEngine: media proxy between all parties (NAT, SRTP↔RTP)
  MySQL: all subscriber/CDR/platform data
  Redis: real-time balance + channel counters (Kamailio reads these)
  API (Node.js :3000): REST API for portal + webhooks
  Portal (Next.js :8080): Customer dashboard
  Billing Engine: CDR rating + DID renewals (60s loop)
```

---

## Quick Start

### 1. Clone and configure

```bash
git clone <this-repo> && cd sipaas
cp .env.example .env
# Edit .env — fill in all values
nano .env
```

### 2. Build and start

```bash
# First-time: bring up DB first, let it init
docker compose up -d mysql redis
sleep 30

# Bring up everything
docker compose up -d --build
docker compose ps
```

### 3. Add your provider trunks to seed SQL

Edit `db/init/03_seed.sql` — replace all `_PLACEHOLDER` values with real IPs/creds,
then rebuild:

```bash
docker compose down mysql
docker volume rm sipaas_mysql-data
docker compose up -d mysql
sleep 30
docker compose up -d
```

### 4. Access

| Service | URL |
|---------|-----|
| Customer Portal | `http://YOUR_IP:8080` |
| REST API | `http://YOUR_IP:3000` |
| Grafana | `http://YOUR_IP:3001` (admin / see .env) |
| Asterisk ARI | `http://127.0.0.1:8088/ari` |

---

## Firewall Rules (Required)

```bash
# SIP signaling
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 5061/tcp   # TLS

# RTP media (must match RTP_MIN_PORT / RTP_MAX_PORT in .env)
ufw allow 10000:20000/udp

# Platform ports
ufw allow 8080/tcp   # Portal
ufw allow 3000/tcp   # API (can be behind nginx instead)

# Only from your monitoring host:
# ufw allow 9090/tcp  # Prometheus
# ufw allow 3001/tcp  # Grafana
```

---

## Customer Flow (Vobiz-style)

```
1. Customer signs up on portal → account created
2. Customer tops up balance (₹)
3. Customer creates a SIP Trunk
   → Gets: username, password, sip_domain, port
   → Platform creates row in Kamailio subscriber table
4. Customer buys a DID number
   → Balance deducted (₹500/mo)
   → DID linked to trunk
5. Customer configures their PBX/softphone:
   SIP Server:  sip.yourdomain.com
   Port:        5060
   Username:    c1_1720000000
   Password:    <generated>
6. Customer dials from their PBX:
   PBX → Kamailio (auth + channel limit + balance) → Asterisk → TATA/Provider2 → PSTN
7. Inbound call to DID:
   TATA → Kamailio (DID lookup) → Asterisk → Customer PBX
```

---

## Upstream Trunk Types

### TATA (IP-based)
- No SIP registration needed
- TATA whitelists your `PUBLIC_IP`
- Kamailio sends calls directly to `TATA_IP:TATA_PORT`
- Asterisk `pjsip.conf` has `tata-trunk` endpoint with no auth

### Provider2 (Registration-based)
- Kamailio **UAC module** handles the SIP REGISTER to Provider2
- Configured in `uacreg` table (seeded in `03_seed.sql`)
- Asterisk also has `prov2-trunk-registration` for redundancy
- Both Kamailio and Asterisk can register — disable one to avoid conflicts

---

## Adding New Customers via CLI

```bash
# Add customer directly via MySQL (or use the portal)
docker exec sipaas-db mysql -u sipaas -pYOURPASS kamailio -e "
  INSERT INTO customers (email, password_hash, name, api_key, api_secret, status, balance)
  VALUES ('user@example.com', '\$2a\$12\$hash', 'John Doe', 'apikey123', 'secret456', 'active', 100.00);"
```

---

## sngrep — Live SIP Traffic Inspection

```bash
# On the host (or inside kamailio container):
docker exec -it kamailio sngrep -d any -L port 5060

# Filter by IP
docker exec -it kamailio sngrep host 203.x.x.x

# Capture to file
docker exec -it kamailio sngrep -I capture.pcap
```

**sngrep keys:**
- `F5` — show/hide RTP
- `F7` — filter by method (INVITE, REGISTER...)
- `Enter` — expand SIP flow
- `q` — quit

---

## kamctl — Kamailio Admin CLI

```bash
# List active registrations
docker exec kamailio kamctl ul show

# Show active calls
docker exec kamailio kamcmd dlg.list

# Add SIP subscriber (alternative to API)
docker exec kamailio kamctl add user@sip.yourdomain.com Password123!

# Reload dispatcher table
docker exec kamailio kamcmd dispatcher.reload

# Reload UAC registrations
docker exec kamailio kamcmd uac.reg_reload

# Check upstream registration status
docker exec kamailio kamcmd uac.reg_info
```

---

## Asterisk Admin CLI

```bash
docker exec -it asterisk asterisk -r

# Inside Asterisk CLI:
pjsip show endpoints
pjsip show registrations
pjsip show contacts
core show channels
dialplan show from-kamailio
cdr show status
```

---

## Database Useful Queries

```sql
-- Active SIP registrations
SELECT username, domain, contact, expires FROM location WHERE expires > NOW();

-- Customer channel usage
SELECT c.name, COUNT(d.id) AS active_calls
FROM dialog d JOIN customers c ON c.id = d.hash_id
GROUP BY c.id;

-- Unbilled CDRs
SELECT COUNT(*), SUM(billsec) FROM cdr WHERE billed = 0;

-- Customer balance
SELECT name, balance FROM customers ORDER BY balance ASC;

-- DID inventory
SELECT number, status, region FROM did_inventory ORDER BY status, region;
```

---

## API Quick Reference

```bash
BASE=http://YOUR_IP:3000/v1

# Register
curl -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"x@x.com","password":"pass123","name":"Test"}'

# Login → get token
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"x@x.com","password":"pass123"}' | jq -r .token)

# Create trunk
curl -X POST $BASE/trunks -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"My PBX","max_channels":5}'

# Buy DID
curl -X POST $BASE/dids -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"number":"+919001234567","trunk_id":1}'

# Top up balance
curl -X POST $BASE/billing/topup -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"amount":500}'

# View CDRs
curl $BASE/calls/cdr -H "Authorization: Bearer $TOKEN"
```

---

## Replacing Placeholder Values

Before first run, replace all placeholders in config files:

| Placeholder | Replace with |
|---|---|
| `KAMAILIO_DOMAIN_PLACEHOLDER` | Your SIP domain (e.g. `sip.yourdomain.com`) |
| `DB_USER_PLACEHOLDER` | DB username from `.env` |
| `DB_PASS_PLACEHOLDER` | DB password from `.env` |
| `DB_HOST_PLACEHOLDER` | `127.0.0.1` or `mysql` |
| `REDIS_PASS_PLACEHOLDER` | Redis password from `.env` |
| `TATA_IP_PLACEHOLDER` | TATA SIP gateway IP |
| `TATA_PORT_PLACEHOLDER` | TATA port (default `5060`) |
| `TATA_CALLERID_PLACEHOLDER` | Your CLI for TATA calls |
| `PROV2_HOST_PLACEHOLDER` | Provider2 SIP host |
| `PROV2_PORT_PLACEHOLDER` | Provider2 port |
| `PROV2_USER_PLACEHOLDER` | Provider2 username |
| `PROV2_PASS_PLACEHOLDER` | Provider2 password |
| `PROV2_FROM_USER_PLACEHOLDER` | Provider2 caller ID |
| `ASTERISK_IP_PLACEHOLDER` | `127.0.0.1` |
| `PUBLIC_IP_PLACEHOLDER` | Your server public IP |
| `AMI_USER_PLACEHOLDER` / `AMI_PASS_PLACEHOLDER` | From `.env` |
| `ARI_USER_PLACEHOLDER` / `ARI_PASS_PLACEHOLDER` | From `.env` |

A helper script:

```bash
./scripts/configure.sh  # (see scripts/ directory)
```

---

## Scale-out Notes

- **Multiple Asterisk nodes**: Add rows to `dispatcher` table (setid=1) — Kamailio load-balances across them
- **Multiple Kamailio nodes**: Use shared MySQL + Redis; each Kamailio reads same DB
- **RTPEngine cluster**: Multiple RTPEngine instances → update `rtpengine_sock` in kamailio.cfg
- **Redis Sentinel/Cluster**: Update `ndb_redis` modparam in kamailio.cfg

---

## Project Structure

```
sipaas/
├── docker-compose.yml        # Full stack
├── .env.example              # Environment template
├── kamailio/
│   ├── Dockerfile
│   └── cfg/
│       ├── kamailio.cfg      # Main SIP proxy (multi-tenant, IP+digest auth)
│       └── tls.cfg           # TLS config
├── asterisk/
│   ├── Dockerfile
│   └── conf/
│       ├── asterisk.conf     # Main config
│       ├── pjsip.conf        # TATA + Provider2 trunks
│       ├── extensions.conf   # Dialplan: outbound routing + inbound DID
│       ├── cdr_mysql.conf    # CDR → MySQL
│       ├── rtp.conf          # RTP port range
│       ├── manager.conf      # AMI
│       ├── http.conf         # HTTP server for ARI
│       └── ari.conf          # ARI credentials
├── rtpengine/
│   ├── Dockerfile
│   └── rtpengine.conf
├── db/
│   └── init/
│       ├── 01_kamailio_schema.sql  # All Kamailio tables
│       ├── 02_platform_schema.sql  # Customers, trunks, DIDs, billing, CDR
│       └── 03_seed.sql             # Dispatcher, providers, rate cards, DIDs
├── api/                            # REST API (Node.js / Express)
│   └── src/
│       ├── routes/  (auth, accounts, trunks, dids, calls, billing, webhooks)
│       ├── services/ (kamailio.js, asterisk.js)
│       └── config/  (db, redis, logger)
├── billing/                        # Billing engine (CDR rating + DID renewal)
├── portal/                         # Customer portal (Next.js)
│   └── src/app/
│       ├── login/        # Sign in / Sign up
│       └── dashboard/
│           ├── page.js   # Overview stats
│           ├── trunks/   # Create/delete SIP trunks
│           ├── dids/     # Buy/manage DID numbers
│           ├── calls/    # CDR table
│           └── billing/  # Balance, top-up, transactions
└── monitoring/
    ├── prometheus.yml
    └── grafana/
```
