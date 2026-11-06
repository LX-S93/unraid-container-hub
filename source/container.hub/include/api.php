<?php
// Container Hub – JSON API (read via GET, write only via POST; Unraid checks the csrf_token on POST)
require_once __DIR__ . '/lib.php';

function ch_req($k, $def = '') { return trim((string)($_REQUEST[$k] ?? $def)); }
function ch_out($d) {
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => true] + $d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}
function ch_post() { if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new Exception('POST required'); }

try {
  switch (ch_req('action')) {
    case 'state':
      ch_out(ch_state());
    case 'stats':
      ch_out(['stats' => ch_stats(), 'time' => time()]);
    case 'logs':
      ch_out(['log' => ch_logs(ch_req('name'), ch_req('tail', '200'))]);
    case 'icon':
      $f = CH_CFG . '/icons/' . ch_iconfile(ch_req('name'));
      if (!is_file($f)) { http_response_code(404); exit; }
      $data = file_get_contents($f);
      $type = (new finfo(FILEINFO_MIME_TYPE))->buffer($data) ?: 'image/png';
      if (stripos(substr($data, 0, 300), '<svg') !== false) $type = 'image/svg+xml';
      if (strpos($type, 'image/') !== 0) $type = 'application/octet-stream';
      header('Content-Type: ' . $type);
      header('Cache-Control: max-age=604800');
      header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'");
      echo $data;
      exit;
    case 'icons':
      ch_out(['icons' => ch_json_read(CH_CFG . '/icons.json', []), 'settings' => ch_settings(),
        'scan' => ch_json_read(CH_TMP . '/scan.json', [])]);
    case 'icons_scan':
      ch_post();
      ch_out(['result' => ch_icons_scan(null, ch_req('force') === '1')]);
    case 'icon_apply':
      ch_post();
      $url = ch_req('url');
      if (!preg_match('~^https?://~i', $url)) throw new Exception('Please enter an http(s) address');
      ch_out(['message' => ch_icon_apply(ch_req('name'), $url, ch_req('source', 'manual'), 'manual')]);
    case 'icon_reset':
      ch_post();
      ch_out(['message' => ch_icon_reset(ch_req('name'))]);
    case 'settings':
      ch_post();
      $s = ch_settings();
      foreach (['auto_apply', 'write_template', 'scan_new'] as $k) if (isset($_POST[$k])) $s[$k] = $_POST[$k] === '1';
      if (isset($_POST['threshold'])) $s['threshold'] = max(50, min(100, (int)$_POST['threshold']));
      ch_json_write(CH_CFG . '/settings.json', $s);
      ch_out(['settings' => $s]);
    default:
      throw new Exception('Unknown action');
  }
} catch (Throwable $e) {
  http_response_code(400);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
