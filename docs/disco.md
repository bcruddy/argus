# Engineering Discovery: Polymarket Whale Trade Detection System

Building a whale trade detection system for Polymarket is highly feasible using their well-documented public APIs. The system can detect **$250k+ trades at any time** and **$15k+ trades near expiration** by combining the Data API's trade filtering capabilities with Gamma API's event metadata—all without requiring authentication for read-only monitoring.

The recommended architecture uses **WebSocket streaming for real-time detection** (~100ms latency) backed by **REST polling for verification and historical analysis**. Event categories are exposed via a `tags` array, and expiration times via the `endDate` field—both critical for time-sensitive geopolitics filtering. Existing open-source projects like `py-clob-client` (341 GitHub stars) and whale trackers like PolyTrack demonstrate proven patterns.

---

## API architecture enables straightforward whale detection

Polymarket exposes three primary APIs, each serving distinct purposes for whale monitoring:

| API           | Base URL                           | Purpose                                   | Auth Required  |
| ------------- | ---------------------------------- | ----------------------------------------- | -------------- |
| **Data API**  | `https://data-api.polymarket.com`  | Trade history, positions, whale filtering | No             |
| **CLOB API**  | `https://clob.polymarket.com`      | Order books, prices, real-time trades     | No (read-only) |
| **Gamma API** | `https://gamma-api.polymarket.com` | Market metadata, categories, expiration   | No             |

The **Data API `/trades` endpoint** is the cornerstone for whale detection, offering built-in filtering:

```bash
# Fetch trades above $250k USD
curl "https://data-api.polymarket.com/trades?filterType=CASH&filterAmount=250000&limit=500"

# Response includes wallet, size, price, timestamp, and market details
```

Each trade response contains the fields needed for threshold checking:

- `size`: Number of outcome tokens traded
- `price`: Price per token (0.00-1.00)
- `timestamp`: Unix timestamp for time-based filtering
- `conditionId`: Links to market metadata for category lookup
- `proxyWallet`: Trader's wallet address for repeat-actor tracking

**USD value calculation**: `usdcSize = size × price`

---

## Event categories and expiration times are API-accessible

For the time-sensitive rules ($15k+ trades within 1 hour of expiration, geopolitics events within 1 week), the Gamma API exposes both category tags and expiration dates.

### Category identification via tags

Events include a `tags` array with category metadata:

```json
{
	"tags": [
		{ "id": "2", "label": "Politics", "slug": "politics" },
		{ "id": "21", "label": "Crypto", "slug": "crypto" }
	]
}
```

Query all available tags: `GET https://gamma-api.polymarket.com/tags?limit=100`

Filter events by category: `GET https://gamma-api.polymarket.com/events?tag_id=2&active=true`

**Implementation strategy**: Build a category lookup map on startup, then cross-reference each trade's `conditionId` with cached market metadata to determine if it's a "geopolitics" event.

### Expiration time exposure

The Gamma API provides expiration via the `endDate` field:

```json
{
	"condition_id": "0xbd31dc8a...",
	"question": "Will X happen?",
	"end_date_iso": "2026-01-15T00:00:00Z",
	"active": true,
	"closed": false
}
```

Additional time-related fields:

- `closedTime`: Actual resolution timestamp (post-resolution)
- `acceptingOrders`: Boolean indicating if trading is still open

---

## Real-time detection requires WebSocket with REST fallback

### WebSocket streaming (~100ms latency)

Connect to `wss://ws-subscriptions-clob.polymarket.com/ws/market` and subscribe to trade events:

```json
{
	"assets_ids": ["token_id_1", "token_id_2"],
	"type": "market"
}
```

The `last_trade_price` event type delivers real-time trades:

```json
{
	"event_type": "last_trade_price",
	"asset_id": "287746654639...",
	"market": "0xbd31dc8a...",
	"price": "0.52",
	"size": "50000",
	"side": "BUY",
	"timestamp": "1704931200"
}
```

**Critical known issue**: WebSocket connections can freeze after ~20 minutes while appearing healthy (ping/pong continues). Implement a data timeout monitor:

