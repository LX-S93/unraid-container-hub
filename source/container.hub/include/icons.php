<?php
// Container Hub – automatic logos
// Sources (first good match wins): dashboard-icons, selfh.st icons, GitHub avatar of the project, favicon of the WebUI.

const CH_DASH_META = 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/metadata.json';
const CH_DASH_PNG = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/%s.png';
const CH_SELF_INDEX = 'https://raw.githubusercontent.com/selfhst/icons/main/index.json';
const CH_SELF_PNG = 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/%s.png';

function ch_fetch($url, $timeout = 20, $max = 8000000) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4,
    CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => $timeout, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_USERAGENT => 'unraid-container-hub']);
  $d = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  curl_close($ch);
  if ($d === false || $code >= 400 || strlen($d) > $max) return [null, $type];
  return [$d, $type];
}

function ch_norm($s) {
  return preg_replace('/[^a-z0-9]/', '', strtolower((string)$s));
}

// slug index of both collections, cached for a week in RAM
function ch_icon_index() {
  @mkdir(CH_TMP, 0777, true);
  $cache = CH_TMP . '/index.json';
  if (is_file($cache) && filemtime($cache) > time() - 7 * 86400) {
    $d = json_decode(@file_get_contents($cache), true);
    if (!empty($d['dash']) || !empty($d['self'])) return $d;
  }
  $idx = ['dash' => [], 'self' => []];
  [$meta] = ch_fetch(CH_DASH_META, 40);
  foreach ((json_decode((string)$meta, true) ?: []) as $slug => $m) {
    $idx['dash'][ch_norm($slug)] = $slug;
    foreach (($m['aliases'] ?? []) as $a) { $k = ch_norm($a); if ($k !== '' && !isset($idx['dash'][$k])) $idx['dash'][$k] = $slug; }
  }
  [$self] = ch_fetch(CH_SELF_INDEX, 40);
  foreach ((json_decode((string)$self, true) ?: []) as $e) {
    if (($e['PNG'] ?? '') !== 'Yes' || empty($e['Reference'])) continue;
    $idx['self'][ch_norm($e['Reference'])] = $e['Reference'];
    $k = ch_norm($e['Name'] ?? '');
    if ($k !== '' && !isset($idx['self'][$k])) $idx['self'][$k] = $e['Reference'];
  }
  if ($idx['dash'] || $idx['self']) file_put_contents($cache, json_encode($idx));
  return $idx;
}

// search keys for a container, strongest first: [key, score]
function ch_icon_keys($c) {
  static $genericLast = ['server', 'app', 'web', 'docker', 'core', 'main', 'image', 'service', 'api', 'ui', 'frontend', 'backend', 'latest', 'stable'];
  static $skipOwner = ['library', 'linuxserver', 'lscr', 'binhex', 'hotio', '11notes', 'jlesage', 'ich777', 'bitnami', 'mmartial', 'nginxinc', 'library'];
  $img = strtolower(preg_replace('/[@:][^\/]*$/', '', $c['image'] ?? ''));
  $parts = explode('/', $img);
  if (count($parts) > 1 && (strpos($parts[0], '.') !== false || strpos($parts[0], ':') !== false)) array_shift($parts);
  $last = end($parts) ?: '';
  $owner = count($parts) > 1 ? $parts[count($parts) - 2] : '';
  $clean = preg_replace(['/^(arch|docker|unraid)-/', '/-(docker|server|container|app|official)$/'], '', $last);
  $name = strtolower($c['name'] ?? '');
  $nclean = preg_replace(['/^binhex-/', '/^official-/', '/-(official|container|docker)$/', '/-\d+$/'], '', $name);
  $keys = [];
  $add = function ($k, $s) use (&$keys) { $k = ch_norm($k); if (strlen($k) >= 2 && (!isset($keys[$k]) || $keys[$k] < $s)) $keys[$k] = $s; };
  if (!in_array($last, $genericLast)) { $add($last, 97); $add($clean, 96); }
  if ($owner && !in_array($owner, $skipOwner)) $add($owner, in_array($last, $genericLast) ? 95 : 86);
  $add($nclean, 93);
  $add($name, 92);
  // first word of the name ("matrix-synapse" → "matrix") as a weak hint
  $first = preg_split('/[-_. ]+/', $nclean)[0] ?? '';
  if (strlen($first) >= 4) $add($first, 72);
  // common abbreviations in container names
  static $abbr = ['ha' => 'home-assistant', 'hass' => 'home-assistant', 'pg' => 'postgres', 'z2m' => 'zigbee2mqtt', 'mqtt' => 'mosquitto'];
  foreach (preg_split('/[-_. ]+/', $nclean) as $tok) if (isset($abbr[$tok])) $add($abbr[$tok], 74);
  arsort($keys);
  return $keys;
}

