# Life Skill Course — Web Application

> **Annual Calendar Camp Management Application**  
> **Markazul Hidayathil Islamiyya**, Kombam, Kodakkad (PO), Mannarkkad, Palakkad.

---

## 🌟 Overview

**Life Skill Course** is a production-oriented, mobile-first, full-stack Progressive Web App (PWA) built specifically for participants and leaders conducting the annual Calendar Camp.

The system is designed for constrained field conditions (low-end Android devices with 4GB RAM, weak 3G networks, and intermittent or completely offline connectivity).

---

## 🚀 100% Free Infrastructure Architecture

| Component | Technology | Free Tier Provider & Limits |
|-----------|-----------|-----------------------------|
| **Database** | MongoDB Atlas (M0 Cluster) | **Free forever**, 512 MB storage, shared RAM, automated backups |
| **Media & Photos** | **Cloudinary** | **Free tier (25 monthly credits)**, automatic face detection & CDN delivery |
| **Backend API** | Node.js + Express.js | **Render.com** (Free Web Service - 750 hrs/month) |
| **Real-Time** | Socket.io | Included with backend server |
| **Frontend UI** | Preact + HTM (CDN) | Served directly from Express static root |
| **Offline Storage** | IndexedDB + Service Worker | Client-side in-browser storage (zero cost) |
| **Reports** | SheetJS (XLSX) & jsPDF | Client-side compilation (zero cost) |

> ⚠️ **Zero Paid APIs**: No paid SMS, no paid WhatsApp Business API, no paid image CDN. WhatsApp sharing opens pre-filled messages directly in the user's WhatsApp application.

---

## 👥 Role-Based Access Control (RBAC)

1. **Super Admin**:
   - Manage all user accounts, teams, and members.
   - Configure campaign stock, calendar pricing, printing expenses, and investments.
   - Allocate stock to teams.
   - Confirm and verify money transfers.
   - View complete financial summary and reconcile profit/loss.
   - Consolidate duplicate area names.
   - Generate campaign-wide reports and Excel exports.

2. **Usthad / Supervisor**:
   - View all teams, members, and operational records.
   - Confirm money transfers from members and teams.
   - Review flagged entries and disputed transfers.
   - View campaign rankings, performance, and financial reports.

3. **Team Leader**:
   - Scoped strictly to their assigned team.
   - View team stock and allocate calendars to team members.
   - Review members' distributions, collections, and handovers.
   - Flag incorrect entries for review and request corrections.
   - View member-level progress bars and team-specific summaries.

4. **Team Member**:
   - Record calendar distributions and money collections with offline queuing.
   - Record handovers of collected funds.
   - Add new visited areas/localities.
   - View personal allocation, remaining calendars, and sync status.
   - Optional donor thank-you WhatsApp message generator.

### Sign-in options

The login screen supports both **phone number + 6-digit PIN** and **username + password**. Super Admins can create Usthad accounts from **Members → New User** and set a phone number and PIN during account creation. Usthad users can change their PIN in **Settings** after signing in with their password. PINs and passwords are stored as password hashes; neither credential is returned by the API.

Phone/PIN sign-in is enabled for Usthad accounts. Other roles continue to use username/password unless a separate account authentication policy is introduced.

---

## ⚡ Mandatory Offline & Sync Workflow

```
[User submits distribution/collection]
               │
      Is device online?
         /          \
       YES           NO
        │             │
   POST /api/...   Save to IndexedDB with unique `clientId`
        │             │
 central figure    Update pending sync badge in Navbar
  auto-updated        │
                      ▼
             Connection restored?
                      │
           Auto-triggers `syncAll()`
                      │
           POST /api/sync/push
         (Idempotent via clientId)
                      │
           Remove synced entries from DB
```

---

## 🛠️ Local Development & Setup

### 1. Prerequisites
- **Node.js** (v18.x or v20.x LTS)
- **MongoDB Atlas** free cluster connection string

### 2. Configuration
Copy the example environment file:
```bash
cp .env.example .env
```
Edit `.env` with your MongoDB connection string and JWT secret:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/life-skill-course?retryWrites=true&w=majority
JWT_SECRET=super-secret-jwt-key-2026
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Server
```bash
npm start
```
The application will be live at `http://localhost:3000`.

### 5. Default Credentials
On first boot, the server automatically initializes:
- **Username**: `admin`
- **Password**: `admin123`
*(Please change this password immediately in Settings after first login)*

---

## ☁️ Free Cloud Deployment (Render.com + MongoDB Atlas)

1. Push this repository to GitHub or GitLab.
2. Sign in to [Render.com](https://render.com) (free).
3. Click **New +** -> **Web Service**.
4. Connect your repository.
5. Set the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. Add Environment Variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: A long random secret key
   - `NODE_ENV`: `production`
   - `CLOUDINARY_URL`: `cloudinary://<api_key>:<api_secret>@<cloud_name>`
   - `CLOUDINARY_CLOUD_NAME`: `bhlwt5m9`
   - `CLOUDINARY_API_KEY`: `681148252944323`
   - `CLOUDINARY_API_SECRET`: `ZkP5e7DSjh2dcLSAXcKwwF7lYnU`
7. Click **Create Web Service**. Your app is live with SSL (`https://your-app.onrender.com`).
