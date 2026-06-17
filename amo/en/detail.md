# Summary

When too many tabs leave the same page open more than once, check the count first and close duplicates easily.

# Description

ClickTabUniq is a Firefox extension for closing duplicate tabs from the right-click menu when the same page is open in multiple tabs. The menu shows how many tabs will be closed before you run an action, so you can understand the impact first.

Choose how duplicates are detected:

- URL
- URL without hash
- Title

For each duplicate detection method, choose the cleanup scope:

- The clicked group or top-level tabs
- Top-level tabs and each group separately
- All tabs

Top-level tabs and each tab group are treated as separate cleanup areas.
Pinned tabs are treated as top-level tabs and are preferred over regular tabs
when choosing which duplicate survives.
When you right-click a tab in a group, you can choose the clicked group by
itself or the top-level cleanup scope.
Top-level cleanup only checks top-level tabs, so duplicates inside the clicked
group stay untouched unless you choose the group scope.
Split view tabs are included in duplicate detection and cleanup.

If only one duplicate detection method or cleanup scope is available, the
right-click menu is streamlined so you can run the action in fewer steps.

Optional notifications can show progress, the final result, and how many tabs
were closed for top-level tabs and each group.

## Privacy

ClickTabUniq uses tab access to compare tab URLs and titles. It does not collect or send browsing data.

# Captions

- screenshot1_menu_item.png: Preview duplicate counts in the tab context menu before closing anything.
- screenshot2_shallow_menu_item.png: Run the cleanup faster with a streamlined menu when only one action is available.
- screenshot3_notification.png: Optional notifications summarize the duplicate tabs that were closed.
- screenshot4_settings.png: Choose detection methods, cleanup scopes, menu contexts, and notifications from the settings page.
