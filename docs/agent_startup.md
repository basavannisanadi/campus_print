# Campus Print Hub - Windows Agent Lifecycle Documentation

This document describes the design, execution, and communication flow of the Windows Print Client Agent (`print-client/client.cjs`).

---

## 1. Agent Startup Sequence
When the Windows Agent daemon starts up, it executes the following steps:
1. **Load Configuration:** Reads configuration parameters from local file `print-client/config.json`, including the target Express backend URL, `shopId`, and `agentToken`.
2. **Initialize File System:** Validates and creates local directories for temporary files and print cache.
3. **Register Agent:** Communicates with the server to register its current execution instance name, machine name, and daemon version.
4. **Trigger Printer Scan:** Initiates the local printer discovery sequence.

---

## 2. Printer Discovery
The agent queries the local operating system to discover attached printers:
* **Mechanism:** Queries Windows Management Instrumentation (WMI) via PowerShell/command utility (`Get-CimInstance Win32_Printer` or equivalent script commands).
* **Information Gathered:** Discovers printer names, IDs, statuses, and capability states.
* **Payload Generation:** Compiles a string array of discovered printer names to upload back to the server.

---

## 3. Registration Process
The agent registers with the central backend server to establish a session:
* **Endpoint:** `POST /api/agent/register`
* **Registration Payload:**
  * `agentId`: Unique agent identifier.
  * `shopId`: Configured print shop ID.
  * `machineName`: Current host name.
  * `daemonVersion`: Software version version string.
* **Response:** Session verification confirming registration.

---

## 4. Authentication
To authorize requests:
* All requests sent from the print client to the server include the `Authorization` header with the configured security token (`agentToken`).
* Endpoints verifying this token gate access to ensure only authorized agents can claim jobs or report statuses.

---

## 5. Heartbeat & Online State
To maintain connection status without heavy database overhead:
* **Heartbeat Endpoint:** `POST /api/agent/heartbeat`
* **Frequency:** Triggers automatically every 15 seconds.
* **Payload:** Updates last seen timestamp, active printer name, and optionally reports the scanned printer list.
* **In-Memory Tracking:** The server stores heartbeat timestamps in memory to compute connection staleness (agent is considered offline if no heartbeat is received for > 60 seconds). This avoids writing transient metrics to db files.

---

## 6. Printer Mapping Process
How jobs are matched to physical print hardware:
* **Configuration:** Shop admins use the Web Admin Portal to map the B&W and Color operations to specific printer names discovered by the agent.
* **Mapping Query:** The agent calls `GET /api/printers/mapping` to fetch current settings.
* **Pre-Claim Guard:** Before claiming queued print jobs, the agent validates that active mappings (`bwPrinterName` and `colorPrinterName`) are configured. If they are missing, it pauses polling to prevent claiming jobs it cannot print.
* **Execution:** SumatraPDF prints the job using the dynamically resolved printer name:
  `SumatraPDF.exe -print-to "${resolvedPrinterName}"`
