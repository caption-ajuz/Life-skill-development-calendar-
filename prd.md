# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Life Skill Course — Annual Calendar Camp Management System

**Version:** 1.0  
**Document Type:** Complete Product Requirements Document  
**Platform:** Mobile-first Web Application / Progressive Web App (PWA)  
**Primary Users:** Super Admin, Usthad/Supervisor, Team Leaders, Team Members  
**Core Priority:** Accurate financial records, simple operation, offline support, and excellent performance on low-end Android phones and slow 3G networks.

---

# 1. Product Overview

## 1.1 Product Name

**Life Skill Course**

## 1.2 Product Purpose

Life Skill Course is a full-stack digital management system for managing the annual calendar camp conducted by Markazul Hidayathil Islamiyya.

During the camp, approximately 100 participants distribute or sell calendars across different areas, collect payments, manage allocated stock, and hand over collected money to the responsible authorities.

The application must replace manual registers, disconnected spreadsheets, and informal reporting with a centralized, reliable, transparent, and easy-to-use system.

## 1.3 Main Objectives

1. Manage all participants, teams, and team leaders.
2. Track calendar stock allocated to teams and individual members.
3. Record calendar distribution, sales, and collections.
4. Record visited areas and identify duplicate area names.
5. Track money handovers and require authorized confirmation.
6. Monitor team-wise and member-wise progress.
7. Provide campaign-wide financial visibility to authorized users only.
8. Generate Excel, PDF, and WhatsApp-ready reports.
9. Support offline data entry and synchronization.
10. Deliver a fast, lightweight experience on low-end Android phones and unstable mobile internet.
11. Maintain an audit trail for financial and operational changes.
12. Use only services with a suitable free tier, after checking their current terms and limits.

## 1.4 Non-Goals

The initial version will not include:

- Job or task management.
- Continuous GPS tracking.
- Automatic WhatsApp message sending through a paid API.
- A dedicated accountant/cashier role.
- A separate read-only viewer role.
- Unnecessary social features, chat systems, or decorative animations.

---

# 2. Target Users and Usage Environment

The system will support approximately 100 participants, with the possibility of growth.

The primary device will be an Android smartphone, including low-end devices with approximately 4 GB RAM.

The application must work under the following conditions:

- Slow 3G internet.
- High latency.
- Intermittent internet connectivity.
- Temporary network disconnection.
- Repeated submissions caused by slow responses.
- Limited device storage.
- Users with basic digital skills.

The interface must use simple language, clear buttons, readable text, and minimal steps for common activities.

---

# 3. User Roles and Permissions

The system must implement role-based access control (RBAC). Permissions must be enforced on the server, not merely by hiding frontend buttons.

## 3.1 Super Admin

The Super Admin has complete administrative control.

Permissions:

- Create, edit, deactivate, and manage user accounts.
- Assign roles and team memberships.
- Create and manage teams.
- Assign team leaders.
- Manage campaign settings.
- Allocate stock to teams.
- View and manage all stock allocations.
- View all members' distribution and collection records.
- View all areas and operational statistics.
- View initial investment, printing costs, other expenses, collections, and overall financial summaries.
- Confirm money transfers.
- Flag, correct, or authorize corrections to records according to policy.
- View audit logs.
- Generate all reports.
- Export Excel and PDF reports.
- Manage the campaign's opening and closing dates.
- Review synchronization errors and unresolved discrepancies.

## 3.2 Usthad / Supervisor

The Usthad/Supervisor is responsible for overall supervision and financial oversight.

Permissions:

- View all teams and team members.
- View all stock allocations and operational records.
- View campaign-wide collections and financial information.
- View initial investment, printing costs, expenses, and other campaign-wide financial figures.
- Confirm money transfers.
- Review flagged entries and correction requests.
- View team rankings and overall progress.
- Generate permitted reports.
- View relevant audit history.

Restrictions:

- Cannot create or delete user accounts.
- Cannot assign or change user roles.
- Cannot change system-wide security settings unless separately authorized.

## 3.3 Team Leader

A Team Leader manages only their assigned team or teams.

Permissions:

- View their team's members.
- View team stock and individual member stock.
- Allocate calendars from the team's available stock to members.
- View member-wise distribution and collection totals.
- View area-wise progress.
- Review discrepancies and flag suspicious or incorrect entries.
- Request corrections with a reason.
- View their team's relevant financial and handover information.
- Generate team-level reports.
- Monitor team rankings and progress.

