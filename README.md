# Container Hub for Unraid

A modern container view for Unraid 7 that replaces the list in the **Docker** tab – with the classic list one click away.

## Features

- **Status at a glance** – running containers, memory in use, available updates and a *Needs attention* list.
  Red only means a real problem: *unhealthy*, *restarting*, or autostart is on but the container is not running.
  Containers you stopped on purpose are simply faded out.
- **Cards view** – your Folder View folders as groups of tiles (or group by network / compose project). Folders where everything is stopped on purpose start collapsed.
- **List view** – sortable table with CPU sparkline, memory against limit, network/IP, filters and bulk start/stop/restart/update.
- **Network view** – one column per Docker network; containers that use `--network container:…` are shown under the container they depend on.
- **Details panel** – start/stop/restart/pause, WebUI, console, log window, edit, update, autostart switch, IPs/MACs, ports, volumes, live logs, and "restart together with dependent containers".
- **Automatic logos** – containers without a logo get one from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) or [selfh.st icons](https://github.com/selfhst/icons). Safe matches are applied automatically, uncertain ones (GitHub project avatar, WebUI favicon) wait for your OK. You can paste your own image address. Optionally the logo is written into the Unraid template, so the Docker tab, Folder View and dashboard show it too.

Everything uses Unraid's own Docker functions (start/stop, update window, console, autostart), so templates and settings stay compatible with the Docker tab.

Works well together with [Docker Toolkit](https://github.com/LX-S93/unraid-docker-toolkit) (memory limits, IPAM).

## Installation

Unraid 7.0 or newer. **Plugins › Install Plugin**:

```
https://raw.githubusercontent.com/LX-S93/unraid-container-hub/main/container.hub.plg
```

Open the **DOCKER** tab. *Classic view* in the title bar switches to Unraid's original list (Folder View keeps working there); *Container Hub* switches back. With tabbed page view enabled in Display Settings, both appear as tabs.

## Data

`/boot/config/plugins/container.hub/`

| | |
|---|---|
| `settings.json` | logo settings |
| `icons.json`, `icons/` | found and chosen logos |
| `backups/` | template backups (one per day, last 10) taken before a logo is written into a template |

Removing the plugin keeps this folder. Logos written into templates stay; *Remove* on the Logos page restores the previous template icon.

## Building

```
./pkg_build.sh 2026.11.06
```

## Credits

Logos come from the dashboard-icons (homarr-labs) and selfh.st icon collections; all logos remain property of their owners.

## License

MIT