```javascript
const DATA_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let lastDataTime = Date.now();

setInterval(() => {
	if (Date.now() - lastDataTime > DATA_TIMEOUT_MS) {
		client.disconnect();
		client.connect(); // Reconnect
	}
}, 30000);
```

### REST polling for verification

Use Data API polling as a verification layer and for historical backfill:

```python
from py_clob_client.client import ClobClient

client = ClobClient("https://clob.polymarket.com")

# Fetch recent large trades
trades = client.get_trades(limit=100)
for trade in trades:
    usd_value = float(trade['size']) * float(trade['price'])
    if usd_value >= 250000:
        trigger_alert(trade)
```

---

## Rate limits permit monitoring at scale

Rate limits are generous for read-only monitoring:

| Endpoint            | Limit          | Effective Capacity |
| ------------------- | -------------- | ------------------ |
| Data API `/trades`  | **75 req/10s** | 450 req/min        |
| CLOB general        | 5,000 req/10s  | 30,000 req/min     |
| CLOB `/data/trades` | 150 req/10s    | 900 req/min        |
| Gamma `/events`     | 100 req/10s    | 600 req/min        |
| Gamma `/markets`    | 125 req/10s    | 750 req/min        |

**Rate limit behavior**: Cloudflare throttles requests (queues rather than drops). HTTP 429 returned when severely exceeded; 10-minute blocks possible for Data API violations.

### Tiered polling strategy for 1000+ markets

```javascript
// Tier 1: High-volume markets (top 50) - 5 second polling
// Tier 2: Medium-activity (200 markets) - 30 second polling
// Tier 3: Low-activity (1000+ markets) - 5 minute polling

// Rate calculation: 600 + 400 + 200 = ~1,200 req/min (within limits)
```

WebSocket connections support ~500 instrument subscriptions each. For 1000+ markets, use 2-3 parallel connections with connection health monitoring.

---

## Prior art reveals proven patterns and thresholds

### Existing whale trackers use $10k-$25k thresholds

| Tool                    | Threshold    | Key Feature                                        |
| ----------------------- | ------------ | -------------------------------------------------- |
| **PolyTrack**           | $10k+        | Cluster detection (identifies multi-wallet whales) |
| **Polywhaler**          | $10k+        | Insider activity scoring                           |
| **PolyInsider**         | $5k+         | Fresh wallet monitoring                            |
| **polymaster (GitHub)** | $25k default | Anomaly detection for contrarian bets              |

PolyTrack's **cluster detection** is notable: when trader "Théo" used 11 wallets to place $30M in bets, most tools showed 11 separate traders—PolyTrack identified 1 whale.

### Open source implementations

The official **`py-clob-client`** (341 stars) provides the foundation:

```python
from py_clob_client.client import ClobClient

# Read-only client (no auth)
client = ClobClient("https://clob.polymarket.com")
markets = client.get_simplified_markets()
book = client.get_order_book(token_id)
```

**polymaster** (Rust) demonstrates anomaly detection:

- Extreme confidence bets (>95% or <5% probability)
- Contrarian positions on unlikely outcomes
- Major capital deployment (>$100k)
- Information asymmetry indicators

### Twitter/Telegram bots

Active whale alert accounts include `@polytrackerbot`, `@PolyAlertHub`, and `@polyburg`. Most poll every 5-30 seconds and filter above $1k-$10k thresholds. Telegram bots like `@PolyIntel_bot` check every 10 minutes with scoring systems.

---

## Data model maps trades to markets and categories

### Hierarchical structure

```
Event (slug: "bitcoin-100k-2026")
  └── Market (condition_id: "0xbd31dc8a...")
       └── Outcomes: YES / NO
            └── Token IDs (ERC1155 assets)
```

Key identifiers:

- **condition_id**: Unique market identifier (bytes32 hash)
- **token_id / positionId**: ERC1155 token for each outcome (large integer)
- **slug**: Human-readable URL identifier

### Trade object schema

```typescript
interface Trade {
	proxyWallet: string; // Trader wallet
	side: 'BUY' | 'SELL';
	asset: string; // Token ID
	conditionId: string; // Market identifier
	size: number; // Token quantity
	price: number; // 0.00-1.00
	timestamp: number; // Unix seconds
	title: string; // Market question
	transactionHash: string; // On-chain reference
	outcome: string; // "Yes" or "No"
}
```

