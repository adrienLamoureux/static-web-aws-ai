/**
 * Maps companion event actions to character interactions.
 * Values reference Interaction constants from character-interactions.js so
 * callers only deal with semantic names — the engine resolves model-specific
 * motions and emotions internally via interactionMap.
 */

import { CompanionActions } from "./CompanionContext";
import { Interaction } from "../live2d/character-interactions";

export const REACTIONS = {
  [CompanionActions.PAGE_NAVIGATE]:    Interaction.GREET,
  [CompanionActions.GENERATION_START]: Interaction.TASK_START,
  [CompanionActions.GENERATION_DONE]:  Interaction.TASK_DONE,
  [CompanionActions.GENERATION_ERROR]: Interaction.TASK_FAIL,
  [CompanionActions.USER_IDLE]:        Interaction.THINKING,
  [CompanionActions.USER_RETURN]:      Interaction.GREET,
  [CompanionActions.FIRST_VISIT]:      Interaction.CELEBRATE,
  [CompanionActions.LONG_SESSION]:     Interaction.ACKNOWLEDGE,
  [CompanionActions.STORY_TURN]:       Interaction.STORY_MOMENT,
};
