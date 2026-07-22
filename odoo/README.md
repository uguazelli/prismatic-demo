# Odoo Docker Setup

This project sets up the latest version of Odoo with PostgreSQL using Docker Compose.

## Network Prerequisites

The setup uses `veridata.network` as an external Docker network. Before starting the containers for the first time, ensure the network exists by running:

```bash
docker network create veridata.network
```

## Quick Start

1. Start services in the background:
   ```bash
   docker compose up -d
   ```

2. Access Odoo:
   - Web UI: [http://localhost:8069](http://localhost:8069)
   - Alias within `veridata.network`: `veridata.odoo.demo`

3. View logs:
   ```bash
   docker compose logs -f web
   ```

4. Stop services:
   ```bash
   docker compose down
   ```

## Directory Layout
- `config/odoo.conf`: Odoo configuration file
- `addons/`: Put your custom Odoo modules here
