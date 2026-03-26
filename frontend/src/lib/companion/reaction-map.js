/**
 * Maps companion events to motion + emotion reactions.
 * Both fields are optional — omit either if not needed for a given event.
 */

import { CompanionActions } from "./CompanionContext";

export const REACTIONS = {
  [CompanionActions.PAGE_NAVIGATE]:    { motion: "greet",       emotion: "happy"    },
  [CompanionActions.GENERATION_START]: { motion: "acknowledge", emotion: "thinking" },
  [CompanionActions.GENERATION_DONE]:  { motion: "react",       emotion: "happy"    },
  [CompanionActions.GENERATION_ERROR]: { motion: "dismiss",     emotion: "sad"      },
  [CompanionActions.USER_IDLE]:        {                         emotion: "thinking" },
  [CompanionActions.USER_RETURN]:      { motion: "greet",       emotion: "happy"    },
};
