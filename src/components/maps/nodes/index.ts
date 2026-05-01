import type { NodeTypes } from "@xyflow/react";
import RootCauseNode from "./RootCauseNode";
import FindingNode from "./FindingNode";
import ActionNode from "./ActionNode";
import CategoryNode from "./CategoryNode";
import JourneyCommercialNode from "./JourneyCommercialNode";
import JourneySupportNode from "./JourneySupportNode";
import JourneyOtherEventsNode from "./JourneyOtherEventsNode";
import JourneyDropoffNode from "./JourneyDropoffNode";

export const nodeTypes: NodeTypes = {
  root_cause: RootCauseNode,
  finding: FindingNode,
  action: ActionNode,
  policy: CategoryNode,
  support: CategoryNode,
  trust: CategoryNode,
  measurement: CategoryNode,
  checkout: CategoryNode,
  journey_commercial: JourneyCommercialNode,
  journey_support: JourneySupportNode,
  journey_other_events: JourneyOtherEventsNode,
  journey_dropoff: JourneyDropoffNode,
};

export {
  RootCauseNode,
  FindingNode,
  ActionNode,
  CategoryNode,
  JourneyCommercialNode,
  JourneySupportNode,
  JourneyOtherEventsNode,
  JourneyDropoffNode,
};
