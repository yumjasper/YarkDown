export const mergePreferenceDefaults = (
  defaults: Record<string, unknown>,
  saved: Record<string, unknown>
): Record<string, unknown> => ({
  ...defaults,
  // electron-store manages migration metadata itself and rejects it in set().
  ...Object.fromEntries(Object.entries(saved).filter(([key]) => key !== '__internal__'))
})
