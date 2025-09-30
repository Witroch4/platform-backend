import { StateGraph } from "@langchain/langgraph";
import type { GraphState } from "./state";
import { GraphStateSchema } from "./state";
import { supervisorNode } from "./supervisor";
import { matcherNode } from "./matcher";
import { scorerNode } from "./scorer";
import { reporterNode } from "./reporter";

export function buildEvaluationGraph() {
  const graph = new (StateGraph as any)({
    stateSchema: GraphStateSchema,
  });

  graph.addNode("Supervisor", supervisorNode as any);
  graph.addNode("Matcher", matcherNode as any);
  graph.addNode("Scorer", scorerNode as any);
  graph.addNode("Reporter", reporterNode as any);

  graph.setEntryPoint("Supervisor");

  graph.addConditionalEdges(
    "Supervisor",
    (state: GraphState) => state.nextActor,
    {
      Matcher: "Matcher",
      Scorer: "Scorer",
      Reporter: "Reporter",
      END: "__end__",
    },
  );

  graph.addEdge("Matcher", "Supervisor");
  graph.addEdge("Scorer", "Supervisor");
  graph.addEdge("Reporter", "__end__");

  return graph.compile();
}