function ch_icon_candidates($c, $idx) {
  $cand = [];
  $put = function ($url, $score, $source, $label) use (&$cand) {
    if (!isset($cand[$url]) || $cand[$url]['score'] < $score) $cand[$url] = ['url' => $url, 'score' => $score, 'source' => $source, 'label' => $label];
  };
  foreach (ch_icon_keys($c) as $k => $s) {
    if (isset($idx['dash'][$k])) $put(sprintf(CH_DASH_PNG, $idx['dash'][$k]), $s, 'dashboard-icons', $idx['dash'][$k]);
    if (isset($idx['self'][$k])) $put(sprintf(CH_SELF_PNG, $idx['self'][$k]), $s - 1, 'selfh.st', $idx['self'][$k]);
  }
  // partial matches ("faster-whisper" ↔ "whisper"), only if nothing exact was found
  if (!$cand) {
    foreach (ch_icon_keys($c) as $k => $s) {
      if (strlen($k) < 5) continue;
      foreach (['dash' => CH_DASH_PNG, 'self' => CH_SELF_PNG] as $src => $fmt) {
        foreach ($idx[$src] as $nk => $slug) {
          if (strlen($nk) < 5 || ch_norm($slug) !== $nk) continue; // real names only, no aliases
          // the collection name must be contained at the start/end of our key, not the other way round
          if ($nk !== $k && (str_ends_with($k, $nk) || str_starts_with($k, $nk))) {
            $put(sprintf($fmt, $slug), min(78, $s - 18), $src === 'dash' ? 'dashboard-icons' : 'selfh.st', $slug);
          }
        }
      }
    }
  }
  // GitHub avatar of the project (needs a check, it may be a person)
  $src = $c['source'] ?: ($c['project'] ?? '');
  $gh = '';
  if (preg_match('~github\.com/([A-Za-z0-9_.-]+)~', $src, $m)) $gh = $m[1];
  elseif (preg_match('~^ghcr\.io/([A-Za-z0-9_.-]+)/~i', $c['image'] ?? '', $m)) $gh = $m[1];
  if ($gh) $put('https://github.com/' . $gh . '.png?size=128', 66, 'GitHub', $gh);
  // favicon of the running WebUI
  if (!empty($c['url']) && preg_match('~^(https?://[^/]+)~', $c['url'], $m)) $put($m[1] . '/favicon.ico', 70, 'WebUI', 'favicon');
  uasort($cand, fn($a, $b) => $b['score'] <=> $a['score']);
  return array_slice(array_values($cand), 0, 6);
}

function ch_image_ok($data, $type) {
  if (!$data || strlen($data) < 64) return false;
  if (stripos($type, 'image/') === 0) return true;
  $sig = substr($data, 0, 8);
  return strncmp($sig, "\x89PNG", 4) === 0 || strncmp($sig, "\xFF\xD8", 2) === 0 || strncmp($sig, "\0\0\1\0", 4) === 0
    || strncmp($sig, 'GIF8', 4) === 0 || strncmp($sig, 'RIFF', 4) === 0 || stripos(substr($data, 0, 200), '<svg') !== false;
}

// download, store, optionally write into the Unraid template
function ch_icon_apply($name, $url, $source, $status, $score = 100) {
  [$data, $type] = ch_fetch($url, 20, 3000000);
  if (!ch_image_ok($data, (string)$type)) throw new Exception("Could not load an image from $url");
  @mkdir(CH_CFG . '/icons', 0777, true);
  file_put_contents(CH_CFG . '/icons/' . ch_iconfile($name), $data);
  $icons = ch_json_read(CH_CFG . '/icons.json', []);
  $e = $icons[$name] ?? [];
  $e = array_merge($e, ['status' => $status, 'url' => $url, 'source' => $source, 'score' => $score, 'ts' => time(), 'type' => $type]);
  $msg = "Logo for $name saved";
  if (ch_settings()['write_template']) {
    $tpl = ch_tpl_file($name);
    if ($tpl) {
      ch_backup_templates();
      if (!array_key_exists('prev_icon', $e)) $e['prev_icon'] = ch_tpl_get($tpl, 'Icon');
      if (ch_tpl_set($tpl, 'Icon', $url)) { ch_clear_unraid_icon($name); $msg .= ' and written to its Unraid template'; }
    }
  }
  $icons[$name] = $e;
  ch_json_write(CH_CFG . '/icons.json', $icons);
  return $msg;
}

