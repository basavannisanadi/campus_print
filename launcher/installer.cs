using System;
using System.IO;
using System.Reflection;
using Microsoft.Win32;

class CampusPrintInstaller {
    static void Main(string[] args) {
        Console.WriteLine("==================================================");
        Console.WriteLine("        CAMPUS PRINT HUB AGENT INSTALLER");
        Console.WriteLine("==================================================");
        Console.WriteLine();

        try {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string installDir = Path.Combine(appData, "CampusPrint");

            Console.WriteLine("Installing Campus Print Agent...");
            Console.WriteLine("Destination: " + installDir);
            Console.WriteLine();

            // Create directories
            if (!Directory.Exists(installDir)) {
                Directory.CreateDirectory(installDir);
            }
            string logsDir = Path.Combine(installDir, "logs");
            if (!Directory.Exists(logsDir)) {
                Directory.CreateDirectory(logsDir);
            }

            // Extract embedded resources
            Assembly assembly = Assembly.GetExecutingAssembly();
            
            Console.WriteLine("-> Extracting Print Agent daemon...");
            ExtractResource(assembly, "client.cjs", Path.Combine(installDir, "client.cjs"));

            Console.WriteLine("-> Extracting Protocol Bridge...");
            ExtractResource(assembly, "bridge.cjs", Path.Combine(installDir, "bridge.cjs"));

            // Create a default config.json structure if it doesn't exist
            Console.WriteLine("-> Installing configuration template...");
            string configPath = Path.Combine(installDir, "config.json");
            if (!File.Exists(configPath)) {
                File.WriteAllText(configPath, "{\"version\":\"1.0.0\",\"printerName\":\"\"}");
            }

            // Create launcher.vbs file to run node silently (no command prompt blinking)
            Console.WriteLine("-> Installing silent launcher script...");
            string vbsPath = Path.Combine(installDir, "launcher.vbs");
            string vbsContent = "Dim shell, nodePath, bridgePath, arg, cmd\r\n" +
                                "Set shell = CreateObject(\"WScript.Shell\")\r\n" +
                                "If WScript.Arguments.Count >= 3 Then\r\n" +
                                "    nodePath = WScript.Arguments(0)\r\n" +
                                "    bridgePath = WScript.Arguments(1)\r\n" +
                                "    arg = WScript.Arguments(2)\r\n" +
                                "    cmd = Chr(34) & nodePath & Chr(34) & \" \" & Chr(34) & bridgePath & Chr(34) & \" \" & Chr(34) & arg & Chr(34)\r\n" +
                                "    shell.Run cmd, 0, False\r\n" +
                                "End If";
            File.WriteAllText(vbsPath, vbsContent);

            // Create StartAgent.cmd for manual double-click startup
            Console.WriteLine("-> Installing manual agent launcher (StartAgent.cmd)...");
            string cmdPath = Path.Combine(installDir, "StartAgent.cmd");
            string cmdContent = "@echo off\r\n" +
                                "title Campus Print Agent\r\n" +
                                "echo ==================================================\r\n" +
                                "echo         CAMPUS PRINT AGENT\r\n" +
                                "echo ==================================================\r\n" +
                                "echo.\r\n" +
                                "where node >nul 2>nul\r\n" +
                                "if errorlevel 1 (\r\n" +
                                "  echo [ERROR] Node.js is not installed or not in PATH.\r\n" +
                                "  echo Please install Node.js v18+ from https://nodejs.org\r\n" +
                                "  echo.\r\n" +
                                "  pause\r\n" +
                                "  exit /b 1\r\n" +
                                ")\r\n" +
                                "echo Starting agent...\r\n" +
                                "node \"%~dp0bridge.cjs\" campusprint://start\r\n" +
                                "if errorlevel 1 (\r\n" +
                                "  echo.\r\n" +
                                "  echo [ERROR] Agent failed to start. Check logs at:\r\n" +
                                "  echo   %~dp0logs\\\r\n" +
                                "  echo.\r\n" +
                                "  pause\r\n" +
                                ")\r\n";
            File.WriteAllText(cmdPath, cmdContent);

            // Register campusprint:// custom protocol in Windows Registry (HKCU - no UAC/admin prompts required)
            Console.WriteLine("-> Registering 'campusprint://' Custom Protocol Handler...");
            
            string registryPath = @"Software\Classes\campusprint";
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(registryPath)) {
                key.SetValue("", "URL:Campus Print Protocol");
                key.SetValue("URL Protocol", "");

                using (RegistryKey commandKey = key.CreateSubKey(@"shell\open\command")) {
                    string nodePath = FindNodePath();
                    string bridgePath = Path.Combine(installDir, "bridge.cjs");
                    string commandString = "cmd.exe /c title Campus Print Agent & \"" + nodePath + "\" \"" + bridgePath + "\" \"%1\"";
                    commandKey.SetValue("", commandString);
                }
            }

            Console.WriteLine();
            Console.WriteLine("==================================================");
            Console.WriteLine("  ✓ Installation Completed Successfully!");
            Console.WriteLine("  You can close this installer window.");
            Console.WriteLine("  Please return to the website and verify.");
            Console.WriteLine("==================================================");
        } catch (Exception ex) {
            Console.WriteLine();
            Console.WriteLine("==================================================");
            Console.WriteLine("  [ERROR] Setup failed: " + ex.Message);
            Console.WriteLine("  Press Enter to exit...");
            Console.WriteLine("==================================================");
            Console.ReadLine();
        }
    }

    static string FindNodePath() {
        string pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrEmpty(pathEnv)) return "node";
        
        string[] paths = pathEnv.Split(';');
        foreach (string p in paths) {
            try {
                if (string.IsNullOrEmpty(p)) continue;
                string cleanPath = p.Replace("\"", "").Trim();
                if (string.IsNullOrEmpty(cleanPath)) continue;
                string fullPath = Path.Combine(cleanPath, "node.exe");
                if (File.Exists(fullPath)) {
                    return fullPath;
                }
            } catch {}
        }
        return "node";
    }

    static void ExtractResource(Assembly assembly, string resourceName, string outputPath) {
        using (Stream stream = assembly.GetManifestResourceStream(resourceName)) {
            if (stream == null) {
                throw new Exception("Resource '" + resourceName + "' not found in installer binary.");
            }
            using (FileStream fileStream = new FileStream(outputPath, FileMode.Create, FileAccess.Write)) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = stream.Read(buffer, 0, buffer.Length)) > 0) {
                    fileStream.Write(buffer, 0, bytesRead);
                }
            }
        }
    }
}