Restrictions:

- Cannot access campaign-wide initial investment, printing costs, or complete financial statements.
- Cannot confirm their own money handovers as an authorized financial confirmation.
- Cannot modify records belonging to unrelated teams.
- Cannot silently overwrite or delete historical records.

## 3.4 Team Member

A Team Member can access their own records and the information specifically permitted for their team.

Permissions:

- View and update their permitted profile information.
- Upload or change their profile photo.
- View their own stock allocation.
- Record calendars distributed or sold.
- Record money collected.
- Record visited areas.
- View their own progress and relevant team statistics.
- View their own transfer and confirmation status.
- Submit corrections or explain discrepancies.
- Use offline entry when internet access is unavailable.

Restrictions:

- Cannot access campaign-wide confidential finances.
- Cannot allocate stock to other teams.
- Cannot confirm money transfers.
- Cannot edit another member's records without explicit authorization.

## 3.5 Permission Matrix

| Feature | Super Admin | Usthad | Team Leader | Team Member |
|---|---|---|---|---|
| Manage users and roles | Full | No | No | No |
| View all teams | Yes | Yes | No | No |
| Manage team members | All teams | View | Own team | Own profile |
| Allocate team stock | Yes | View | Own team | No |
| Allocate member stock | Yes | View | Own team | No |
| Enter distribution records | Yes | As permitted | Own team, if needed | Own records |
| View own/team progress | Yes | Yes | Own team | Own progress |
| View campaign-wide finance | Yes | Yes | No | No |
| Confirm money transfers | Yes | Yes | No | No |
| Flag/request correction | Yes | Yes | Own team | Own records |
| Export all reports | Yes | Yes, permitted | Own team | Own records, if enabled |
| View audit logs | Full | Relevant logs | Team-relevant logs | Own relevant status |

---

# 4. Authentication and Account Security

The application must use individual user accounts.

Requirements:

1. Secure login and logout.
2. Server-side authorization on every protected operation.
3. Secure password hashing.
4. Session expiry and secure session handling.
5. Login rate limiting and basic abuse protection.
6. No passwords, API secrets, or database credentials in frontend code.
7. No shared universal PIN used as a substitute for individual accounts.
8. Account deactivation must prevent further access.
9. Important administrative and financial actions must be recorded in the audit log.
10. Data belonging to one team must not be exposed to another team through direct API requests.

A simple login interface should be optimized for mobile devices and weak networks.

---

# 5. Team and Member Management

The Super Admin must be able to:

- Create teams.
- Rename or deactivate teams.
- Assign a Team Leader.
- Add members to teams.
- Move members between teams with appropriate history.
- View member lists.
- Search members by name.
- Filter members by team.
- View each member's profile photo and basic information.
- View member activity and stock summaries.

Member profile information should include only fields required for the campaign, such as name, contact number where needed, team, role, and profile photo.

Profile photos must be compressed and resized before upload whenever practical. The app should use small thumbnails in lists and load full-size images only when necessary.

---

# 6. Calendar Stock Management

## 6.1 Stock Allocation Model

The system must use a hybrid stock model:

**Campaign stock → Team stock → Individual member stock**

The Super Admin allocates stock to teams. Team Leaders allocate available team stock to individual members.

The system must maintain an accurate stock ledger.

## 6.2 Required Stock Information

For each allocation, record:

- Calendar type or edition, if multiple types exist.
- Quantity.
- Source and destination.
- Allocation date and time.
- Person making the allocation.
- Relevant team and member.
- Notes, where necessary.
- Offline/synchronization status, where applicable.

## 6.3 Stock Calculations

The system must calculate:

- Total campaign stock.
- Stock allocated to each team.
- Stock allocated to each member.
- Remaining team stock.
- Remaining member stock.
- Calendars distributed or sold.
- Returned or damaged calendars, if such records are enabled.
- Unexplained stock differences.

No allocation may reduce available stock below zero.

Concurrent submissions must not result in the same stock being allocated twice.

## 6.4 Stock Reconciliation

The application must provide a clear reconciliation view showing:

- Opening stock.
- Stock received.
- Stock allocated.
- Stock distributed or sold.
- Stock returned, if applicable.
- Closing stock.
- Difference requiring investigation.

The system must distinguish a genuine stock difference from a record that has not yet synchronized.

---

# 7. Distribution and Collection Records

## 7.1 Member Entry Form

