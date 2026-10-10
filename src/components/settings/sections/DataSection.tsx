import { BackupSettingsSection } from "@/components/settings/BackupSettingsSection";
import { DashboardImportSettings } from "@/components/settings/DashboardImportSettings";

export function DataSection() {
  return (
    <>
      <DashboardImportSettings />
      <BackupSettingsSection />
    </>
  );
}
