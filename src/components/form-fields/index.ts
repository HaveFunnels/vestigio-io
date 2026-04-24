// Shared form field types and utilities.
//
// The UI components (SharedFields, StyledDropdown) were removed in the
// premium form redesign — both funnels now use src/components/form-steps/.
// This barrel re-exports only the types and helpers still used by
// backend routes (parseRevenue, isValidPhone, isValidDomainFormat).

export * from "./types";
