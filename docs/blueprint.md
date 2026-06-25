# Watchtower Crypto Alerts — Bot specification

**Archetype:** custom

Watchtower is a personal Telegram bot that lets users maintain private crypto watchlists, set price threshold and percent move alerts, request on-demand prices, and receive optional morning summaries. Alerts respect quiet hours and include cooldowns to prevent spam. The bot includes an owner/admin view showing user metrics and alert analytics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto watchers who want private, lightweight Telegram alerts for coins they follow.

## Success criteria

- Users can create and manage watchlists with threshold and percent move alerts
- Alerts are delivered according to user-specified rules and quiet hours
- Owner can view analytics and system health metrics
- System handles price feed failures gracefully without user disruption

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Welcome and quick setup for new users
- **/help** (command, actor: user, command: /help) — Lists available commands and examples
- **/add** (command, actor: user, command: /add) — Interactive flow to add coins to watchlist with inline buttons for common coins and text input for custom tickers
- **/remove** (command, actor: user, command: /remove) — Shows watchlist with inline buttons to remove items
- **/list** (command, actor: user, command: /list) — Displays current watchlist and active alerts
- **/price** (command, actor: user, command: /price) — On-demand price check for specific coin or full watchlist
- **/alerts** (command, actor: user, command: /alerts) — Lists configured alerts with inline controls
- **/set_threshold** (command, actor: user, command: /set_threshold) — Guided flow to create price threshold alerts
- **/set_percent_rule** (command, actor: user, command: /set_percent_rule) — Set percent-move alerts for watchlist
- **summary_time** (command, actor: user, command: /summary_time) — Set optional morning summary time
- **quiet_hours** (command, actor: user, command: /quiet_hours) — Configure quiet hours for alerts
- **settings** (command, actor: user, command: /settings) — Edit preferences like timezone, fiat, and cooldowns
- **admin** (command, actor: owner, command: /admin) — Owner-only access to analytics and system metrics

## Flows

### Watchlist Management
_Trigger:_ /add or /remove

1. User selects /add or /remove
2. Bot displays inline buttons for common coins or text input
3. User confirms or corrects ticker symbol
4. Watchlist is updated

_Data touched:_ User, Watchlist

### Alert Configuration
_Trigger:_ /set_threshold or /set_percent_rule

1. User selects alert type
2. Bot guides through ticker selection
3. User sets threshold/percent and direction
4. Alert is created and stored

_Data touched:_ User, Price-threshold alert, Percent-move rule

### Price Check
_Trigger:_ /price [TICKER|none]

1. User requests price check
2. Bot fetches current prices
3. Bot displays prices and percent changes

_Data touched:_ User, Watchlist

### Alert Trigger Handling
_Trigger:_ Price threshold crossed or percent move detected

1. System detects alert condition
2. Checks quiet hours and cooldown
3. Sends alert message with snooze/disable buttons
4. Records alert in history

_Data touched:_ Alert history record, User

### Morning Summary
_Trigger:_ User's configured summary time

1. System checks for summary time
2. Gathers prices and alert history
3. Sends summary message with key metrics

_Data touched:_ User, Watchlist, Alert history record

### Owner Analytics
_Trigger:_ /admin

1. Owner authenticates
2. Displays user metrics
3. Shows top alerts and system health

_Data touched:_ User, Alert history record

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram chat user with preferences and settings
  - fields: Telegram chat id, timezone, quiet hours, summary time, default fiat, cooldown length
- **Watchlist entry** _(retention: persistent)_ — Coin being tracked by user
  - fields: ticker symbol, display name, enabled flag
- **Price-threshold alert** _(retention: persistent)_ — Alert when price crosses a specific threshold
  - fields: ticker, direction, threshold value, enabled flag, created_at
- **Percent-move rule** _(retention: persistent)_ — Alert when coin moves by a certain percentage
  - fields: enabled, percentage threshold, timeframe, direction
- **Alert history record** _(retention: persistent)_ — Record of triggered alerts for user analytics
  - fields: alert type, coin, old_price, new_price, percent_change, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging
- **Crypto Price Feed** (required) — Reliable price data for alert evaluation
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- /admin - View analytics and system metrics
- /claim_owner - Secure owner-claim flow for transferring ownership

## Notifications

- Direct Telegram messages for user alerts
- Owner-only analytics dashboard via /admin command

## Permissions & privacy

- All user data is private and persistent per user
- Owner has read-only access to analytics and system metrics
- User can manage their own watchlist and alert settings

## Edge cases

- Unknown or invalid ticker symbols with fuzzy matching suggestions
- Price feed failures with silent retries and alert suppression
- Alerts during quiet hours with queued delivery or suppression
- Multiple alert types firing simultaneously for same coin

## Required tests

- Verify alert delivery during non-quiet hours with cooldown enforcement
- Test price threshold and percent move alert triggers
- Validate morning summary content and timing
- Confirm owner analytics display correct metrics
- Test error handling for price feed failures

## Assumptions

- Default fiat is USD and can be changed in settings
- Percent-move timeframe is 1 hour by default
- Quiet hours default to 22:00-07:00 local time
- Timezone is inferred from Telegram locale with explicit override
- Cooldown is 60 minutes per user+rule+coin by default
- Morning summary is disabled by default
- Owner identity is set via secure owner-claim flow
