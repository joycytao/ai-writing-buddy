# Bug Tickets

## BUG-001: Google Drive browse shows permission denied

- Status: Open
- Priority: P1
- Reported: 2026-04-21
- Area: Cloud references (Google Drive integration)

### Summary
After connecting Google Drive, clicking Browse can fail with:
"Google Drive permission denied. Confirm Drive API access is enabled for this OAuth app."

### Repro Steps
1. Open Settings.
2. In Connect service, choose Google Drive and click Connect.
3. Complete OAuth consent.
4. In Link reference, choose provider and click Browse.

### Actual Result
Browse modal fails to list resources and shows the permission denied error.

### Expected Result
Browse modal should list folders/files from Google Drive for selection.

### Notes
- This can happen when Drive API is not enabled for the Google Cloud OAuth app/project.
- May also occur with token/scope misconfiguration in OAuth consent setup.

### Workaround
- Verify Drive API is enabled in Google Cloud Console for the client ID project.
- Disconnect and reconnect Google Drive after confirming API settings.

### Suggested Fix (Later)
- Add a preflight check after OAuth to validate Drive API access before opening browse modal.
- Add a setup checklist/link in UI for Google Cloud API enablement when 403 occurs.
