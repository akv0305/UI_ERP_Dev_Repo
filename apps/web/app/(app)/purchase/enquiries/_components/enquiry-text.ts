/** Display helpers shared by the enquiry screens (kept out of JSX for react/jsx-no-literals). */

export function codeName(code: string, name: string): string {
  return `${code}  ${name}`;
}

export function itemText(item: { code: string; description: string; size: string | null }): string {
  return codeName(
    item.code,
    item.size === null ? item.description : `${item.description}, ${item.size}`,
  );
}

export function indentLineRef(indentNumber: string, lineNo: number): string {
  return `${indentNumber} / ${lineNo}`;
}
