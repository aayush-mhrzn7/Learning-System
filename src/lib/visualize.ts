import type {
  VisualizeDiagram,
  VisualizeMessage,
  VisualizeState,
} from "@/db/schema";

export const emptyVisualize: VisualizeState = { messages: [] };

/** Migrate older single-diagram payloads into per-message blocks. */
export function normalizeVisualize(raw: unknown): VisualizeState {
  if (!raw || typeof raw !== "object") return emptyVisualize;
  const value = raw as {
    messages?: VisualizeMessage[];
    diagram?: VisualizeDiagram | null;
    explanation?: string;
  };
  const messages = Array.isArray(value.messages) ? [...value.messages] : [];
  if (
    value.diagram &&
    messages.length > 0 &&
    !messages.some((m) => m.role === "assistant" && m.diagram)
  ) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const turn = messages[i]!;
      if (turn.role !== "assistant") continue;
      messages[i] = {
        ...turn,
        diagram: value.diagram,
        explanation: value.explanation ?? turn.explanation ?? "",
      };
      break;
    }
  }
  return { messages };
}

export function hasAnyDiagram(state: VisualizeState) {
  return state.messages.some(
    (turn) => turn.role === "assistant" && Boolean(turn.diagram),
  );
}
