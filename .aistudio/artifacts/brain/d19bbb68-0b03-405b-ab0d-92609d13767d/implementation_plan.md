# Implementation Plan: Reusable Campaign Teams, First-Class Campaign Architecture, Independent Collectors, Enhanced WhatsApp Reporting, and Comprehensive System Audit

## 1. Executive Summary & Strategic Approach
This enhancement establishes a multi-year campaign architecture for the **Life Skill Course Annual Calendar Camp Management Portal**. Each calendar camp operates as a distinct, first-class **Campaign** entity with a consistent unique ID, name, start and end dates, and lifecycle status (`upcoming`, `active`, `completed`, `archived`). Teams, stock allocations, collections, distributions, expenses, transfers, and reports are directly associated with their corresponding `campaignId`. 

Member accounts remain independent of any single team or campaign, allowing volunteers to participate in consecutive campaigns across years without duplicate accounts or losing historical performance records. Independent collectors operating outside of teams are supported as first-class field participants. The WhatsApp Report Builder is extended with team-only scoping, campaign context, and a "Show Top Collectors" ranking toggle. Finally, a complete application security audit, end-to-end verification, and pre-cleanup dry-run are executed.

---

## 2. First-Class Campaign Architecture & Data Models

### A. First-Class Campaign Entity (`server/models/Campaign.js`)
Each campaign is uniquely identified and tracks its operational timeframe:
- **`_id`**: MongoDB ObjectId (permanent primary key).
- **`campaignCode`**: Unique human-readable code (e.g. `CAMP-2026`, `CAMP-2027`).
- **`name`**: Campaign title (e.g., `"Life Skill Course — Calendar Camp 2026"`).
- **`startDate`**: Operational start date.
- **`endDate`**: Operational end date.
- **`status`**: Current status enum: `['upcoming', 'active', 'completed', 'archived']`.
- **Financial & Stock Configuration**:
  - `totalStock`: Central calendar quantity issued for this campaign.
  - `calendarPrice`: Standard price per calendar (default: ₹100).
  - `initialInvestment`: Initial capital invested.
  - `printingCost`: Total printing expenditure.
  - `defaultMemberTarget`: Default collection target per member (default: ₹25,000).
- **`isActive`**: Boolean flag indicating the currently active campaign.

### B. Foreign Key Linking Across Domain Models
Every operational record links to its originating campaign:
- **`Team`**: `campaignId: { type: ObjectId, ref: 'Campaign', index: true }`.
  - Teams belong to a specific campaign. When a new campaign starts, new teams can be formed while past campaign teams are marked `completed` or `archived`.
- **`StockAllocation`**: `campaignId: { type: ObjectId, ref: 'Campaign', index: true }`.
  - Ensures central-to-team and team-to-member stock balances reconcile strictly per campaign.
- **`Collection`**: `campaignId: { type: ObjectId, ref: 'Campaign', index: true }`, `teamId: { type: ObjectId, ref: 'Team', default: null, required: false }`.
  - Supports both team collections and independent collections linked to the active campaign.
- **`Distribution`**: `campaignId: { type: ObjectId, ref: 'Campaign', index: true }`, `teamId: { type: ObjectId, ref: 'Team', default: null, required: false }`.
- **`Expense`**: `campaignId: { type: ObjectId, ref: 'Campaign', index: true }`.
- **`MoneyTransfer`**: `campaignId: { type: ObjectId, ref: 'Campaign', index: true }`.

### C. Zero-Loss Data Migration & Compatibility Helper
- A startup migration routine ensures existing database records are backfilled:
  1. Checks for an active campaign; if none exists, creates the default `"Life Skill Course — Calendar Camp 2026"` (`campaignCode: 'CAMP-2026'`).
  2. Migrates existing `CampaignConfig` parameters (`totalStock`, `calendarPrice`, etc.) into the active `Campaign` document.
  3. Updates all unassigned historical teams, stock allocations, distributions, collections, expenses, and money transfers with the active `campaignId`.

---

## 3. Member Accounts & Team Decoupling

### A. Member Account Independence
- **Stable Identity**: Members (`User` model) retain permanent accounts across all campaigns (`_id`, `fullName`, `phone`, `username`, `profilePhoto`, `collectionTarget`).
- **Active Team Context**: `User.teamId` reflects the member's current active team assignment (`ObjectId | null`). When a campaign finishes or a team is archived, `teamId` is safely reset to `null`.
- **Independent Field Collectors**:
  - Members with `teamId: null` operate as independent collectors.
  - Independent status is clearly displayed as `"Independent Member / No Team"`.
  - Self-entered collections without a team are allowed and saved with `teamId: null` and the active `campaignId`.
  - Entries are routed directly to the **Super Admin & Usthad Approval Queue**.
  - Target tracking calculates progress toward the individual target (default ₹25,000) using only approved collections from the current campaign.

