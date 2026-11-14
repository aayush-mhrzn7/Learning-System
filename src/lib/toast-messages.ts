export const trashToasts = {
  restoring: "Fishing that note out of the bin…",
  restored: "Back on the shelf",
  restoreFailed: "Could not restore item. Try again in a moment.",
  restoringAll: "Bringing everything back…",
  restoredAll: "Every note is back in the library",
  restoreAllFailed: "Could not restore Trash. Try again in a moment.",
  deleting: "Deleting for good…",
  deleted: "Permanently deleted. That one is forgotten.",
  deleteFailed: "Could not permanently delete item. Try again.",
  emptying: "Taking out the trash…",
  emptied: "Trash emptied. Fresh, clear headspace.",
  emptyFailed: "Could not empty Trash. Try again.",
} as const;

export const noteToasts = {
  imageUploadFailed: "Image did not upload. Check the file and retry.",
  publishedAsIs: "Published as-is. No claims to check.",
  republishedAsIs: "Re-published as-is. Nothing new to verify.",
  pipelineFailed: "Publish pipeline failed. Check the step and retry.",
  gapAnalysisFailed: "Gap analysis failed. Try running it again.",
  gapUpdateFailed: "Could not update that gap. Try again.",
  gapDeleteFailed: "Could not delete that gap. Try again.",
} as const;

export const sidebarToasts = {
  movedToTrash: "Moved to Trash. Restorable until you empty it.",
  needDirectory: "Create a directory first so notes have a home",
  logoutFailed: "Could not log out. Refresh and try again.",
  moveNoteFailed: "Could not move that note. It is back where it was.",
  moveDirectoryFailed: "Could not move that directory. Put back as before.",
  trashFailed: "Could not move item to Trash. Nothing was changed.",
  saveChangeFailed: "Could not save that change. Reverted, try again.",
} as const;

export const workspaceToasts = {
  createDirectoryFailed: "Could not create directory. Try another name.",
} as const;

export const aiToasts = {
  inlineChatFailed: "Chat hit a snag. Your question is back in the box.",
  visualizeFailed: "Visualize hit a snag. Your prompt is back in the box.",
  visualizeLoadFailed: "Could not load this visualization. Reload to retry.",
  graphLoadFailed: "Could not load the knowledge graph. Reload to retry.",
  diagramCopied: "Diagram copied. Paste it into a writing note.",
  diagramCopyFailed: "Could not copy diagram. Check clipboard permission.",
} as const;

export const providerToasts = {
  loadFailed: "Could not load provider settings. Reopen and retry.",
  openRouterDisabled: "OpenRouter is napping for now. Pick another provider.",
  saved: "Provider saved. Your AI brain is wired up.",
  saveFailed: "Could not save provider. Check the key and retry.",
  needKey: "Save an API key for this provider first",
  switchFailed: "Could not switch provider. Try again.",
} as const;