The member entry form must be short and mobile-friendly.

Fields may include:

- Date and time.
- Member.
- Team.
- Area.
- Number of calendars distributed or sold.
- Amount collected.
- Payment or collection notes, if needed.

The logged-in member and team should be prefilled wherever possible.

Numeric fields must use suitable mobile input types.

## 7.2 Automatic Inclusion in Operational Totals

Member entries must automatically become part of the operational totals after successful server acceptance and validation.

Routine Team Leader approval is not required for every entry.

However, an entry may later be flagged for correction or investigation.

The interface must distinguish:

- Saved locally.
- Waiting to synchronize.
- Synchronized successfully.
- Included in operational totals.
- Flagged for correction.
- Correction requested.
- Corrected or resolved.

**Synchronization is not the same as approval or financial confirmation.**

Offline records must not be presented as confirmed server records until the server has received and accepted them.

## 7.3 Editing and Corrections

The system must not silently overwrite or delete important historical records.

For corrections, store:

- Original value.
- Corrected value.
- Person requesting or making the change.
- Date and time.
- Reason for correction.
- Person authorizing the correction, if required by policy.

Team Leaders can flag errors and request corrections. Authorized users can review and resolve them.

Duplicate submissions must be prevented through unique client-generated identifiers and server-side idempotency checks.

---

# 8. Area Management

Members must be able to record the areas they visit.

Requirements:

- Search existing areas before adding a new one.
- Allow members to propose or add a new area.
- Link area visits to the member, team, and date.
- Display area-wise distribution and collection statistics.
- Filter reports by area.
- Detect likely duplicate names.
- Support aliases or alternative spellings where appropriate.
- Allow authorized users to merge duplicate area records while preserving historical references.

Example: “Mannarkkad,” “Mannarkad,” and a locally used spelling may refer to the same place. The system should help authorized users normalize such entries without automatically merging unrelated places.

GPS tracking is not required for the first version.

---

# 9. Money Collection and Handover Management

This is a critical financial feature.

## 9.1 Collection Records

Every collection record should include:

- Collection ID.
- Member who recorded it.
- Team.
- Amount.
- Date and time.
- Related distribution entry, where applicable.
- Payment method, if relevant.
- Notes or reference.
- Synchronization status.

The application must distinguish money collected from money handed over.

## 9.2 Money Transfer / Handover

A money handover record must include:

- Transfer ID.
- Amount handed over.
- Person handing over the money.
- Person receiving the money.
- Date and time.
- Related collection records, where appropriate.
- Transfer status.
- Confirmation by an authorized person.
- Confirmation date and time.
- Notes or discrepancy details.

## 9.3 Confirmation Workflow

A handover must not be considered confirmed merely because a member or Team Leader records it.

Only the Super Admin or Usthad/Supervisor can confirm a transfer.

Possible statuses:

1. Draft or locally saved.
2. Pending synchronization.
3. Submitted for confirmation.
4. Confirmed.
5. Flagged for discrepancy.
6. Correction required.
7. Cancelled with an auditable reason, if cancellation is permitted.

Only an authorized confirmation changes the transfer to **Confirmed**.

A confirmed transfer must not be silently edited. Any correction must follow an auditable reversal or adjustment process.

## 9.4 Financial Integrity

The system must:

- Prevent double-counting collections and transfers.
- Treat transfers as movement of already collected money, not new income.
- Keep collection totals separate from handover totals.
- Identify unhanded-over balances.
- Identify pending confirmations.
- Identify discrepancies between reported collections and confirmed handovers.
- Avoid counting the same record twice during synchronization.

---

# 10. Campaign-Wide Financial Management

Only the Super Admin and Usthad/Supervisor can view complete campaign-wide financial information.

## 10.1 Financial Entries

Authorized users must be able to record:

- Initial investment.
- Calendar printing costs.
- Other campaign expenses.
- Additional approved income, if applicable.
- Adjustments and corrections with reasons.

Each financial entry should include an amount, category, date, description, creator, and audit history.

## 10.2 Financial Dashboard

The dashboard must display:

- Initial investment.
- Total printing cost.
- Total other expenses.
- Total recorded collections.
- Total confirmed handovers.
- Pending handovers.
- Unhanded-over collection balance.
- Other recorded income, if any.
- Net campaign result, calculated from clearly defined categories.

## 10.3 Definitions

The application must not use “profit” as a synonym for money collected.

At minimum, distinguish:

