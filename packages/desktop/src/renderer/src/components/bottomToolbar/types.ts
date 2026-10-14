export interface ToolbarMenuItem {
  id: string
  label: string
  icon?: string
  disabled?: boolean
  divided?: boolean
  run: () => void
}
