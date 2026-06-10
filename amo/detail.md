## Summary

When too many tabs leave the same page open more than once, check the count first and close duplicates easily.

## Description

ClickTabUniq is a Firefox extension for closing duplicate tabs from the right-click menu when the same page is open in multiple tabs. The menu shows how many tabs will be closed before you run an action, so you can understand the impact first.

Choose how duplicates are detected:

- URL
- URL without hash
- Title

For each duplicate detection method, you can also choose the cleanup scope:

- The clicked hierarchy
- Each hierarchy
- All tabs

Hierarchies are top-level tabs and each tab group.
Pinned tabs are treated as top-level tabs and are preferred over regular tabs when choosing which duplicate survives.
Top-level cleanup only checks top-level tabs, so duplicates inside groups are left untouched.
When you right-click a tab in a group, you can also close duplicates within that group only.
Split view tabs are included in duplicate detection and cleanup.

Optional notifications can show progress, the final result, and how many tabs were closed in each hierarchy.

## Privacy

ClickTabUniq uses tab access to compare tab URLs and titles. It does not collect or send browsing data.
