/** Opt-in workaround for native accessibility-tree stalls; other modes retain assistive-technology support. */
export const useAccessibilityPerformanceMode = (platform: string, mode: string | undefined): boolean =>
  platform === 'win32' && mode === 'performance'
