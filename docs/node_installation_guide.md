# Node.js Installation Guide (for Shop PC)

This guide walks you through installing Node.js on your Shop PC to run the Campus Print Agent.

---

## Step 1: Download the Node.js Installer
1. Open any web browser on your Shop PC (e.g., Google Chrome, Microsoft Edge).
2. Visit the official download page: **[nodejs.org](https://nodejs.org/)**.
3. Click the **LTS (Long Term Support)** download button (usually the recommended version on the left, e.g. **v20.x** or **v22.x**).
4. Save the `.msi` installer file to your computer.

---

## Step 2: Run the Installer
1. Double-click the downloaded installer file (e.g., `node-vxx.xx.x-x64.msi`) to launch the setup wizard.
2. Click **Next** on the welcome screen.
3. Accept the license agreement and click **Next**.
4. Choose the default installation path (usually `C:\Program Files\nodejs\`) and click **Next**.
5. **CRITICAL STEP:** On the "Custom Setup" screen, make sure **"Add to PATH"** is selected (it will have a disk icon next to it and is enabled by default). This allows you to run `node` from any command prompt.
6. Click **Next**.
7. Click **Next** on the "Tools for Native Modules" screen (you don't need to check the box to install Chocolatey).
8. Click **Install**.
9. If Windows asks for administrator permission, click **Yes**.
10. Once complete, click **Finish**.

---

## Step 3: Verify the Installation
To make sure Node.js installed correctly:
1. Press the `Windows Key + R`, type **`cmd`**, and press Enter to open a Command Prompt window.
2. Type the following command and press Enter:
   ```cmd
   node -v
   ```
   *Expected output: A version number (e.g., `v20.11.0`).*
3. Type the following command and press Enter:
   ```cmd
   npm -v
   ```
   *Expected output: A version number (e.g., `10.2.4`).*

> [!NOTE]
> If you get an error saying `'node' is not recognized as an internal or external command`, close the Command Prompt, open a new one, and try again. This refreshes the PATH variables.

---

## Step 4: Run the Print Agent
1. Copy the `print-client` folder onto the Shop PC.
2. Open a Command Prompt in that folder, or navigate to it using:
   ```cmd
   cd path/to/print-client
   ```
3. Run the print agent:
   ```cmd
   node client.cjs
   ```
   *Alternatively, double-click the `run-client.bat` file in that folder.*