- **Total collections:** Money recorded as collected.
- **Confirmed handovers:** Money confirmed as received by the authorized recipient.
- **Outstanding handover balance:** Collected money not yet accounted for through confirmed handovers, subject to the campaign's accounting rules.
- **Total expenses:** Recorded printing costs and other expenses.
- **Net result:** Calculated only from the explicitly configured income and expense categories.

The accounting model must be finalized before implementation so that initial investment, sales revenue, transfers, and expenses are not double-counted.

Team Leaders and Team Members must not see confidential campaign-wide expense or net-result figures. They may see their own or team-level operational figures according to their permissions.

---

# 11. Dashboard and Analytics

The dashboard must show useful information without loading the entire database into the browser.

## 11.1 Super Admin Dashboard

- Total teams.
- Total participants.
- Total allocated stock.
- Remaining stock.
- Total distribution/sales.
- Total recorded collections.
- Confirmed and pending handovers.
- Campaign-wide financial summary.
- Team rankings.
- Member rankings.
- Area-wise progress.
- Recent activity and flagged records.

## 11.2 Usthad/Supervisor Dashboard

- Overall campaign progress.
- Team and member performance.
- Stock summaries.
- Collection and handover status.
- Campaign-wide financial information.
- Pending confirmations.
- Errors and unresolved discrepancies.

## 11.3 Team Leader Dashboard

- Own team's performance.
- Member-wise progress.
- Team stock and member stock.
- Collections and relevant handovers.
- Areas visited.
- Entries flagged for correction.
- Team ranking and daily progress.

## 11.4 Team Member Dashboard

- Personal stock.
- Personal distribution/sales.
- Personal collections.
- Personal handover status.
- Areas visited.
- Daily and cumulative progress.
- Pending offline entries and synchronization status.

## 11.5 Filters

Reports and dashboards should support relevant combinations of:

- Date range.
- Today.
- Campaign-to-date.
- Team.
- Member.
- Area.
- Record status.

The application must use server-side filtering and aggregation for large datasets wherever appropriate.

Rankings must use clearly documented metrics. Users must be able to distinguish daily rankings from cumulative rankings.

---

# 12. Reports and Export

## 12.1 Excel Reports

The system must support Excel-compatible `.xlsx` exports.

Possible reports:

- Complete member list.
- Team-wise member list.
- Team-wise stock allocation.
- Member-wise stock allocation.
- Distribution/sales report.
- Collection report.
- Area-wise report.
- Money handover report.
- Pending confirmation report.
- Campaign financial report.
- Daily summary.
- Campaign-to-date summary.
- Correction and audit report, restricted by role.

Exports must respect role-based permissions.

## 12.2 PDF Reports

The system must generate readable PDF reports suitable for printing and sharing.

Reports should include:

- Report title.
- Campaign name.
- Date range.
- Generation date.
- Relevant team/member/area filters.
- Clearly labeled totals.
- Page numbers where appropriate.

For Malayalam or Arabic content, the PDF generation process must use fonts that correctly support the required scripts.

## 12.3 WhatsApp-Ready Reports

The application must generate concise, formatted text that users can copy or open in WhatsApp for manual sending.

Example:

**Life Skill Course — Daily Summary**

Date: [Selected Date]

Team: [Team Name]

- Calendars distributed: [Quantity]
- Amount collected: ₹[Amount]
- Amount handed over: ₹[Amount]
- Pending handover: ₹[Amount]
- Areas visited: [Count]

This is a manually shareable summary, not an automatically verified receipt.

The user should be able to copy the text or open WhatsApp with a prefilled message where supported.

No paid WhatsApp API is required.

---

# 13. Optional Thank-You Message

Provide an optional setting for a thank-you message to a person who contributes or pays.

Requirements:

- The feature must be enabled or disabled by an authorized user.
- When enabled, the relevant form may request the person's phone number.
- The user must be able to review the message before opening WhatsApp.
- Use a manually initiated WhatsApp link or share flow.
- Do not send messages automatically.
- Do not require a paid messaging API.
- Do not treat a thank-you message as proof of payment.
- Avoid collecting phone numbers when the feature is disabled or unnecessary.

The final message wording must be configurable or easy to edit.

---

# 14. Offline-First Progressive Web App

Offline support is mandatory.

The application must be installable as a PWA where supported.

## 14.1 Offline Features

When internet is unavailable, users should still be able to:

