export interface PdfJsField {
  type: string
  value?: string | boolean | string[]
  editable?: boolean
  readOnly?: boolean
  hidden?: boolean
  exportValues?: string[] | string
  options?: Array<{ exportValue: string }>
}

export const pdfFieldEntries = (objects: unknown): Array<[string, PdfJsField[]]> => {
  if (!objects) return []
  return objects instanceof Map ? Array.from(objects.entries()) : Object.entries(objects)
}

export interface PdfWorkspaceField {
  name: string
  type: string
  value: string | boolean
  original: string | boolean
  options: string[]
}

export const editablePdfFields = (objects: unknown): PdfWorkspaceField[] =>
  pdfFieldEntries(objects).flatMap(([name, widgets]) => {
    const field = widgets.find(item => ['text', 'checkbox', 'combobox', 'listbox', 'radiobutton'].includes(item.type))
    if (!field || field.readOnly || field.editable === false || field.hidden) return []
    const options = field.options?.map(item => item.exportValue) || widgets.flatMap(item =>
      typeof item.exportValues === 'string' ? [item.exportValues] : item.exportValues || [])
    const original = field.type === 'checkbox'
      ? field.value !== 'Off' && !!field.value
      : String(Array.isArray(field.value) ? field.value[0] || '' : field.value || '')
    return [{ name, type: field.type, value: original, original, options: [...new Set(options)] }]
  })
