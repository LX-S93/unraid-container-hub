<?php
// Container Hub – background logo scan (started by the page, or by hand: php icons_cli.php [--force])
$docroot = '/usr/local/emhttp';
require_once __DIR__ . '/lib.php';
$r = ch_icons_scan(null, in_array('--force', $argv ?? []));
echo json_encode($r), "\n";
