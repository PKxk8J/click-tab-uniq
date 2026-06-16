# Summary

Close duplicate tabs from the right-click menu.

# Description

ClickTabUniq closes duplicate tabs directly from Firefox's right-click menu.

Choose how duplicates are detected:

- URL
- URL without hash
- Title

For each duplicate detection method, choose the cleanup scope:

- The clicked hierarchy
- Each hierarchy
- All tabs

Menu items show how many duplicate tabs will be closed before you choose an
action.

Hierarchies are top-level tabs and each tab group.
Pinned tabs are treated as top-level tabs and are preferred over regular tabs
when choosing which duplicate survives.
When you right-click a tab in a group, the menu can also offer the top-level
cleanup scope. Choosing that top-level scope only checks top-level tabs, so
duplicates inside the clicked group stay untouched unless you choose the group
scope.
Split view tabs are included in duplicate detection and cleanup.

Optional notifications can show progress, the final result, and how many tabs
were closed in each hierarchy.

## Privacy

ClickTabUniq uses tab access to detect and close duplicate tabs.
It does not collect or send browsing data.
