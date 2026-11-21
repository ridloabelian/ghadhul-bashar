/**
 * Generates ready-to-deploy Enterprise Browser Policies (Linux JSON, Windows .reg,
 * macOS .mobileconfig) so Ghadhul Bashar cannot be impulsively disabled or bypassed
 * via Incognito mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'dist', 'policies');

const DEFAULT_EXT_ID = 'ghadhulbasharplaceholderextensionid';
const DEFAULT_UPDATE_URL = 'https://clients2.google.com/service/update2/crx';

function buildChromePolicyJson(extensionId, blockIncognito) {
  return {
    ExtensionSettings: {
      [extensionId]: {
        installation_mode: 'force_installed',
        update_url: DEFAULT_UPDATE_URL,
      },
    },
    ...(blockIncognito ? { IncognitoModeAvailability: 1 } : {}),
  };
}

function buildWindowsReg(extensionId, blockIncognito) {
  const lines = [
    'Windows Registry Editor Version 5.00',
    '',
    '[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist]',
    `"1"="${extensionId};${DEFAULT_UPDATE_URL}"`,
    '',
    '[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\BraveSoftware\\Brave\\ExtensionInstallForcelist]',
    `"1"="${extensionId};${DEFAULT_UPDATE_URL}"`,
  ];
  if (blockIncognito) {
    lines.push(
      '',
      '[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome]',
      '"IncognitoModeAvailability"=dword:00000001'
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function buildMacMobileConfig(extensionId, blockIncognito) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.google.Chrome</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>org.ghadhulbashar.chrome.policy</string>
      <key>PayloadUUID</key>
      <string>6A7B2E12-4F8B-4A9E-A98F-202611210001</string>
      <key>ExtensionInstallForcelist</key>
      <array>
        <string>${extensionId};${DEFAULT_UPDATE_URL}</string>
      </array>
      ${blockIncognito ? '<key>IncognitoModeAvailability</key>\n      <integer>1</integer>' : ''}
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>Ghadhul Bashar Gaze Protection Lock</string>
  <key>PayloadIdentifier</key>
  <string>org.ghadhulbashar.profile</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>6A7B2E12-4F8B-4A9E-A98F-202611210002</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

export function generatePolicies(extensionId = DEFAULT_EXT_ID, blockIncognito = true) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const linuxChrome = path.join(OUT_DIR, 'linux-chrome-managed-policy.json');
  const winReg = path.join(OUT_DIR, 'windows-force-install.reg');
  const macProfile = path.join(OUT_DIR, 'macos-force-install.mobileconfig');

  fs.writeFileSync(
    linuxChrome,
    JSON.stringify(buildChromePolicyJson(extensionId, blockIncognito), null, 2) + '\n'
  );
  fs.writeFileSync(winReg, buildWindowsReg(extensionId, blockIncognito));
  fs.writeFileSync(macProfile, buildMacMobileConfig(extensionId, blockIncognito));

  return { linuxChrome, winReg, macProfile };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const extId = process.argv[2] || DEFAULT_EXT_ID;
  const blockIncognito = !process.argv.includes('--allow-incognito');
  const generated = generatePolicies(extId, blockIncognito);
  console.log('Generated OS Anti-Bypass Policies:', generated);
}