function ch_icon_reset($name) {
  $icons = ch_json_read(CH_CFG . '/icons.json', []);
  $e = $icons[$name] ?? [];
  @unlink(CH_CFG . '/icons/' . ch_iconfile($name));
  if (array_key_exists('prev_icon', $e)) {
    $tpl = ch_tpl_file($name);
    if ($tpl) { ch_backup_templates(); ch_tpl_set($tpl, 'Icon', $e['prev_icon']); ch_clear_unraid_icon($name); }
  }
  $icons[$name] = ['status' => 'dismissed', 'ts' => time(), 'candidates' => $e['candidates'] ?? []];
  ch_json_write(CH_CFG . '/icons.json', $icons);
  return "Logo for $name removed";
}

// look for logos for every container without one
function ch_icons_scan($list = null, $force = false) {
  @set_time_limit(300);
  @mkdir(CH_TMP, 0777, true);
  $lock = fopen(CH_TMP . '/scan.lock', 'c');
  if (!flock($lock, LOCK_EX | LOCK_NB)) return ['busy' => true];
  if ($list === null) $list = ch_state_light();
  $idx = ch_icon_index();
  $set = ch_settings();
  $icons = ch_json_read(CH_CFG . '/icons.json', []);
  $res = ['checked' => 0, 'applied' => 0, 'review' => 0, 'none' => 0];
  foreach ($list as $c) {
    $n = $c['name'];
    $st = $icons[$n]['status'] ?? '';
    // never touch containers that already have a logo or a decision
    if ($c['icon_src'] === 'unraid' || in_array($st, ['auto', 'manual', 'dismissed'])) continue;
    // background scans only look at containers seen for the first time
    if (!$force && $st !== '') continue;
    $res['checked']++;
    $cand = ch_icon_candidates($c, $idx);
    // keep only candidates that actually load
    $ok = [];
    foreach ($cand as $k) {
      if ($k['source'] === 'dashboard-icons' || $k['source'] === 'selfh.st') { $ok[] = $k; continue; }
      [$d, $t] = ch_fetch($k['url'], 6, 3000000);
      if (ch_image_ok($d, (string)$t)) $ok[] = $k;
    }
    $best = $ok[0] ?? null;
    if ($best && $set['auto_apply'] && $best['score'] >= (int)$set['threshold']) {
      try {
        ch_icon_apply($n, $best['url'], $best['source'], 'auto', $best['score']);
        $icons = ch_json_read(CH_CFG . '/icons.json', []);
        $icons[$n]['candidates'] = $ok;
        $res['applied']++;
        ch_json_write(CH_CFG . '/icons.json', $icons);
        continue;
      } catch (Exception $e) { /* fall through to review */ }
    }
    $icons[$n] = ['status' => $best ? 'review' : 'none', 'candidates' => $ok, 'ts' => time()];
    $res[$best ? 'review' : 'none']++;
    ch_json_write(CH_CFG . '/icons.json', $icons);
  }
  $meta = ch_json_read(CH_TMP . '/scan.json', []);
  $meta['last'] = time();
  ch_json_write(CH_TMP . '/scan.json', $meta);
  flock($lock, LOCK_UN);
  return $res;
}

// container list without the slower parts, for scans
function ch_state_light() {
  $DC = new DockerClient();
  $info = $DC->getAllInfo();
  $ins = ch_inspect();
  $icons = ch_json_read(CH_CFG . '/icons.json', []);
  $r = [];
  foreach ($DC->getDockerContainers() as $c) {
    $n = $c['Name'];
    $i = $info[$n] ?? [];
    $src = ch_hub_icon($n, $icons) ? 'hub' : ((!empty($i['icon']) && strpos($i['icon'], 'question.png') === false) ? 'unraid' : '');
    $r[] = ['name' => $n, 'image' => $c['Image'], 'url' => $i['url'] ?? '', 'project' => $i['Project'] ?? '',
      'source' => $ins[$n]['source'] ?? '', 'icon_src' => $src];
  }
  return $r;
}

// start a background scan when new containers without a logo show up
function ch_maybe_scan_icons($list, $icons) {
  if (!ch_settings()['scan_new']) return;
  $todo = false;
  foreach ($list as $c) {
    if ($c['icon_src'] === '' && !isset($icons[$c['name']])) { $todo = true; break; }
  }
  if (!$todo) return;
  $meta = ch_json_read(CH_TMP . '/scan.json', []);
  if (($meta['started'] ?? 0) > time() - 300) return;
  $meta['started'] = time();
  ch_json_write(CH_TMP . '/scan.json', $meta);
  exec('nohup php ' . escapeshellarg(__DIR__ . '/icons_cli.php') . ' >/dev/null 2>&1 &');
}