- Open the previously loaded application shell.
- View relevant cached information where safe.
- Create permitted distribution and collection entries.
- Record area visits.
- View pending offline entries.
- See whether records are waiting to synchronize.

Sensitive information should not be cached unnecessarily on shared devices.

## 14.2 Technical Requirements

- Service worker for application-shell caching.
- IndexedDB for queued local records.
- Unique client-generated IDs for offline records.
- A reliable synchronization queue.
- Retry handling for temporary failures.
- Duplicate-submission prevention.
- Conflict detection and resolution.
- Clear pending, synchronized, and failed statuses.
- A manual retry option for failed synchronization.
- Protection against losing unsaved form data when a request fails.

## 14.3 Synchronization Rules

When the connection returns:

1. Detect connectivity and attempt synchronization.
2. Send queued records in a safe, controlled manner.
3. Validate records on the server.
4. Use idempotency checks to prevent duplicates.
5. Return the server's authoritative result.
6. Update local synchronization status.
7. Refresh affected summaries without discarding unsaved user input.
8. Present actionable errors when a record cannot be synchronized.

The system must not claim that offline data has been received by other users before successful synchronization.

If two users make conflicting changes, the system must not silently choose an arbitrary value. Financial and stock conflicts require explicit resolution.

---

# 15. Real-Time Updates

The application should support real-time updates where feasible.

Preferred approach:

- WebSocket or another suitable real-time mechanism if it is compatible with the selected free-tier infrastructure.
- Otherwise, lightweight polling of relevant changes.

Polling requirements:

- Fetch only changed or necessary data.
- Do not reload the entire page.
- Do not interrupt data entry.
- Do not erase unsaved forms.
- Use sensible intervals and backoff.
- Reduce or pause polling when the app is offline or the tab is hidden.
- Avoid excessive requests that exhaust free-tier limits.

Real-time updates are a convenience, not a substitute for server-side validation or synchronization.

---

# 16. Mobile Performance and Low-Network Optimization

Performance is a core product requirement, not a later enhancement.

## 16.1 Target Devices

The application should remain usable on:

- Low-end Android phones.
- Devices with approximately 4 GB RAM.
- Older mobile browsers.
- Slow 3G connections.
- Unstable connections with repeated disconnections.

## 16.2 Frontend Requirements

- Mobile-first responsive design.
- Lightweight JavaScript bundles.
- Code splitting and lazy loading.
- Load heavy report/export functionality only when requested.
- Avoid unnecessary libraries.
- Avoid large animation frameworks.
- Avoid expensive background computations.
- Use pagination or incremental loading for lists.
- Avoid loading every member, entry, and photo at once.
- Preserve entered form data during network failures.
- Prevent accidental duplicate submissions.
- Use clear loading, success, and error states.
- Use accessible touch targets and readable text.
- Minimize the number of taps required for common entries.

## 16.3 Network Requirements

- Minimize unnecessary API calls.
- Use compressed responses where supported.
- Request only necessary fields.
- Use pagination and server-side filtering.
- Use cache headers and conditional requests where appropriate.
- Retry temporary failures with exponential backoff.
- Avoid repeatedly downloading unchanged data.
- Avoid blocking the main interface while nonessential data loads.

## 16.4 Image Optimization

- Resize and compress profile photos before upload where possible.
- Generate small thumbnails for member lists.
- Use modern image formats when supported.
- Lazy-load images.
- Limit image upload size and validate file types.
- Avoid loading full-resolution photos into list views.
- Use a free storage option only after verifying its current limits and terms.

## 16.5 Performance Targets

Treat these as engineering targets to measure under representative test conditions, not unconditional guarantees:

- Initial compressed JavaScript: aim for approximately 200 KB or less where feasible.
- Largest Contentful Paint: 2.5 seconds or less under suitable test conditions.
- Interaction to Next Paint: 200 milliseconds or less.
- Cumulative Layout Shift: 0.1 or less.
- Common forms should remain responsive while network requests are pending.
- A network interruption must not silently discard entered data.

Record actual results on representative low-end devices and throttled networks.

---

# 17. Database and Backend Architecture

The application must use a real backend and persistent database.

A frontend-only mockup or browser-only database is not an acceptable final solution.

The architecture should be simple, maintainable, secure, and suitable for the campaign's size.

## 17.1 Suggested Data Entities

The developer should evaluate and design the final schema for:

