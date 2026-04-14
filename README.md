# 🧰 Field Kit

**Searchable asset catalog for sales & enablement teams.**

Field Kit is a lightweight, static-site catalog that organizes resources ("Packets") into a searchable, filterable library. Each Packet groups related assets — lab packages, setup guides, demos, and documentation — with rich tagging for discoverability.

## Features

- **Full-text search** across titles, descriptions, tags, and maintainers
- **Multi-faceted filtering** by publish state, discoverability level, industry, technical domain, language, and freeform tags
- **Detailed packet view** with linked resources (GitHub repos, Devin sessions, Google Docs, videos, etc.)
- **"Propose Entry" workflow** via GitHub Issues for intake of new packets
- **GitHub Pages ready** — zero build step, pure HTML/CSS/JS

## Quick Start

1. Clone the repo
2. Open `index.html` in a browser (or serve with any static file server)
3. To add a packet, create a new JSON file in `data/packets/` and add it to `data/packets/index.json`

## Packet Schema

Each packet is a JSON file in `data/packets/`. See [`data/schema.json`](data/schema.json) for the full schema.

Key fields:
- `id` — Unique slug
- `title` / `description` — Human-readable info
- `publishState` — Draft, Published, Archived, Deprecated
- `discoverability` — Internal, Partner, Named Partner, Partner Tier, Public
- `tags` — industry, productLine, thirdPartySoftware, language, technicalDomain, custom
- `resources` — labPackage (cognitionEnv / customerEnv), setupGuide, media

## Adding a Packet

### Via GitHub Issues (recommended)
Click **"Propose Entry"** in the header to open a pre-filled issue template.

### Manually
1. Create a new `.json` file in `data/packets/` following the schema
2. Add the filename to `data/packets/index.json`
3. Open a PR

## Hosting

Deploy to GitHub Pages by enabling it in your repo settings (Settings → Pages → Source: `main` branch, root `/`).

## Project Structure

```
field-kit/
├── index.html                  # Main page
├── assets/
│   ├── css/style.css           # Styles
│   └── js/app.js               # Client-side app
├── data/
│   ├── schema.json             # Packet JSON schema
│   └── packets/
│       ├── index.json           # Manifest of all packet files
│       └── *.json               # Individual packet files
└── .github/
    └── ISSUE_TEMPLATE/
        └── propose-packet.yml   # "Propose Entry" issue template
```
