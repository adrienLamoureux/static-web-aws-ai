import { useCallback } from "react";
import {
  createLoraProfile,
  saveLoraProfile,
  deleteLoraProfile,
  listLoraProfilesForCharacter,
} from "../../services/lora";
import {
  normalizeString,
  buildProfileSavePayload,
  normalizeProfileDraft,
  createEmptyProfileDraft,
} from "./loraUtils";

/**
 * Encapsulates the LoRA profile mutation handlers (save, delete, reset)
 * so LoraManagement.js stays under the 500-line limit.
 */
export default function useLoraProfileActions({
  resolvedApiBaseUrl,
  selectedCharacterId,
  selectedProfileId,
  setSelectedProfileId,
  profileDraft,
  loadProfile,
  setError,
  setNotice,
  setIsSaving,
  setProfileDraft,
  setProfileOptions,
}) {
  const refreshProfileOptions = useCallback(async () => {
    const listResponse = await listLoraProfilesForCharacter(
      resolvedApiBaseUrl,
      selectedCharacterId
    );
    return (listResponse?.items || listResponse?.profiles || [])
      .map((p) => ({
        id: normalizeString(p.id || p.characterId),
        name: normalizeString(p.name || p.displayName || p.id || p.characterId),
      }))
      .filter((p) => p.id);
  }, [resolvedApiBaseUrl, selectedCharacterId]);

  const handleSaveProfile = useCallback(async () => {
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing.");
      return;
    }
    if (!selectedCharacterId) {
      setError("Select a character first.");
      return;
    }
    if (!profileDraft?.name?.trim()) {
      setError("Profile name is required.");
      return;
    }
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const payload = buildProfileSavePayload(profileDraft);
      let savedProfileId = selectedProfileId;
      let response;
      if (!selectedProfileId) {
        response = await createLoraProfile(resolvedApiBaseUrl, {
          characterId: selectedCharacterId,
          ...payload,
        });
        savedProfileId = response?.profile?.id || response?.id || "";
        setNotice("LoRA profile created.");
      } else {
        response = await saveLoraProfile(resolvedApiBaseUrl, selectedProfileId, {
          characterId: selectedCharacterId,
          ...payload,
        });
        setNotice("LoRA profile saved.");
      }
      const savedProfile = response?.profile || {};
      setProfileDraft(
        normalizeProfileDraft({
          profile: savedProfile,
          characterId: selectedCharacterId,
          name: normalizeString(savedProfile.name || payload.name),
        })
      );
      const profiles = await refreshProfileOptions();
      setProfileOptions(profiles);
      if (savedProfileId) setSelectedProfileId(savedProfileId);
    } catch (saveError) {
      setError(saveError?.message || "Failed to save LoRA profile.");
    } finally {
      setIsSaving(false);
    }
  }, [
    resolvedApiBaseUrl,
    selectedCharacterId,
    selectedProfileId,
    profileDraft,
    setError,
    setNotice,
    setIsSaving,
    setProfileDraft,
    setProfileOptions,
    setSelectedProfileId,
    refreshProfileOptions,
  ]);

  const handleDeleteProfile = useCallback(async () => {
    if (!selectedProfileId) return;
    if (!window.confirm(`Delete LoRA profile "${profileDraft?.name || selectedProfileId}"?`))
      return;
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      await deleteLoraProfile(resolvedApiBaseUrl, selectedProfileId);
      const profiles = await refreshProfileOptions();
      setProfileOptions(profiles);
      const firstId = profiles[0]?.id || "";
      setSelectedProfileId(firstId);
      if (firstId) {
        loadProfile(firstId);
      } else {
        setProfileDraft(createEmptyProfileDraft({ characterId: selectedCharacterId }));
      }
      setNotice("LoRA profile deleted.");
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete LoRA profile.");
    } finally {
      setIsSaving(false);
    }
  }, [
    resolvedApiBaseUrl,
    selectedCharacterId,
    selectedProfileId,
    profileDraft,
    loadProfile,
    setError,
    setNotice,
    setIsSaving,
    setProfileDraft,
    setProfileOptions,
    setSelectedProfileId,
    refreshProfileOptions,
  ]);

  return { handleSaveProfile, handleDeleteProfile };
}
