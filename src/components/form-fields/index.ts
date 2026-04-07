// Barrel exports for the shared form fields used by /onboard and /lp/audit.
//
// Importing pattern:
//   import { DomainField, BusinessTypeField, RevenueField, parseRevenue }
//     from "@/components/form-fields";
//
// Anything new that needs to be shared between the two funnels should
// land in this folder and be re-exported here.

export * from "./types";
export * from "./StyledDropdown";
export * from "./SharedFields";
