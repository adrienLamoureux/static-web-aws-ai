const registerCorePromptRoutes = require("./core-prompt");
const registerMediaRoutes = require("./media-routes");
const registerBedrockRoutes = require("./bedrock-routes");
const registerReplicateImageRoutes = require("./replicate-image-routes");
const registerCivitaiImageRoutes = require("./civitai-image-routes");
const registerGradioRoutes = require("./gradio-routes");
const registerReplicateImageStatusSelectRoutes = require("./replicate-image-status-select-routes");
const registerReplicateVideoRoutes = require("./replicate-video-routes");
const registerBedrockImageVideoRoute = require("./bedrock-image-video-route");
const registerStorySessionRoutes = require("./story-session-routes");
const registerStoryMessageRoute = require("./story-message-route");
const registerStoryIllustrationRoute = require("./story-illustration-route");
const registerOperationsRoutes = require("./operations-routes");
const registerLoraRoutes = require("./lora-routes");

const registerRoutes = (app, deps) => {
  registerCorePromptRoutes(app, deps);
  registerMediaRoutes(app, deps);
  registerBedrockRoutes(app, deps);
  registerReplicateImageRoutes(app, deps);
  registerCivitaiImageRoutes(app, deps);
  registerGradioRoutes(app, deps);
  registerReplicateImageStatusSelectRoutes(app, deps);
  registerReplicateVideoRoutes(app, deps);
  registerBedrockImageVideoRoute(app, deps);
  registerStorySessionRoutes(app, deps);
  registerStoryMessageRoute(app, deps);
  registerStoryIllustrationRoute(app, deps);
  registerOperationsRoutes(app, deps);
  registerLoraRoutes(app, deps);
};

module.exports = {
  registerRoutes,
};
