export function analyzeTabs(tabs = []) {
  const actions = {
    suspend: [],
    optimize: [],
    keepActive: []
  };

  const now = Date.now();
  for (const tab of tabs) {
    const inactiveMs = now - new Date(tab.lastInteractionAt).getTime();

    if (!tab.isActive && inactiveMs > 3 * 60 * 1000 && tab.estimatedRamMb > 180) {
      actions.suspend.push(tab.tabId);
      continue;
    }

    if (!tab.isActive && (tab.estimatedCpuPct > 25 || tab.estimatedRamMb > 120)) {
      actions.optimize.push(tab.tabId);
      continue;
    }

    actions.keepActive.push(tab.tabId);
  }

  return actions;
}
