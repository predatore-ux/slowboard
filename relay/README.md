# Slowboard relay v3

The firmware and website use this single-process Node HTTPS relay. It is not deployed
yet. Run one always-on instance behind a trusted HTTPS reverse proxy. Do not deploy
unchanged to stateless Functions or multiple instances: active pairing/control state
is intentionally in memory and restarting requires re-pairing.

Node 22+ is required. There are no third-party runtime packages.

Production configuration:

- DEVICE_REGISTRY: absolute path to the supplied private/devices.json, mounted as a
  secret file. Do not copy it into the public website. The file contains board IDs and
  SHA-256 device-key hashes matching the supplied firmware identity.
- ALLOWED_ORIGINS: https://predatore-ux.github.io (origin only, no /slowboard path).
- TRUST_PROXY: 1 only when requests arrive through YOUR TLS reverse proxy, which
  overwrites X-Forwarded-Proto. Do not expose its plain HTTP backend port to the internet.
- PORT: internal listening port, default 8080.
- ALLOW_LOCAL_HTTP: omit in production. 1 is only for isolated localhost testing.

Start with node server.mjs. The Dockerfile can be used on an always-on container host;
mount the private registry read-only and point DEVICE_REGISTRY at it. The image excludes
private files. /health returns only service/version and also accepts internal HTTP
health probes. All board and pairing APIs still require HTTPS.

Render setup (one Free web service for a prototype):

- Repository: predatore-ux/slowboard; branch: main; root directory: relay.
- Language: Node; build command: npm install --omit=dev; start command: npm start.
- Instance type: Free. Health check path: /health. Node 24 is pinned in .node-version.
- Set DEVICE_REGISTRY=/etc/secrets/devices.json, TRUST_PROXY=1, and
  ALLOWED_ORIGINS=https://predatore-ux.github.io.
- In Environment > Secret Files, add devices.json with the contents of the PRIVATE
  registry supplied separately with the matching firmware. Never commit that file.
- Render provides PORT and HTTPS. Do not enable ALLOW_LOCAL_HTTP.
- The Free service can sleep after 15 minutes without traffic and take about a minute
  to wake. A restart loses temporary pairings, so pair again. This is for testing;
  choosing a paid always-on plan is a separate decision.

After deployment, enter that HTTPS origin in the board's phone setup page and the
website pairing form. Optionally set RELAY_URL in slowboard/dist/network-config.mjs
to prefill the public endpoint for visitors, then publish that one public file.
Never put a device key or OTA password in network-config.mjs or a QR URL.

Protocol:

1. Device POST /api/device/exchange: X-SB-Board and Bearer device key; fresh boot ID,
   36 sensor states (0,1,?), acknowledged frame revision, optional expiring pair code.
2. Browser POST /api/pair: board ID and one-time six-digit code. A successful request
   returns a temporary controller token. Codes are consumed once; guesses are limited.
3. Browser GET /api/state?board=...: authenticated readings and heartbeat.
4. Browser POST /api/frame?board=...: complete 36-pixel frame, turn and brightness,
   monotonically increasing client sequence. Device exchange returns current control.
5. POST /api/disconnect releases ownership. Missed heartbeat, device reboot or USB
   override revokes ownership. Firmware additionally enforces its own lease timer.

Tests: node --test tests/*.test.mjs. tests/preview.mjs starts a localhost-only simulated
board for browser QA with explicitly fake credentials. It must not be deployed.

This service exchanges physical state and lighting only. It is not an authoritative
multiplayer game server, permanent user-account system or firmware download service.