1. Users.
2. Roles and permissions.
3. Teams.
4. Team memberships.
5. Campaigns and campaign settings.
6. Calendar types or editions, if required.
7. Stock allocations.
8. Distribution/sales entries.
9. Collection entries.
10. Areas.
11. Area visits.
12. Money transfers and confirmations.
13. Expenses and initial investment.
14. Correction requests.
15. Audit logs.
16. Synchronization/idempotency records.

Related records must use stable identifiers and appropriate database constraints.

## 17.2 Data Integrity

- Use database transactions for critical stock and financial operations.
- Validate quantities and amounts on the server.
- Use decimal-safe money handling; do not rely on floating-point arithmetic for financial calculations.
- Store timestamps consistently and display them in the appropriate local time zone.
- Preserve audit history.
- Add suitable indexes for commonly filtered fields.
- Use server-side aggregation for summaries.
- Avoid duplicate records during retries.
- Define deletion, deactivation, and correction policies explicitly.

## 17.3 Architecture Proposal Before Coding

Before implementation, the developer or AI coding tool must provide:

- Proposed frontend framework.
- Backend and API architecture.
- Database choice.
- Authentication strategy.
- PWA and offline synchronization design.
- Real-time update strategy.
- Image storage strategy.
- Excel/PDF export approach.
- Backup and recovery approach.
- Free-tier compatibility and limitations.

The implementation must not proceed on the assumption that a service is permanently free without checking its current published terms.

---

# 18. Free Infrastructure Policy

The project must prioritize services with usable free tiers.

Before selecting a service, verify:

- Whether the intended use is permitted by its terms.
- Monthly usage limits.
- Storage limits.
- Database limits.
- Request or execution limits.
- Bandwidth and egress charges.
- Sleep or inactivity behavior.
- Build and deployment restrictions.
- Backup and recovery options.
- Whether payment details are required.
- What happens if a free quota is exceeded.

Potential candidates to evaluate include Cloudflare Pages, Cloudflare Workers, Cloudflare D1, Cloudflare R2, and other suitable free-tier services.

These are candidates, not a final architecture decision. Choose the stack only after checking current documentation and compatibility.

Do not select a platform solely because it advertises a free tier. Ensure its terms allow the intended project use.

No paid service may be introduced without explicit approval.

The developer must clearly explain the practical limits and risks of the proposed free stack, including what happens if the app exceeds a quota.

---

# 19. Audit Trail and Accountability

Important operations must be auditable.

The audit trail should record:

- User performing the action.
- Action type.
- Affected record.
- Previous and new values where appropriate.
- Date and time.
- Reason for corrections or cancellations.
- Confirmation details for financial handovers.
- Synchronization-related duplicate or conflict events where relevant.

Audit history must not be editable by ordinary users.

The system should allow authorized administrators to investigate discrepancies without losing the original record.

---

# 20. User Interface and Experience

The interface must be simple, consistent, and mobile-first.

Design principles:

- Clear navigation.
- Short forms.
- Simple labels.
- Minimal unnecessary steps.
- Readable typography.
- Consistent buttons.
- Useful empty states.
- Clear confirmation dialogs for sensitive actions.
- Friendly but precise error messages.
- No unnecessary visual effects.
- Responsive layouts for phones, tablets, and desktops.

The interface should prioritize the most frequent activities:

1. Record distribution and collection.
2. View personal or team progress.
3. Check stock.
4. Record money handover.
5. Confirm handovers for authorized users.
6. Review reports and discrepancies.

The app must never display a success message until the relevant action has actually been saved locally or accepted by the server. The message must accurately describe which one occurred.

---

# 21. Testing Requirements

Testing is mandatory before release.

## 21.1 Functional Testing

Test:

- Login and logout.
- Role permissions.
- Team creation and assignment.
- Member management.
- Stock allocation.
- Distribution and collection entries.
- Area creation and duplicate detection.
- Money handovers.
- Confirmation workflow.
- Correction workflow.
- Dashboard calculations.
- Excel and PDF exports.
- WhatsApp-ready sharing.
- Optional thank-you messaging.

## 21.2 Financial Testing

Test:

- Duplicate collection submissions.
- Duplicate transfer submissions.
- Unconfirmed handovers.
- Confirmed handovers.
- Partial handovers.
- Corrections to financial records.
- Stock and money discrepancies.
- Initial investment and expense calculations.
- Prevention of double-counting transfers as new income.

## 21.3 Offline Testing

Test:

- Create entries while offline.
- Close and reopen the app before synchronization.
- Reconnect after a long interruption.
- Retry failed synchronization.
- Submit the same entry more than once.
- Resolve conflicting records.
- Preserve data after a page refresh or browser restart where supported.
- Display accurate pending and synchronized statuses.

## 21.4 Performance Testing

Test with:

- A representative low-end Android phone.
- A throttled 3G connection.
- High latency.
- Intermittent connectivity.
- A realistic dataset for approximately 100 participants.
- Large enough historical records to verify pagination and aggregation.

## 21.5 Security Testing

Test:

- Unauthorized access to campaign finances.
- Team Leaders attempting to access other teams.
- Members attempting to edit another member's data.
- Unauthorized transfer confirmation.
- Direct API requests bypassing frontend controls.
- Session expiry.
- Invalid and oversized uploads.
- Rate limiting and input validation.

---

# 22. Acceptance Criteria

The application is ready for release only when all critical criteria below are satisfied.

1. All four roles operate with correct permissions.
2. Users cannot access restricted information by manipulating frontend requests.
3. Team and member stock balances remain accurate.
4. Duplicate submissions do not duplicate stock, collection, or transfer records.
5. Member entries become operational totals after successful server acceptance, without routine Team Leader approval.
6. Financial handovers require confirmation by the Super Admin or Usthad/Supervisor.
7. Collections and handovers are displayed separately and are not double-counted.
8. Campaign-wide financial information is restricted to authorized roles.
9. Members can record permitted entries offline.
10. Offline entries synchronize reliably when connectivity returns.
11. Synchronization status is clearly separated from confirmation status.
12. Area records support duplicate detection and controlled normalization.
13. Authorized users can export permitted Excel and PDF reports.
14. Users can generate WhatsApp-ready summaries without a paid WhatsApp API.
15. Profile photos are optimized for mobile networks.
16. The application remains usable on low-end Android devices and slow connections.
17. Important financial and administrative actions have an audit trail.
18. No unapproved paid service is required to run the selected architecture.
19. The deployed app uses a real backend and persistent database.
20. Backup, recovery, free-tier limits, and operational risks are documented.

---

# 23. Development Deliverables

The development team must provide:

1. Working full-stack application.
2. Responsive mobile-first frontend.
3. Backend and API.
4. Database schema and migration process.
5. Secure authentication and role-based authorization.
6. PWA installation support.
7. Offline data storage and synchronization.
8. Stock, distribution, collection, and handover modules.
9. Dashboards and role-specific reports.
10. Excel and PDF exports.
11. WhatsApp-ready sharing.
12. Image upload and optimization.
13. Audit trail.
14. Automated tests for critical calculations and permissions.
15. Deployment instructions.
16. Environment variable documentation.
17. Database backup and recovery instructions.
18. A clear list of selected free services and their current limits.
19. Known limitations and future improvement recommendations.

---

# 24. Implementation Sequence

The application should be developed in controlled stages.

**Phase 1 — Architecture and data model**

Finalize requirements, database design, role permissions, financial definitions, and the free-tier-compatible stack.

**Phase 2 — Authentication and administration**

Implement login, roles, teams, members, and campaign settings.

**Phase 3 — Stock and operational entries**

Implement stock allocation, distribution/sales, collections, and area management.

**Phase 4 — Money handovers and finance**

Implement transfer records, authorized confirmation, expenses, initial investment, financial summaries, and audit history.

**Phase 5 — Dashboards and reports**

Implement role-specific dashboards, filters, rankings, Excel exports, PDF exports, and WhatsApp-ready summaries.

**Phase 6 — PWA and offline synchronization**

Implement local storage, queued writes, synchronization, conflict handling, and clear status indicators.

**Phase 7 — Performance and security**

Optimize for low-end Android phones and slow 3G, test role isolation, and validate financial integrity.

**Phase 8 — Deployment and verification**

Deploy to the approved free-tier infrastructure, verify limits, test backup/recovery procedures, and complete acceptance testing.

---

# 25. Final Product Principle

Life Skill Course must prioritize **accuracy, accountability, simplicity, reliability, and performance**.

The application should not become complicated through unnecessary features. It must make the campaign easier to manage while protecting financial information and maintaining reliable records.

Every important operation must be traceable. Every financial total must have a clear definition. Every offline record must have a truthful synchronization status. Every user must see only the information they are authorized to access.

The final application must be a genuinely usable, secure, full-stack system—not merely a visual prototype.