---

## On-chain data optional but valuable for verification

### API is sufficient for core whale detection

All trade data is available via APIs without blockchain access. However, on-chain verification adds value:

| Use Case            | API Sufficient? | On-Chain Benefit           |
| ------------------- | --------------- | -------------------------- |
| Real-time trades    | ✅ Yes          | N/A                        |
| Trade verification  | ✅ Yes          | Authoritative confirmation |
| Volume calculations | ⚠️ Caution      | Avoids double-counting     |
| Settlement status   | ✅ Yes          | N/A                        |

**Important caveat**: Each trade emits TWO `OrderFilled` events on-chain (one per side). Naïve volume calculations double-count—use the subgraph or API aggregates instead.

### Contract addresses (Polygon)

| Contract             | Address                                      |
| -------------------- | -------------------------------------------- |
| CTF Exchange         | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| NegRisk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Conditional Tokens   | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |

Goldsky-hosted subgraph available for indexed queries.

---

## Recommended system architecture

```
┌────────────────────────────────────────────────────────────┐
│                   DATA INGESTION LAYER                      │
├──────────────────┬─────────────────┬───────────────────────┤
│  WebSocket       │  REST Polling   │  Market Metadata      │
│  (Real-time)     │  (Verification) │  (Categories/Expiry)  │
│  CLOB trades     │  Data API       │  Gamma API            │
└────────┬─────────┴────────┬────────┴──────────┬────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌────────────────────────────────────────────────────────────┐
│                 WHALE DETECTION ENGINE                      │
│  • $250k+ threshold check (any time)                        │
│  • $15k+ with expiration window check                       │
│  • Category lookup (geopolitics = 1 week window)            │
│  • Deduplication and verification                           │
└─────────────────────────┬──────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Telegram   │  │  Discord    │  │  Webhooks   │
│  Bot API    │  │  Webhooks   │  │  (Custom)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Storage recommendations

| Data Type             | Storage     | Retention  |
| --------------------- | ----------- | ---------- |
| Real-time state       | Redis       | 24 hours   |
| Trade history         | TimescaleDB | 90+ days   |
| Market metadata cache | Redis       | 1 hour TTL |
| Wallet profiles       | PostgreSQL  | Permanent  |

---

## Implementation checklist

**Phase 1: Core infrastructure**

- [ ] Set up `py-clob-client` or TypeScript equivalent
- [ ] Cache all markets from Gamma API with category tags and `endDate`
- [ ] Implement trade ingestion via Data API polling (30s interval)
- [ ] Build threshold detection logic with time-to-expiration calculation

**Phase 2: Real-time enhancement**

- [ ] Add WebSocket connection to CLOB for `last_trade_price` events
- [ ] Implement reconnection logic with data timeout monitoring
- [ ] Set up Redis for deduplication (prevent duplicate alerts)

**Phase 3: Alert delivery**

- [ ] Configure Telegram bot or Discord webhooks
- [ ] Format alerts with market details, trade size, time-to-expiration
- [ ] Add repeat-actor flagging (same wallet, multiple large trades)

**Phase 4: Advanced features**

- [ ] Wallet clustering to identify multi-account whales
- [ ] Anomaly scoring (contrarian bets, extreme confidence)
- [ ] Historical analysis dashboard

---

## Conclusion

Polymarket's API ecosystem provides everything needed for whale detection without authentication or on-chain infrastructure. The **Data API's `filterAmount` parameter** directly supports minimum trade thresholds, while the **Gamma API's `tags` and `endDate` fields** enable category-based and time-sensitive filtering.

Key technical decisions:

1. **Use WebSocket + REST hybrid** for real-time detection with verification
2. **Cache market metadata** to enable fast category/expiration lookups per trade
3. **Implement reconnection logic** to handle WebSocket freeze issue
4. **Consider $10k-$25k thresholds** as baselines—existing trackers validate these as useful

The $250k threshold is aggressive compared to existing trackers (most use $10k), which means fewer but higher-signal alerts. The time-sensitive $15k rules add complexity but are achievable by joining trade data with cached market metadata on every event.
