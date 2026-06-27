export const interpolateVariables = (str: string, rowData: Record<string, any>): string => {
  const varRegex = /\{\{(.+?)\}\}/g;
  return str.replace(varRegex, (_, key) => {
    const val = rowData[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
};

export const resolveContent = (content: any): any => {
  // If content is a variable-like syntax but not in a string template, return it.
  // The SDK resolves content mainly through interpolateVariables and evaluateSmartLogic,
  // which will resolve it using rowData (the user payload).
  return content;
};
