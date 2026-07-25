# Campus Print

> A centralized campus printing management system that streamlines the complete document printing workflow between students, administrators, and campus printers.

![Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![Backend](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-green)
![Frontend](https://img.shields.io/badge/Frontend-React%20%7C%20TypeScript-blue)
![Desktop Agent](https://img.shields.io/badge/Desktop%20Agent-Windows-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

# Overview

Campus Print is a full-stack print management system designed for educational institutions to simplify and automate campus printing.

Instead of relying on USB drives, email attachments, or manual file transfers, students can securely upload PDF documents through a web portal. Administrators review and approve print requests, while a Windows Desktop Agent automatically retrieves approved jobs and sends them to the appropriate campus printer.

The system provides complete visibility into the printing workflow, ensuring reliability, accountability, and centralized management of print operations.

---

# Key Features

## Student Portal

- Secure authentication
- Upload PDF documents
- Track print request status
- View print history
- Simple and responsive interface

## Admin Portal

- Manage print requests
- Approve or reject print jobs
- Configure printers
- Enable Maintenance Mode
- Monitor Desktop Agent status
- View system dashboard

## Desktop Agent

- Automatic backend registration
- Periodic heartbeat monitoring
- Printer discovery
- Automatic print job retrieval
- Silent PDF printing
- Print completion reporting
- Runtime logging and diagnostics

---

# System Overview

```text
                 Student Portal
                        │
                        ▼
               Express Backend API
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
     JSON Database            Desktop Agent
                                      │
                                      ▼
                              Windows Printer
```

The backend acts as the central coordinator between the web applications, database, and Desktop Agent. Approved print jobs are automatically delivered to the Desktop Agent, which handles communication with local printers.

---

# Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Frontend | React, TypeScript |
| Desktop Agent | Node.js |
| Database | JSON-based storage |
| Printing Engine | SumatraPDF |
| Networking | Cloudflare Tunnel |
| Authentication | JWT |

---

# Project Structure

```text
Campus Print
│
├── backend/             Express backend server
├── admin-portal/        Administrator web application
├── student-portal/      Student web application
├── desktop-agent/       Windows Desktop Agent
├── docs/                Project documentation
└── installer/           Desktop Agent installer
```

---

# Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd campus-print
```

### 2. Install dependencies

Install dependencies for the backend, portals, and Desktop Agent.

```bash
npm install
```

### 3. Configure environment variables

Create the required environment configuration.

> Detailed configuration instructions are available in the Installation & Deployment guide.

### 4. Start the backend

```bash
npm start
```

### 5. Start the web applications

Run the Student Portal and Admin Portal.

### 6. Install the Desktop Agent

Install the Windows Desktop Agent on the machine connected to the printer.

---

# Documentation

Detailed documentation is available in the `docs/` directory.

| Document | Description |
|----------|-------------|
| 01-System-Architecture.md | Overall system architecture and communication flow |
| 02-Backend.md | Backend design and implementation |
| 03-Desktop-Agent.md | Desktop Agent architecture and workflow |
| 04-API-Reference.md | REST API documentation |
| 05-Installation-and-Deployment.md | Development and production setup |
| 06-Database.md | Database structure and data model |
| 07-Developer-Guide.md | Development guidelines and project structure |
| 08-Testing-and-Validation.md | Testing strategy and validation results |

---

# Project Status

| Module | Status |
|---------|--------|
| Backend | ✅ Complete |
| Student Portal | ✅ Complete |
| Admin Portal | ✅ Complete |
| Desktop Agent | ✅ Complete |
| Authentication | ✅ Complete |
| Print Workflow | ✅ Complete |
| Queue Management | ✅ Complete |
| Printer Management | ✅ Complete |
| Documentation | 🚧 In Progress |
| Frontend Redesign | 🚧 In Progress |

---

# Future Improvements

Potential future enhancements include:

- Email notifications
- Print analytics and reporting
- Mobile-friendly interface
- Multi-printer load balancing
- Automatic Desktop Agent updates
- Enhanced administrative reporting

---

# Contributing

Contributions, bug reports, and feature suggestions are welcome.

Please refer to the **Developer Guide** for coding standards, project structure, and contribution guidelines.

---

# License

This project is licensed under the MIT License.