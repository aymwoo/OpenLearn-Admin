# Changelog

All notable changes to this project will be documented in this file.

## [4.3.0] - 2026-04-23

### Added
- **New Help Page**: Added a user-friendly instruction page (`/help`) specifically designed for teachers to understand system updates and Git synchronization.
- **Enhanced Navigation**: Unified the Sidebar and Header layouts across Dashboard and Settings pages for a consistent user experience.
- **Help Icon**: Added a quick-access help button in the top-right header next to settings.

### Changed
- **Dashboard Metrics**: Migrated data source from `sysinfo.aspx` to the more robust `api/SiteStats.ashx` API.
- **UI Modernization**:
  - Implemented a premium glassmorphism design for headers and cards.
  - Optimized the metrics grid to be more compact and visually balanced.
  - Merged "Startup Time" into the "System Uptime" card to reduce clutter.
- **Settings Page Refinement**:
  - Increased font sizes and input padding for improved readability and touch accessibility.
  - Reorganized action buttons: "Back to Dashboard" and "Save Configuration" are now aligned in a single row with distinct color styles.
- **Sidebar Cleanup**: Simplified the navigation by hiding non-essential links (Repositories, Metrics, Terminal) to focus on core management tasks.

### Fixed
- **Icon Alignment**: Corrected the vertical alignment of status icons and text in the system uptime display.
- **Path Resolution**: Fixed an issue where Web Service URL settings were not correctly applied to metrics fetching.
- **Error Handling**: Improved error message clarity and logging for API fetch failures.