### B. Super Admin Team Management & Leadership Reorganization
- **Team Creation**: Super Admin creates teams assigned to the active `campaignId`.
- **Team Leadership Management**:
  - Super Admin can assign or change the Team Leader via `PUT /api/teams/:id/leader`.
  - When leadership changes, the previous leader is cleanly demoted to `team_member` without deleting their account or transactions, and the new leader is updated with `role: 'team_leader'`.
  - Global administrators (`super_admin`, `usthad`) never have their administrative roles altered during team assignments.
- **Safe Team Archival / Removal**:
  - `POST /api/teams/:id/archive`: Marks `team.isActive = false, team.isArchived = true, team.archivedAt = new Date()`.
  - Members in the team are detached (`teamId: null`), transitioning safely to the independent member state.
  - Historical records preserve their original `teamId` and `campaignId` for complete audit integrity.

### C. Fast Member Search & Assignment Autocomplete
- **`GET /api/users/search?q=...`**:
  - Search members by name, phone, or username.
  - Sanitized response includes: `_id`, `fullName`, `username`, `phone`, `role`, `profilePhoto`, `teamId`, `teamName`, and `isIndependent`.
  - Sensitive security attributes (`passwordHash`, `pinHash`, `passwordHint`, `pinHint`, tokens) are strictly omitted.
  - Debounced frontend component displays member cards with avatars and current assignment badge.
  - Distinct **"+ Create New User"** workflow if the member does not exist.

---

## 4. WhatsApp Report Builder Enhancements

Preserving all existing report formats and manual sharing mechanisms, the report builder is extended with:
1. **Campaign Context in Header & Metadata**:
   - Displays the active campaign name and year in report headers and JSON metadata.
2. **Team-wise Member Filter**:
   - Checkbox labelled: `"Team-wise Report / Selected Team Members Only"`.
   - When enabled, excludes all unrelated teams and independent members, filtering calculations strictly to members of the selected team for the chosen campaign.
   - Enforces RBAC: Team Leaders are restricted to their assigned team; Super Admin/Usthad can view any team or campaign-wide totals.
3. **Top Collectors Toggle**:
   - Switch labelled: `"Show Top Collectors"`.
   - When enabled, aggregates approved collections per member for the reporting timeframe, sorts descending, assigns competition badges/ranks (🥇 1st, 🥈 2nd, 🥉 3rd...), and outputs achieved collection, target, percentage, and remaining amount.
   - Ties share rank; subsequent ranks skip appropriately.
   - When disabled, omits the ranking section while retaining standard team and summary sections.

---

## 5. System Audit, Verification & Dry-Run Plan

### A. Functional & Security Verification
- Audit authentication, RBAC, session expiry, and CSRF/CORS posture.
- Verify central, team, and member stock reconciliation: $\text{Total Stock} = \text{Central Stock} + \text{Team Stock} + \text{Member Stock} + \text{Sold/Distributed}$.
- Ensure independent member entries reach Super Admin/Usthad approval queues and update financial metrics upon approval.
- Ensure all historical queries filter by `campaignId` to prevent data pollution across repeated campaigns.

### B. Mandatory Test Suite (15 Scenarios)
1. Team creation with existing member assignment via search.
2. Account reuse verification (no duplicate accounts created).
3. Create New User workflow.
4. Team Leader replacement and former leader account retention.
5. Team archival and safe member detachment to independent state.
6. Independent member dashboard rendering ("Independent Member / No Team").
7. Independent member collection submission and Super Admin/Usthad approval.
8. Independent member ₹25,000 collection target and percentage calculation.
9. Campaign creation with isolated stock and transactions linked to `campaignId`.
10. Historical report verification linked to previous campaign IDs.
11. Selected Team Members Only WhatsApp report filtering.
12. Show Top Collectors descending ranking and medal formatting.
13. Show Top Collectors disabled omission verification.
14. Preservation of all existing WhatsApp report sections and sharing actions.
15. Backend authorization, RBAC boundary enforcement, and error handling.

### C. Pre-Cleanup Dry-Run Report (Phase 6)
- Detailed audit inventory presented in chat classifying demo/sandbox records vs real data.
- The designated Super Admin account (`username: admin`) and its credentials are strictly preserved.
- Destructive cleanup is gated until explicit confirmation is provided.

---

## 6. Implementation Steps
1. Create `server/models/Campaign.js` and add `campaignId` to `Team.js`, `Collection.js`, `Distribution.js`, `StockAllocation.js`, `Expense.js`, and `MoneyTransfer.js`.
2. Implement campaign management routes (`/api/campaigns`) and database migration helper.
3. Update `server/routes/teams.js` with archival, leader assignment, and member management.
4. Implement member search in `server/routes/users.js`.
5. Update `server/routes/collections.js` and `server/routes/distributions.js` for independent collectors (`teamId: null`).
6. Update `server/routes/reports.js` and `server/utils/whatsappReports.js` with campaign scoping, team-only filter, and Top Collectors ranking.
7. Update frontend pages (`Teams.js`, `Dashboard.js`, `Reports.js`, `Profile.js`, `Settings.js`) with responsive UI and autocomplete.
8. Run automated tests, compile applet, and present full audit report.
