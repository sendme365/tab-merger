// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  const result = await mergeAllTabs(tab.windowId);

  if (result.success) {
    console.log(`Merged ${result.tabsMoved} tabs from ${result.windowsClosed} windows`);
  } else if (result.error) {
    console.error('Failed to merge tabs:', result.error);
  }
});

// Listen for messages from popup (kept for backward compatibility)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'mergeTabs') {
    // Try to get current window from sender
    const windowId = sender.tab?.windowId;
    if (windowId) {
      mergeAllTabs(windowId)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
    } else {
      sendResponse({ success: false, error: 'Could not determine current window' });
    }
    return true; // Keep message channel open for async response
  }
});

// Get a random tab group color
function getRandomColor() {
  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Merge all tabs from all windows into the current window
async function mergeAllTabs(currentWindowId) {
  try {
    // Get all windows with their tabs
    const windows = await chrome.windows.getAll({ populate: true });

    // Filter out the current window
    const otherWindows = windows.filter(w => w.id !== currentWindowId);

    // Need at least 1 other window to merge
    if (otherWindows.length === 0) {
      return {
        success: false,
        error: 'Need at least 2 windows to merge',
        tabsMoved: 0,
        windowsClosed: 0,
        groupsCreated: 0
      };
    }

    // Sort other windows by lastFocusedTime (ascending - oldest first, newest last)
    otherWindows.sort((a, b) => {
      const timeA = a.lastFocusedTime || 0;
      const timeB = b.lastFocusedTime || 0;
      return timeA - timeB;
    });

    let tabsMoved = 0;
    let groupsCreated = 0;

    // Process each other window (in activation time order)
    for (let i = 0; i < otherWindows.length; i++) {
      const window = otherWindows[i];
      const tabIds = window.tabs.map(tab => tab.id);

      if (tabIds.length > 0) {
        // Move all tabs from this window to the current window
        await chrome.tabs.move(tabIds, { windowId: currentWindowId, index: -1 });

        // Create a tab group for these tabs
        const groupId = await chrome.tabs.group({ tabIds: tabIds });

        // Set group title and random color
        const groupTitle = `${i + 1}`;
        const groupColor = getRandomColor();
        await chrome.tabGroups.update(groupId, {
          title: groupTitle,
          color: groupColor
        });

        tabsMoved += tabIds.length;
        groupsCreated++;
      }
      // Note: Chrome automatically closes windows when all tabs are moved
    }

    return {
      success: true,
      tabsMoved: tabsMoved,
      windowsClosed: otherWindows.length,
      groupsCreated: groupsCreated
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      tabsMoved: 0,
      windowsClosed: 0,
      groupsCreated: 0
    };
  }
}
