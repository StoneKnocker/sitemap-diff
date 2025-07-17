# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
This is a **Cloudflare Workers-based sitemap monitoring bot** that automatically monitors website sitemap changes and sends notifications via Telegram/Discord. It's a defensive security tool for content monitoring and change detection.

## Architecture
- **Platform**: Cloudflare Workers (serverless)
- **Storage**: Cloudflare KV for persistent storage
- **Languages**: JavaScript/Node.js
- **Notifications**: Telegram Bot API, Discord Bot API
- **Scheduling**: Cloudflare Workers Cron Triggers (hourly)

## Core Components

### Entry Point
- `src/index.js:216` - Main Cloudflare Worker handler
- `src/index.js:236` - Cron job handler for scheduled monitoring

### Services
- `src/services/rss-manager.js:9` - RSS/sitemap management with KV storage
- `src/services/xml-parser.js:11` - XML parsing and URL extraction

### Bots
- `src/apps/telegram-bot.js:7` - Telegram bot implementation
- `src/apps/discord-bot.js:7` - Discord bot implementation

### Configuration
- `src/config.js:6` - Environment variable management
- `wrangler.toml:1` - Cloudflare Workers configuration

## Key Features
1. **Sitemap Monitoring**: Automatically downloads and parses sitemap.xml files
2. **Change Detection**: Compares current vs previous sitemap versions
3. **Silent Mode**: Only sends notifications when changes are detected
4. **Multi-platform**: Supports both Telegram and Discord notifications
5. **Keyword Analysis**: Extracts and summarizes keywords from new content
6. **Interactive Commands**: Bot commands for manual operations

## Commands

### Telegram Commands
- `/start`, `/help` - Show help information
- `/rss list` - List monitored sitemaps
- `/rss add URL` - Add sitemap monitoring
- `/rss del URL` - Remove sitemap monitoring
- `/news` - Manual keyword summary trigger

### Discord Commands
- `/rss list` - List monitored sitemaps
- `/rss add URL` - Add sitemap monitoring
- `/rss del URL` - Remove sitemap monitoring
- `/news` - Manual keyword summary trigger

## Development Commands

### Setup
```bash
# Install dependencies
npm install

# Install Wrangler CLI globally
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv namespace create SITEMAP_STORAGE
wrangler kv namespace create SITEMAP_STORAGE --preview
```

### Local Development
```bash
# Start local dev server
npm run dev

# Test health check
curl http://localhost:8787/health

# Test manual trigger
curl -X POST http://localhost:8787/monitor
```

### Environment Setup
Create `.dev.vars` for local development:
```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_TARGET_CHAT=@your_channel_or_user_id
DISCORD_TOKEN=your_discord_token
```

### Deployment
```bash
# Deploy to production
npm run deploy

# View logs
npm run tail
```

## API Endpoints
- `GET /health` - Health check
- `POST /monitor` - Manual trigger monitoring
- `GET /api/status` - Get monitoring status
- `POST /webhook/telegram` - Telegram webhook
- `POST /webhook/discord` - Discord webhook

## Storage Schema (KV)
- `rss_feeds` - Array of monitored sitemap URLs
- `sitemap_current_{domain}` - Current sitemap content
- `sitemap_latest_{domain}` - Previous sitemap content
- `sitemap_dated_{domain}_{date}` - Historical sitemap content
- `last_update_{domain}` - Last update timestamp

## Environment Variables Required
- `TELEGRAM_BOT_TOKEN` - Telegram bot token from @BotFather
- `TELEGRAM_TARGET_CHAT` - Target chat/channel ID or username
- `DISCORD_TOKEN` (optional) - Discord bot token

## Testing
- No automated tests currently (see package.json:10)
- Manual testing via curl commands or bot commands
- Check `/health` endpoint for basic functionality
- Use `/news` command to test manual monitoring

## Common Tasks
1. **Add new monitoring**: Use `/rss add https://example.com/sitemap.xml`
2. **Check status**: Visit `/api/status` endpoint
3. **View logs**: Run `wrangler tail` to see real-time logs
4. **Update deployment**: Run `npm run deploy` after code changes