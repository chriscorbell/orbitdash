import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection";
import { CustomCssSettings } from "@/components/settings/CustomCssSettings";
import { WallpaperSettings } from "@/components/settings/WallpaperSettings";
import type { SettingsProps } from "@/components/settings/settings-sections";

export function AppearanceSection(props: SettingsProps) {
  return (
    <>
      <AppearanceSettingsSection
        appearance={props.appearance}
        onChange={props.onAppearanceChange}
      />
      <WallpaperSettings
        appearance={props.appearance}
        onChange={props.onAppearanceChange}
        onPreview={props.onAppearancePreview}
      />
      <CustomCssSettings
        customCss={props.appearance.customCss}
        onChange={(customCss) => props.onAppearanceChange({ customCss })}
      />
    </>
  );
}
