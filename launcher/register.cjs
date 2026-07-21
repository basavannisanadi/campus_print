const { exec } = require('child_process');
const path = require('path');

const bridgePath = path.resolve(__dirname, 'bridge.cjs');
const nodePath = process.execPath; // Resolves to the path of node.exe currently running

// Register the custom protocol command line
const command = `"${nodePath}" "${bridgePath}" "%1"`;

// Commands to add to Registry (under HKCU so no admin rights are required)
const regCommands = [
  `reg add "HKCU\\Software\\Classes\\campusprint" /ve /t REG_SZ /d "URL:Campus Print Protocol" /f`,
  `reg add "HKCU\\Software\\Classes\\campusprint" /v "URL Protocol" /t REG_SZ /d "" /f`,
  `reg add "HKCU\\Software\\Classes\\campusprint\\shell\\open\\command" /ve /t REG_SZ /d "${command.replace(/"/g, '\\"')}" /f`
];

async function register() {
  console.log("Registering 'campusprint://' custom protocol...");
  for (const cmd of regCommands) {
    await new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error(`Registry Error: ${stderr || err.message}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  console.log("Custom protocol registered successfully!");
  console.log(`Command set to: ${command}`);
}

register().catch(err => {
  console.error("Registration failed:", err);
  process.exit(1);
});
