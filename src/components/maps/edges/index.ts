import type { EdgeTypes } from "@xyflow/react";
import CausalEdge from "./CausalEdge";
import TransitionEdge from "./TransitionEdge";
import ContributesToEdge from "./ContributesToEdge";
import AddressesEdge from "./AddressesEdge";
import RedirectEdge from "./RedirectEdge";

export const edgeTypes: EdgeTypes = {
  causal: CausalEdge,
  transition: TransitionEdge,
  contributes_to: ContributesToEdge,
  addresses: AddressesEdge,
  redirect: RedirectEdge,
};

export { CausalEdge, TransitionEdge, ContributesToEdge, AddressesEdge, RedirectEdge };
