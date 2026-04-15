/**
 * ActionCard — dispatcher that renders the appropriate action card
 * based on the action type returned by the companion backend.
 *
 * Supported types: "image", "navigate", "start_story", "generate_music"
 */

import GenerationCard from "./GenerationCard";
import NavigationCard from "./NavigationCard";
import StoryCard from "./StoryCard";
import MusicCard from "./MusicCard";
import PromptGenerateCard from "./PromptGenerateCard";

export default function ActionCard({ action, onNavigate }) {
  if (!action) return null;

  switch (action.type) {
    case "image":
      return <GenerationCard generation={action} />;
    case "navigate":
      return <NavigationCard navigation={action} onNavigate={onNavigate} />;
    case "start_story":
      return <StoryCard storyAction={action} onNavigate={onNavigate} />;
    case "generate_music":
      return <MusicCard musicAction={action} onNavigate={onNavigate} />;
    case "generate_prompt":
      return <PromptGenerateCard action={action} />;
    default:
      return null;
  }
}
