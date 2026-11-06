<?php
// Container Hub – backend helpers
$docroot = $docroot ?? ($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '/usr/local/emhttp';
require_once "$docroot/plugins/dynamix.docker.manager/include/DockerClient.php";

const CH_CFG = '/boot/config/plugins/container.hub';
const CH_TMP = '/tmp/container.hub';
const CH_TPL = '/boot/config/plugins/dockerMan/templates-user';
const CH_AUTOSTART = '/var/lib/docker/unraid-autostart';

function ch_json_read($p, $def) {
  if (!is_file($p)) return $def;
  $d = json_decode(@file_get_contents($p), true);
  return is_array($d) ? $d : $def;
}

function ch_json_write($p, $d) {
  @mkdir(dirname($p), 0777, true);
  file_put_contents("$p.tmp", json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
  rename("$p.tmp", $p);
}

function ch_settings() {
  return array_merge(['auto_apply' => true, 'threshold' => 90, 'write_template' => true, 'scan_new' => true],
    ch_json_read(CH_CFG . '/settings.json', []));
}

function ch_sh($cmd) {
  $o = [];
  exec($cmd . ' 2>/dev/null', $o);
  return $o;
}

function ch_host_mem_mb() {
  foreach (@file('/proc/meminfo') ?: [] as $l) {
    if (preg_match('/^MemTotal:\s+(\d+)/', $l, $m)) return intdiv((int)$m[1], 1024);
  }
  return 0;
}

function ch_autostart() {
  $r = [];
  foreach ((array)@file(CH_AUTOSTART, FILE_IGNORE_NEW_LINES) as $l) {
    $p = preg_split('/\s+/', trim((string)$l));
    if ($p[0] !== '') $r[$p[0]] = $p[1] ?? '';
  }
  return $r;
}

// folders of the Folder View plugin (v3, v2 or v1)
function ch_folders() {
  foreach (['folder.view3', 'folder.view2', 'folder.view'] as $p) {
    $f = "/boot/config/plugins/$p/docker.json";
    if (!is_file($f)) continue;
    $out = [];
    foreach (ch_json_read($f, []) as $id => $fo) {
      $out[] = ['id' => (string)$id, 'name' => $fo['name'] ?? (string)$id, 'icon' => $fo['icon'] ?? '',
        'containers' => array_values($fo['containers'] ?? []), 'regex' => $fo['regex'] ?? ''];
    }
    return ['source' => $p, 'folders' => $out];
  }
  return ['source' => null, 'folders' => []];
}

// details docker ps/getDockerContainers does not give us (no environment variables!)
function ch_inspect() {
  $ids = ch_sh('docker ps -aq --no-trunc');
  if (!$ids) return [];
  $arr = json_decode(shell_exec('docker inspect ' . implode(' ', array_map('escapeshellarg', $ids)) . ' 2>/dev/null'), true) ?: [];
  $r = [];
  foreach ($arr as $c) {
    $name = ltrim($c['Name'] ?? '', '/');
    $mounts = [];
    foreach (($c['Mounts'] ?? []) as $m) {
      $mounts[] = ['src' => $m['Source'] ?? ($m['Name'] ?? ''), 'dst' => $m['Destination'] ?? '', 'rw' => !empty($m['RW'])];
    }
    $r[$name] = [
      'status' => $c['State']['Status'] ?? '',
      'health' => $c['State']['Health']['Status'] ?? '',
      'started' => $c['State']['StartedAt'] ?? '',
      'finished' => $c['State']['FinishedAt'] ?? '',
      'exit' => (int)($c['State']['ExitCode'] ?? 0),
      'restarts' => (int)($c['RestartCount'] ?? 0),
      'mem_limit' => intdiv((int)($c['HostConfig']['Memory'] ?? 0), 1048576),
      'source' => $c['Config']['Labels']['org.opencontainers.image.source'] ?? '',
      'mounts' => $mounts,
    ];
  }
  return $r;
}

function ch_networks() {
  $ids = ch_sh("docker network ls -q");
  if (!$ids) return [];
  $arr = json_decode(shell_exec('docker network inspect ' . implode(' ', array_map('escapeshellarg', $ids)) . ' 2>/dev/null'), true) ?: [];
  $r = [];
  foreach ($arr as $n) {
    $cfg = [];
    foreach (($n['IPAM']['Config'] ?? []) as $c) {
      if (!empty($c['Subnet']) && strpos($c['Subnet'], ':') === false) { $cfg = $c; break; }
    }
    $r[$n['Name']] = ['name' => $n['Name'], 'driver' => $n['Driver'] ?? '', 'subnet' => $cfg['Subnet'] ?? '', 'gateway' => $cfg['Gateway'] ?? ''];
  }
  return $r;
}

function ch_iconfile($name) {
  return preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
}

function ch_hub_icon($name, $icons) {
  $h = $icons[$name] ?? null;
  if (!$h || !in_array($h['status'] ?? '', ['auto', 'manual'])) return '';
  $f = CH_CFG . '/icons/' . ch_iconfile($name);
  if (!is_file($f)) return '';
  return '/plugins/container.hub/include/api.php?action=icon&name=' . rawurlencode($name) . '&v=' . (int)($h['ts'] ?? 0);
}

function ch_state() {
  $DC = new DockerClient();
  $cts = $DC->getDockerContainers();
  $info = $DC->getAllInfo();
  $ins = ch_inspect();
  $auto = ch_autostart();
  $icons = ch_json_read(CH_CFG . '/icons.json', []);
  $list = [];
  $missing = 0;
  foreach ($cts as $c) {
    $n = $c['Name'];
    $i = $info[$n] ?? [];
    $x = $ins[$n] ?? [];
    $nets = [];
    foreach (($c['Networks'] ?? []) as $nn => $v) {
      if (!empty($v['IPAddress']) || !empty($v['MacAddress'])) $nets[] = ['net' => $nn, 'ip' => $v['IPAddress'] ?? '', 'mac' => $v['MacAddress'] ?? ''];
    }
    $ports = [];
    foreach (($c['Ports'] ?? []) as $p) {
      if (is_array($p) && isset($p['PrivatePort'])) $ports[] = ['priv' => (string)$p['PrivatePort'], 'pub' => (string)($p['PublicPort'] ?? ''), 'type' => $p['Type'] ?? ''];
    }
    $icon = ch_hub_icon($n, $icons);
    $iconSrc = $icon ? 'hub' : '';
    if (!$icon && !empty($i['icon']) && strpos($i['icon'], 'question.png') === false) { $icon = $i['icon']; $iconSrc = 'unraid'; }
    if (!$icon) $missing++;
    $list[] = [
      'id' => $c['Id'], 'name' => $n, 'image' => $c['Image'],
      'running' => (bool)$c['Running'], 'paused' => (bool)$c['Paused'],
      'state' => $x['status'] ?? ($c['Running'] ? 'running' : 'exited'),
      'health' => $x['health'] ?? '', 'started' => $x['started'] ?? '', 'finished' => $x['finished'] ?? '',
      'exit' => $x['exit'] ?? 0, 'restarts' => $x['restarts'] ?? 0,
      'autostart' => array_key_exists($n, $auto), 'wait' => $auto[$n] ?? '',
      'update' => ($i['updated'] ?? '') === 'false',
      'managed' => $c['Manager'] ?: '', 'compose' => $c['ComposeProject'] ?? '',
      'url' => $i['url'] ?? '', 'shell' => $i['shell'] ?? '', 'template' => $i['template'] ?? '',
      'project' => $i['Project'] ?? '', 'support' => $i['Support'] ?? '',
      'icon' => $icon, 'icon_src' => $iconSrc,
      'netmode' => $c['NetworkMode'] ?? '', 'nets' => $nets, 'ports' => $ports,
      'mem_limit' => $x['mem_limit'] ?? 0, 'mounts' => $x['mounts'] ?? [], 'source' => $x['source'] ?? '',
      'created' => $c['Created'] ?? '',
    ];
  }
  $folders = ch_folders();
  // folders with a regex pick up matching containers too
  foreach ($folders['folders'] as &$f) {
    if ($f['regex'] === '') continue;
    foreach ($list as $c) {
      if (!in_array($c['name'], $f['containers']) && @preg_match('/' . str_replace('/', '\/', $f['regex']) . '/i', $c['name'])) $f['containers'][] = $c['name'];
    }
  }
  unset($f);
  ch_maybe_scan_icons($list, $icons);
  return [
    'containers' => $list, 'folders' => $folders['folders'], 'folder_source' => $folders['source'],
    'networks' => ch_networks(), 'host_mem_mb' => ch_host_mem_mb(), 'missing_icons' => $missing,
    'toolkit' => is_dir('/usr/local/emhttp/plugins/docker.toolkit'), 'time' => time(),
  ];
}

function ch_parse_size_mb($s) {
  if (!preg_match('/([0-9.]+)\s*([KMGT]?i?B)/i', $s, $m)) return 0;
  $f = ['B' => 1 / 1048576, 'KB' => 1 / 1024, 'KIB' => 1 / 1024, 'MB' => 1, 'MIB' => 1, 'GB' => 1024, 'GIB' => 1024, 'TB' => 1048576, 'TIB' => 1048576][strtoupper($m[2])] ?? 1;
  return round((float)$m[1] * $f, 1);
}

function ch_stats() {
  $r = [];
  foreach (ch_sh("docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'") as $l) {
    $p = explode("\t", $l);
    if (count($p) < 3) continue;
    [$used, $lim] = array_pad(explode('/', $p[2]), 2, '');
    $r[$p[0]] = ['cpu' => (float)rtrim($p[1], '%'), 'mem' => ch_parse_size_mb($used), 'mem_max' => ch_parse_size_mb($lim)];
  }
  return $r;
}

function ch_logs($name, $tail) {
  $tail = max(20, min(2000, (int)$tail));
  $o = shell_exec('docker logs --tail ' . $tail . ' --timestamps ' . escapeshellarg($name) . ' 2>&1');
  $o = preg_replace('/\x1b\[[0-9;?]*[A-Za-z]/', '', (string)$o);
  if (strlen($o) > 400000) $o = substr($o, -400000);
  return $o;
}

// ---------- templates ----------
function ch_tpl_file($name) {
  foreach (glob(CH_TPL . '/my-*.xml') as $f) {
    $x = @simplexml_load_file($f);
    if ($x && (string)$x->Name === $name) return $f;
  }
  return null;
}

function ch_tpl_get($file, $tag) {
  $x = @simplexml_load_file($file);
  return $x ? trim((string)$x->$tag) : '';
}

function ch_tpl_set($file, $tag, $val) {
  $dom = new DOMDocument();
  $dom->preserveWhiteSpace = true;
  if (!@$dom->load($file)) return false;
  $root = $dom->documentElement;
  $n = null;
  foreach ($root->childNodes as $c) {
    if ($c->nodeType === XML_ELEMENT_NODE && $c->nodeName === $tag) { $n = $c; break; }
  }
  if (!$n) { $n = $dom->createElement($tag); $root->appendChild($n); }
  while ($n->firstChild) $n->removeChild($n->firstChild);
  $n->appendChild($dom->createTextNode($val));
  return $dom->save($file) !== false;
}

// one template backup per day is enough
function ch_backup_templates() {
  $dir = CH_CFG . '/backups';
  @mkdir($dir, 0777, true);
  $f = "$dir/templates-" . date('Ymd') . '.tgz';
  if (is_file($f)) return $f;
  exec('tar -czf ' . escapeshellarg($f) . ' -C ' . escapeshellarg(dirname(CH_TPL)) . ' templates-user 2>&1', $o, $rc);
  if ($rc !== 0) throw new Exception('Template backup failed');
  foreach (array_slice(array_reverse(glob("$dir/templates-*.tgz")), 10) as $old) @unlink($old);
  return $f;
}

// make Unraid fetch the icon again from the template
function ch_clear_unraid_icon($name) {
  global $dockerManPaths;
  foreach ([$dockerManPaths['images'] ?? '', $dockerManPaths['images-ram'] ?? ''] as $d) {
    if ($d) @unlink("$d/$name-icon.png");
  }
  $wi = $dockerManPaths['webui-info'] ?? '';
  if ($wi && is_file($wi)) {
    $info = json_decode(@file_get_contents($wi), true) ?: [];
    if (isset($info[$name]['icon'])) { unset($info[$name]['icon']); file_put_contents($wi, json_encode($info, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); }
  }
}

require_once __DIR__ . '/icons.php';
